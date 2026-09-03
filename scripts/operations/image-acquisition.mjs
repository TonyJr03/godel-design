import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const LOCK_PATH = "infra/sh-portability-image-lock.json";
const COMPOSE_PATH = "infra/supabase/docker-compose.yml";
const BACKUP_PATH = "scripts/operations/backup-selfhosted.mjs";
const RESTORE_PATH = "scripts/operations/restore-selfhosted.mjs";
const UPSTREAM_DOCUMENT_PATH = "infra/SUPABASE_UPSTREAM.md";
const UPSTREAM_LOCK_PATH = "infra/supabase-upstream.lock.json";
const PLATFORM = Object.freeze({ os: "linux", architecture: "amd64" });
const TOP_LEVEL_KEYS = ["schemaVersion", "format", "platform", "supabaseUpstreamCommit", "images"];
const IMAGE_KEYS = ["logicalName", "role", "canonicalRepository", "sourceRef", "manifestDigest", "platform", "authority"];

function fail(code) { throw new Error("IMAGE_LOCK_" + code); }
function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function assertExactKeys(value, expected, code) { if (!isObject(value) || Object.keys(value).length !== expected.length || Object.keys(value).some((key) => !expected.includes(key))) fail(code); }
function assertString(value, code, maximum = 320) { if (typeof value !== "string" || !value.length || value.length > maximum) fail(code); }
function assertPlatform(value, code) { assertExactKeys(value, ["os", "architecture"], code); if (value.os !== PLATFORM.os || value.architecture !== PLATFORM.architecture) fail(code); }

