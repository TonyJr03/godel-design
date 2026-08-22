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
const REQUIRED_ARTIFACTS_V1 = ["postgres/logical/cluster.sql", "postgres/physical/pgdata.tar", "storage/storage.tar"];
const REQUIRED_ARTIFACTS_V2 = [...REQUIRED_ARTIFACTS_V1, "storage/xattrs.json"];
const STORAGE_XATTR_IMAGE = "supabase/storage-api:v1.60.4";
const STORAGE_XATTR_SIDECAR_SCHEMA_VERSION = 1;
const STORAGE_XATTR_SIDECAR_FORMAT = "supabase-file-xattrs";
const STORAGE_XATTR_NAMES = ["user.supabase.cache-control", "user.supabase.content-type", "user.supabase.etag"];
const LEGACY_STORAGE_XATTR_NAMES = ["user.supabase.cache-control", "user.supabase.content-type"];
const MAX_STORAGE_XATTR_ENTRIES = 100000;
const MAX_STORAGE_XATTR_PATH_LENGTH = 4096;
const MAX_STORAGE_XATTR_VALUE_BYTES = 64 * 1024;
const LEGACY_STORAGE_XATTR_TEMP = "legacy-storage-xattrs.json";
const MIN_RESTORE_MARGIN = 512 * 1024 * 1024;

function log(message) { console.log("[ops:restore:selfhosted] " + message); }
function die(message) { throw new Error(message); }
function requiredArtifacts(schemaVersion) {
  if (schemaVersion === 1) return REQUIRED_ARTIFACTS_V1;
  if (schemaVersion === 2) return REQUIRED_ARTIFACTS_V2;
  die("source backup has unsupported schema version");
}
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function safeStorageXattrPath(value) {
  if (typeof value !== "string" || !value || value.length > MAX_STORAGE_XATTR_PATH_LENGTH || value.startsWith("/") || value.includes("\\") || /[\0-\x1f]/.test(value)) die("invalid storage xattr sidecar path");
  if (value.split("/").some((segment) => !segment || segment === "." || segment === "..")) die("invalid storage xattr sidecar path");
}
function canonicalBase64(value) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) die("invalid storage xattr sidecar value");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length > MAX_STORAGE_XATTR_VALUE_BYTES || decoded.toString("base64") !== value) die("invalid storage xattr sidecar value");
}
function compactJsonSource(source) {
  let compact = "", quoted = false, escaped = false;
  for (const character of source) {
    if (quoted) {
      compact += character;
      if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === "\"") quoted = false;
    } else if (character === "\"") {
      quoted = true; compact += character;
    } else if (!/\s/.test(character)) compact += character;
  }
  return compact;
}
function validateStorageXattrSidecar(value, allowedNames = STORAGE_XATTR_NAMES) {
  if (!plainObject(value) || Object.keys(value).join("\0") !== ["schemaVersion", "format", "entries"].join("\0") || value.schemaVersion !== STORAGE_XATTR_SIDECAR_SCHEMA_VERSION || value.format !== STORAGE_XATTR_SIDECAR_FORMAT || !Array.isArray(value.entries) || value.entries.length > MAX_STORAGE_XATTR_ENTRIES) die("invalid storage xattr sidecar");
  let previousPath = "";
  for (const entry of value.entries) {
    if (!plainObject(entry) || Object.keys(entry).join("\0") !== ["path", "attributes"].join("\0") || !plainObject(entry.attributes)) die("invalid storage xattr sidecar entry");
    safeStorageXattrPath(entry.path);
    if (previousPath && previousPath >= entry.path) die("storage xattr sidecar paths are not deterministic");
    previousPath = entry.path;
    const names = Object.keys(entry.attributes);
    if (!names.length || names.join("\0") !== [...names].sort().join("\0") || names.some((name) => !allowedNames.includes(name))) die("invalid storage xattr sidecar attributes");
    for (const name of names) canonicalBase64(entry.attributes[name]);
  }
}
async function readStorageXattrSidecar(directory, file = "xattrs.json", allowedNames = STORAGE_XATTR_NAMES) {
  const raw = await readFile(resolve(directory, file), "utf8");
  let sidecar;
  try { sidecar = JSON.parse(raw); } catch { die("invalid storage xattr sidecar JSON"); }
  if (compactJsonSource(raw) !== JSON.stringify(sidecar)) die("storage xattr sidecar is not canonical JSON");
  validateStorageXattrSidecar(sidecar, allowedNames);
  return sidecar;
}

