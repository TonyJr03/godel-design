import { spawn } from "node:child_process";
import { mkdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const SUPABASE_DIR = resolve(ROOT, "infra/supabase");
const BACKUP_LOCK = resolve(ROOT, "backups/selfhosted/.backup-selfhosted.lock");
const UPSTREAM_PIN = "e846d45ce64207b952a4df44ac8b480ea0abb27e";
const SUPABASE_SERVICES = ["studio", "api-gw", "auth", "rest", "realtime", "storage", "imgproxy", "meta", "functions", "db", "supavisor"];
const GODEL_SERVICES = ["app", "nginx"];
const NON_DB_SERVICES = SUPABASE_SERVICES.filter((service) => service !== "db");
const REQUIRED_ARTIFACTS = ["postgres/logical/cluster.sql", "postgres/physical/pgdata.tar", "storage/storage.tar"];
const MIN_RESTORE_MARGIN = 512 * 1024 * 1024;

function log(message) { console.log("[ops:restore:selfhosted] " + message); }
function die(message) { throw new Error(message); }

function run(bin, args, cwd = ROOT, allowFailure = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, out: out.trim(), err: err.trim() };
      if (code && !allowFailure) reject(new Error(bin + " command failed"));
      else resolvePromise(result);
    });
  });
}

const supabase = (args, allowFailure = false) => run("docker", ["compose", "-f", "docker-compose.yml"].concat(args), SUPABASE_DIR, allowFailure);
const godel = (args, allowFailure = false) => run("docker", ["compose", "--env-file", "compose.env.local", "-f", "compose.yaml"].concat(args), ROOT, allowFailure);

function parsePathOption(args, option) {
  const supplied = args.shift();
  if (!supplied || supplied.startsWith("--")) die(option + " requires a path");
  return resolve(ROOT, supplied);
}

function options(args) {
  const verb = args.shift();
  const value = { backup: null, protectedRoot: null, target: null, dryRun: false, defensiveBackup: null, defensiveProtectedRoot: null, confirmed: false };
  while (args.length) {
    const option = args.shift();
    if (option === "--backup") value.backup = parsePathOption(args, option);
    else if (option === "--protected-root") value.protectedRoot = parsePathOption(args, option);
    else if (option === "--target") {
      const supplied = args.shift();
      if (!supplied || supplied.startsWith("--")) die("--target requires a value");
      value.target = supplied;
    } else if (option === "--dry-run") value.dryRun = true;
    else if (option === "--defensive-backup") value.defensiveBackup = parsePathOption(args, option);
    else if (option === "--defensive-protected-root") value.defensiveProtectedRoot = parsePathOption(args, option);
    else if (option === "--confirm-destructive-qa-restore") value.confirmed = true;
    else die("unknown option " + option);
  }
  if (verb !== "restore") die("use restore");
  if (!value.backup) die("restore requires --backup");
  if (!value.protectedRoot) die("restore requires --protected-root");
  if (value.target !== "current-selfhosted-qa") die("restore target must be current-selfhosted-qa");
  if (Boolean(value.defensiveBackup) !== Boolean(value.defensiveProtectedRoot)) die("defensive backup and protected root must be supplied together");
  return value;
}

function nested(parent, child) {
  const a = resolve(parent), b = resolve(child);
  const windows = /^[a-z]:/i.test(a) && /^[a-z]:/i.test(b);
  if (windows && a.slice(0, 2).toLowerCase() !== b.slice(0, 2).toLowerCase()) return false;
  const result = relative(a, b);
  return result === "" || (!result.startsWith("..") && !result.includes(".." + sep) && !/^[a-z]:/i.test(result) && !result.startsWith("/"));
}

function containsIncompleteSegment(value) {
  return resolve(value).split(/[\\/]+/).some((segment) => segment.endsWith(".incomplete"));
}

async function existingDirectory(value, label) {
  const current = await stat(value).catch(() => null);
  if (!current?.isDirectory()) die(label + " must be an existing directory");
}

async function inspect(container, template) {
  return (await run("docker", ["inspect", container, "--format", template])).out;
}