function parseSourceRef(sourceRef) {
  const match = /^([a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*):([A-Za-z0-9][A-Za-z0-9._-]{0,127})$/.exec(sourceRef);
  if (!match) fail("SOURCE_REF");
  return { repository: match[1], tag: match[2] };
}

function canonicalRepository(sourceRef) { return "docker.io/" + parseSourceRef(sourceRef).repository; }
function assertAuthority(value) { assertString(value, "AUTHORITY"); if (value.startsWith("/") || value.includes("\\") || value.split("/").includes("..")) fail("AUTHORITY"); }

function assertImage(image) {
  assertExactKeys(image, IMAGE_KEYS, "IMAGE_SCHEMA");
  assertString(image.logicalName, "LOGICAL_NAME", 64);
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(image.logicalName)) fail("LOGICAL_NAME");
  if (!["runtime", "helper"].includes(image.role)) fail("ROLE");
  assertString(image.canonicalRepository, "REPOSITORY", 255);
  if (!/^docker\.io\/[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/.test(image.canonicalRepository)) fail("REPOSITORY");
  assertString(image.sourceRef, "SOURCE_REF", 255);
  if (image.canonicalRepository !== canonicalRepository(image.sourceRef)) fail("SOURCE_REPOSITORY_MISMATCH");
  assertString(image.manifestDigest, "MANIFEST_DIGEST", 71);
  if (!/^sha256:[a-f0-9]{64}$/.test(image.manifestDigest)) fail("MANIFEST_DIGEST");
  assertPlatform(image.platform, "PLATFORM");
  assertAuthority(image.authority);
  if (["docker.io/godel-design-app", "docker.io/godel-design-nginx"].includes(image.canonicalRepository)) fail("GODEL_FINAL_IMAGE");
}

export function validateImageLock(lock) {
  assertExactKeys(lock, TOP_LEVEL_KEYS, "SCHEMA");
  if (lock.schemaVersion !== 1 || lock.format !== "godel-sh-portability-image-lock") fail("SCHEMA");
  assertPlatform(lock.platform, "PLATFORM");
  assertString(lock.supabaseUpstreamCommit, "UPSTREAM_COMMIT", 40);
  if (!/^[a-f0-9]{40}$/.test(lock.supabaseUpstreamCommit)) fail("UPSTREAM_COMMIT");
  if (!Array.isArray(lock.images) || !lock.images.length || lock.images.length > 64) fail("IMAGES");
  const names = new Set();
  const authorities = new Set();
  const sourceDigests = new Map();
  let previousName = "";
  for (const image of lock.images) {
    assertImage(image);
    if (names.has(image.logicalName)) fail("DUPLICATE_LOGICAL_NAME");
    if (authorities.has(image.authority)) fail("DUPLICATE_AUTHORITY");
    if (previousName && previousName >= image.logicalName) fail("IMAGE_ORDER");
    const sourceIdentity = image.canonicalRepository + "\u0000" + image.sourceRef + "\u0000" + image.platform.os + "\u0000" + image.platform.architecture;
    const establishedDigest = sourceDigests.get(sourceIdentity);
    if (establishedDigest && establishedDigest !== image.manifestDigest) fail("SOURCE_DIGEST_CONFLICT");
    names.add(image.logicalName);
    authorities.add(image.authority);
    sourceDigests.set(sourceIdentity, image.manifestDigest);
    previousName = image.logicalName;
  }
  return { imageCount: lock.images.length, platform: PLATFORM, upstreamCommit: lock.supabaseUpstreamCommit };
}

function parseComposeImages(content) {
  const images = [];
  let inServices = false;
  let currentService = null;
  for (const line of content.split(/\r?\n/)) {
    if (line === "services:") { inServices = true; continue; }
    if (!inServices) continue;
    if (/^[^\s#]/.test(line)) break;
    const service = /^  ([a-z0-9][a-z0-9-]*):\s*$/.exec(line);
    if (service) { currentService = service[1]; continue; }
    const image = /^    image:\s*([^\s#]+)\s*$/.exec(line);
    if (image && currentService) {
      if (images.some((entry) => entry.service === currentService)) fail("COMPOSE_DUPLICATE_IMAGE");
      images.push({ service: currentService, sourceRef: image[1] });
    }
  }
  if (!images.length) fail("COMPOSE_IMAGES");
  return images;
}

function extractStorageXattrImage(content) {
  const matches = [...content.matchAll(/^const STORAGE_XATTR_IMAGE = "([^"]+)";$/gm)];
  if (matches.length !== 1) fail("HELPER_SOURCE");
  return matches[0][1];
}

function requirement({ logicalName, role, sourceRef, authority }) { return { logicalName, role, sourceRef, canonicalRepository: canonicalRepository(sourceRef), authority }; }

export async function extractPullOnlyImageRequirements({ root = ROOT } = {}) {
  const [compose, backup, restore] = await Promise.all([readFile(resolve(root, COMPOSE_PATH), "utf8"), readFile(resolve(root, BACKUP_PATH), "utf8"), readFile(resolve(root, RESTORE_PATH), "utf8")]);
  const runtime = parseComposeImages(compose).map(({ service, sourceRef }) => requirement({ logicalName: "runtime-" + service, role: "runtime", sourceRef, authority: COMPOSE_PATH + " service " + service }));
  const db = runtime.find((entry) => entry.logicalName === "runtime-db");
  if (!db) fail("COMPOSE_DB_IMAGE");
  const backupStorageImage = extractStorageXattrImage(backup);
  const restoreStorageImage = extractStorageXattrImage(restore);
  if (backupStorageImage !== restoreStorageImage) fail("HELPER_SOURCE_MISMATCH");
  const helpers = [
    requirement({ logicalName: "helper-postgres-db-config", role: "helper", sourceRef: db.sourceRef, authority: RESTORE_PATH + " rebuildDbConfig" }),
    requirement({ logicalName: "helper-postgres-filesystem", role: "helper", sourceRef: db.sourceRef, authority: BACKUP_PATH + " runFilesystemHelper; " + RESTORE_PATH + " runRestoreFilesystem" }),
    requirement({ logicalName: "helper-storage-xattr", role: "helper", sourceRef: backupStorageImage, authority: BACKUP_PATH + " STORAGE_XATTR_IMAGE; " + RESTORE_PATH + " STORAGE_XATTR_IMAGE" }),
  ];
  return [...helpers, ...runtime].sort((left, right) => left.logicalName.localeCompare(right.logicalName));
}

function extractUpstreamCommit(document, upstreamLock) {
  const commits = [...new Set(document.match(/\b[a-f0-9]{40}\b/g) ?? [])];
  if (commits.length !== 1 || !isObject(upstreamLock) || !/^[a-f0-9]{40}$/.test(upstreamLock.base_ref) || upstreamLock.base_ref !== commits[0]) fail("UPSTREAM_BINDING");
  return commits[0];
}

export async function readImageLock({ root = ROOT } = {}) {
  const path = resolve(root, LOCK_PATH);
  const relativePath = relative(root, path);
  if (!relativePath || relativePath.startsWith(".." + sep) || relativePath === "..") fail("LOCK_PATH");
  try { return JSON.parse(await readFile(path, "utf8")); } catch { fail("LOCK_PARSE"); }
}

export async function validateImageLockAgainstRepository({ root = ROOT, lock } = {}) {
  const activeLock = lock ?? await readImageLock({ root });
  const summary = validateImageLock(activeLock);
  const [requirements, upstreamDocument, upstreamLockText] = await Promise.all([extractPullOnlyImageRequirements({ root }), readFile(resolve(root, UPSTREAM_DOCUMENT_PATH), "utf8"), readFile(resolve(root, UPSTREAM_LOCK_PATH), "utf8")]);
  let upstreamLock;
  try { upstreamLock = JSON.parse(upstreamLockText); } catch { fail("UPSTREAM_BINDING"); }
  const upstreamCommit = extractUpstreamCommit(upstreamDocument, upstreamLock);
  if (activeLock.supabaseUpstreamCommit !== upstreamCommit) fail("UPSTREAM_BINDING");
  const lockedByName = new Map(activeLock.images.map((image) => [image.logicalName, image]));
  if (lockedByName.size !== requirements.length) fail("REPOSITORY_COVERAGE");
  for (const expected of requirements) {
    const actual = lockedByName.get(expected.logicalName);
    if (!actual || actual.role !== expected.role || actual.canonicalRepository !== expected.canonicalRepository || actual.sourceRef !== expected.sourceRef || actual.authority !== expected.authority) fail("REPOSITORY_COVERAGE");
  }
  return { ...summary, requirementCount: requirements.length };
}

export function formatValidationReport(summary) { return "PASS image-lock images=" + summary.imageCount + " requirements=" + summary.requirementCount + " platform=linux/amd64 upstream=" + summary.upstreamCommit; }
export async function validateLockCli({ root = ROOT } = {}) { return formatValidationReport(await validateImageLockAgainstRepository({ root })); }

async function main() {
  if (process.argv.slice(2).length !== 1 || process.argv[2] !== "validate-lock") { console.error("[ops:portability:images] USAGE: validate-lock"); process.exitCode = 1; return; }
  try { console.log("[ops:portability:images] " + await validateLockCli()); } catch (error) { console.error("[ops:portability:images] FAIL " + (error instanceof Error ? error.message : "IMAGE_LOCK_UNKNOWN")); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();
