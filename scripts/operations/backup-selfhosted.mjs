#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readFile, rename, rm, stat, statfs, writeFile } from "node:fs/promises";
import { resolve, relative, basename, sep } from "node:path";

const ROOT = process.cwd();
const SUPA_DIR = resolve(ROOT, "infra/supabase");
const SERVICES = ["studio","api-gw","auth","rest","realtime","storage","imgproxy","meta","functions","db","supavisor"];
const NON_DB = SERVICES.filter((name) => name !== "db");
const DATA_ROOT_DEFAULT = resolve(ROOT, "backups/selfhosted");
const PROTECTED_ROOT_DEFAULT = resolve(ROOT, "protected-recovery-material/selfhosted");
const BACKUP_FORMAT = "godel-selfhosted-backup";
const BACKUP_SCHEMA_VERSION = 3;
const PROTECTED_RECOVERY_ARTIFACT = "pgsodium-root-key.tar";
const EXPECTED_ARTIFACTS = ["postgres/logical/cluster.sql","postgres/physical/pgdata.tar","storage/storage.tar","storage/xattrs.json"];
const STORAGE_XATTR_IMAGE = "supabase/storage-api:v1.60.4";
const STORAGE_XATTR_SIDECAR_SCHEMA_VERSION = 1;
const STORAGE_XATTR_SIDECAR_FORMAT = "supabase-file-xattrs";
const STORAGE_XATTR_NAMES = ["user.supabase.cache-control","user.supabase.content-type","user.supabase.etag"];
const MAX_STORAGE_XATTR_ENTRIES = 100000;
const MAX_STORAGE_XATTR_PATH_LENGTH = 4096;
const MAX_STORAGE_XATTR_VALUE_BYTES = 64 * 1024;
const MIN_LOGICAL_DUMP_ALLOWANCE = 512 * 1024 * 1024;
const CONSERVATIVE_LOGICAL_FACTOR = 2;
const DATA_SAFETY_MARGIN = 256 * 1024 * 1024;
const PROTECTED_ALLOWANCE = 16 * 1024 * 1024;

