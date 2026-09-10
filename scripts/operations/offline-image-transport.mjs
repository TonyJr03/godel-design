import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { evaluateCleanHostGate } from "./clean-host-gate.mjs";
import { assertVerifiedLocalImage, assertVerifiedRegistryImage, createDockerImageAdapter, validateAcquisitionAuthority } from "./image-acquisition.mjs";
import { readReconstructionManifest } from "./portability-manifest.mjs";

const exec = promisify(execFile), ROOT = resolve(import.meta.dirname, "../..");
const PLATFORM = Object.freeze({ os: "linux", architecture: "amd64" });
const BUNDLE_KEYS = ["schemaVersion", "format", "operationId", "repositoryGitCommit", "reconstructionManifestSha256", "imageLockSha256", "imageLockSchemaVersion", "platform", "images"];
const IMAGE_KEYS = ["canonicalRepository", "sourceRefs", "manifestDigest", "configDigest", "platform", "archive", "size", "sha256"];
const fail = (code) => { throw new Error(`OFFLINE_IMAGE_TRANSPORT_${code}`); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const safe = (value) => typeof value === "string" && value.length > 0 && !value.includes("\0") && !/^(?:[A-Za-z]:|[\\/])/.test(value) && !value.split(/[\\/]+/).some((part) => !part || part === "." || part === "..");
const physicalKey = (image) => [image.canonicalRepository, image.manifestDigest, image.configDigest, image.platform.os, image.platform.architecture].join("\0");
const isTransportError = (error) => error?.message?.startsWith("OFFLINE_IMAGE_TRANSPORT_");
function rethrow(error, fallback) { if (isTransportError(error)) throw error; fail(fallback); }
function exactKeys(value, expected, code) { if (!isObject(value) || Object.keys(value).length !== expected.length || Object.keys(value).some((key) => !expected.includes(key))) fail(code); }
function platform(value, code) { exactKeys(value, ["os", "architecture"], code); if (!same(value, PLATFORM)) fail(code); }
function expectedSourceRefs(lock, image) { return lock.images.filter((item) => physicalKey(item) === physicalKey(image)).map((item) => item.sourceRef).sort(); }

export function transportAlias(operationId, index, image) {
  if (typeof operationId !== "string" || !/^[0-9a-f-]{36}$/.test(operationId) || !Number.isSafeInteger(index) || index < 0 || typeof image?.configDigest !== "string") fail("TRANSPORT_ALIAS");
  return `godel-sh-image-transport/${operationId.slice(0, 8)}:${index}-${image.configDigest.slice(7, 19)}`;
}
export function uniquePhysicalImages(lock) { return [...new Map(lock.images.map((image) => [physicalKey(image), image])).values()]; }
export function validateRawRegistryManifest(image, bytes) {
  let manifest; try { manifest = JSON.parse(bytes); } catch { fail("RAW_MANIFEST_INVALID"); }
  if (!isObject(manifest) || !isObject(manifest.config) || `sha256:${digest(bytes)}` !== image.manifestDigest || manifest.config.digest !== image.configDigest) fail("RAW_MANIFEST_BINDING");
  return manifest;
}
export function validateOfflineBundle(bundle, authority, manifestSha256) {
  exactKeys(bundle, BUNDLE_KEYS, "BUNDLE_SCHEMA");
  if (bundle.schemaVersion !== 1 || bundle.format !== "godel-sh-offline-image-bundle" || bundle.operationId !== authority.manifest.operationId || bundle.repositoryGitCommit !== authority.manifest.repository.gitCommit || bundle.reconstructionManifestSha256 !== manifestSha256 || bundle.imageLockSha256 !== authority.manifest.imageAuthority.sha256 || bundle.imageLockSchemaVersion !== 2) fail("BUNDLE_BINDING");
  platform(bundle.platform, "BUNDLE_PLATFORM");
  if (!Array.isArray(bundle.images)) fail("BUNDLE_INVENTORY");
  const expectedImages = uniquePhysicalImages(authority.lock), expected = new Map(expectedImages.map((image) => [physicalKey(image), image]));
  if (bundle.images.length !== expected.size) fail("BUNDLE_INVENTORY");
  const physical = new Set(), archives = new Set(), sourceRefs = new Set();
  for (const [index, item] of bundle.images.entries()) {
    exactKeys(item, IMAGE_KEYS, "BUNDLE_IMAGE_SCHEMA");
    if (typeof item.canonicalRepository !== "string" || !safe(item.archive) || basename(item.archive) !== item.archive || !Number.isSafeInteger(item.size) || item.size < 1 || !/^[a-f0-9]{64}$/.test(item.sha256) || !/^sha256:[a-f0-9]{64}$/.test(item.manifestDigest) || !/^sha256:[a-f0-9]{64}$/.test(item.configDigest)) fail("BUNDLE_INVENTORY");
    platform(item.platform, "BUNDLE_INVENTORY");
    const key = physicalKey(item), expectedImage = expected.get(key);
    if (!expectedImage || key !== physicalKey(expectedImages[index]) || physical.has(key) || archives.has(item.archive) || !Array.isArray(item.sourceRefs) || item.sourceRefs.some((value) => typeof value !== "string") || new Set(item.sourceRefs).size !== item.sourceRefs.length || !same(item.sourceRefs, [...item.sourceRefs].sort()) || !same(item.sourceRefs, expectedSourceRefs(authority.lock, expectedImage)) || item.sourceRefs.some((sourceRef) => sourceRefs.has(sourceRef))) fail("BUNDLE_INVENTORY");
    physical.add(key); archives.add(item.archive); item.sourceRefs.forEach((sourceRef) => sourceRefs.add(sourceRef));
  }
  return bundle;
}
export function createOfflineDockerAdapter({ root = ROOT, runner = exec } = {}) {
  const call = (args, options = {}) => runner("docker", args, { cwd: root, windowsHide: true, maxBuffer: 128 * 1024 * 1024, ...options });
  const image = createDockerImageAdapter({ root, runner });
  return {
    ...image,
    inspectAliasIfPresent: async (alias) => {
      try { const inspected = JSON.parse((await call(["image", "inspect", alias])).stdout)?.[0]; if (!inspected) fail("DOCKER_INSPECT"); return { os: inspected.Os, architecture: inspected.Architecture, imageId: inspected.Id, repoDigests: inspected.RepoDigests }; }
      catch (error) { if (error?.code === 1) return null; rethrow(error, "DOCKER_INSPECT"); }
    },
    rawManifest: async (reference) => (await call(["buildx", "imagetools", "inspect", "--raw", reference], { encoding: "buffer" })).stdout,
    save: async (alias, output) => { await call(["image", "save", "--platform", "linux/amd64", "--output", output, alias]); },
    load: async (input) => { await call(["image", "load", "--platform", "linux/amd64", "--input", input]); },
    removeAlias: async (alias) => { await call(["image", "rm", alias]); },
  };
}
export function createOfflineGitAdapter({ root = ROOT, runner = exec } = {}) {
  const call = (args) => runner("git", args, { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024 });
  return { clean: async () => (await call(["status", "--porcelain"])).stdout.trim() === "", head: async () => (await call(["rev-parse", "HEAD"])).stdout.trim() };
}
async function authorityFor({ manifestPath, root, readManifest = readReconstructionManifest, validateAuthority = validateAcquisitionAuthority }) {
  let loaded, authority; try { loaded = await readManifest({ manifestPath }); authority = await validateAuthority({ root, manifest: loaded.manifest }); } catch (error) { rethrow(error, "AUTHORITY"); }
  if (!loaded?.manifest || typeof loaded.manifestSha256 !== "string" || !authority?.lock) fail("AUTHORITY");
  return { ...authority, manifest: loaded.manifest, manifestSha256: loaded.manifestSha256 };
}
async function gitGate(authority, git) {
  let clean; try { clean = await git.clean(); } catch { fail("GIT_STATUS"); } if (!clean) fail("REPOSITORY_DIRTY");
  let head; try { head = await git.head(); } catch { fail("GIT_HEAD"); } if (head !== authority.manifest.repository.gitCommit) fail("GIT_MISMATCH");
}
function transportPath(value, output = false) { if (!safe(value)) fail("PATH"); const parts = value.split(/[\\/]/); if (output && (parts.length !== 2 || parts[0] !== "backups")) fail("OUTPUT_PATH"); return parts; }
async function directory(root, relative, required) {
  const parts = transportPath(relative); let current = resolve(root);
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part); let entry;
    try { entry = await lstat(current); } catch { if (!required && index === parts.length - 1) return current; fail("FILESYSTEM_PATH"); }
    if (entry.isSymbolicLink() || !entry.isDirectory()) fail("FILESYSTEM_PATH");
  }
  return current;
}
async function regularFile(path, code) { let entry; try { entry = await lstat(path); } catch { fail(code); } if (entry.isSymbolicLink() || !entry.isFile()) fail(code); try { return await readFile(path); } catch { fail(code); } }
export async function fingerprintArchive(path, code = "ARCHIVE_INVALID") {
  let entry, metadata;
  try { entry = await lstat(path); } catch { fail(code); }
  if (entry.isSymbolicLink() || !entry.isFile()) fail(code);
  try { metadata = await stat(path); } catch { fail(code); }
  if (!metadata.isFile()) fail(code);
  const hash = createHash("sha256");
  try { for await (const chunk of createReadStream(path)) hash.update(chunk); } catch { fail(code); }
  return { size: metadata.size, sha256: hash.digest("hex") };
}
async function aliasIfPresent(docker, alias) { if (typeof docker.inspectAliasIfPresent !== "function") fail("DOCKER_ADAPTER"); try { return await docker.inspectAliasIfPresent(alias); } catch (error) { rethrow(error, "DOCKER_INSPECT"); } }
async function ensureAlias({ docker, alias, image, reference }) {
  const present = await aliasIfPresent(docker, alias);
  if (present) { try { assertVerifiedLocalImage(image, present); } catch { fail("ALIAS_MISMATCH"); } return { created: false }; }
  try { await docker.tagImage(reference, alias); } catch { fail("ALIAS_CREATE"); }
  try { assertVerifiedLocalImage(image, await aliasIfPresent(docker, alias)); } catch (error) { if (isTransportError(error)) throw error; fail("ALIAS_CREATE"); }
  return { created: true };
}
async function cleanupAliases(docker, aliases) { let incomplete = false; for (const alias of aliases) { try { await docker.removeAlias(alias); } catch { incomplete = true; } } if (incomplete) fail("TEMP_ALIAS_CLEANUP_INCOMPLETE"); }
async function cleanupTemporary(paths) { let incomplete = false; for (const path of paths) { try { await unlink(path); } catch (error) { if (error?.code !== "ENOENT") incomplete = true; } } if (incomplete) fail("TEMP_FILE_CLEANUP_INCOMPLETE"); }