async function composeContainer(kind, service) {
  const current = await (kind === "supabase" ? supabase(["ps", "-q", service]) : godel(["ps", "-q", service]));
  if (!current.out) die("expected " + kind + " service is not present");
  return current.out;
}

async function composeContainerAnyState(kind, service) {
  const current = await (kind === "supabase" ? supabase(["ps", "-a", "-q", service]) : godel(["ps", "-a", "-q", service]));
  const ids = current.out.split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1) die("expected " + kind + " service container is not uniquely resolvable");
  return ids[0];
}

async function containerState(container) {
  const parsed = JSON.parse(await inspect(container, "{{json .State}}"));
  const image = await inspect(container, "{{.Config.Image}}");
  return { status: parsed.Status, health: parsed.Health?.Status ?? "none", image };
}

async function postgresStopSignal(container) {
  const raw = (await inspect(container, "{{.Config.StopSignal}}")).trim().toUpperCase();
  const normalized = raw || "SIGTERM";
  if (["SIGTERM", "TERM", "15"].includes(normalized)) return "SIGTERM";
  if (["SIGINT", "INT", "2"].includes(normalized)) return "SIGINT";
  die("unsupported PostgreSQL stop signal");
}

async function stoppedState(container) {
  const raw = (await inspect(container, "{{.State.Status}}\\t{{.State.ExitCode}}\\t{{.State.OOMKilled}}")).split("\t");
  const [status, exitCodeRaw, oomKilledRaw] = raw;
  if (typeof status !== "string" || !status || !/^-?\d+$/.test(exitCodeRaw ?? "") || !["true", "false"].includes(oomKilledRaw)) die("invalid PostgreSQL stopped state");
  const exitCode = Number(exitCodeRaw);
  if (!Number.isInteger(exitCode)) die("invalid PostgreSQL stopped state");
  return { status, exitCode, oomKilled: oomKilledRaw === "true" };
}

async function assertCleanPostgresStopped(container) {
  const current = await stoppedState(container);
  if (current.status !== "exited" || current.exitCode !== 0 || current.oomKilled) die("clean PostgreSQL shutdown not demonstrated");
}

async function runRestoreFilesystem({ image, source, target, command }) {
  const args = ["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "--cap-add=CHOWN", "--cap-add=FOWNER"];
  if (source) args.push("-v", source + ":/source:ro");
  if (target) args.push("-v", target + ":/target");
  args.push(image, "sh", "-ec", command);
  return run("docker", args);
}

async function assertPostmasterPidAbsent(source, image) {
  await runRestoreFilesystem({ image, source, command: "test ! -e /source/postmaster.pid" });
}

async function waitForHealthy(kind, services, { attempts = 60, intervalMs = 2000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await assertHealthy(kind, services);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
    }
  }
  throw new Error("timeout waiting for " + kind + " services to become healthy", { cause: lastError });
}

function throwIfAbortRequested(execution) {
  if (execution.abortRequested) throw new Error("restore aborted by " + execution.abortSignal);
}

async function assertHealthy(kind, services) {
  for (const service of services) {
    const current = await containerState(await composeContainer(kind, service));
    if (current.status !== "running" || (current.health !== "none" && current.health !== "healthy")) die("expected " + kind + " services are unhealthy");
  }
}

function assertExactServiceSet(actual, expected, label) {
  if (actual.join(",") !== [...expected].sort().join(",")) die("unexpected " + label + " service set");
}

async function currentTargets() {
  const db = await composeContainer("supabase", "db");
  const storage = await composeContainer("supabase", "storage");
  const dbMounts = JSON.parse(await inspect(db, "{{json .Mounts}}"));
  const storageMounts = JSON.parse(await inspect(storage, "{{json .Mounts}}"));
  const pgdata = dbMounts.find((mount) => mount.Destination === "/var/lib/postgresql/data");
  const dbConfig = dbMounts.find((mount) => mount.Destination === "/etc/postgresql-custom");
  const storageData = storageMounts.find((mount) => mount.Destination === "/var/lib/storage");
  if (!pgdata || pgdata.Type !== "bind" || !dbConfig || dbConfig.Type !== "volume" || !dbConfig.Name || !storageData || storageData.Type !== "bind") die("unexpected current persistent mount contract");
  return { db, storage, pgdata, dbConfig, storageData };
}

