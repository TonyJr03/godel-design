import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const STORAGE_XATTR_IMAGE = "supabase/storage-api:v1.60.4";
const XATTR_NAMES = ["user.supabase.cache-control", "user.supabase.content-type", "user.supabase.etag"];
const MAX_ENTRIES = 100000;
const MAX_PATH = 4096;
const MAX_VALUE = 64 * 1024;

function fail(message) { throw new Error(message); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function compactJson(source) { let output = "", quoted = false, escaped = false; for (const character of source) { if (quoted) { output += character; if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === "\"") quoted = false; } else if (character === "\"") { quoted = true; output += character; } else if (!/\s/.test(character)) output += character; } return output; }
function pathValue(value) { if (typeof value !== "string" || !value || value.length > MAX_PATH || value.startsWith("/") || value.includes("\\") || /[\0-\x1f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) fail("invalid storage xattr sidecar path"); }
function base64(value) { if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail("invalid storage xattr sidecar value"); const decoded = Buffer.from(value, "base64"); if (decoded.length > MAX_VALUE || decoded.toString("base64") !== value) fail("invalid storage xattr sidecar value"); }

export function validateStorageXattrSidecar(value) {
  if (!plain(value) || Object.keys(value).join("\0") !== ["schemaVersion", "format", "entries"].join("\0") || value.schemaVersion !== 1 || value.format !== "supabase-file-xattrs" || !Array.isArray(value.entries) || value.entries.length > MAX_ENTRIES) fail("invalid storage xattr sidecar");
  let previous = "";
  for (const entry of value.entries) {
    if (!plain(entry) || Object.keys(entry).join("\0") !== ["path", "attributes"].join("\0") || !plain(entry.attributes)) fail("invalid storage xattr sidecar entry");
    pathValue(entry.path); if (previous && previous >= entry.path) fail("storage xattr sidecar paths are not deterministic"); previous = entry.path;
    const names = Object.keys(entry.attributes);
    if (!names.length || names.join("\0") !== [...names].sort().join("\0") || names.some((name) => !XATTR_NAMES.includes(name))) fail("invalid storage xattr sidecar attributes");
    for (const name of names) base64(entry.attributes[name]);
  }
}

export async function readStorageXattrSidecar(directory, file = "xattrs.json", reader = readFile) {
  const raw = await reader(resolve(directory, file), "utf8"); let value;
  try { value = JSON.parse(raw); } catch { fail("invalid storage xattr sidecar JSON"); }
  if (compactJson(raw) !== JSON.stringify(value)) fail("storage xattr sidecar is not canonical JSON");
  validateStorageXattrSidecar(value); return value;
}

const XATTR_SCRIPT = `
const fs = require("fs");
const path = require("path");
const xattr = require("fs-xattr");
const mode = process.argv[1];
const fileName = process.argv[2];
const allow = ${JSON.stringify(XATTR_NAMES)};
const maxEntries = ${MAX_ENTRIES};
const maxPathLength = ${MAX_PATH};
const maxValueBytes = ${MAX_VALUE};
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function compactJsonSource(source) { let compact = "", quoted = false, escaped = false; for (const character of source) { if (quoted) { compact += character; if (escaped) escaped = false; else if (character === "\\\\") escaped = true; else if (character === "\\\"") quoted = false; } else if (character === "\\\"") { quoted = true; compact += character; } else if (!/\\s/.test(character)) compact += character; } return compact; }
function safePath(value) { if (typeof value !== "string" || !value || value.length > maxPathLength || value.startsWith("/") || value.includes("\\\\") || /[\\0-\\x1f]/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("invalid storage xattr sidecar path"); }
function base64(value) { if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("invalid storage xattr sidecar value"); const decoded = Buffer.from(value,"base64"); if (decoded.length > maxValueBytes || decoded.toString("base64") !== value) throw new Error("invalid storage xattr sidecar value"); return decoded; }
function validate(value) { if (!plainObject(value) || Object.keys(value).join("\\0") !== ["schemaVersion","format","entries"].join("\\0") || value.schemaVersion !== 1 || value.format !== ${JSON.stringify("supabase-file-xattrs")} || !Array.isArray(value.entries) || value.entries.length > maxEntries) throw new Error("invalid storage xattr sidecar"); let previous = ""; for (const entry of value.entries) { if (!plainObject(entry) || Object.keys(entry).join("\\0") !== ["path","attributes"].join("\\0") || !plainObject(entry.attributes)) throw new Error("invalid storage xattr sidecar entry"); safePath(entry.path); if (previous && previous >= entry.path) throw new Error("storage xattr sidecar paths are not deterministic"); previous = entry.path; const names = Object.keys(entry.attributes); if (!names.length || names.join("\\0") !== [...names].sort().join("\\0") || names.some((name) => !allow.includes(name))) throw new Error("invalid storage xattr sidecar attributes"); for (const name of names) base64(entry.attributes[name]); } }
function targetFor(relative) { const target = path.resolve("/target",...relative.split("/")); if (!target.startsWith("/target/")) throw new Error("unsafe storage xattr target"); const state = fs.lstatSync(target); if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1) throw new Error("unexpected storage filesystem entry"); return target; }
if (!["replay","verify"].includes(mode) || !/^[A-Za-z0-9._-]+$/.test(fileName) || fileName === "." || fileName === ".." || typeof xattr.listSync !== "function" || typeof xattr.getSync !== "function" || typeof xattr.setSync !== "function") throw new Error("storage xattr helper contract unavailable");
const raw = fs.readFileSync("/source/" + fileName,"utf8");
let sidecar; try { sidecar = JSON.parse(raw); } catch { throw new Error("invalid storage xattr sidecar JSON"); }
if (compactJsonSource(raw) !== JSON.stringify(sidecar)) throw new Error("storage xattr sidecar is not canonical JSON");
validate(sidecar);
for (const entry of sidecar.entries) { const target = targetFor(entry.path), names = Object.keys(entry.attributes); if (mode === "replay") for (const name of names) xattr.setSync(target,name,base64(entry.attributes[name])); const actual = new Set(xattr.listSync(target).filter((name) => allow.includes(name))); if (actual.size !== names.length || names.some((name) => !actual.has(name))) throw new Error("storage xattr replay verification failed"); for (const name of names) if (!Buffer.from(xattr.getSync(target,name)).equals(base64(entry.attributes[name]))) throw new Error("storage xattr replay verification failed"); }
`;

export function createRecoveryDataPrimitives({ runDocker, storageXattrImage = STORAGE_XATTR_IMAGE } = {}) {
  if (typeof runDocker !== "function") fail("recovery data runner is required");
  async function filesystem({ image, source, target, command, operation }) {
    const args = ["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "--cap-add=CHOWN", "--cap-add=FOWNER"];
    if (source) args.push("-v", `${source}:/source:ro`); if (target) args.push("-v", `${target}:/target`);
    args.push(image, "sh", "-ec", command); return runDocker(args, operation);
  }
  async function xattrs({ image, source, target, fileName = "xattrs.json", mode, operation }) {
    if (image !== storageXattrImage || !["replay", "verify"].includes(mode) || !/^[A-Za-z0-9._-]+$/.test(fileName) || fileName === "." || fileName === "..") fail("storage xattr helper contract is incompatible");
    return runDocker(["run", "--rm", "--pull=never", "--network", "none", "--read-only", "--user", "0:0", "--security-opt", "no-new-privileges", "--cap-drop=ALL", "--cap-add=DAC_OVERRIDE", "-v", `${source}:/source:ro`, "-v", `${target}:/target`, "--entrypoint", "node", image, "-e", XATTR_SCRIPT, mode, fileName], operation);
  }
  return Object.freeze({
    runFilesystem: filesystem,
    clearTarget: ({ image, target, operation }) => filesystem({ image, target, command: "find /target -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +", operation }),
    restoreArchive: ({ image, archiveDirectory, archiveName, target, operation }) => filesystem({ image, source: archiveDirectory, target, command: `tar -xf /source/${archiveName} -C /target`, operation: operation ?? (archiveName === "pgdata.tar" ? "extract PGDATA" : "extract Storage") }),
    assertRestoredPgdata: ({ image, target }) => filesystem({ image, source: target, command: "test -f /source/PG_VERSION; test \"$(cat /source/PG_VERSION)\" = \"17\"; test ! -e /source/postmaster.pid; test -n \"$(ls -A /source)\"", operation: "validate restored PGDATA" }),
    assertRestoredStorage: ({ image, target }) => filesystem({ image, source: target, command: "test -n \"$(ls -A /source)\"", operation: "validate restored Storage" }),
    restoreProtectedKey: ({ image, protectedDirectory, volume }) => filesystem({ image, source: protectedDirectory, target: volume, command: "tar -xf /source/pgsodium-root-key.tar -C /target pgsodium_root.key; test -f /target/pgsodium_root.key; test -s /target/pgsodium_root.key; test \"$(ls -1A /target | wc -l)\" -eq 6; for entry in conf.d extension-custom-scripts pgsodium_root.key read-replica.conf supautils.conf wal-g.conf; do test -e /target/$entry; done", operation: "restore pgsodium root key" }),
    replayStorageXattrs: (input) => xattrs({ ...input, mode: "replay", operation: input.operation ?? "restore Storage xattrs" }),
    verifyStorageXattrs: (input) => xattrs({ ...input, mode: "verify", operation: input.operation ?? "verify Storage xattrs" }),
  });
}