function die(message) { throw new Error(message); }
function throwIfAbortRequested(execution) { if (execution.abortRequested) throw new Error("backup aborted by " + execution.abortSignal); }
function log(message) { console.log("[ops:backup:selfhosted] " + message); }
function requireBackupSchemaVersion(schemaVersion) { if (schemaVersion !== BACKUP_SCHEMA_VERSION) die("unsupported backup schema version"); }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function canonicalSha256(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function validateProtectedRecoveryMaterial(manifest) {
  const protectedMaterial = manifest.protectedRecoveryMaterial, artifact = protectedMaterial?.artifact;
  if (manifest.format !== BACKUP_FORMAT) die("invalid backup format");
  if (!plainObject(protectedMaterial) || protectedMaterial.required !== true || protectedMaterial.captured !== true || !plainObject(artifact) || artifact.relativePath !== PROTECTED_RECOVERY_ARTIFACT || artifact.type !== "tar" || !Number.isSafeInteger(artifact.size) || artifact.size < 1 || !canonicalSha256(artifact.sha256)) die("invalid protected recovery material");
  return artifact;
}
function safeStorageXattrPath(value) {
  if (typeof value !== "string" || !value || value.length > MAX_STORAGE_XATTR_PATH_LENGTH || value.startsWith("/") || value.includes("\\") || /[\0-\x1f]/.test(value)) die("invalid storage xattr sidecar path");
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) die("invalid storage xattr sidecar path");
}
function canonicalBase64(value) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) die("invalid storage xattr sidecar value");
  const decoded = Buffer.from(value,"base64");
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
function validateStorageXattrSidecar(value) {
  if (!plainObject(value) || Object.keys(value).join("\0") !== ["schemaVersion","format","entries"].join("\0") || value.schemaVersion !== STORAGE_XATTR_SIDECAR_SCHEMA_VERSION || value.format !== STORAGE_XATTR_SIDECAR_FORMAT || !Array.isArray(value.entries) || value.entries.length > MAX_STORAGE_XATTR_ENTRIES) die("invalid storage xattr sidecar");
  let previousPath = "";
  for (const entry of value.entries) {
    if (!plainObject(entry) || Object.keys(entry).join("\0") !== ["path","attributes"].join("\0") || !plainObject(entry.attributes)) die("invalid storage xattr sidecar entry");
    safeStorageXattrPath(entry.path);
    if (previousPath && previousPath >= entry.path) die("storage xattr sidecar paths are not deterministic");
    previousPath = entry.path;
    const names = Object.keys(entry.attributes);
    if (!names.length || names.join("\0") !== [...names].sort().join("\0") || names.some((name) => !STORAGE_XATTR_NAMES.includes(name))) die("invalid storage xattr sidecar attributes");
    for (const name of names) canonicalBase64(entry.attributes[name]);
  }
}
async function verifyStorageXattrSidecar(backup) {
  const raw = await readFile(resolve(backup,"storage/xattrs.json"),"utf8");
  let sidecar;
  try { sidecar = JSON.parse(raw); } catch { die("invalid storage xattr sidecar JSON"); }
  if (compactJsonSource(raw) !== JSON.stringify(sidecar)) die("storage xattr sidecar is not canonical JSON");
  validateStorageXattrSidecar(sidecar);
}
const STORAGE_XATTR_CAPTURE_SCRIPT = `
const fs = require("fs");
const path = require("path");
const xattr = require("fs-xattr");
const root = "/source";
const allow = ${JSON.stringify(STORAGE_XATTR_NAMES)};
const maxEntries = ${MAX_STORAGE_XATTR_ENTRIES};
const maxPathLength = ${MAX_STORAGE_XATTR_PATH_LENGTH};
const maxValueBytes = ${MAX_STORAGE_XATTR_VALUE_BYTES};
function safeRelativePath(value) {
  if (!value || value.length > maxPathLength || value.startsWith("/") || value.includes("\\\\") || /[\\0-\\x1f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("invalid storage xattr path");
}
function walk(directory, entries) {
  const directoryState = fs.lstatSync(directory);
  if (!directoryState.isDirectory() || directoryState.isSymbolicLink()) throw new Error("unexpected storage filesystem entry");
  for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
    const file = path.join(directory,item.name), state = fs.lstatSync(file);
    if (state.isDirectory() && !state.isSymbolicLink()) { walk(file, entries); continue; }
    if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1) throw new Error("unexpected storage filesystem entry");
    const present = new Set(xattr.listSync(file));
    const attributes = {};
    for (const name of allow) {
      if (!present.has(name)) continue;
      const value = Buffer.from(xattr.getSync(file,name));
      if (value.length > maxValueBytes) throw new Error("storage xattr value exceeds limit");
      attributes[name] = value.toString("base64");
    }
    if (Object.keys(attributes).length) {
      const relative = path.relative(root,file).split(path.sep).join("/");
      safeRelativePath(relative);
      if (entries.length >= maxEntries) throw new Error("storage xattr entry limit exceeded");
      entries.push({ path: relative, attributes });
    }
  }
}
if (typeof xattr.listSync !== "function" || typeof xattr.getSync !== "function") throw new Error("fs-xattr synchronous API unavailable");
process.umask(0o077);
const entries = [];
walk(root,entries);
entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
fs.writeFileSync("/backup/storage/xattrs.json",JSON.stringify({ schemaVersion: ${STORAGE_XATTR_SIDECAR_SCHEMA_VERSION}, format: ${JSON.stringify(STORAGE_XATTR_SIDECAR_FORMAT)}, entries }) + "\\n",{ mode: 0o600 });
`;
async function captureStorageXattrs({ image, source, output }) {
  try { await runStorageXattrCaptureHelper({ image, source, output }); }
  catch { die("storage xattr capture failed"); }
}
function run(bin, args, cwd = ROOT, allowed = false) {
  return new Promise((ok, bad) => {
    const child = spawn(bin, args, { cwd, windowsHide: true, stdio: ["ignore","pipe","pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (chunk) => { out += chunk; }); child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", bad); child.on("close", (code) => code === 0 || allowed ? ok({ code, out: out.trim(), err: err.trim() }) : bad(new Error(bin + " failed: " + (err.trim() || out.trim() || code))));
  });
}
const supa = (args, allowed = false) => run("docker", ["compose","-f","docker-compose.yml"].concat(args), SUPA_DIR, allowed);
const godel = (args, allowed = false) => run("docker", ["compose","--env-file","compose.env.local","-f","compose.yaml"].concat(args), ROOT, allowed);
async function inspect(id, format) { return (await run("docker", ["inspect","--format",format,id])).out; }
async function id(kind, service) {
  const result = kind === "supa" ? await supa(["ps","-q",service]) : await godel(["ps","-q",service]);
  if (!result.out) die("missing expected " + kind + " service " + service);
  return result.out;
}
async function state(container) {
  const parts = (await inspect(container, "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.Config.Image}}")).split("|");
  return { status: parts[0], health: parts[1], image: parts[2] };
}
async function postgresStopSignal(container) {
  const value = (await inspect(container, "{{.Config.StopSignal}}")).trim().toUpperCase();
  if (!value || value === "SIGTERM" || value === "TERM" || value === "15") return "SIGTERM";
  if (value === "SIGINT" || value === "INT" || value === "2") return "SIGINT";
  die("unsupported PostgreSQL stop signal");
}
async function stoppedState(container) {
  const [status, exitCodeRaw, oomKilledRaw] = (await inspect(container, "{{.State.Status}}|{{.State.ExitCode}}|{{.State.OOMKilled}}")).split("|");
  if (!status || !/^-?\d+$/.test(exitCodeRaw) || (oomKilledRaw !== "true" && oomKilledRaw !== "false")) die("invalid PostgreSQL stopped state");
  const exitCode = Number(exitCodeRaw);
  if (!Number.isInteger(exitCode)) die("invalid PostgreSQL stopped state");
  return { status, exitCode, oomKilled: oomKilledRaw === "true" };
}
async function assertCleanPostgresStopped(container) {
  const current = await stoppedState(container);
  if (current.status !== "exited" || current.exitCode !== 0 || current.oomKilled) die("clean PostgreSQL shutdown not demonstrated");
}
async function runFilesystemHelper({ image, source, output, command }) {
  const args = ["run","--rm","--pull=never","--network","none","--read-only","--user","0:0","--security-opt","no-new-privileges","--cap-drop=ALL","--cap-add=DAC_OVERRIDE","-v",source+":/source:ro"];
  if (output) args.push("-v",output+":/backup");
  args.push(image,"sh","-ec",command);
  return run("docker",args);
}
async function runStorageXattrCaptureHelper({ image, source, output }) {
  const args = ["run","--rm","--pull=never","--network","none","--read-only","--user","0:0","--security-opt","no-new-privileges","--cap-drop=ALL","--cap-add=DAC_OVERRIDE","-v",source+":/source:ro","-v",output+":/backup","--entrypoint","node",image,"-e",STORAGE_XATTR_CAPTURE_SCRIPT];
  return run("docker",args);
}
async function probeFilesystemHelperAccess({ image, source, output, requiredFile }) {
  if (requiredFile && (!/^[A-Za-z0-9._-]+$/.test(requiredFile) || requiredFile === "." || requiredFile === "..")) die("invalid filesystem helper required file");
  const checks = ["test -r /source","test -x /source"];
  if (requiredFile) checks.push("test -r /source/" + requiredFile);
  if (output) {
    const probeFile = ".fs-helper-probe-" + randomBytes(8).toString("hex");
    checks.push("umask 077",": > /backup/" + probeFile,"rm -f /backup/" + probeFile);
  }
  const command = checks.join(" && ");
  return runFilesystemHelper({ image, source, output, command });
}
async function assertPostmasterPidAbsent(source, image) {
  await runFilesystemHelper({ image, source, command: "test ! -e /source/postmaster.pid" });
}
async function healthy(kind, names) {
  for (const name of names) {
    const current = await state(await id(kind, name));
    if (current.status !== "running" || (current.health !== "none" && current.health !== "healthy")) die(kind + " " + name + " is unhealthy");
  }
}
async function waitForHealthy(kind, services, { attempts = 60, intervalMs = 2000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await healthy(kind, services);
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
    }
  }
  throw new Error("timeout waiting for " + kind + " services to become healthy", { cause: lastError });
}
async function safeDirectory(dir) { await mkdir(dir, { recursive: true, mode: 0o700 }); if (process.platform !== "win32") await chmod(dir, 0o700); }
function nested(parent, child) {
  const a=resolve(parent), b=resolve(child), windows=/^[a-z]:/i.test(a)&&/^[a-z]:/i.test(b);
  if (windows && a.slice(0,2).toLowerCase() !== b.slice(0,2).toLowerCase()) return false;
  const r=relative(a,b); return r === "" || (!r.startsWith("..") && !r.includes(".."+sep) && !/^[a-z]:/i.test(r) && !r.startsWith("/"));
}
async function ignored(file) { return (await run("git", ["check-ignore","-q","--no-index",relative(ROOT,file)], ROOT, true)).code === 0; }
async function digest(file) {
  return await new Promise((ok, bad) => {
    const hash = createHash("sha256"), stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk)); stream.on("error", bad); stream.on("end", () => ok(hash.digest("hex")));
  });
}
async function checkTar(file, expected, forbidden, exact = false) {
  return await new Promise((ok, bad) => {
    const child = spawn("tar", ["-tf",file], { windowsHide:true, stdio:["ignore","pipe","pipe"] });
    let carry="", found=false, forbiddenFound=false, count=0;
    child.stdout.on("data", (chunk) => { carry += chunk.toString(); let lines=carry.split(/\r?\n/); carry=lines.pop(); for (const name of lines) { if (!name) continue; if (name !== "./") count += 1; if (name === expected || name === "./"+expected) found=true; if (forbidden && (name === forbidden || name.endsWith("/"+forbidden))) forbiddenFound=true; } });
    child.on("error", bad); child.on("close", (code) => { if (carry) { const name=carry; if (name !== "./") count += 1; if (name === expected || name === "./"+expected) found=true; if (forbidden && (name === forbidden || name.endsWith("/"+forbidden))) forbiddenFound=true; } if (code) return bad(new Error("unreadable tar "+basename(file))); if (expected && !found) return bad(new Error("tar missing "+expected)); if (forbiddenFound) return bad(new Error("tar contains forbidden "+forbidden)); if (exact && count !== 1) return bad(new Error("tar contains unexpected entries")); ok(); });
  });
}
function options(args) {
  const verb = args.shift(), value = { data: DATA_ROOT_DEFAULT, protected: PROTECTED_ROOT_DEFAULT, dry: false };
  while (args.length) { const item = args.shift(); if (item === "--dry-run") value.dry = true; else if (item === "--backup") value.backup = resolve(ROOT,args.shift() || ""); else if (item === "--output-root") value.data = resolve(ROOT,args.shift() || ""); else if (item === "--protected-root") value.protected = resolve(ROOT,args.shift() || ""); else die("unknown option " + item); }
  if (verb !== "create" && verb !== "verify") die("use create or verify"); if (verb === "verify" && !value.backup) die("verify requires --backup");
  return { verb, value };
}
async function preflight(value) {
  await run("docker", ["version","--format","{{.Server.Version}}"]); await run("docker", ["compose","version","--short"]);
  if (!(await readFile(resolve(ROOT,"infra/SUPABASE_UPSTREAM.md"),"utf8")).includes("e846d45ce64207b952a4df44ac8b480ea0abb27e")) die("unexpected upstream pin");
  if (!(await readFile(resolve(SUPA_DIR,"docker-compose.yml"),"utf8")).includes("STORAGE_BACKEND: file")) die("Storage backend is not file");
  const actualSupa = (await supa(["config","--services"])).out.split(/\r?\n/).filter(Boolean).sort();
  const actualGodel = (await godel(["config","--services"])).out.split(/\r?\n/).filter(Boolean).sort();
  if (actualSupa.join(",") !== [...SERVICES].sort().join(",") || actualGodel.join(",") !== "app,nginx") die("unexpected Compose service set");
  await healthy("supa",SERVICES); await healthy("godel",["app","nginx"]);
  const db = await id("supa","db"), storage = await id("supa","storage");
  const dbMounts = JSON.parse(await inspect(db,"{{json .Mounts}}")), storageMounts = JSON.parse(await inspect(storage,"{{json .Mounts}}"));
  const pg = dbMounts.find((m) => m.Destination === "/var/lib/postgresql/data"), cfg = dbMounts.find((m) => m.Destination === "/etc/postgresql-custom"), st = storageMounts.find((m) => m.Destination === "/var/lib/storage");
  if (!pg || pg.Type !== "bind" || !st || st.Type !== "bind" || !cfg || cfg.Type !== "volume" || !cfg.Name) die("unexpected persistent mount");
  const dbStopSignal = await postgresStopSignal(db);
  await run("docker", ["exec",db,"test","-f","/etc/postgresql-custom/pgsodium_root.key"]);
  if (value.data === value.protected || nested(value.data,value.protected) || nested(value.protected,value.data)) die("unsafe output roots");
  for (const output of [value.data,value.protected]) for (const critical of [pg.Source,st.Source]) if (nested(critical,output) || nested(output,critical)) die("unsafe output root overlaps critical data");
  for (const root of [value.data,value.protected]) if (nested(ROOT,root) && !(await ignored(resolve(root,".probe")))) die("output root is not ignored");
  await safeDirectory(value.data); await safeDirectory(value.protected);
  const image=(await state(db)).image;
  await probeFilesystemHelperAccess({ image, source:pg.Source, output:value.data, requiredFile:"PG_VERSION" });
  await probeFilesystemHelperAccess({ image, source:st.Source });
  await probeFilesystemHelperAccess({ image, source:cfg.Name, output:value.protected, requiredFile:"pgsodium_root.key" });
  log("filesystem-helper capability PASS");
  const measure = async (source) => Number((await runFilesystemHelper({ image, source, command: "du -sb /source | cut -f1" })).out);
  const pgBytes=await measure(pg.Source), storageBytes=await measure(st.Source), logicalAllowance=Math.max(MIN_LOGICAL_DUMP_ALLOWANCE,Math.ceil(pgBytes*CONSERVATIVE_LOGICAL_FACTOR)), requiredData=pgBytes+storageBytes+logicalAllowance+DATA_SAFETY_MARGIN;
  const dataAvailable=Number((await statfs(value.data)).bavail)*Number((await statfs(value.data)).bsize), protectedAvailable=Number((await statfs(value.protected)).bavail)*Number((await statfs(value.protected)).bsize);
  if (!Number.isFinite(pgBytes)||!Number.isFinite(storageBytes)||dataAvailable<requiredData||protectedAvailable<PROTECTED_ALLOWANCE) die("insufficient demonstrable disk space");
  log("PostgreSQL stop signal PASS: " + dbStopSignal);
  log("disk-space PASS; estimated data bytes "+requiredData+"; available data bytes "+dataAvailable+"; available protected bytes "+protectedAvailable);
  const storageImage = (await state(storage)).image;
  if (storageImage !== STORAGE_XATTR_IMAGE) die("unexpected Storage image for xattr sidecar");
  return { db, pg, st, cfg, dbStopSignal, dbImage: image, storageImage };
}
async function verifyChecksums(backup, manifest) {
  requireBackupSchemaVersion(manifest.schemaVersion);
  const expected = new Set(EXPECTED_ARTIFACTS);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== expected.size) die("manifest artifacts are incomplete");
  const manifestByPath = new Map(manifest.artifacts.map((artifact) => [artifact.relativePath, artifact]));
  if (manifestByPath.size !== expected.size || [...expected].some((path) => !manifestByPath.has(path))) die("manifest artifact set is invalid");
  const lines = (await readFile(resolve(backup,"checksums.sha256"),"utf8")).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== expected.size) die("checksums entry count is invalid");
  const checksums = new Map();
  for (const line of lines) {
    const match=line.match(/^([a-f0-9]{64})  (.+)$/i); if (!match) die("invalid checksum entry");
    const path=match[2]; if (path.startsWith("/")||path.includes("..")||!expected.has(path)||checksums.has(path)) die("unsafe or unexpected checksum path");
    checksums.set(path,match[1].toLowerCase());
  }
  for (const path of expected) { const artifact=manifestByPath.get(path), file=resolve(backup,path), actual=await digest(file); if (checksums.get(path)!==artifact.sha256 || (await stat(file)).size!==artifact.size || actual!==artifact.sha256 || actual!==checksums.get(path)) die("checksum verification failed"); }
}
async function verifyProtectedRecoveryMaterial(backup, protectedRoot, manifest) {
  const key = resolve(protectedRoot,basename(backup),PROTECTED_RECOVERY_ARTIFACT);
  const artifact = validateProtectedRecoveryMaterial(manifest);
  if ((await stat(key)).size !== artifact.size || await digest(key) !== artifact.sha256) die("protected recovery material integrity verification failed");
  await checkTar(key,"pgsodium_root.key",null,true);
}
async function recover() {
  await supa(["start","db"]); await waitForHealthy("supa",["db"]);
  await supa(["start"].concat(NON_DB)); await waitForHealthy("supa",SERVICES);
  await godel(["start","app","nginx"]); await waitForHealthy("godel",["app","nginx"]);
  for (const path of ["/api/health/live","/api/health/ready"]) { const response = await fetch("http://localhost:8080" + path); if (!response.ok) die(path + " returned " + response.status); }
}
async function create(value) {
  const p = await preflight(value), backupId = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z/,"Z") + "-" + randomBytes(4).toString("hex");
  const dataIncomplete = resolve(value.data,"backup-" + backupId + ".incomplete"), protectedIncomplete = resolve(value.protected,"backup-" + backupId + ".incomplete"), dataFinal = resolve(value.data,"backup-" + backupId), protectedFinal = resolve(value.protected,"backup-" + backupId), completeManifestTemp = resolve(dataFinal,".manifest.complete.tmp");
  const execution = { maintenanceStarted: false, runtimeRecovered: false, abortRequested: false, abortSignal: null, protectedFinalizedByThisRun: false, dataFinalizedByThisRun: false, completionCommitted: false };
  log("preflight PASS; backup " + backupId + "; DB " + p.dbImage + "; Storage " + p.storageImage);
  if (value.dry) { log("dry-run PASS; planned maintenance sequence only"); return; }
  const lockPath = resolve(value.data,".backup-selfhosted.lock"); let lockOwned = false;
  let operationError;
  try { await mkdir(lockPath,{mode:0o700}); lockOwned = true; } catch (error) { if (error?.code === "EEXIST") die("backup lock exists; aborting before maintenance"); throw error; }
  const handleSignal = (signal) => { if (!execution.abortRequested) { execution.abortRequested = true; execution.abortSignal = signal; log("abort requested by " + signal); } };
  process.on("SIGINT", handleSignal); process.on("SIGTERM", handleSignal);
  try {
    await safeDirectory(resolve(dataIncomplete,"postgres/logical")); await safeDirectory(resolve(dataIncomplete,"postgres/physical")); await safeDirectory(resolve(dataIncomplete,"storage")); await safeDirectory(protectedIncomplete);
    const manifest = { format:BACKUP_FORMAT, schemaVersion:BACKUP_SCHEMA_VERSION, backupId, status:"INCOMPLETE", startedAt:new Date().toISOString(), repository:{commit:(await run("git",["rev-parse","HEAD"])).out,branch:(await run("git",["branch","--show-current"])).out,dirty:(await run("git",["status","--porcelain"])).out.length>0}, supabase:{upstreamCommit:"e846d45ce64207b952a4df44ac8b480ea0abb27e",composeProject:"supabase",dbImage:p.dbImage,storageImage:p.storageImage,storageBackend:"file"}, godel:{composeProject:"godel-runtime"}, logicalBackup:{tool:"pg_dumpall",toolVersion:(await run("docker",["exec",p.db,"pg_dumpall","--version"])).out,noRolePasswords:true}, artifacts:[], protectedRecoveryMaterial:{required:true,captured:false,artifact:{relativePath:PROTECTED_RECOVERY_ARTIFACT,type:"tar"}}, requiredExternalSecretVariableNames:["POSTGRES_PASSWORD","JWT_SECRET","SECRET_KEY_BASE","REALTIME_DB_ENC_KEY","VAULT_ENC_KEY","PG_META_CRYPTO_KEY","ANON_KEY","SERVICE_ROLE_KEY","SUPABASE_PUBLISHABLE_KEY","SUPABASE_SECRET_KEY","DASHBOARD_PASSWORD"], conditionalExternalSecretDependencies:[{name:"JWT_KEYS",condition:"asymmetric auth keys active"},{name:"JWT_JWKS",condition:"asymmetric auth keys active"},{name:"ANON_KEY_ASYMMETRIC",condition:"opaque API key translation active"},{name:"SERVICE_ROLE_KEY_ASYMMETRIC",condition:"opaque API key translation active"}] };
    await writeFile(resolve(dataIncomplete,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
    throwIfAbortRequested(execution);
    execution.maintenanceStarted = true; await godel(["stop","app","nginx"]); await supa(["stop"].concat(NON_DB)); throwIfAbortRequested(execution);
    await supa(["run","--rm","--no-deps","--pull","never","-v",dataIncomplete+":/backup","db","sh","-ec","umask 077; exec pg_dumpall --no-role-passwords --no-password --file=/backup/postgres/logical/cluster.sql -h db -U postgres"]);
    throwIfAbortRequested(execution);
    await supa(["stop","-t","120","db"]); await assertCleanPostgresStopped(p.db); await assertPostmasterPidAbsent(p.pg.Source,p.dbImage);
    throwIfAbortRequested(execution);
    const tar = async (source,target) => runFilesystemHelper({ image:p.dbImage, source, output:dataIncomplete, command:"umask 077; exec tar -C /source -cf /backup/"+target+" ." });
    await tar(p.pg.Source,"postgres/physical/pgdata.tar"); throwIfAbortRequested(execution);
    await tar(p.st.Source,"storage/storage.tar"); throwIfAbortRequested(execution);
    await captureStorageXattrs({ image:p.storageImage, source:p.st.Source, output:dataIncomplete }); throwIfAbortRequested(execution);
    await runFilesystemHelper({ image:p.dbImage, source:p.cfg.Name, output:protectedIncomplete, command:"umask 077; exec tar -C /source -cf /backup/"+PROTECTED_RECOVERY_ARTIFACT+" pgsodium_root.key" });
    throwIfAbortRequested(execution);
    const files=EXPECTED_ARTIFACTS;
    for (const item of files) { const file=resolve(dataIncomplete,item); if ((await stat(file)).size<1) die("empty artifact"); manifest.artifacts.push({relativePath:item,size:(await stat(file)).size,sha256:await digest(file)}); }
    await checkTar(resolve(dataIncomplete,files[1]),"PG_VERSION","postmaster.pid"); await checkTar(resolve(dataIncomplete,files[2])); const protectedArtifact = resolve(protectedIncomplete,PROTECTED_RECOVERY_ARTIFACT); await checkTar(protectedArtifact,"pgsodium_root.key",null,true);
    await verifyStorageXattrSidecar(dataIncomplete);
    await writeFile(resolve(dataIncomplete,"checksums.sha256"),manifest.artifacts.map((a)=>a.sha256+"  "+a.relativePath).join("\n")+"\n",{mode:0o600}); await verifyChecksums(dataIncomplete,manifest); manifest.protectedRecoveryMaterial.artifact.size=(await stat(protectedArtifact)).size; manifest.protectedRecoveryMaterial.artifact.sha256=await digest(protectedArtifact); manifest.protectedRecoveryMaterial.captured=true; validateProtectedRecoveryMaterial(manifest); throwIfAbortRequested(execution);
    await recover(); execution.runtimeRecovered = true; throwIfAbortRequested(execution);
    await rename(protectedIncomplete,protectedFinal); execution.protectedFinalizedByThisRun = true;
    await rename(dataIncomplete,dataFinal); execution.dataFinalizedByThisRun = true;
    manifest.status="COMPLETE"; manifest.completedAt=new Date().toISOString(); await writeFile(completeManifestTemp,JSON.stringify(manifest,null,2)+"\n",{mode:0o600}); await rename(completeManifestTemp,resolve(dataFinal,"manifest.json")); execution.completionCommitted = true;
    log("backup COMPLETE " + backupId);
  } catch (backupError) {
    let recoveryError;
    const cleanupErrors = [];
    if (execution.maintenanceStarted && !execution.runtimeRecovered) {
      try {
        await recover();
        execution.runtimeRecovered = true;
      } catch (error) {
        recoveryError = error;
      }
    }
    if (!execution.completionCommitted) {
      try {
        await rm(execution.protectedFinalizedByThisRun ? protectedFinal : protectedIncomplete,{recursive:true,force:true});
      } catch (error) {
        cleanupErrors.push(error);
      }
      if (execution.dataFinalizedByThisRun) {
        try {
          await rm(completeManifestTemp,{force:true});
        } catch (error) {
          cleanupErrors.push(error);
        }
      }
    }
    const cleanupError = cleanupErrors.length === 1 ? cleanupErrors[0] : cleanupErrors.length > 1 ? new AggregateError(cleanupErrors,"backup cleanup failed") : undefined;
    if (recoveryError) {
      console.error("[ops:backup:selfhosted] BACKUP FAILED / RUNTIME RECOVERY FAILED");
      operationError = new AggregateError([backupError,recoveryError,...(cleanupError ? [cleanupError] : [])],"BACKUP FAILED / RUNTIME RECOVERY FAILED");
    }
    if (execution.maintenanceStarted && execution.runtimeRecovered) {
      console.error("[ops:backup:selfhosted] BACKUP FAILED / RUNTIME RECOVERED");
      operationError = new AggregateError([backupError,...(cleanupError ? [cleanupError] : [])],"BACKUP FAILED / RUNTIME RECOVERED");
    }
    if (!operationError && cleanupError) operationError = new AggregateError([backupError,cleanupError],"BACKUP FAILED / CLEANUP FAILED");
    if (!operationError) operationError = backupError;
  } finally {
    let lockCleanupError;
    if (lockOwned) {
      try { await rm(lockPath,{recursive:true,force:true}); } catch (error) { lockCleanupError = error; }
    }
    process.off("SIGINT", handleSignal); process.off("SIGTERM", handleSignal);
    if (operationError && lockCleanupError) throw new AggregateError([operationError,lockCleanupError],"BACKUP FAILED / LOCK CLEANUP FAILED");
    if (operationError) throw operationError;
    if (lockCleanupError) throw new Error("backup succeeded but lock cleanup failed", { cause: lockCleanupError });
  }
}
async function verify(value) {
  if (value.backup.split(/[\\/]+/).some((segment) => segment.endsWith(".incomplete"))) die("cannot verify incomplete backup path");
  const manifest=JSON.parse(await readFile(resolve(value.backup,"manifest.json"),"utf8")); requireBackupSchemaVersion(manifest.schemaVersion); if (manifest.status !== "COMPLETE") die("backup is not COMPLETE");
  await verifyChecksums(value.backup,manifest);
  await verifyStorageXattrSidecar(value.backup);
  await checkTar(resolve(value.backup,"postgres/physical/pgdata.tar"),"PG_VERSION","postmaster.pid"); await checkTar(resolve(value.backup,"storage/storage.tar")); if ((await stat(resolve(value.backup,"postgres/logical/cluster.sql"))).size<1) die("logical artifact empty");
  await verifyProtectedRecoveryMaterial(value.backup,value.protected,manifest); log("verify PASS " + basename(value.backup));
}
try { const parsed=options(process.argv.slice(2)); if (parsed.verb === "create") await create(parsed.value); else await verify(parsed.value); } catch (error) { console.error("[ops:backup:selfhosted] ERROR: "+error.message); process.exitCode=1; }