class CommandExecutionError extends Error {
  constructor(operation, exitCode, stderrSummary, cause) {
    super(operation + " failed", cause ? { cause } : undefined);
    this.name = "CommandExecutionError";
    this.operation = operation;
    this.exitCode = exitCode;
    this.stderrSummary = stderrSummary;
  }
}

function sanitizeStderr(value) {
  const normalized = String(value ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 8).map((line) => line
    .replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED_JWT]")
    .replace(/\b(bearer)\s+[^\s]+/gi, "$1 [REDACTED]")
    .replace(/\b(password|passwd|secret|token|authorization|api[ _-]?key|jwt)\b\s*([:=])\s*[^\s,;]+/gi, "$1$2[REDACTED]")
    .slice(0, 240));
  const summary = normalized.join("\n").slice(0, 1200);
  return summary || "(no stderr)";
}

function run(bin, args, cwd = ROOT, allowFailure = false, operation = "subprocess") {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (chunk) => { out += chunk; });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", (error) => reject(new CommandExecutionError(operation, null, "(spawn error)", error)));
    child.on("close", (code) => {
      const result = { code, out: out.trim(), err: err.trim() };
      if (code && !allowFailure) reject(new CommandExecutionError(operation, code, sanitizeStderr(err)));
      else resolvePromise(result);
    });
  });
}

const supabase = (args, allowFailure = false, operation = "Supabase Compose operation") => run("docker", ["compose", "-f", "docker-compose.yml"].concat(args), SUPABASE_DIR, allowFailure, operation);
const godel = (args, allowFailure = false, operation = "Godel Compose operation") => run("docker", ["compose", "--env-file", "compose.env.local", "-f", "compose.yaml"].concat(args), ROOT, allowFailure, operation);

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

async function inspect(container, template, operation = "subprocess") {
  return (await run("docker", ["inspect", container, "--format", template], ROOT, false, operation)).out;
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
  const raw = await inspect(container, "{{json .State}}", "inspect PostgreSQL stopped state");
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    die("invalid PostgreSQL stopped state");
  }
  if (!state || typeof state !== "object" || Array.isArray(state) || typeof state.Status !== "string" || !state.Status || !Number.isInteger(state.ExitCode) || typeof state.OOMKilled !== "boolean") die("invalid PostgreSQL stopped state");
  return { status: state.Status, exitCode: state.ExitCode, oomKilled: state.OOMKilled };
}

async function assertCleanPostgresStopped(container) {
  const current = await stoppedState(container);
  if (current.status !== "exited" || current.exitCode !== 0 || current.oomKilled) die("clean PostgreSQL shutdown not demonstrated");
}