async function officialVerify(backup, protectedRoot) {
  await run(process.execPath, [resolve(ROOT, "scripts/operations/backup-selfhosted.mjs"), "verify", "--backup", backup, "--protected-root", protectedRoot]);
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) die("source backup manifest has invalid " + label);
  return value;
}

function artifact(manifest, path) {
  const result = manifest.artifacts?.find((item) => item?.relativePath === path);
  if (!result || !Number.isSafeInteger(result.size) || result.size < 1) die("source backup manifest has invalid artifacts");
  return result;
}

function assertManifestContract(manifest) {
  if (manifest?.schemaVersion !== 1 || manifest.status !== "COMPLETE") die("source backup is not COMPLETE schema v1");
  requireString(manifest.backupId, "backup id");
  const sourceCommit = requireString(manifest.repository?.commit, "repository commit");
  requireString(manifest.repository?.branch, "repository branch");
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || manifest.repository?.dirty !== false) die("source backup repository state is not eligible");
  if (manifest.supabase?.upstreamCommit !== UPSTREAM_PIN || manifest.supabase?.composeProject !== "supabase" || manifest.godel?.composeProject !== "godel-runtime") die("source backup compose provenance is incompatible");
  if (manifest.supabase?.storageBackend !== "file" || manifest.logicalBackup?.tool !== "pg_dumpall" || manifest.logicalBackup?.noRolePasswords !== true) die("source backup logical or storage contract is incompatible");
  requireString(manifest.supabase?.dbImage, "database image");
  requireString(manifest.supabase?.storageImage, "storage image");
  if (manifest.protectedRecoveryMaterial?.required !== true || manifest.protectedRecoveryMaterial?.captured !== true) die("source backup protected recovery material is incomplete");
  for (const path of REQUIRED_ARTIFACTS) artifact(manifest, path);
  return manifest;
}

async function readManifest(backup) {
  return assertManifestContract(JSON.parse(await readFile(resolve(backup, "manifest.json"), "utf8")));
}

async function assertGitSafety(sourceCommit) {
  const dirty = await run("git", ["status", "--porcelain"]);
  if (dirty.out) die("current repository must be clean before restore");
  const branch = await run("git", ["branch", "--show-current"]);
  const head = await run("git", ["rev-parse", "HEAD"]);
  if (!branch.out || !head.out) die("current repository identity is unavailable");
  if ((await run("git", ["cat-file", "-e", sourceCommit + "^{commit}"], ROOT, true)).code !== 0) die("source backup commit is unavailable locally");
  if ((await run("git", ["merge-base", "--is-ancestor", sourceCommit, "HEAD"], ROOT, true)).code !== 0) die("source backup commit is not an ancestor of current HEAD");
  log("repository provenance PASS");
  return { head: head.out, branch: branch.out };
}

async function readEnvironment(file) {
  const text = await readFile(file, "utf8");
  if (!text.trim()) die("required runtime configuration is empty");
  const values = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const delimiter = line.indexOf("=");
    if (delimiter < 1) continue;
    const name = line.slice(0, delimiter).trim();
    const value = line.slice(delimiter + 1).trim();
    if (name) values.set(name, value);
  }
  return values;
}

