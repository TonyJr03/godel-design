#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const ROOT = resolve(import.meta.dirname, "../..");
const EXPECTED_REPOSITORY = "https://github.com/supabase/supabase.git";
const EXPECTED_UPSTREAM_PATH = "docker/";
const CURRENT_BASE_RELEASE_VERSION = "0.8.0";
const KNOWN_DRIFT = new Set([
  ".env.example",
  "CONFIG.md",
  "docker-compose.yml",
  "volumes/db/jwt.sql",
]);
const PERSISTENT_AREAS = ["POSTGRES", "AUTH", "STORAGE", "REALTIME", "SUPAVISOR", "OTHER"];
const OFFICIAL_TAG = /^self-hosted\/v(\d+\.\d+\.\d+)$/;
const SHA = /^[a-f0-9]{40}$/;

function error(code) {
  const value = new Error(code);
  value.code = code;
  return value;
}

function safeError(errorValue) {
  return errorValue instanceof Error ? errorValue.message : "UNKNOWN_ERROR";
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function targetVersion(tag) {
  const match = typeof tag === "string" && tag.match(OFFICIAL_TAG);
  if (!match) throw error("TARGET_MUST_BE_OFFICIAL_SELF_HOSTED_TAG");
  return match[1];
}

function classifyPath(path) {
  if (path === "upgrades.json") return "UPDATE_TOOLING";
  if (path === "docker-compose.yml" || path.startsWith("docker-compose.")) return "COMPOSE";
  if (path === ".env.example") return "ENV_EXAMPLE";
  if (path.startsWith("volumes/api/")) return "API_GATEWAY";
  if (path.startsWith("volumes/auth/")) return "AUTH";
  if (path.startsWith("volumes/rest/")) return "REST";
  if (path.startsWith("volumes/realtime/")) return "REALTIME";
  if (path.startsWith("volumes/storage/")) return "STORAGE";
  if (path.startsWith("volumes/db/")) return "POSTGRES";
  if (path.startsWith("volumes/pooler/")) return "SUPAVISOR";
  if (path.startsWith("volumes/functions/")) return "FUNCTIONS";
  if (path.includes("meta")) return "META";
  if (path.includes("studio")) return "STUDIO";
  if (path.includes("imgproxy")) return "IMGPROXY";
  if (path === "update.sh" || path.includes("update")) return "UPDATE_TOOLING";
  if (path.endsWith(".sh") || path.startsWith("utils/")) return "SCRIPTS";
  if (path.includes("migration") || path.includes("upgrade")) return "MIGRATIONS";
  return "OTHER";
}

function redactLine(line) {
  return line.replace(/([A-Za-z_][A-Za-z0-9_]*=)[^\s]*/g, "$1[REDACTED]");
}

async function git(args, options = {}) {
  return execFile("git", args, { cwd: options.cwd, env: options.env, windowsHide: true, maxBuffer: 1024 * 1024 });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (errorValue) {
    if (errorValue && typeof errorValue === "object" && errorValue.code === "ENOENT") return false;
    throw errorValue;
  }
}

async function walkFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const child = join(directory, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...await walkFiles(child, name));
    else if (entry.isFile()) paths.push(name);
  }
  return paths.sort();
}

function ignoredOperationalPath(path) {
  return path === ".env"
    || path === ".supabase-version"
    || path.startsWith("backups/")
    || path.startsWith("volumes/db/data/")
    || path.startsWith("volumes/storage/")
    || path.startsWith("volumes/snippets/")
    || (path.startsWith("volumes/functions/") && path !== "volumes/functions/main/index.ts");
}

async function fileDigest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function structuralDelta(baseDirectory, targetDirectory) {
  const [baseFiles, targetFiles] = await Promise.all([walkFiles(baseDirectory), walkFiles(targetDirectory)]);
  const base = new Set(baseFiles);
  const target = new Set(targetFiles);
  const added = targetFiles.filter((path) => !base.has(path));
  const removed = baseFiles.filter((path) => !target.has(path));
  const modified = [];
  for (const path of baseFiles.filter((path) => target.has(path))) {
    if (await fileDigest(join(baseDirectory, path)) !== await fileDigest(join(targetDirectory, path))) modified.push(path);
  }
  const all = [...added, ...removed, ...modified];
  return {
    added,
    removed,
    modified,
    counts: { added: added.length, removed: removed.length, modified: modified.length, total: all.length },
    classifications: [...new Set(all.map(classifyPath))].sort(),
  };
}