export async function exportOfflineImageBundle({ manifestPath, output, root = ROOT, docker = createOfflineDockerAdapter({ root }), git = createOfflineGitAdapter({ root }), readManifest, validateAuthority } = {}) {
  transportPath(manifestPath); transportPath(output, true);
  const authority = await authorityFor({ manifestPath, root, readManifest, validateAuthority }); await gitGate(authority, git);
  const outputDirectory = await directory(root, output, false), parent = resolve(outputDirectory, "..");
  try { await mkdir(parent, { recursive: false, mode: 0o700 }); } catch (error) { if (error?.code !== "EEXIST") fail("OUTPUT_PARENT"); }
  try { await mkdir(outputDirectory, { recursive: false, mode: 0o700 }); } catch { fail("OUTPUT_EXISTS"); }
  const images = [], ownedAliases = [], temporary = [];
  try {
    for (const [index, image] of uniquePhysicalImages(authority.lock).entries()) {
      const reference = `${image.canonicalRepository}@${image.manifestDigest}`;
      try { const raw = await docker.rawManifest(reference); validateRawRegistryManifest(image, raw); await docker.pullExactImage(reference); assertVerifiedRegistryImage(image, await docker.inspectImage(reference)); } catch (error) { if (error?.message === "IMAGE_ACQUISITION_LOCAL_REPODIGEST") fail("REGISTRY_REPODIGEST"); rethrow(error, "EXPORT_IMAGE"); }
      const alias = transportAlias(authority.manifest.operationId, index, image), ownership = await ensureAlias({ docker, alias, image, reference }); if (ownership.created) ownedAliases.push(alias);
      const archive = `${String(index).padStart(2, "0")}-${image.configDigest.slice(7, 19)}.tar`, tmp = resolve(outputDirectory, `.${archive}.tmp`), final = resolve(outputDirectory, archive); temporary.push(tmp);
      try { await docker.save(alias, tmp); await rename(tmp, final); } catch { fail("ARCHIVE_SAVE"); } temporary.pop();
      let fingerprint; try { fingerprint = await fingerprintArchive(final, "ARCHIVE_METADATA"); } catch (error) { rethrow(error, "ARCHIVE_METADATA"); }
      images.push({ canonicalRepository: image.canonicalRepository, sourceRefs: expectedSourceRefs(authority.lock, image), manifestDigest: image.manifestDigest, configDigest: image.configDigest, platform: PLATFORM, archive, size: fingerprint.size, sha256: fingerprint.sha256 });
      if (ownership.created) { await cleanupAliases(docker, [alias]); ownedAliases.pop(); }
    }
    const bundle = { schemaVersion: 1, format: "godel-sh-offline-image-bundle", operationId: authority.manifest.operationId, repositoryGitCommit: authority.manifest.repository.gitCommit, reconstructionManifestSha256: authority.manifestSha256, imageLockSha256: authority.manifest.imageAuthority.sha256, imageLockSchemaVersion: 2, platform: PLATFORM, images };
    const bytes = Buffer.from(`${JSON.stringify(bundle)}\n`); await writeFile(resolve(outputDirectory, "bundle.json"), bytes, { flag: "wx", mode: 0o600 }); await writeFile(resolve(outputDirectory, "bundle.json.sha256"), `${digest(bytes)}  bundle.json\n`, { flag: "wx", mode: 0o600 });
    return Object.freeze({ state: "PASS", mode: "VERIFIED_OFFLINE_IMAGE_BUNDLE", uniqueImages: images.length, bundle: basename(outputDirectory) });
  } catch (error) { try { await cleanupTemporary(temporary); await cleanupAliases(docker, ownedAliases); } catch (cleanupError) { throw cleanupError; } rethrow(error, "EXPORT"); }
}
export async function importOfflineImageBundle({ manifestPath, bundle, root = ROOT, docker = createOfflineDockerAdapter({ root }), gate = evaluateCleanHostGate, readManifest, validateAuthority } = {}) {
  transportPath(manifestPath); transportPath(bundle); let gateResult; try { gateResult = await gate({ manifestPath, root }); } catch { fail("CLEAN_HOST_GATE"); } if (gateResult?.state !== "PASS") fail("CLEAN_HOST_GATE");
  const authority = await authorityFor({ manifestPath, root, readManifest, validateAuthority }), bundleDirectory = await directory(root, bundle, true);
  const bytes = await regularFile(resolve(bundleDirectory, "bundle.json"), "BUNDLE_FILE"), sidecar = await regularFile(resolve(bundleDirectory, "bundle.json.sha256"), "BUNDLE_SIDECAR");
  if (sidecar.toString("utf8") !== `${digest(bytes)}  bundle.json\n`) fail("BUNDLE_SIDECAR"); let metadata; try { metadata = JSON.parse(bytes); } catch { fail("BUNDLE_INVALID"); } validateOfflineBundle(metadata, authority, authority.manifestSha256);
  for (const image of metadata.images) { const archive = await fingerprintArchive(resolve(bundleDirectory, image.archive)); if (archive.size !== image.size || archive.sha256 !== image.sha256) fail("ARCHIVE_INVALID"); }
  for (const [index, image] of metadata.images.entries()) {
    const alias = transportAlias(metadata.operationId, index, image), present = await aliasIfPresent(docker, alias);
    if (present) { try { assertVerifiedLocalImage(image, present); } catch { fail("ALIAS_MISMATCH"); } continue; }
    try { await docker.load(resolve(bundleDirectory, image.archive)); } catch { fail("ARCHIVE_LOAD"); }
    try { assertVerifiedLocalImage(image, await aliasIfPresent(docker, alias)); } catch { fail("LOADED_IMAGE_MISMATCH"); }
  }
  for (const image of authority.lock.images) { const present = await aliasIfPresent(docker, image.sourceRef); if (present) { try { assertVerifiedLocalImage(image, present); } catch { fail("ALIAS_MISMATCH"); } } }
  for (const image of authority.lock.images) { const index = metadata.images.findIndex((item) => physicalKey(item) === physicalKey(image)); await ensureAlias({ docker, alias: image.sourceRef, image, reference: transportAlias(metadata.operationId, index, image) }); }
  return Object.freeze({ state: "PASS", mode: "VERIFIED_OFFLINE_IMAGE_BUNDLE", target: "clean-host-disposable-rehearsal", platform: "linux/amd64", logicalAuthorities: authority.lock.images.length, uniqueImages: metadata.images.length, verifiedImages: metadata.images.length, executionAliases: new Set(authority.lock.images.map((image) => image.sourceRef)).size, registryAccess: "NOT_REQUIRED", localImageAuthority: "CONFIG_DIGEST_VERIFIED" });
}
function args(values, verb) { const parsed = {}; while (values.length) { const key = values.shift(), value = values.shift(); if (!key?.startsWith("--") || !value || parsed[key]) fail("ARGUMENTS"); parsed[key] = value; } if (!safe(parsed["--manifest"]) || !safe(parsed[verb === "export" ? "--output" : "--bundle"]) || Object.keys(parsed).length !== 2) fail("ARGUMENTS"); return parsed; }
if (import.meta.main) { try { const [verb, ...rest] = process.argv.slice(2), parsed = args(rest, verb), result = verb === "export" ? await exportOfflineImageBundle({ manifestPath: parsed["--manifest"], output: parsed["--output"] }) : verb === "import" ? await importOfflineImageBundle({ manifestPath: parsed["--manifest"], bundle: parsed["--bundle"] }) : fail("ARGUMENTS"); process.stdout.write(`${JSON.stringify(result)}\n`); } catch (error) { process.stderr.write(`FAIL ${isTransportError(error) ? error.message : "OFFLINE_IMAGE_TRANSPORT_FAILED"}\n`); process.exitCode = 1; } }
