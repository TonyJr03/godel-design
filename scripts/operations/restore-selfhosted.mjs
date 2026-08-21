import { spawn } from "node:child_process";
import { readFile, stat, statfs } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const SUPABASE_DIR = resolve(ROOT, "infra/supabase");
const BACKUP_LOCK = resolve(ROOT, "backups/selfhosted/.backup-selfhosted.lock");
const UPSTREAM_PIN = "e846d45ce64207b952a4df44ac8b480ea0abb27e";
const SUPABASE_SERVICES = ["studio", "api-gw", "auth", "rest", "realtime", "storage", "imgproxy", "meta", "functions", "db", "supavisor"];
const GODEL_SERVICES = ["app", "nginx"];
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

async function containerState(container) {
  const parsed = JSON.parse(await inspect(container, "{{json .State}}"));
  const image = await inspect(container, "{{.Config.Image}}");
  return { status: parsed.Status, health: parsed.Health?.Status ?? "none", image };
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

async function assertSourceCandidate(backup, protectedRoot, label) {
  if (containsIncompleteSegment(backup) || containsIncompleteSegment(protectedRoot)) die(label + " cannot use incomplete artifact paths");
  await existingDirectory(backup, label + " backup");
  await existingDirectory(protectedRoot, label + " protected root");
  await officialVerify(backup, protectedRoot);
  const manifest = await readManifest(backup);
  await Promise.all([
    assertArchiveExtractionSafety(resolve(backup, "postgres/physical/pgdata.tar")),
    assertArchiveExtractionSafety(resolve(backup, "storage/storage.tar")),
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

async function validateDefensiveBackup(value, sourceManifest) {
  if (!value.defensiveBackup) {
    log("defensive backup pending; destructive restore not armed");
    return;
  }
  if (value.defensiveBackup === value.backup) die("defensive backup must be distinct from source backup");
  assertPathSafety({ backup: value.defensiveBackup, protectedRoot: value.defensiveProtectedRoot }, await currentTargets());
  const defensive = await assertSourceCandidate(value.defensiveBackup, value.defensiveProtectedRoot, "defensive");
  if (defensive.supabase.upstreamCommit !== sourceManifest.supabase.upstreamCommit || defensive.supabase.dbImage !== sourceManifest.supabase.dbImage || defensive.supabase.storageImage !== sourceManifest.supabase.storageImage) die("defensive backup is incompatible with source backup");
  log("defensive backup verification PASS");
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

/*
 * Future destructive restore engine contract:
 * BEFORE target mutation, the running runtime and its original target mounts are
 * authoritative. AFTER target mutation begins, a future failure MUST NOT restart
 * a partially restored runtime; it must remain stopped and require defensive rollback.
 */
async function restore(value) {
  const sourceManifest = await assertSourceCandidate(value.backup, value.protectedRoot, "source");
  await assertGitSafety(sourceManifest.repository.commit);
  const targets = await assertOperationalCompatibility(sourceManifest);
  assertPathSafety(value, targets);
  await assertExternalRecoveryDependencies(sourceManifest);
  await assertNoActiveBackupLock();
  await assertRestoreDiskReadiness(sourceManifest, targets);
  await validateDefensiveBackup(value, sourceManifest);
  if (value.dryRun) {
    logDryRunPlan();
    log("dry-run PASS; no runtime or filesystem mutation was performed");
    return;
  }
  if (!value.confirmed) die("destructive restore requires --confirm-destructive-qa-restore");
  die("destructive restore engine is not implemented in SH-04.2B1");
}

try {
  await restore(options(process.argv.slice(2)));
} catch (error) {
  console.error("[ops:restore:selfhosted] ERROR: " + error.message);
  process.exitCode = 1;
}