async function godelDrift(baseDirectory, vendorDirectory, knownDrift = KNOWN_DRIFT) {
  const [baseFiles, vendorFiles] = await Promise.all([walkFiles(baseDirectory), walkFiles(vendorDirectory)]);
  const paths = [...new Set([...baseFiles, ...vendorFiles])].filter((path) => !ignoredOperationalPath(path));
  const changed = [];
  for (const path of paths) {
    const basePath = join(baseDirectory, path);
    const vendorPath = join(vendorDirectory, path);
    if (!await exists(basePath) || !await exists(vendorPath) || await fileDigest(basePath) !== await fileDigest(vendorPath)) changed.push(path);
  }
  return {
    changed: changed.map((path) => ({ path, classification: knownDrift.has(path) ? "GODEL_REQUIRED" : "UNKNOWN" })),
    unknown: changed.filter((path) => !knownDrift.has(path)),
    valid: changed.filter((path) => !knownDrift.has(path)).length === 0 && [...knownDrift].every((path) => changed.includes(path)),
  };
}

function serviceImages(contents) {
  const images = new Map();
  let current = null;
  for (const line of contents.split(/\r?\n/)) {
    const service = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (service) {
      current = service[1];
      continue;
    }
    const image = line.match(/^    image:\s*([^\s#]+)\s*$/);
    if (current && image) {
      if (image[1].includes("${")) throw error(`IMAGE_IDENTITY_AMBIGUOUS:${current}`);
      images.set(current, image[1]);
    }
  }
  if (images.size === 0) throw error("COMPOSE_IMAGES_UNRESOLVABLE");
  return images;
}

async function imageDelta(baseDirectory, targetDirectory) {
  const [base, target] = await Promise.all([
    readFile(join(baseDirectory, "docker-compose.yml"), "utf8"),
    readFile(join(targetDirectory, "docker-compose.yml"), "utf8"),
  ]);
  const oldImages = serviceImages(base);
  const newImages = serviceImages(target);
  const services = [...new Set([...oldImages.keys(), ...newImages.keys()])].sort();
  return services.map((service) => {
    const oldImage = oldImages.get(service) ?? null;
    const newImage = newImages.get(service) ?? null;
    if (!oldImage || !newImage) throw error(`IMAGE_IDENTITY_MISSING:${service}`);
    return { service, oldImage, newImage, changed: oldImage !== newImage };
  });
}

function parseAuthority(markdown, lock) {
  const base = markdown.match(/Commit exacto:\s*`?([a-f0-9]{40})`?/i)?.[1];
  if (!base || !SHA.test(base) || lock.repository !== EXPECTED_REPOSITORY || lock.upstream_path !== EXPECTED_UPSTREAM_PATH || !SHA.test(lock.base_ref) || base !== lock.base_ref) {
    throw error("TRACKED_UPSTREAM_AUTHORITY_MISMATCH");
  }
  if (!markdown.includes("https://github.com/supabase/supabase") || lock.authority !== "SUPABASE_UPSTREAM.md") throw error("TRACKED_UPSTREAM_AUTHORITY_INVALID");
  return { repository: lock.repository, upstreamPath: lock.upstream_path, baseRef: lock.base_ref };
}

async function stampStatus(vendorDirectory, expectedRef) {
  const stamp = join(vendorDirectory, ".supabase-version");
  if (!await exists(stamp)) return { status: "ABSENT_VALID", ref: null };
  const lines = (await readFile(stamp, "utf8")).split(/\r?\n/).filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  const refLine = lines.find((line) => /^ref=/.test(line.trim()));
  const ref = refLine?.replace(/^ref=/, "").trim();
  if (!ref || lines.filter((line) => /^ref=/.test(line.trim())).length !== 1 || !SHA.test(ref)) throw error("LOCAL_STAMP_MALFORMED");
  if (ref !== expectedRef) throw error("LOCAL_STAMP_MISMATCH");
  return { status: "PRESENT_MATCHING_VALID", ref };
}

function parseUpgrades(contents, baseVersion, target) {
  let manifest;
  try {
    manifest = JSON.parse(contents);
  } catch {
    throw error("UPGRADES_MANIFEST_INVALID");
  }
  if (!manifest || Array.isArray(manifest) || typeof manifest !== "object") throw error("UPGRADES_MANIFEST_INVALID");
  const targetSemver = targetVersion(target);
  const gates = [];
  for (const [version, entry] of Object.entries(manifest)) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) continue;
    if (compareVersions(version, targetSemver) > 0) {
      gates.push({ version, classification: "NOT_APPLICABLE" });
    } else if (compareVersions(version, baseVersion) <= 0) {
      gates.push({ version, classification: "ALREADY_PRESENT_IN_BASE" });
    } else if (!entry || Array.isArray(entry) || typeof entry !== "object") {
      gates.push({ version, classification: "UNCLEAR" });
    } else {
      gates.push({ version, classification: "APPLIES_TO_BASE_TO_TARGET" });
    }
  }
  return gates.sort((left, right) => compareVersions(left.version, right.version));
}

function validateGodelContract(runtimeCompose) {
  const checks = {
    internalServerUrl: /SUPABASE_SERVER_URL:\s+\$\{SUPABASE_SERVER_URL:-\}/.test(runtimeCompose),
    publicBrowserUrl: /NEXT_PUBLIC_SUPABASE_URL:\s+\$\{NEXT_PUBLIC_SUPABASE_URL/.test(runtimeCompose),
    serverOnlySecret: /SUPABASE_SECRET_KEY:\s+\$\{SUPABASE_SECRET_KEY:-\}/.test(runtimeCompose),
  };
  return { checks, valid: Object.values(checks).every(Boolean) };
}

function createCandidateComposeConfigInvocation(candidateDirectory, tempDirectory) {
  const composePath = join(candidateDirectory, "docker-compose.yml");
  const overridePath = join(candidateDirectory, "supabase-godel.override.yml");
  return {
    command: "docker",
    args: ["compose", "-f", composePath, "-f", overridePath, "config", "--no-interpolate", "--no-env-resolution", "--format", "json"],
    cwd: candidateDirectory,
    env: composeConfigEnvironment(tempDirectory),
  };
}

function executionEnvironment() {
  const inherited = ["PATH", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"];
  if (process.platform === "win32") inherited.push("HOME", "USERPROFILE");
  else inherited.push("HOME");
  return Object.fromEntries(inherited.flatMap((key) => process.env[key] ? [[key, process.env[key]]] : []));
}

function composeConfigEnvironment(tempDirectory) {
  return {
    ...executionEnvironment(),
    COMPOSE_DISABLE_ENV_FILE: "1",
    DOCKER_CONFIG: join(tempDirectory, "docker-config"),
  };
}

async function runCandidateComposeConfig(invocation) {
  try {
    const { stdout } = await execFile(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
    });
    return { ok: true, output: stdout };
  } catch {
    return { ok: false };
  }
}

function noPublishedPorts(service) {
  return !Object.hasOwn(service, "ports") || (Array.isArray(service.ports) && service.ports.length === 0);
}

function networkIsExternal(network) {
  return Boolean(network && typeof network === "object" && network.external === true);
}

function serviceHasNetwork(service, networkName) {
  if (!service || typeof service !== "object") return false;
  if (Array.isArray(service.networks)) return service.networks.includes(networkName);
  return Boolean(service.networks && typeof service.networks === "object" && Object.hasOwn(service.networks, networkName));
}

function hasExpectedEnvironment(service, variable, expected) {
  return Boolean(service?.environment && typeof service.environment === "object" && service.environment[variable] === expected);
}

function validateEffectiveCandidateCompose(effectiveCompose, runtimeCompose) {
  const services = effectiveCompose?.services;
  const networks = effectiveCompose?.networks;
  if (!services || typeof services !== "object" || !networks || typeof networks !== "object") return { status: "FAIL" };
  const requiredServices = ["api-gw", "supavisor", "auth", "realtime", "storage", "functions"];
  const checks = Object.fromEntries(requiredServices.map((service) => [`service_${service}`, Boolean(services[service] && typeof services[service] === "object")]));
  checks.apiGwPortsClosed = noPublishedPorts(services["api-gw"]);
  checks.supavisorPortsClosed = noPublishedPorts(services.supavisor);
  checks.externalNetwork = networkIsExternal(networks["godel-supabase-api"]);
  checks.apiGwNetwork = serviceHasNetwork(services["api-gw"], "godel-supabase-api");
  checks.gotrueJwks = hasExpectedEnvironment(services.auth, "GOTRUE_JWT_KEYS", "${JWT_KEYS:-[]}");
  checks.realtimeJwks = hasExpectedEnvironment(services.realtime, "API_JWT_JWKS", '${JWT_JWKS:-{"keys":[]}}');
  checks.storageJwks = hasExpectedEnvironment(services.storage, "JWT_JWKS", '${JWT_JWKS:-{"keys":[]}}');
  checks.functionsJwks = hasExpectedEnvironment(services.functions, "SUPABASE_JWKS", '${JWT_JWKS:-{"keys":[]}}');
  Object.assign(checks, validateGodelContract(runtimeCompose).checks);
  return { status: Object.values(checks).every(Boolean) ? "PASS" : "FAIL" };
}

async function validateCandidateCompose({ targetDirectory, override, runtimeCompose, tempDirectory, runConfig = runCandidateComposeConfig }) {
  const candidateDirectory = join(tempDirectory, "candidate-supabase");
  await mkdir(candidateDirectory, { recursive: true });
  await mkdir(join(tempDirectory, "docker-config"), { recursive: true });
  await Promise.all([
    writeFile(join(candidateDirectory, "docker-compose.yml"), await readFile(join(targetDirectory, "docker-compose.yml"), "utf8")),
    writeFile(join(candidateDirectory, "supabase-godel.override.yml"), override),
  ]);
  const result = await runConfig(createCandidateComposeConfigInvocation(candidateDirectory, tempDirectory));
  if (!result?.ok || typeof result.output !== "string") return { status: "FAIL" };
  let effectiveCompose;
  try {
    effectiveCompose = JSON.parse(result.output);
  } catch {
    return { status: "FAIL" };
  }
  return validateEffectiveCandidateCompose(effectiveCompose, runtimeCompose);
}

function persistentRisk(delta, images) {
  const affected = new Set(delta.classifications);
  const risk = Object.fromEntries(PERSISTENT_AREAS.map((area) => [area, "NO_PERSISTENT_CHANGE"]));
  if (affected.has("POSTGRES")) risk.POSTGRES = "REQUIRES_RUNTIME_PROOF";
  if (affected.has("AUTH")) risk.AUTH = "REQUIRES_RUNTIME_PROOF";
  if (affected.has("STORAGE")) risk.STORAGE = "REQUIRES_RUNTIME_PROOF";
  if (affected.has("REALTIME")) risk.REALTIME = "REQUIRES_RUNTIME_PROOF";
  if (affected.has("SUPAVISOR")) risk.SUPAVISOR = "REQUIRES_RUNTIME_PROOF";
  if (affected.has("MIGRATIONS") || affected.has("COMPOSE") || affected.has("OTHER")) risk.OTHER = "REQUIRES_RUNTIME_PROOF";
  const imageAreas = { db: "POSTGRES", auth: "AUTH", storage: "STORAGE", realtime: "REALTIME", supavisor: "SUPAVISOR" };
  for (const image of images.filter((entry) => entry.changed)) {
    risk[imageAreas[image.service] ?? "OTHER"] = "REQUIRES_RUNTIME_PROOF";
  }
  // A non-zero delta without a named persistent owner is never implicitly compatible.
  if (delta.counts.total > 0 && Object.values(risk).every((value) => value === "NO_PERSISTENT_CHANGE")) risk.OTHER = "REQUIRES_RUNTIME_PROOF";
  return risk;
}

async function acquireSnapshots({ repository, baseRef, target, tempDirectory }) {
  async function snapshot(ref, name, exactTag = false) {
    const checkout = join(tempDirectory, `checkout-${name}`);
    await git(["init", "-q", checkout]);
    await git(["-C", checkout, "remote", "add", "origin", repository]);
    await git(["-C", checkout, "config", "core.sparseCheckout", "true"]);
    await git(["-C", checkout, "sparse-checkout", "set", "docker"]);
    if (exactTag) {
      const tagRef = `refs/tags/${ref}`;
      await git(["-C", checkout, "fetch", "--depth=1", "--filter=blob:none", "--no-tags", "-q", "origin", `${tagRef}:${tagRef}`]);
      const { stdout } = await git(["-C", checkout, "rev-parse", `${tagRef}^{commit}`]);
      await git(["-C", checkout, "checkout", "-q", stdout.trim()]);
      const destination = join(tempDirectory, name);
      await cp(join(checkout, "docker"), destination, { recursive: true });
      return { directory: destination, commit: stdout.trim(), tag: ref };
    }
    await git(["-C", checkout, "fetch", "--depth=1", "--filter=blob:none", "-q", "origin", ref]);
    const { stdout } = await git(["-C", checkout, "rev-parse", "FETCH_HEAD^{commit}"]);
    await git(["-C", checkout, "checkout", "-q", "FETCH_HEAD"]);
    const destination = join(tempDirectory, name);
    await cp(join(checkout, "docker"), destination, { recursive: true });
    return { directory: destination, commit: stdout.trim() };
  }
  const base = await snapshot(baseRef, "base");
  let targetSnapshot;
  try {
    targetSnapshot = await snapshot(target, "target", true);
  } catch {
    throw error("OFFICIAL_TAG_UNRESOLVED");
  }
  return { base, target: targetSnapshot };
}

async function runRuntimePreflight(preflight, context) {
  if (!preflight) return { status: "NOT_RUN" };
  const result = await preflight(context);
  const safeChecks = ["health", "d5", "lock", "failureMarker"];
  if (!result || typeof result !== "object" || !safeChecks.every((check) => result[check] === "PASS")) {
    throw error("RUNTIME_PREFLIGHT_FAILED");
  }
  return { status: "PASS" };
}

function dryRunEnvironment(repository) {
  return {
    ...executionEnvironment(),
    SUPABASE_REPO_URL: repository,
  };
}

function createDryRunInvocation({ candidateDirectory, baseRef, target, repository }) {
  const shell = process.platform === "win32" ? (process.env.GODEL_GIT_SH ?? "C:\\Program Files\\Git\\bin\\sh.exe") : "sh";
  return {
    command: shell,
    args: [join(candidateDirectory, "update.sh"), "--dry-run", "--from", baseRef, "--to", target],
    cwd: candidateDirectory,
    env: dryRunEnvironment(repository),
  };
}

async function runDryRunCommand(invocation) {
  return execFile(invocation.command, invocation.args, {
    cwd: invocation.cwd,
    env: invocation.env,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  }).catch((failure) => ({ stdout: failure.stdout ?? "", stderr: failure.stderr ?? "", code: failure.code ?? 1 }));
}

async function defaultDryRun({ candidateDirectory, baseRef, target, repository, runCommand = runDryRunCommand }) {
  const result = await runCommand(createDryRunInvocation({ candidateDirectory, baseRef, target, repository }));
  const output = redactLine(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return {
    conflicts: /CONFLICTS:\s+[1-9]|Files with merge conflicts|merge failures:\s+[1-9]/.test(output),
    failed: result.code && result.code !== 0,
    statuses: output.split(/\r?\n/).filter((line) => /^\s+(updated|new|merged|CONFLICT|merge-failed):/.test(line)).map((line) => line.trim()),
  };
}

async function copyCandidateVendor(source, target) {
  const paths = await walkFiles(source);
  for (const path of paths.filter((value) => !ignoredOperationalPath(value))) {
    const destination = join(target, path);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(source, path), destination, { force: true, recursive: false });
  }
  await writeFile(join(target, ".env"), await readFile(join(source, ".env.example"), "utf8"));
}

export async function createUpdatePlan(options = {}) {
  const root = resolve(options.root ?? ROOT);
  const target = options.target;
  const tempDirectory = await mkdtemp(join(tmpdir(), "godel-sh044b-"));
  const evidence = {
    plannerResult: "ERROR",
    tempDirectoryCleaned: false,
    runtimePreflight: { status: "NOT_RUN" },
    candidateCompose: { status: "NOT_RUN" },
  };
  try {
    targetVersion(target);
    const [authorityText, lockText, override, runtimeCompose] = await Promise.all([
      readFile(join(root, "infra/SUPABASE_UPSTREAM.md"), "utf8"),
      readFile(join(root, "infra/supabase-upstream.lock.json"), "utf8"),
      readFile(join(root, "infra/supabase-godel.override.yml"), "utf8"),
      readFile(join(root, "compose.yaml"), "utf8"),
    ]);
    let lock;
    try { lock = JSON.parse(lockText); } catch { throw error("UPSTREAM_LOCK_INVALID"); }
    const authority = parseAuthority(authorityText, lock);
    const vendorDirectory = resolve(root, "infra/supabase");
    evidence.base = authority.baseRef;
    evidence.target = target;
    evidence.targetTag = target;
    evidence.stamp = await stampStatus(vendorDirectory, authority.baseRef);

    let snapshots;
    try {
      snapshots = await (options.acquireSnapshots ?? acquireSnapshots)({ repository: options.snapshotRepository ?? authority.repository, baseRef: authority.baseRef, target, tempDirectory });
    } catch (failure) {
      if (safeError(failure) === "OFFICIAL_TAG_UNRESOLVED") throw failure;
      throw error("UPSTREAM_SNAPSHOT_ACQUISITION_FAILED");
    }
    if (!SHA.test(snapshots.base.commit) || snapshots.base.commit !== authority.baseRef) throw error("BASE_SNAPSHOT_MISMATCH");
    if (!SHA.test(snapshots.target.commit)) throw error("TARGET_REF_UNRESOLVED");
    evidence.targetCommit = snapshots.target.commit;
    evidence.delta = await structuralDelta(snapshots.base.directory, snapshots.target.directory);
    const zero = evidence.delta.counts.total === 0;
    if (!zero) {
      evidence.candidateCompose = await (options.validateCandidateCompose ?? validateCandidateCompose)({
        targetDirectory: snapshots.target.directory,
        override,
        runtimeCompose,
        tempDirectory,
        runConfig: options.runCandidateComposeConfig ?? runCandidateComposeConfig,
      });
      if (evidence.candidateCompose?.status !== "PASS") throw error("CANDIDATE_COMPOSE_INVALID");
    }
    evidence.images = await imageDelta(snapshots.base.directory, snapshots.target.directory);
    evidence.gates = parseUpgrades(await readFile(join(snapshots.target.directory, "upgrades.json"), "utf8"), options.baseReleaseVersion ?? CURRENT_BASE_RELEASE_VERSION, target);
    evidence.drift = await godelDrift(snapshots.base.directory, vendorDirectory, options.knownDrift ?? KNOWN_DRIFT);
    if (!evidence.drift.valid) throw error("UNEXPECTED_GODEL_DRIFT");
    if (evidence.gates.some((gate) => gate.classification === "UNCLEAR")) throw error("BREAKING_GATE_UNCLEAR");

    evidence.persistentRisk = persistentRisk(evidence.delta, evidence.images);
    evidence.rollbackClass = zero ? "R0_PRE_RUNTIME_ABORT" : Object.values(evidence.persistentRisk).some((value) => value !== "NO_PERSISTENT_CHANGE") ? "R3_RECOVERY_REQUIRED_ROLLBACK" : "R1_CONFIG_VENDOR_ROLLBACK";
    evidence.recoveryBackup = zero ? "NOT_REQUIRED_WITH_EVIDENCE" : "REQUIRED";

    if (zero) {
      evidence.candidateCompose = { status: "NOT_REQUIRED_ZERO_DELTA" };
      evidence.plannerResult = "NO_UPDATE_REQUIRED";
      return evidence;
    }

    const candidateDirectory = join(tempDirectory, "candidate");
    await copyCandidateVendor(vendorDirectory, candidateDirectory);
    const dryRun = await (options.dryRun ?? defaultDryRun)({
      candidateDirectory,
      baseRef: authority.baseRef,
      target,
      repository: authority.repository,
      runCommand: options.runDryRunCommand ?? runDryRunCommand,
    });
    evidence.updateShDryRun = dryRun;
    if (dryRun.conflicts || dryRun.failed) throw error("UPDATE_SH_DRY_RUN_BLOCKED");
    evidence.runtimePreflight = await runRuntimePreflight(options.runtimePreflight, {
      baseRef: authority.baseRef,
      targetTag: target,
      targetCommit: evidence.targetCommit,
    });
    evidence.plannerResult = "UPDATE_PLAN_READY";
    return evidence;
  } catch (failure) {
    evidence.plannerResult = safeError(failure).startsWith("TARGET_") ? "ERROR" : "BLOCKED";
    evidence.blockedBy = safeError(failure);
    return evidence;
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
    evidence.tempDirectoryCleaned = !await exists(tempDirectory);
  }
}

function parseArguments(args) {
  if (args.length !== 2 || args[0] !== "--to") throw error("USAGE: npm run ops:supabase:update:plan -- --to self-hosted/vX.Y.Z");
  return { target: args[1] };
}

async function main() {
  const result = await createUpdatePlan(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.plannerResult === "BLOCKED" || result.plannerResult === "ERROR" ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((failure) => {
    console.error(JSON.stringify({ plannerResult: "ERROR", blockedBy: safeError(failure) }));
    process.exitCode = 1;
  });
}