async function runRestoreFilesystem({ image, source, target, command, operation = "restore filesystem operation" }) {
  const args = ["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "--cap-add=CHOWN", "--cap-add=FOWNER"];
  if (source) args.push("-v", source + ":/source:ro");
  if (target) args.push("-v", target + ":/target");
  args.push(image, "sh", "-ec", command);
  return run("docker", args, ROOT, false, operation);
}

const STORAGE_XATTR_REPLAY_SCRIPT = `
const fs = require("fs");
const path = require("path");
const xattr = require("fs-xattr");
const mode = process.argv[1];
const fileName = process.argv[2];
const allAllowed = ${JSON.stringify(STORAGE_XATTR_NAMES)};
const legacyAllowed = ${JSON.stringify(LEGACY_STORAGE_XATTR_NAMES)};
const allow = mode && mode.startsWith("legacy-") ? legacyAllowed : allAllowed;
const maxEntries = ${MAX_STORAGE_XATTR_ENTRIES};
const maxPathLength = ${MAX_STORAGE_XATTR_PATH_LENGTH};
const maxValueBytes = ${MAX_STORAGE_XATTR_VALUE_BYTES};
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function compactJsonSource(source) { let compact = "", quoted = false, escaped = false; for (const character of source) { if (quoted) { compact += character; if (escaped) escaped = false; else if (character === "\\\\") escaped = true; else if (character === "\\\"") quoted = false; } else if (character === "\\\"") { quoted = true; compact += character; } else if (!/\\s/.test(character)) compact += character; } return compact; }
function safePath(value) { if (typeof value !== "string" || !value || value.length > maxPathLength || value.startsWith("/") || value.includes("\\\\") || /[\\0-\\x1f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("invalid storage xattr sidecar path"); }
function base64(value) { if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("invalid storage xattr sidecar value"); const decoded = Buffer.from(value,"base64"); if (decoded.length > maxValueBytes || decoded.toString("base64") !== value) throw new Error("invalid storage xattr sidecar value"); return decoded; }
function validate(value) { if (!plainObject(value) || Object.keys(value).join("\\0") !== ["schemaVersion","format","entries"].join("\\0") || value.schemaVersion !== ${STORAGE_XATTR_SIDECAR_SCHEMA_VERSION} || value.format !== ${JSON.stringify(STORAGE_XATTR_SIDECAR_FORMAT)} || !Array.isArray(value.entries) || value.entries.length > maxEntries) throw new Error("invalid storage xattr sidecar"); let previous = ""; for (const entry of value.entries) { if (!plainObject(entry) || Object.keys(entry).join("\\0") !== ["path","attributes"].join("\\0") || !plainObject(entry.attributes)) throw new Error("invalid storage xattr sidecar entry"); safePath(entry.path); if (previous && previous >= entry.path) throw new Error("storage xattr sidecar paths are not deterministic"); previous = entry.path; const names = Object.keys(entry.attributes); if (!names.length || names.join("\\0") !== [...names].sort().join("\\0") || names.some((name) => !allow.includes(name))) throw new Error("invalid storage xattr sidecar attributes"); for (const name of names) base64(entry.attributes[name]); } }
function targetFor(relative) { const target = path.resolve("/target",...relative.split("/")); if (!target.startsWith("/target/")) throw new Error("unsafe storage xattr target"); const state = fs.lstatSync(target); if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1) throw new Error("unexpected storage filesystem entry"); return target; }
function inventory() { const files = new Set(), queue = ["/target"]; while (queue.length) { const directory = queue.pop(), directoryState = fs.lstatSync(directory); if (!directoryState.isDirectory() || directoryState.isSymbolicLink()) throw new Error("unexpected storage filesystem entry"); for (const item of fs.readdirSync(directory,{withFileTypes:true})) { const current = path.join(directory,item.name), state = fs.lstatSync(current); if (state.isDirectory() && !state.isSymbolicLink()) queue.push(current); else if (state.isFile() && !state.isSymbolicLink() && state.nlink === 1) { const relative = path.relative("/target",current).split(path.sep).join("/"); safePath(relative); files.add(relative); } else throw new Error("unexpected storage filesystem entry"); } } return files; }
if (!["replay","verify","legacy-replay","legacy-verify"].includes(mode) || !/^[A-Za-z0-9._-]+$/.test(fileName) || fileName === "." || fileName === ".." || typeof xattr.listSync !== "function" || typeof xattr.getSync !== "function" || typeof xattr.setSync !== "function") throw new Error("storage xattr helper contract unavailable");
const raw = fs.readFileSync("/source/" + fileName,"utf8");
let sidecar; try { sidecar = JSON.parse(raw); } catch { throw new Error("invalid storage xattr sidecar JSON"); }
if (compactJsonSource(raw) !== JSON.stringify(sidecar)) throw new Error("storage xattr sidecar is not canonical JSON");
validate(sidecar);
if (mode.startsWith("legacy-")) { const actual = inventory(), expected = new Set(sidecar.entries.map((entry) => entry.path)); if (actual.size !== expected.size || [...actual].some((entry) => !expected.has(entry))) throw new Error("legacy Storage physical inventory is not recoverable"); }
for (const entry of sidecar.entries) { const target = targetFor(entry.path), names = Object.keys(entry.attributes); if (mode.endsWith("replay")) for (const name of names) xattr.setSync(target,name,base64(entry.attributes[name])); const actual = new Set(xattr.listSync(target).filter((name) => allow.includes(name))); if (actual.size !== names.length || names.some((name) => !actual.has(name))) throw new Error("storage xattr replay verification failed"); for (const name of names) if (!Buffer.from(xattr.getSync(target,name)).equals(base64(entry.attributes[name]))) throw new Error("storage xattr replay verification failed"); }
`;

async function runStorageXattrHelper({ image, source, target, fileName, mode, operation }) {
  if (image !== STORAGE_XATTR_IMAGE || !["replay", "verify", "legacy-replay", "legacy-verify"].includes(mode) || !/^[A-Za-z0-9._-]+$/.test(fileName) || fileName === "." || fileName === "..") die("storage xattr helper contract is incompatible");
  const args = ["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "-v", source + ":/source:ro", "-v", target + ":/target", image, "sh", "-ec", "node -e " + JSON.stringify(STORAGE_XATTR_REPLAY_SCRIPT) + " " + mode + " " + fileName];
  await run("docker", args, ROOT, false, operation);
}

function safeStoragePathSegment(value, label) {
  if (typeof value !== "string" || !value || value.length > MAX_STORAGE_XATTR_PATH_LENGTH || value.includes("/") || value.includes("\\") || /[\0-\x1f]/.test(value) || value === "." || value === "..") die("invalid legacy Storage " + label);
}
function safeStorageObjectName(value) {
  if (typeof value !== "string" || !value || value.length > MAX_STORAGE_XATTR_PATH_LENGTH || value.startsWith("/") || value.includes("\\") || /[\0-\x1f]/.test(value) || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) die("invalid legacy Storage object metadata");
}
async function storageLayoutConfiguration(container) {
  const values = new Map((await inspect(container, "{{range .Config.Env}}{{println .}}{{end}}")).split(/\r?\n/).filter(Boolean).map((line) => {
    const delimiter = line.indexOf("=");
    return delimiter > 0 ? [line.slice(0, delimiter), line.slice(delimiter + 1)] : ["", ""];
  }));
  const tenantId = values.get("TENANT_ID"), globalBucket = values.get("GLOBAL_S3_BUCKET");
  safeStoragePathSegment(tenantId, "tenant configuration");
  safeStoragePathSegment(globalBucket, "global bucket configuration");
  return { tenantId, globalBucket };
}
function legacyStorageRelativePath(layout, row) {
  safeStoragePathSegment(row.bucketId, "bucket metadata");
  safeStorageObjectName(row.name);
  safeStoragePathSegment(row.version, "version metadata");
  const result = [layout.globalBucket, layout.tenantId, row.bucketId, ...row.name.split("/"), row.version].join("/");
  safeStorageXattrPath(result);
  return result;
}
async function legacyStorageMetadata(container) {
  const query = "select json_build_object('bucketId',bucket_id,'name',name,'version',version,'metadataObject',jsonb_typeof(metadata) = 'object','mimetype',metadata->>'mimetype','cacheControl',metadata->>'cacheControl')::text from storage.objects order by bucket_id,name,version";
  const result = await run("docker", ["exec", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", query], ROOT, false, "read legacy Storage metadata");
  return result.out ? result.out.split(/\r?\n/).map((line) => {
    let row;
    try { row = JSON.parse(line); } catch { die("invalid legacy Storage metadata output"); }
    if (!plainObject(row) || Object.keys(row).join("\0") !== ["bucketId", "name", "version", "metadataObject", "mimetype", "cacheControl"].join("\0") || row.metadataObject !== true || [row.bucketId, row.name, row.version, row.mimetype, row.cacheControl].some((value) => typeof value !== "string" || !value.trim())) die("invalid legacy Storage metadata");
    return row;
  }) : [];
}
async function prepareLegacyStorageXattrSidecar({ db, storage, temporaryDirectory }) {
  const [layout, rows] = await Promise.all([storageLayoutConfiguration(storage), legacyStorageMetadata(db)]);
  const entries = rows.map((row) => ({ path: legacyStorageRelativePath(layout, row), attributes: { "user.supabase.cache-control": Buffer.from(row.cacheControl, "utf8").toString("base64"), "user.supabase.content-type": Buffer.from(row.mimetype, "utf8").toString("base64") } })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const sidecar = { schemaVersion: STORAGE_XATTR_SIDECAR_SCHEMA_VERSION, format: STORAGE_XATTR_SIDECAR_FORMAT, entries };
  validateStorageXattrSidecar(sidecar, LEGACY_STORAGE_XATTR_NAMES);
  await writeFile(resolve(temporaryDirectory, LEGACY_STORAGE_XATTR_TEMP), JSON.stringify(sidecar) + "\n", { mode: 0o600 });
  return resolve(temporaryDirectory, LEGACY_STORAGE_XATTR_TEMP);
}

async function assertPostmasterPidAbsent(source, image) {
  await runRestoreFilesystem({ image, source, command: "test ! -e /source/postmaster.pid", operation: "verify postmaster.pid absence" });
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
  if (!result || !Number.isSafeInteger(result.size) || result.size < 1 || typeof result.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(result.sha256)) die("source backup manifest has invalid artifacts");
  return result;
}

function assertManifestContract(manifest) {
  if (!plainObject(manifest) || manifest.status !== "COMPLETE") die("source backup is not COMPLETE");
  const expected = requiredArtifacts(manifest.schemaVersion);
  requireString(manifest.backupId, "backup id");
  const sourceCommit = requireString(manifest.repository?.commit, "repository commit");
  requireString(manifest.repository?.branch, "repository branch");
  if (!/^[0-9a-f]{40}$/i.test(sourceCommit) || manifest.repository?.dirty !== false) die("source backup repository state is not eligible");
  if (manifest.supabase?.upstreamCommit !== UPSTREAM_PIN || manifest.supabase?.composeProject !== "supabase" || manifest.godel?.composeProject !== "godel-runtime") die("source backup compose provenance is incompatible");
  if (manifest.supabase?.storageBackend !== "file" || manifest.logicalBackup?.tool !== "pg_dumpall" || manifest.logicalBackup?.noRolePasswords !== true) die("source backup logical or storage contract is incompatible");
  requireString(manifest.supabase?.dbImage, "database image");
  if (requireString(manifest.supabase?.storageImage, "storage image") !== STORAGE_XATTR_IMAGE) die("source backup Storage image is incompatible");
  if (manifest.protectedRecoveryMaterial?.required !== true || manifest.protectedRecoveryMaterial?.captured !== true) die("source backup protected recovery material is incomplete");
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== expected.length) die("source backup manifest has invalid artifacts");
  const paths = manifest.artifacts.map((item) => item?.relativePath);
  if (new Set(paths).size !== expected.length || paths.some((path) => !expected.includes(path))) die("source backup manifest has invalid artifacts");
  for (const path of expected) artifact(manifest, path);
  return manifest;
}

async function readManifest(backup) {
  const manifest = assertManifestContract(JSON.parse(await readFile(resolve(backup, "manifest.json"), "utf8")));
  if (manifest.schemaVersion === 2) await readStorageXattrSidecar(resolve(backup, "storage"));
  return manifest;
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

function logDryRunPlan(schemaVersion) {
  const steps = [
    "acquire restore lock",
    "stop Godel",
    "stop Supabase non-DB services",
    "stop PostgreSQL",
    "replace PGDATA exactly",
    "replace Storage exactly",
    "create fresh compatible DB config",
    "restore only pgsodium root key",
    ...(schemaVersion === 2 ? ["replay Storage xattr sidecar", "verify Storage xattr replay"] : ["start DB and validate health", "derive legacy Storage xattrs from restored PostgreSQL", "verify legacy Storage xattr recovery"]),
    ...(schemaVersion === 2 ? ["start DB and validate health"] : []),
    "start remaining Supabase services",
    "start Godel services",
    "validate live and ready endpoints",
    "run external gates",
    "release restore lock",
  ];
  steps.forEach((step, index) => log("dry-run planned " + (index + 1) + ": " + step));
}

async function recoverOriginalRuntime() {
  await supabase(["start", "db"], false, "recover/start PostgreSQL");
  await waitForHealthy("supabase", ["db"]);
  await supabase(["start"].concat(NON_DB_SERVICES), false, "recover/start Supabase non-DB");
  await waitForHealthy("supabase", SUPABASE_SERVICES);
  await godel(["start", "app", "nginx"], false, "recover/start Godel");
  await waitForHealthy("godel", GODEL_SERVICES);
  for (const path of ["/api/health/live", "/api/health/ready"]) {
    const response = await fetch("http://localhost:8080" + path);
    if (!response.ok) die("current application health endpoint failed");
  }
}

async function clearExactTarget(image, target, operation) {
  await runRestoreFilesystem({ image, target, command: "find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +", operation });
}

async function restoreArchive(image, archiveDirectory, archiveName, target) {
  await runRestoreFilesystem({ image, source: archiveDirectory, target, command: "tar -xf /source/" + archiveName + " -C /target", operation: archiveName === "pgdata.tar" ? "extract PGDATA" : "extract Storage" });
}

async function assertRestoredPgdata(image, target) {
  await runRestoreFilesystem({ image, source: target, command: "test -f /source/PG_VERSION; test \"$(cat /source/PG_VERSION)\" = \"17\"; test ! -e /source/postmaster.pid; test -n \"$(ls -A /source)\"", operation: "validate restored PGDATA" });
}

async function assertRestoredStorage(image, target) {
  await runRestoreFilesystem({ image, source: target, command: "test -n \"$(ls -A /source)\"", operation: "validate restored Storage" });
}

async function rebuildDbConfig(image, volume) {
  await runRestoreFilesystem({ image, target: volume, command: "find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +", operation: "clear/rebuild db-config" });
  const args = ["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "--cap-add=CHOWN", "--cap-add=FOWNER", "--entrypoint", "sh", "-v", volume + ":/etc/postgresql-custom", image, "-ec", "test \"$(ls -1A /etc/postgresql-custom | wc -l)\" -eq 5; for entry in conf.d extension-custom-scripts read-replica.conf supautils.conf wal-g.conf; do test -e /etc/postgresql-custom/$entry; done; test ! -e /etc/postgresql-custom/pgsodium_root.key"];
  await run("docker", args, ROOT, false, "rebuild db-config");
}

async function restoreProtectedKey(image, protectedDirectory, volume) {
  await runRestoreFilesystem({ image, source: protectedDirectory, target: volume, command: "tar -xf /source/pgsodium-root-key.tar -C /target pgsodium_root.key; test -f /target/pgsodium_root.key; test -s /target/pgsodium_root.key; test \"$(ls -1A /target | wc -l)\" -eq 6; for entry in conf.d extension-custom-scripts pgsodium_root.key read-replica.conf supautils.conf wal-g.conf; do test -e /target/$entry; done", operation: "restore pgsodium root key" });
}

async function safetyQuiesce(execution) {
  const errors = [];
  const attempt = async (action) => { try { await action(); } catch (error) { errors.push(error); } };
  await attempt(() => godel(["stop", "app", "nginx"], false, "stop Godel"));
  await attempt(() => supabase(["stop"].concat(NON_DB_SERVICES), false, "stop Supabase non-DB"));
  await attempt(() => supabase(["stop", "-t", "120", "db"], false, "stop PostgreSQL"));
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

function reportFailureDetails(prefix, error, depth = 0) {
  if (depth >= 3 || !error) return;
  if (error instanceof CommandExecutionError) {
    console.error("[ops:restore:selfhosted] " + prefix + " OPERATION: " + error.operation);
    console.error("[ops:restore:selfhosted] " + prefix + " EXIT CODE: " + (error.exitCode ?? "(spawn error)"));
    console.error("[ops:restore:selfhosted] " + prefix + " STDERR: " + error.stderrSummary);
    return;
  }
  if (error instanceof AggregateError) {
    const children = Array.from(error.errors ?? []).slice(0, 5);
    if (!children.length) console.error("[ops:restore:selfhosted] " + prefix + " CAUSE: " + sanitizeStderr(error.message));
    children.forEach((child, index) => reportFailureDetails(prefix + "[" + (index + 1) + "]", child, depth + 1));
    return;
  }
  console.error("[ops:restore:selfhosted] " + prefix + " CAUSE: " + sanitizeStderr(error?.message));
  if (error.cause instanceof CommandExecutionError || error.cause instanceof AggregateError) reportFailureDetails(prefix, error.cause, depth + 1);
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
    logDryRunPlan(sourceManifest.schemaVersion);
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
      await godel(["stop", "app", "nginx"], false, "stop Godel");
      throwIfAbortRequested(execution);
      execution.phase = "stop-supabase-non-db";
      await supabase(["stop"].concat(NON_DB_SERVICES), false, "stop Supabase non-DB");
      throwIfAbortRequested(execution);
      execution.phase = "stop-postgresql";
      await supabase(["stop", "-t", "120", "db"], false, "stop PostgreSQL");
      await assertCleanPostgresStopped(targets.db);
      await assertPostmasterPidAbsent(targets.pgdata.Source, lockedSourceManifest.supabase.dbImage);
      throwIfAbortRequested(execution);

      // Mutation boundary: from this point the original runtime is never restarted automatically.
      execution.phase = "replace-pgdata";
      execution.mutationStarted = true;
      await clearExactTarget(lockedSourceManifest.supabase.dbImage, targets.pgdata.Source, "clear PGDATA");
      await restoreArchive(lockedSourceManifest.supabase.dbImage, resolve(value.backup, "postgres/physical"), "pgdata.tar", targets.pgdata.Source);
      await assertRestoredPgdata(lockedSourceManifest.supabase.dbImage, targets.pgdata.Source);
      throwIfAbortRequested(execution);

      execution.phase = "replace-storage";
      await clearExactTarget(lockedSourceManifest.supabase.dbImage, targets.storageData.Source, "clear Storage");
      await restoreArchive(lockedSourceManifest.supabase.dbImage, resolve(value.backup, "storage"), "storage.tar", targets.storageData.Source);
      await assertRestoredStorage(lockedSourceManifest.supabase.dbImage, targets.storageData.Source);
      throwIfAbortRequested(execution);

      execution.phase = "rebuild-db-config";
      await rebuildDbConfig(lockedSourceManifest.supabase.dbImage, targets.dbConfig.Name);
       execution.phase = "restore-pgsodium-key";
       await restoreProtectedKey(lockedSourceManifest.supabase.dbImage, resolve(value.protectedRoot, basename(value.backup)), targets.dbConfig.Name);
       throwIfAbortRequested(execution);

       if (lockedSourceManifest.schemaVersion === 2) {
         execution.phase = "restore-storage-xattrs-v2";
         await runStorageXattrHelper({ image: lockedSourceManifest.supabase.storageImage, source: resolve(value.backup, "storage"), target: targets.storageData.Source, fileName: "xattrs.json", mode: "replay", operation: "restore Storage xattrs v2" });
         throwIfAbortRequested(execution);
         execution.phase = "verify-storage-xattrs";
         await runStorageXattrHelper({ image: lockedSourceManifest.supabase.storageImage, source: resolve(value.backup, "storage"), target: targets.storageData.Source, fileName: "xattrs.json", mode: "verify", operation: "verify Storage xattrs v2" });
         throwIfAbortRequested(execution);
         log("Storage xattr restore PASS");
       }

       execution.phase = "start-restored-postgresql";
      await supabase(["start", "db"], false, "start PostgreSQL");
      execution.dbStarted = true;
       execution.restoredRuntimeStarted = true;
       await waitForHealthy("supabase", ["db"]);
       throwIfAbortRequested(execution);

       if (lockedSourceManifest.schemaVersion === 1) {
         execution.phase = "rehydrate-storage-xattrs-v1";
         const legacySidecar = await prepareLegacyStorageXattrSidecar({ db: targets.db, storage: targets.storage, temporaryDirectory: BACKUP_LOCK });
         throwIfAbortRequested(execution);
         await runStorageXattrHelper({ image: lockedSourceManifest.supabase.storageImage, source: BACKUP_LOCK, target: targets.storageData.Source, fileName: basename(legacySidecar), mode: "legacy-replay", operation: "rehydrate Storage xattrs v1" });
         throwIfAbortRequested(execution);
         execution.phase = "verify-storage-xattrs";
         await runStorageXattrHelper({ image: lockedSourceManifest.supabase.storageImage, source: BACKUP_LOCK, target: targets.storageData.Source, fileName: basename(legacySidecar), mode: "legacy-verify", operation: "verify Storage xattrs v1" });
         await rm(legacySidecar, { force: true });
         throwIfAbortRequested(execution);
         log("Storage xattr restore PASS");
       }

       execution.phase = "start-restored-supabase";
      await supabase(["start"].concat(NON_DB_SERVICES), false, "start Supabase non-DB");
      execution.nonDbStarted = true;
      await waitForHealthy("supabase", SUPABASE_SERVICES);
      throwIfAbortRequested(execution);
      execution.phase = "start-restored-godel";
      await godel(["start", "app", "nginx"], false, "start Godel");
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
      console.error("[ops:restore:selfhosted] RESTORE FAILURE PHASE: " + execution.phase);
      reportFailureDetails("RESTORE FAILURE", restoreError);
      if (execution.mutationStarted) {
        preserveLock = true;
        let quiesceError;
        try { await safetyQuiesce(execution); } catch (error) { quiesceError = error; }
        if (quiesceError) reportFailureDetails("RUNTIME QUIESCE FAILURE", quiesceError);
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
          reportFailureDetails("ORIGINAL RUNTIME RECOVERY FAILURE", recoveryError);
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