async function assertExternalRecoveryDependencies(manifest) {
  const [supabaseEnvironment, godelEnvironment, supabaseCompose] = await Promise.all([
    readEnvironment(resolve(SUPABASE_DIR, ".env")),
    readEnvironment(resolve(ROOT, "compose.env.local")),
    readFile(resolve(SUPABASE_DIR, "docker-compose.yml"), "utf8"),
  ]);
  const configured = new Map([...supabaseEnvironment, ...godelEnvironment]);
  const requireConfigured = (name) => {
    if (!configured.get(name)) die("required external recovery dependency is not configured");
  };
  if (!Array.isArray(manifest.requiredExternalSecretVariableNames)) die("source backup manifest has invalid external dependency inventory");
  for (const name of manifest.requiredExternalSecretVariableNames) requireConfigured(name);
  const activeComposeLines = supabaseCompose.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("#");
  });
  const jwtKeysActive = activeComposeLines.some((line) => line.includes("${JWT_KEYS")) && Boolean(configured.get("JWT_KEYS"));
  const jwtJwksActive = activeComposeLines.some((line) => line.includes("${JWT_JWKS")) && Boolean(configured.get("JWT_JWKS"));
  const asymmetricAuthActive = jwtKeysActive || jwtJwksActive;
  if (asymmetricAuthActive) {
    requireConfigured("JWT_KEYS");
    requireConfigured("JWT_JWKS");
  }
  if (manifest.supabase.storageBackend !== "file") die("current restore contract requires file Storage");
  log("external recovery dependencies PASS");
}

function safeTarEntry(name) {
  if (!name || name.startsWith("/") || name.startsWith("\\") || /^[A-Za-z]:/.test(name) || name.split(/[\\/]+/).includes("..")) die("archive contains unsafe entry path");
}

async function assertArchiveExtractionSafety(file) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn("tar", ["-tf", file], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let carry = "", failure;
    const validate = (line) => {
      if (!line || failure) return;
      try { safeTarEntry(line); } catch (error) { failure = error; child.kill(); }
    };
    child.stdout.on("data", (chunk) => {
      carry += chunk.toString();
      const lines = carry.split(/\r?\n/);
      carry = lines.pop();
      for (const line of lines) validate(line);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      validate(carry);
      if (failure) reject(failure);
      else if (code) reject(new Error("archive safety check failed"));
      else resolvePromise();
    });
  });
}

async function assertArchiveEntryTypes(file) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn("tar", ["-tvf", file], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let carry = "", failure;
    const validate = (line) => {
      if (!line || failure) return;
      if (line[0] !== "-" && line[0] !== "d") {
        failure = new Error("archive contains unsupported entry type");
        child.kill();
      }
    };
    child.stdout.on("data", (chunk) => {
      carry += chunk.toString();
      const lines = carry.split(/\r?\n/);
      carry = lines.pop();
      for (const line of lines) validate(line);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      validate(carry);
      if (failure) reject(failure);
      else if (code) reject(new Error("archive type safety check failed"));
      else resolvePromise();
    });
  });
}

async function assertSourceCandidate(backup, protectedRoot, label) {
  if (containsIncompleteSegment(backup) || containsIncompleteSegment(protectedRoot)) die(label + " cannot use incomplete artifact paths");
  await existingDirectory(backup, label + " backup");
  await existingDirectory(protectedRoot, label + " protected root");
  await officialVerify(backup, protectedRoot);
  const manifest = await readManifest(backup);
  await Promise.all([
    assertArchiveExtractionSafety(resolve(backup, "postgres/physical/pgdata.tar")),
    assertArchiveExtractionSafety(resolve(backup, "storage/storage.tar")),
    assertArchiveEntryTypes(resolve(backup, "postgres/physical/pgdata.tar")),
    assertArchiveEntryTypes(resolve(backup, "storage/storage.tar")),
  ]);
  return manifest;
}

function assertPathSafety(value, targets) {
  const sourcePaths = [value.backup, value.protectedRoot];
  if (nested(value.backup, value.protectedRoot) || nested(value.protectedRoot, value.backup)) die("source backup and protected root overlap unsafely");
  for (const source of sourcePaths) {
    for (const target of [targets.pgdata.Source, targets.storageData.Source]) {
      if (nested(source, target) || nested(target, source)) die("restore source overlaps a current target path");
    }
  }
}

