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
const EXPECTED_ARTIFACTS = ["postgres/logical/cluster.sql","postgres/physical/pgdata.tar","storage/storage.tar"];
const MIN_LOGICAL_DUMP_ALLOWANCE = 512 * 1024 * 1024;
const CONSERVATIVE_LOGICAL_FACTOR = 2;
const DATA_SAFETY_MARGIN = 256 * 1024 * 1024;
const PROTECTED_ALLOWANCE = 16 * 1024 * 1024;
let maintenance = false, lock = null;

function die(message) { throw new Error(message); }
function log(message) { console.log("[ops:backup:selfhosted] " + message); }
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
async function healthy(kind, names) {
  for (const name of names) {
    const current = await state(await id(kind, name));
    if (current.status !== "running" || (current.health !== "none" && current.health !== "healthy")) die(kind + " " + name + " is unhealthy");
  }
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
  await run("docker", ["exec",db,"test","-f","/etc/postgresql-custom/pgsodium_root.key"]);
  if (value.data === value.protected || nested(value.data,value.protected) || nested(value.protected,value.data)) die("unsafe output roots");
  for (const output of [value.data,value.protected]) for (const critical of [pg.Source,st.Source]) if (nested(critical,output) || nested(output,critical)) die("unsafe output root overlaps critical data");
  for (const root of [value.data,value.protected]) if (nested(ROOT,root) && !(await ignored(resolve(root,".probe")))) die("output root is not ignored");
  await safeDirectory(value.data); await safeDirectory(value.protected);
  const image=(await state(db)).image;
  const measure = async (source) => Number((await run("docker",["run","--rm","--pull=never","--network","none","--read-only","--user","0:0","-v",source+":/source:ro",image,"sh","-ec","du -sb /source | cut -f1"])).out);
  const pgBytes=await measure(pg.Source), storageBytes=await measure(st.Source), logicalAllowance=Math.max(MIN_LOGICAL_DUMP_ALLOWANCE,Math.ceil(pgBytes*CONSERVATIVE_LOGICAL_FACTOR)), requiredData=pgBytes+storageBytes+logicalAllowance+DATA_SAFETY_MARGIN;
  const dataAvailable=Number((await statfs(value.data)).bavail)*Number((await statfs(value.data)).bsize), protectedAvailable=Number((await statfs(value.protected)).bavail)*Number((await statfs(value.protected)).bsize);
  if (!Number.isFinite(pgBytes)||!Number.isFinite(storageBytes)||dataAvailable<requiredData||protectedAvailable<PROTECTED_ALLOWANCE) die("insufficient demonstrable disk space");
  log("disk-space PASS; estimated data bytes "+requiredData+"; available data bytes "+dataAvailable+"; available protected bytes "+protectedAvailable);
  return { db, pg, st, cfg, dbImage: image, storageImage: (await state(storage)).image };
}
async function verifyChecksums(backup, manifest) {
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
async function recover() {
  await supa(["start","db"]); for (let i=0;i<60;i+=1) { try { await healthy("supa",["db"]); break; } catch { await new Promise((r)=>setTimeout(r,2000)); } }
  await supa(["start"].concat(NON_DB)); for (let i=0;i<60;i+=1) { try { await healthy("supa",SERVICES); break; } catch { await new Promise((r)=>setTimeout(r,2000)); } }
  await godel(["start","app","nginx"]); for (let i=0;i<60;i+=1) { try { await healthy("godel",["app","nginx"]); break; } catch { await new Promise((r)=>setTimeout(r,2000)); } }
  for (const path of ["/api/health/live","/api/health/ready"]) { const response = await fetch("http://localhost:8080" + path); if (!response.ok) die(path + " returned " + response.status); }
}
async function create(value) {
  const p = await preflight(value), backupId = new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+Z/,"Z") + "-" + randomBytes(4).toString("hex");
  log("preflight PASS; backup " + backupId + "; DB " + p.dbImage + "; Storage " + p.storageImage);
  if (value.dry) { log("dry-run PASS; planned maintenance sequence only"); return; }
  lock = resolve(value.data,".backup-selfhosted.lock"); try { await mkdir(lock,{mode:0o700}); } catch { die("backup lock exists; aborting before maintenance"); }
  const incomplete = resolve(value.data,"backup-" + backupId + ".incomplete"), protectedIncomplete = resolve(value.protected,"backup-" + backupId + ".incomplete");
  await safeDirectory(resolve(incomplete,"postgres/logical")); await safeDirectory(resolve(incomplete,"postgres/physical")); await safeDirectory(resolve(incomplete,"storage")); await safeDirectory(protectedIncomplete);
  const manifest = { schemaVersion:1, backupId, status:"INCOMPLETE", startedAt:new Date().toISOString(), repository:{commit:(await run("git",["rev-parse","HEAD"])).out,branch:(await run("git",["branch","--show-current"])).out,dirty:(await run("git",["status","--porcelain"])).out.length>0}, supabase:{upstreamCommit:"e846d45ce64207b952a4df44ac8b480ea0abb27e",composeProject:"supabase",dbImage:p.dbImage,storageImage:p.storageImage,storageBackend:"file"}, godel:{composeProject:"godel-runtime"}, logicalBackup:{tool:"pg_dumpall",toolVersion:(await run("docker",["exec",p.db,"pg_dumpall","--version"])).out,noRolePasswords:true}, artifacts:[], protectedRecoveryMaterial:{required:true,captured:false,artifact:{relativePath:"pgsodium-root-key.tar",type:"tar"}}, requiredExternalSecretVariableNames:["POSTGRES_PASSWORD","JWT_SECRET","SECRET_KEY_BASE","REALTIME_DB_ENC_KEY","VAULT_ENC_KEY","PG_META_CRYPTO_KEY","ANON_KEY","SERVICE_ROLE_KEY","SUPABASE_PUBLISHABLE_KEY","SUPABASE_SECRET_KEY","DASHBOARD_PASSWORD","SMTP_PASS"], conditionalExternalSecretDependencies:[{name:"JWT_KEYS",condition:"asymmetric auth keys active"},{name:"JWT_JWKS",condition:"asymmetric auth keys active"},{name:"S3_PROTOCOL_ACCESS_KEY_ID",condition:"S3 protocol active"},{name:"S3_PROTOCOL_ACCESS_KEY_SECRET",condition:"S3 protocol active"}] };
  await writeFile(resolve(incomplete,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
  try {
    maintenance = true; await godel(["stop","app","nginx"]); await supa(["stop"].concat(NON_DB));
    await supa(["run","--rm","--no-deps","--pull","never","-v",incomplete+":/backup","db","pg_dumpall","--no-role-passwords","--no-password","--file=/backup/postgres/logical/cluster.sql","-h","db","-U","postgres"]);
    await supa(["stop","db"]); if ((await state(p.db)).status === "running") die("cannot prove DB stopped");
    const tar = async (source,target) => run("docker",["run","--rm","--pull=never","--network","none","--read-only","--user","0:0","--security-opt","no-new-privileges","-v",source+":/source:ro","-v",incomplete+":/backup",p.dbImage,"sh","-ec","tar -C /source -cf /backup/"+target+" ."]);
    await tar(p.pg.Source,"postgres/physical/pgdata.tar"); await tar(p.st.Source,"storage/storage.tar");
    await run("docker",["run","--rm","--pull=never","--network","none","--read-only","--user","0:0","--security-opt","no-new-privileges","-v",p.cfg.Name+":/source:ro","-v",protectedIncomplete+":/backup",p.dbImage,"sh","-ec","tar -C /source -cf /backup/pgsodium-root-key.tar pgsodium_root.key"]);
    const files=EXPECTED_ARTIFACTS;
    for (const item of files) { const file=resolve(incomplete,item); if ((await stat(file)).size<1) die("empty artifact"); manifest.artifacts.push({relativePath:item,size:(await stat(file)).size,sha256:await digest(file)}); }
    await checkTar(resolve(incomplete,files[1]),"PG_VERSION","postmaster.pid"); await checkTar(resolve(incomplete,files[2])); await checkTar(resolve(protectedIncomplete,"pgsodium-root-key.tar"),"pgsodium_root.key",null,true);
    await writeFile(resolve(incomplete,"checksums.sha256"),manifest.artifacts.map((a)=>a.sha256+"  "+a.relativePath).join("\n")+"\n",{mode:0o600}); await verifyChecksums(incomplete,manifest); manifest.protectedRecoveryMaterial.captured=true;
    await recover(); manifest.status="COMPLETE"; manifest.completedAt=new Date().toISOString(); await writeFile(resolve(incomplete,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
    await rename(incomplete,resolve(value.data,"backup-"+backupId)); await rename(protectedIncomplete,resolve(value.protected,"backup-"+backupId)); log("backup COMPLETE " + backupId);
  } catch (error) { await rm(protectedIncomplete,{recursive:true,force:true}); if (maintenance) await recover().catch(()=>{}); throw error; } finally { await rm(lock,{recursive:true,force:true}); }
}
async function verify(value) {
  const manifest=JSON.parse(await readFile(resolve(value.backup,"manifest.json"),"utf8")); if (manifest.schemaVersion !== 1 || manifest.status !== "COMPLETE") die("backup is not COMPLETE schema v1");
  await verifyChecksums(value.backup,manifest);
  await checkTar(resolve(value.backup,"postgres/physical/pgdata.tar"),"PG_VERSION","postmaster.pid"); await checkTar(resolve(value.backup,"storage/storage.tar")); if ((await stat(resolve(value.backup,"postgres/logical/cluster.sql"))).size<1) die("logical artifact empty");
  const key=resolve(value.protected,basename(value.backup),"pgsodium-root-key.tar"); await checkTar(key,"pgsodium_root.key",null,true); log("verify PASS " + basename(value.backup));
}
try { const parsed=options(process.argv.slice(2)); if (parsed.verb === "create") await create(parsed.value); else await verify(parsed.value); } catch (error) { console.error("[ops:backup:selfhosted] ERROR: "+error.message); process.exitCode=1; }