async function assertOperationalCompatibility(manifest) {
  const upstream = await readFile(resolve(ROOT, "infra/SUPABASE_UPSTREAM.md"), "utf8");
  if (!upstream.includes(UPSTREAM_PIN)) die("unexpected current upstream pin");
  if (!(await readFile(resolve(SUPABASE_DIR, "docker-compose.yml"), "utf8")).includes("STORAGE_BACKEND: file")) die("current Storage backend is not file");
  const actualSupabase = (await supabase(["config", "--services"])).out.split(/\r?\n/).filter(Boolean).sort();
  const actualGodel = (await godel(["config", "--services"])).out.split(/\r?\n/).filter(Boolean).sort();
  assertExactServiceSet(actualSupabase, SUPABASE_SERVICES, "Supabase");
  assertExactServiceSet(actualGodel, GODEL_SERVICES, "Godel");
  await assertHealthy("supabase", SUPABASE_SERVICES);
  await assertHealthy("godel", GODEL_SERVICES);
  const targets = await currentTargets();
  const [dbState, storageState] = await Promise.all([containerState(targets.db), containerState(targets.storage)]);
  if (dbState.image !== manifest.supabase.dbImage || storageState.image !== manifest.supabase.storageImage) die("current runtime images are incompatible with source backup");
  for (const path of ["/api/health/live", "/api/health/ready"]) {
    const response = await fetch("http://localhost:8080" + path);
    if (!response.ok) die("current application health endpoint failed");
  }
  log("current runtime compatibility PASS");
  return targets;
}

async function assertNoActiveBackupLock() {
  const current = await stat(BACKUP_LOCK).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (current) die("backup lock exists; restore preflight aborting");
  log("backup lock inspection PASS");
}

async function assertRestoreDiskReadiness(manifest, targets) {
  const physical = artifact(manifest, "postgres/physical/pgdata.tar").size;
  const storage = artifact(manifest, "storage/storage.tar").size;
  const archiveBytes = physical + storage;
  const required = archiveBytes + Math.max(MIN_RESTORE_MARGIN, Math.ceil(archiveBytes * 0.25));
  const [pgdataFilesystem, storageFilesystem] = await Promise.all([statfs(targets.pgdata.Source), statfs(targets.storageData.Source)]);
  const pgdataAvailable = Number(pgdataFilesystem.bavail) * Number(pgdataFilesystem.bsize);
  const storageAvailable = Number(storageFilesystem.bavail) * Number(storageFilesystem.bsize);
  const available = Math.min(pgdataAvailable, storageAvailable);
  if (!Number.isSafeInteger(required) || !Number.isFinite(available) || pgdataAvailable < required || storageAvailable < required) die("insufficient demonstrable restore disk space");
  log("restore disk-space PASS; estimated required bytes " + required + "; available bytes " + available);
}

async function validateDefensiveBackup(value, sourceManifest, repository, required = false) {
  if (!value.defensiveBackup) {
    if (required) die("destructive restore requires defensive backup and protected root");
    log("defensive backup pending; destructive restore not armed");
    return null;
  }
  if (value.defensiveBackup === value.backup) die("defensive backup must be distinct from source backup");
  assertPathSafety({ backup: value.defensiveBackup, protectedRoot: value.defensiveProtectedRoot }, await currentTargets());
  const defensive = await assertSourceCandidate(value.defensiveBackup, value.defensiveProtectedRoot, "defensive");
  if (defensive.supabase.upstreamCommit !== sourceManifest.supabase.upstreamCommit || defensive.supabase.dbImage !== sourceManifest.supabase.dbImage || defensive.supabase.storageImage !== sourceManifest.supabase.storageImage) die("defensive backup is incompatible with source backup");
  if (required && (defensive.repository.commit !== repository.head || defensive.repository.branch !== repository.branch || defensive.repository.dirty !== false)) die("defensive backup must match current clean repository identity");
  log("defensive backup verification PASS");
  return defensive;
}

function logDryRunPlan() {
  const steps = [
    "acquire restore lock",
    "stop Godel",
    "stop Supabase non-DB services",
    "stop PostgreSQL",
    "replace PGDATA exactly",
    "replace Storage exactly",
    "create fresh compatible DB config",
    "restore only pgsodium root key",
    "start DB and validate health",
    "start remaining Supabase services",
    "start Godel services",
    "validate live and ready endpoints",
    "run external gates",
    "release restore lock",
  ];
  steps.forEach((step, index) => log("dry-run planned " + (index + 1) + ": " + step));
}

async function recoverOriginalRuntime() {
  await supabase(["start", "db"]);
  await waitForHealthy("supabase", ["db"]);
  await supabase(["start"].concat(NON_DB_SERVICES));
  await waitForHealthy("supabase", SUPABASE_SERVICES);
  await godel(["start", "app", "nginx"]);
  await waitForHealthy("godel", GODEL_SERVICES);
  for (const path of ["/api/health/live", "/api/health/ready"]) {
    const response = await fetch("http://localhost:8080" + path);
    if (!response.ok) die("current application health endpoint failed");
  }
}

async function clearExactTarget(image, target) {
  await runRestoreFilesystem({ image, target, command: "find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +" });
}

async function restoreArchive(image, archiveDirectory, archiveName, target) {
  await runRestoreFilesystem({ image, source: archiveDirectory, target, command: "tar -xf /source/" + archiveName + " -C /target" });
}

async function assertRestoredPgdata(image, target) {
  await runRestoreFilesystem({ image, source: target, command: "test -f /source/PG_VERSION; test \"$(cat /source/PG_VERSION)\" = \"17\"; test ! -e /source/postmaster.pid; test -n \"$(ls -A /source)\"" });
}

async function assertRestoredStorage(image, target) {
  await runRestoreFilesystem({ image, source: target, command: "test -n \"$(ls -A /source)\"" });
}

async function rebuildDbConfig(image, volume) {
  await clearExactTarget(image, volume);
  const args = ["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "--cap-add=CHOWN", "--cap-add=FOWNER", "--entrypoint", "sh", "-v", volume + ":/etc/postgresql-custom", image, "-ec", "test \"$(ls -1A /etc/postgresql-custom | wc -l)\" -eq 5; for entry in conf.d extension-custom-scripts read-replica.conf supautils.conf wal-g.conf; do test -e /etc/postgresql-custom/$entry; done; test ! -e /etc/postgresql-custom/pgsodium_root.key"];
  await run("docker", args);
}

async function restoreProtectedKey(image, protectedDirectory, volume) {
  await runRestoreFilesystem({ image, source: protectedDirectory, target: volume, command: "tar -xf /source/pgsodium-root-key.tar -C /target pgsodium_root.key; test -f /target/pgsodium_root.key; test -s /target/pgsodium_root.key; test \"$(ls -1A /target | wc -l)\" -eq 6; for entry in conf.d extension-custom-scripts pgsodium_root.key read-replica.conf supautils.conf wal-g.conf; do test -e /target/$entry; done" });
}

async function safetyQuiesce(execution) {
  const errors = [];
  const attempt = async (action) => { try { await action(); } catch (error) { errors.push(error); } };
  await attempt(() => godel(["stop", "app", "nginx"]));
  await attempt(() => supabase(["stop"].concat(NON_DB_SERVICES)));
  await attempt(() => supabase(["stop", "-t", "120", "db"]));
  await attempt(async () => {
    for (const [kind, services] of [["supabase", SUPABASE_SERVICES], ["godel", GODEL_SERVICES]]) {
      for (const service of services) {
        const current = await containerState(await composeContainerAnyState(kind, service));
        if (!["exited", "created", "dead"].includes(current.status)) die("post-mutation runtime quiesce not demonstrated");
      }
    }
  });
  if (errors.length) throw new AggregateError(errors, "post-mutation safety quiesce failed");
}

async function writePostMutationFailureMarker(execution, sourceManifest, defensiveManifest) {
  await writeFile(resolve(BACKUP_LOCK, "restore-failure.json"), JSON.stringify({ schemaVersion: 1, status: "FAILED_AFTER_MUTATION", failedAt: new Date().toISOString(), phase: execution.phase, sourceBackupId: sourceManifest?.backupId ?? null, sourceBackup: basename(execution.sourceBackup), defensiveBackupId: defensiveManifest?.backupId ?? null, defensiveBackup: basename(execution.defensiveBackup) }, null, 2) + "\n", { mode: 0o600 });
}

async function restore(value) {
  const sourceManifest = await assertSourceCandidate(value.backup, value.protectedRoot, "source");
  const repository = await assertGitSafety(sourceManifest.repository.commit);
  const targets = await assertOperationalCompatibility(sourceManifest);
  await postgresStopSignal(targets.db);
  assertPathSafety(value, targets);
  await assertExternalRecoveryDependencies(sourceManifest);
  await assertNoActiveBackupLock();
  await assertRestoreDiskReadiness(sourceManifest, targets);
  const defensiveManifest = await validateDefensiveBackup(value, sourceManifest, repository, !value.dryRun);
  if (value.dryRun) {
    logDryRunPlan();
    log("dry-run PASS; no runtime or filesystem mutation was performed");
    return;
  }
  if (!value.confirmed) die("destructive restore requires --confirm-destructive-qa-restore");
  const execution = { lockOwned: false, maintenanceStarted: false, mutationStarted: false, restoredRuntimeStarted: false, runtimeHealthy: false, abortRequested: false, abortSignal: null, phase: "pre-lock", dbStarted: false, nonDbStarted: false, godelStarted: false, sourceBackup: value.backup, defensiveBackup: value.defensiveBackup };
  try {
    execution.phase = "acquire-lock";
    try {
      await mkdir(BACKUP_LOCK, { mode: 0o700 });
      execution.lockOwned = true;
    } catch (error) {
      if (error?.code === "EEXIST") die("backup lock exists; restore aborting before maintenance");
      throw error;
    }
    const handleSignal = (signal) => {
      if (!execution.abortRequested) {
        execution.abortRequested = true;
        execution.abortSignal = signal;
        log("abort requested by " + signal);
      }
    };
    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);
    let operationError;
    let preserveLock = false;
    let lockedSourceManifest = null;
    let lockedDefensiveManifest = null;
    try {
      execution.phase = "reverify-after-lock";
      lockedSourceManifest = await assertSourceCandidate(value.backup, value.protectedRoot, "source");
      lockedDefensiveManifest = await validateDefensiveBackup(value, lockedSourceManifest, repository, true);
      if (lockedSourceManifest.backupId !== sourceManifest.backupId || lockedSourceManifest.repository.commit !== sourceManifest.repository.commit || lockedDefensiveManifest.backupId !== defensiveManifest.backupId || lockedDefensiveManifest.repository.commit !== defensiveManifest.repository.commit) die("backup identity changed after lock acquisition");
      throwIfAbortRequested(execution);

      execution.phase = "stop-godel";
      execution.maintenanceStarted = true;
      await godel(["stop", "app", "nginx"]);
      throwIfAbortRequested(execution);
      execution.phase = "stop-supabase-non-db";
      await supabase(["stop"].concat(NON_DB_SERVICES));
      throwIfAbortRequested(execution);
      execution.phase = "stop-postgresql";
      await supabase(["stop", "-t", "120", "db"]);
      await assertCleanPostgresStopped(targets.db);
      await assertPostmasterPidAbsent(targets.pgdata.Source, lockedSourceManifest.supabase.dbImage);
      throwIfAbortRequested(execution);

      // Mutation boundary: from this point the original runtime is never restarted automatically.
      execution.phase = "replace-pgdata";
      execution.mutationStarted = true;
      await clearExactTarget(lockedSourceManifest.supabase.dbImage, targets.pgdata.Source);
      await restoreArchive(lockedSourceManifest.supabase.dbImage, resolve(value.backup, "postgres/physical"), "pgdata.tar", targets.pgdata.Source);
      await assertRestoredPgdata(lockedSourceManifest.supabase.dbImage, targets.pgdata.Source);
      throwIfAbortRequested(execution);

      execution.phase = "replace-storage";
      await clearExactTarget(lockedSourceManifest.supabase.dbImage, targets.storageData.Source);
      await restoreArchive(lockedSourceManifest.supabase.dbImage, resolve(value.backup, "storage"), "storage.tar", targets.storageData.Source);
      await assertRestoredStorage(lockedSourceManifest.supabase.dbImage, targets.storageData.Source);
      throwIfAbortRequested(execution);

      execution.phase = "rebuild-db-config";
      await rebuildDbConfig(lockedSourceManifest.supabase.dbImage, targets.dbConfig.Name);
      execution.phase = "restore-pgsodium-key";
      await restoreProtectedKey(lockedSourceManifest.supabase.dbImage, resolve(value.protectedRoot, basename(value.backup)), targets.dbConfig.Name);
      throwIfAbortRequested(execution);

      execution.phase = "start-restored-postgresql";
      await supabase(["start", "db"]);
      execution.dbStarted = true;
      execution.restoredRuntimeStarted = true;
      await waitForHealthy("supabase", ["db"]);
      throwIfAbortRequested(execution);
      execution.phase = "start-restored-supabase";
      await supabase(["start"].concat(NON_DB_SERVICES));
      execution.nonDbStarted = true;
      await waitForHealthy("supabase", SUPABASE_SERVICES);
      throwIfAbortRequested(execution);
      execution.phase = "start-restored-godel";
      await godel(["start", "app", "nginx"]);
      execution.godelStarted = true;
      await waitForHealthy("godel", GODEL_SERVICES);
      for (const path of ["/api/health/live", "/api/health/ready"]) {
        const response = await fetch("http://localhost:8080" + path);
        if (!response.ok) die("restored application health endpoint failed");
      }
      execution.runtimeHealthy = true;
      execution.phase = "complete";
      log("restore runtime PASS " + lockedSourceManifest.backupId);
    } catch (restoreError) {
      if (execution.mutationStarted) {
        preserveLock = true;
        let quiesceError;
        try { await safetyQuiesce(execution); } catch (error) { quiesceError = error; }
        let markerError;
        try { await writePostMutationFailureMarker(execution, lockedSourceManifest, lockedDefensiveManifest); } catch (error) { markerError = error; }
        console.error("[ops:restore:selfhosted] RESTORE FAILED AFTER TARGET MUTATION");
        if (quiesceError) {
          console.error("[ops:restore:selfhosted] RUNTIME QUIESCE NOT DEMONSTRATED");
          console.error("[ops:restore:selfhosted] MANUAL SAFETY INTERVENTION REQUIRED");
        } else {
          console.error("[ops:restore:selfhosted] RUNTIME LEFT STOPPED");
        }
        console.error("[ops:restore:selfhosted] DEFENSIVE ROLLBACK REQUIRED");
        console.error("[ops:restore:selfhosted] OPERATION LOCK PRESERVED");
        operationError = new AggregateError([restoreError, ...(quiesceError ? [quiesceError] : []), ...(markerError ? [markerError] : [])], "RESTORE FAILED AFTER TARGET MUTATION");
      } else if (execution.maintenanceStarted) {
        try {
          await recoverOriginalRuntime();
          console.error("[ops:restore:selfhosted] RESTORE FAILED BEFORE MUTATION / ORIGINAL RUNTIME RECOVERED");
          operationError = new Error("RESTORE FAILED BEFORE MUTATION / ORIGINAL RUNTIME RECOVERED", { cause: restoreError });
        } catch (recoveryError) {
          preserveLock = true;
          operationError = new AggregateError([restoreError, recoveryError], "RESTORE FAILED BEFORE MUTATION / ORIGINAL RUNTIME RECOVERY FAILED");
        }
      } else {
        operationError = restoreError;
      }
    } finally {
      process.off("SIGINT", handleSignal);
      process.off("SIGTERM", handleSignal);
      if (execution.lockOwned && !preserveLock) {
        try { await rm(BACKUP_LOCK, { recursive: true, force: true }); } catch (lockError) {
          operationError = operationError ? new AggregateError([operationError, lockError], "RESTORE FAILED / LOCK CLEANUP FAILED") : new Error("restore succeeded but lock cleanup failed", { cause: lockError });
        }
      }
      if (operationError) throw operationError;
    }
  } catch (error) {
    throw error;
  }
}

try {
  await restore(options(process.argv.slice(2)));
} catch (error) {
  console.error("[ops:restore:selfhosted] ERROR: " + error.message);
  process.exitCode = 1;
}
