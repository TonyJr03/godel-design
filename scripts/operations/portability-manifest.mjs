import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { link, lstat, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { isCanonicalGenerationId } from "./secret-generation.mjs";
import { readImageLock, validateImageLockAgainstRepository } from "./image-acquisition.mjs";

const execFileAsync = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../..");
const FORMAT = "godel-sh-reconstruction-manifest";
const PLATFORM = Object.freeze({ os: "linux", architecture: "amd64" });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const TOP_KEYS = ["schemaVersion", "format", "operationId", "platform", "repository", "supabase", "imageAuthority", "godelBuilds", "backup", "externalSecretGenerationId", "protectedRecoveryMaterial", "targetContract", "contracts"];

function fail(code) { throw new Error("PORTABILITY_MANIFEST_" + code); }
function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, expected, code) { if (!isObject(value) || Object.keys(value).length !== expected.length || Object.keys(value).some((key) => !expected.includes(key))) fail(code); }
function string(value, code, maximum = 512) { if (typeof value !== "string" || !value.length || value.length > maximum) fail(code); }
function sha256(value, code) { string(value, code, 64); if (!SHA256.test(value)) fail(code); }
function commit(value, code) { string(value, code, 40); if (!COMMIT.test(value)) fail(code); }
function platform(value, code) { exactKeys(value, ["os", "architecture"], code); if (value.os !== PLATFORM.os || value.architecture !== PLATFORM.architecture) fail(code); }
function stableJson(value) { return JSON.stringify(value, null, 2) + "\n"; }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function contained(parent, child) { const relation = relative(resolve(parent), resolve(child)); return relation === "" || (!relation.startsWith(".." + sep) && relation !== ".."); }
function safeRelative(value, code) { string(value, code); if (value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/.test(value) || value.split("/").some((part) => !part || part === "." || part === "..")) fail(code); }

async function regular(path, code) {
  let entry;
  try { entry = await lstat(path); } catch { fail(code + "_MISSING"); }
  if (entry.isSymbolicLink()) fail(code + "_SYMLINK");
  if (!entry.isFile()) fail(code + "_NOT_REGULAR");
  return entry;
}

async function directory(path, code) {
  let entry;
  try { entry = await lstat(path); } catch { fail(code + "_MISSING"); }
  if (entry.isSymbolicLink()) fail(code + "_SYMLINK");
  if (!entry.isDirectory()) fail(code + "_NOT_DIRECTORY");
}

async function publishCreateOnly({ temporaryPath, finalPath, publication }) {
  try {
    await publication.link(temporaryPath, finalPath);
  } catch (error) {
    if (error?.code === "EEXIST") fail("OUTPUT_EXISTS");
    throw error;
  }
}

export async function hashRegularFile(path, code = "FILE") {
  const entry = await regular(path, code);
  const bytes = await readFile(path);
  return { sha256: digest(bytes), size: entry.size, bytes };
}

async function defaultGit(root) {
  const call = async (args) => (await execFileAsync("git", args, { cwd: root, windowsHide: true })).stdout.trim();
  return {
    head: async () => call(["rev-parse", "HEAD"]),
    clean: async () => !(await call(["status", "--porcelain"])),
    hasCommit: async (value) => { try { await call(["cat-file", "-e", value + "^{commit}"]); return true; } catch { return false; } },
    isAncestor: async (older, newer) => { try { await call(["merge-base", "--is-ancestor", older, newer]); return true; } catch { return false; } },
  };
}

async function defaultBackupVerifier({ root, backup, protectedRoot }) {
  try {
    await execFileAsync(process.execPath, [resolve(root, "scripts/operations/backup-selfhosted.mjs"), "verify", "--backup", backup, "--protected-root", protectedRoot], { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024 });
  } catch { fail("BACKUP_VERIFY_FAILED"); }
}

function upstreamCommitFromDocument(document) {
  const commits = [...new Set(document.match(/\b[a-f0-9]{40}\b/g) ?? [])];
  if (commits.length !== 1) fail("UPSTREAM_BINDING");
  return commits[0];
}

function normalizedImages(lock) {
  return lock.images.map((image) => ({ logicalName: image.logicalName, canonicalRepository: image.canonicalRepository, manifestDigest: image.manifestDigest, platform: image.platform }));
}

function baseImages(source, code) {
  const stages = new Set();
  const external = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^FROM\s+([^\s]+)(?:\s+AS\s+([A-Za-z0-9_-]+))?\s*$/i.exec(line);
    if (!match) continue;
    const [reference, alias] = [match[1], match[2]];
    if (!stages.has(reference)) {
      if (!/@sha256:[a-f0-9]{64}$/.test(reference)) fail(code);
      external.push(reference);
    }
    if (alias) stages.add(alias);
  }
  if (!external.length) fail(code);
  return external;
}

async function repositoryAuthority(root) {
  const [upstreamDocument, upstreamLockFile, imageLockFile, appDockerfile, nginxDockerfile] = await Promise.all([
    readFile(resolve(root, "infra/SUPABASE_UPSTREAM.md"), "utf8"),
    hashRegularFile(resolve(root, "infra/supabase-upstream.lock.json"), "UPSTREAM_LOCK"),
    hashRegularFile(resolve(root, "infra/sh-portability-image-lock.json"), "IMAGE_LOCK"),
    hashRegularFile(resolve(root, "Dockerfile"), "APP_DOCKERFILE"),
    hashRegularFile(resolve(root, "Dockerfile.nginx"), "NGINX_DOCKERFILE"),
  ]);
  let upstreamLock;
  try { upstreamLock = JSON.parse(upstreamLockFile.bytes.toString("utf8")); } catch { fail("UPSTREAM_BINDING"); }
  const upstreamCommit = upstreamCommitFromDocument(upstreamDocument);
  if (!isObject(upstreamLock) || upstreamLock.base_ref !== upstreamCommit) fail("UPSTREAM_BINDING");
  const imageLock = await readImageLock({ root });
  await validateImageLockAgainstRepository({ root, lock: imageLock });
  return {
    upstreamCommit,
    upstreamLockSha256: upstreamLockFile.sha256,
    imageLock: { format: imageLock.format, schemaVersion: imageLock.schemaVersion, sha256: imageLockFile.sha256, platform: imageLock.platform, imageCount: imageLock.images.length, images: normalizedImages(imageLock) },
    recipes: [
      { logicalName: "godel-app", dockerfile: "Dockerfile", dockerfileSha256: appDockerfile.sha256, baseImages: baseImages(appDockerfile.bytes.toString("utf8"), "APP_BASE_IMAGE"), platform: PLATFORM },
      { logicalName: "godel-nginx", dockerfile: "Dockerfile.nginx", dockerfileSha256: nginxDockerfile.sha256, baseImages: baseImages(nginxDockerfile.bytes.toString("utf8"), "NGINX_BASE_IMAGE"), platform: PLATFORM },
    ],
  };
}

function validateBackupManifest(value) {
  if (!isObject(value) || value.format !== "godel-selfhosted-backup" || value.schemaVersion !== 3 || value.status !== "COMPLETE") fail("BACKUP_STATE");
  string(value.backupId, "BACKUP_ID", 160);
  if (!isObject(value.repository) || value.repository.dirty !== false) fail("BACKUP_REPOSITORY");
  commit(value.repository.commit, "BACKUP_SOURCE_COMMIT");
  if (!isObject(value.supabase)) fail("BACKUP_UPSTREAM");
  commit(value.supabase.upstreamCommit, "BACKUP_UPSTREAM");
  if (!isCanonicalGenerationId(value.externalSecretGenerationId)) fail("BACKUP_GENERATION");
  const material = value.protectedRecoveryMaterial;
  if (!isObject(material) || material.required !== true || material.captured !== true || !isObject(material.artifact)) fail("PROTECTED_MATERIAL");
  const artifact = material.artifact;
  if (artifact.relativePath !== "pgsodium-root-key.tar" || artifact.type !== "tar" || !Number.isSafeInteger(artifact.size) || artifact.size < 1 || !SHA256.test(artifact.sha256)) fail("PROTECTED_MATERIAL");
  return artifact;
}

async function backupAuthority({ backup, protectedRoot, upstreamCommit, git, verifyBackup, root }) {
  try { await verifyBackup({ root, backup, protectedRoot }); } catch (error) { if (error instanceof Error && error.message === "PORTABILITY_MANIFEST_BACKUP_VERIFY_FAILED") throw error; fail("BACKUP_VERIFY_FAILED"); }
  const manifestPath = resolve(backup, "manifest.json");
  const checksumsPath = resolve(backup, "checksums.sha256");
  const [manifestFile, checksumsFile] = await Promise.all([hashRegularFile(manifestPath, "BACKUP_MANIFEST"), hashRegularFile(checksumsPath, "BACKUP_CHECKSUMS")]);
  let manifest;
  try { manifest = JSON.parse(manifestFile.bytes.toString("utf8")); } catch { fail("BACKUP_MANIFEST_JSON"); }
  const artifact = validateBackupManifest(manifest);
  if (manifest.supabase.upstreamCommit !== upstreamCommit) fail("BACKUP_UPSTREAM");
  if (!await git.hasCommit(manifest.repository.commit)) fail("BACKUP_SOURCE_UNKNOWN");
  return {
    manifest,
    manifestSha256: manifestFile.sha256,
    checksumsSha256: checksumsFile.sha256,
    protectedArtifact: await hashRegularFile(resolve(protectedRoot, basename(backup), artifact.relativePath), "PROTECTED_ARTIFACT"),
    protectedRelativePath: artifact.relativePath,
  };
}

export async function validateReconstructionInputs({ root = ROOT, backup, protectedRoot, git: providedGit, verifyBackup = defaultBackupVerifier } = {}) {
  if (!backup || !protectedRoot) fail("INPUTS");
  const git = providedGit ?? await defaultGit(root);
  if (!await git.clean()) fail("REPOSITORY_DIRTY");
  const head = await git.head();
  commit(head, "REPOSITORY_HEAD");
  const authority = await repositoryAuthority(root);
  const backupData = await backupAuthority({ backup: resolve(backup), protectedRoot: resolve(protectedRoot), upstreamCommit: authority.upstreamCommit, git, verifyBackup, root });
  if (backupData.protectedArtifact.size < 1 || backupData.protectedArtifact.size !== backupData.manifest.protectedRecoveryMaterial.artifact.size) fail("PROTECTED_ARTIFACT_SIZE");
  if (backupData.protectedArtifact.sha256 !== backupData.manifest.protectedRecoveryMaterial.artifact.sha256) fail("PROTECTED_ARTIFACT_HASH");
  if (!await git.isAncestor(backupData.manifest.repository.commit, head)) fail("BACKUP_SOURCE_NOT_ANCESTOR");
  return { head, authority, backupData };
}

function buildManifest(input, operationId) {
  if (!UUID.test(operationId)) fail("OPERATION_ID");
  const { head, authority, backupData } = input;
  const generationId = backupData.manifest.externalSecretGenerationId;
  return {
    schemaVersion: 1,
    format: FORMAT,
    operationId,
    platform: PLATFORM,
    repository: { gitCommit: head },
    supabase: { upstreamCommit: authority.upstreamCommit, upstreamLockSha256: authority.upstreamLockSha256 },
    imageAuthority: authority.imageLock,
    godelBuilds: authority.recipes.map((recipe) => ({ ...recipe, gitCommit: head, configurationBinding: recipe.logicalName === "godel-app" ? generationId : null })),
    backup: { backupId: backupData.manifest.backupId, schemaVersion: 3, manifestSha256: backupData.manifestSha256, checksumsSha256: backupData.checksumsSha256, sourceGitCommit: backupData.manifest.repository.commit },
    externalSecretGenerationId: generationId,
    protectedRecoveryMaterial: { relativePath: backupData.protectedRelativePath, size: backupData.protectedArtifact.size, sha256: backupData.protectedArtifact.sha256 },
    targetContract: { model: "A_SEPARATE_DISPOSABLE", hostContract: "PROVIDER_NEUTRAL_CLEAN_LINUX_DOCKER_HOST", platform: PLATFORM, supabaseComposeProject: "supabase", godelComposeProject: "godel-runtime", operatorNetwork: "godel-supabase-api", persistence: { pgdata: "BIND", storage: "BIND", dbConfig: "NAMED_VOLUME" } },
    contracts: { reconstructionManifestSchema: 1, imageLockSchema: 1, backupSchema: 3, secretGenerationStrategy: "EXACT_GENERATION_SNAPSHOTS", backupGenerationAlignment: "FAIL_CLOSED", implicitRollbackChain: "FORBIDDEN" },
  };
}

function validateRecipe(value) {
  exactKeys(value, ["logicalName", "dockerfile", "dockerfileSha256", "baseImages", "platform", "gitCommit", "configurationBinding"], "BUILD_RECIPE");
  if (!["godel-app", "godel-nginx"].includes(value.logicalName) || !Array.isArray(value.baseImages) || !value.baseImages.length || value.baseImages.some((item) => typeof item !== "string" || !/@sha256:[a-f0-9]{64}$/.test(item))) fail("BUILD_RECIPE");
  safeRelative(value.dockerfile, "BUILD_RECIPE"); sha256(value.dockerfileSha256, "BUILD_RECIPE"); platform(value.platform, "BUILD_RECIPE"); commit(value.gitCommit, "BUILD_RECIPE");
  if (value.logicalName === "godel-app" ? !isCanonicalGenerationId(value.configurationBinding) : value.configurationBinding !== null) fail("BUILD_RECIPE");
}

export function validateReconstructionManifest(manifest) {
  exactKeys(manifest, TOP_KEYS, "SCHEMA");
  if (manifest.schemaVersion !== 1 || manifest.format !== FORMAT || !UUID.test(manifest.operationId)) fail("SCHEMA");
  platform(manifest.platform, "PLATFORM");
  exactKeys(manifest.repository, ["gitCommit"], "REPOSITORY"); commit(manifest.repository.gitCommit, "REPOSITORY");
  exactKeys(manifest.supabase, ["upstreamCommit", "upstreamLockSha256"], "SUPABASE"); commit(manifest.supabase.upstreamCommit, "SUPABASE"); sha256(manifest.supabase.upstreamLockSha256, "SUPABASE");
  exactKeys(manifest.imageAuthority, ["format", "schemaVersion", "sha256", "platform", "imageCount", "images"], "IMAGE_AUTHORITY");
  if (manifest.imageAuthority.format !== "godel-sh-portability-image-lock" || manifest.imageAuthority.schemaVersion !== 1 || !Number.isSafeInteger(manifest.imageAuthority.imageCount) || manifest.imageAuthority.imageCount < 1 || !Array.isArray(manifest.imageAuthority.images) || manifest.imageAuthority.images.length !== manifest.imageAuthority.imageCount) fail("IMAGE_AUTHORITY");
  sha256(manifest.imageAuthority.sha256, "IMAGE_AUTHORITY"); platform(manifest.imageAuthority.platform, "IMAGE_AUTHORITY");
  for (const image of manifest.imageAuthority.images) { exactKeys(image, ["logicalName", "canonicalRepository", "manifestDigest", "platform"], "IMAGE_INVENTORY"); string(image.logicalName, "IMAGE_INVENTORY", 64); string(image.canonicalRepository, "IMAGE_INVENTORY", 255); if (!/^sha256:[a-f0-9]{64}$/.test(image.manifestDigest)) fail("IMAGE_INVENTORY"); platform(image.platform, "IMAGE_INVENTORY"); if (/godel-design-(app|nginx)/.test(image.logicalName + image.canonicalRepository)) fail("IMAGE_INVENTORY"); }
  if (!Array.isArray(manifest.godelBuilds) || manifest.godelBuilds.length !== 2) fail("BUILD_RECIPES"); manifest.godelBuilds.forEach(validateRecipe);
  exactKeys(manifest.backup, ["backupId", "schemaVersion", "manifestSha256", "checksumsSha256", "sourceGitCommit"], "BACKUP"); string(manifest.backup.backupId, "BACKUP", 160); if (manifest.backup.schemaVersion !== 3) fail("BACKUP"); sha256(manifest.backup.manifestSha256, "BACKUP"); sha256(manifest.backup.checksumsSha256, "BACKUP"); commit(manifest.backup.sourceGitCommit, "BACKUP");
  if (!isCanonicalGenerationId(manifest.externalSecretGenerationId)) fail("EXTERNAL_SECRET_GENERATION");
  exactKeys(manifest.protectedRecoveryMaterial, ["relativePath", "size", "sha256"], "PROTECTED_MATERIAL"); safeRelative(manifest.protectedRecoveryMaterial.relativePath, "PROTECTED_MATERIAL"); if (manifest.protectedRecoveryMaterial.relativePath !== "pgsodium-root-key.tar" || !Number.isSafeInteger(manifest.protectedRecoveryMaterial.size) || manifest.protectedRecoveryMaterial.size < 1) fail("PROTECTED_MATERIAL"); sha256(manifest.protectedRecoveryMaterial.sha256, "PROTECTED_MATERIAL");
  exactKeys(manifest.targetContract, ["model", "hostContract", "platform", "supabaseComposeProject", "godelComposeProject", "operatorNetwork", "persistence"], "TARGET_CONTRACT");
  if (manifest.targetContract.model !== "A_SEPARATE_DISPOSABLE" || manifest.targetContract.hostContract !== "PROVIDER_NEUTRAL_CLEAN_LINUX_DOCKER_HOST" || manifest.targetContract.supabaseComposeProject !== "supabase" || manifest.targetContract.godelComposeProject !== "godel-runtime" || manifest.targetContract.operatorNetwork !== "godel-supabase-api") fail("TARGET_CONTRACT"); platform(manifest.targetContract.platform, "TARGET_CONTRACT"); exactKeys(manifest.targetContract.persistence, ["pgdata", "storage", "dbConfig"], "TARGET_CONTRACT"); if (manifest.targetContract.persistence.pgdata !== "BIND" || manifest.targetContract.persistence.storage !== "BIND" || manifest.targetContract.persistence.dbConfig !== "NAMED_VOLUME") fail("TARGET_CONTRACT");
  exactKeys(manifest.contracts, ["reconstructionManifestSchema", "imageLockSchema", "backupSchema", "secretGenerationStrategy", "backupGenerationAlignment", "implicitRollbackChain"], "CONTRACTS");
  if (manifest.contracts.reconstructionManifestSchema !== 1 || manifest.contracts.imageLockSchema !== 1 || manifest.contracts.backupSchema !== 3 || manifest.contracts.secretGenerationStrategy !== "EXACT_GENERATION_SNAPSHOTS" || manifest.contracts.backupGenerationAlignment !== "FAIL_CLOSED" || manifest.contracts.implicitRollbackChain !== "FORBIDDEN") fail("CONTRACTS");
  if (!same(manifest.platform, manifest.imageAuthority.platform) || !same(manifest.platform, manifest.targetContract.platform) || manifest.godelBuilds.some((recipe) => !same(recipe.platform, manifest.platform)) || manifest.godelBuilds.find((recipe) => recipe.logicalName === "godel-app")?.configurationBinding !== manifest.externalSecretGenerationId) fail("PLATFORM_OR_BINDING");
  return manifest;
}

export async function createReconstructionManifest({ root = ROOT, backup, protectedRoot, output, operationId = randomUUID(), git, verifyBackup, publication = { link } } = {}) {
  if (!output) fail("OUTPUT");
  if (typeof output !== "string" || output.includes("\0") || output.split(/[\\/]+/).includes("..")) fail("OUTPUT_PATH");
  const outputPath = resolve(output), backupPath = resolve(backup), protectedPath = resolve(protectedRoot);
  if (contained(backupPath, outputPath) || contained(protectedPath, outputPath) || outputPath.endsWith(".sha256")) fail("OUTPUT_PATH");
  try { await lstat(outputPath); fail("OUTPUT_EXISTS"); } catch (error) { if (error instanceof Error && error.message === "PORTABILITY_MANIFEST_OUTPUT_EXISTS") throw error; if (error?.code !== "ENOENT") throw error; }
  try { await lstat(outputPath + ".sha256"); fail("OUTPUT_EXISTS"); } catch (error) { if (error instanceof Error && error.message === "PORTABILITY_MANIFEST_OUTPUT_EXISTS") throw error; if (error?.code !== "ENOENT") throw error; }
  const input = await validateReconstructionInputs({ root, backup: backupPath, protectedRoot: protectedPath, git, verifyBackup });
  const manifest = buildManifest(input, operationId);
  const bytes = Buffer.from(stableJson(validateReconstructionManifest(manifest)));
  const manifestSha256 = digest(bytes);
  const sidecarPath = outputPath + ".sha256";
  const temporary = outputPath + ".tmp-" + process.pid + "-" + randomUUID();
  const temporarySidecar = sidecarPath + ".tmp-" + process.pid + "-" + randomUUID();
  try {
    await directory(dirname(outputPath), "OUTPUT_DIRECTORY");
    await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
    await writeFile(temporarySidecar, manifestSha256 + "  " + basename(outputPath) + "\n", { mode: 0o600, flag: "wx" });
    await publishCreateOnly({ temporaryPath: temporarySidecar, finalPath: sidecarPath, publication });
    await publishCreateOnly({ temporaryPath: temporary, finalPath: outputPath, publication });
  } catch (error) {
    await Promise.allSettled([rm(temporary, { force: true }), rm(temporarySidecar, { force: true })]);
    throw error;
  }
  await Promise.all([rm(temporary, { force: true }), rm(temporarySidecar, { force: true })]);
  return { manifest, manifestSha256, outputPath };
}

export async function readReconstructionManifest({ manifestPath, verifySidecar = true } = {}) {
  if (!manifestPath) fail("MANIFEST_PATH");
  const file = await hashRegularFile(resolve(manifestPath), "MANIFEST");
  let manifest;
  try { manifest = JSON.parse(file.bytes.toString("utf8")); } catch { fail("MANIFEST_JSON"); }
  validateReconstructionManifest(manifest);
  if (verifySidecar) {
    const sidecar = await hashRegularFile(resolve(manifestPath) + ".sha256", "MANIFEST_SIDECAR");
    if (sidecar.bytes.toString("utf8") !== file.sha256 + "  " + basename(manifestPath) + "\n") fail("MANIFEST_SIDECAR");
  }
  return { manifest, manifestSha256: file.sha256 };
}

export async function validateReconstructionManifestAgainstRepository({ root = ROOT, manifest, backup, protectedRoot, git, verifyBackup } = {}) {
  validateReconstructionManifest(manifest);
  const input = await validateReconstructionInputs({ root, backup, protectedRoot, git, verifyBackup });
  if (manifest.repository.gitCommit !== input.head) fail("REPOSITORY_HEAD_MISMATCH");
  if (manifest.supabase.upstreamCommit !== input.authority.upstreamCommit) fail("UPSTREAM_MISMATCH");
  if (manifest.supabase.upstreamLockSha256 !== input.authority.upstreamLockSha256) fail("UPSTREAM_LOCK_HASH_MISMATCH");
  if (!same(manifest.imageAuthority, input.authority.imageLock)) fail("IMAGE_AUTHORITY_MISMATCH");
  const boundRecipes = manifest.godelBuilds.map((recipe) => ({ logicalName: recipe.logicalName, dockerfile: recipe.dockerfile, dockerfileSha256: recipe.dockerfileSha256, baseImages: recipe.baseImages, platform: recipe.platform, gitCommit: recipe.gitCommit }));
  const currentRecipes = input.authority.recipes.map((recipe) => ({ ...recipe, gitCommit: input.head }));
  if (!same(boundRecipes, currentRecipes)) fail("BUILD_RECIPE_MISMATCH");
  const backupData = input.backupData;
  if (manifest.backup.backupId !== backupData.manifest.backupId || manifest.backup.schemaVersion !== backupData.manifest.schemaVersion || manifest.backup.sourceGitCommit !== backupData.manifest.repository.commit) fail("BACKUP_ID_MISMATCH");
  if (manifest.backup.manifestSha256 !== backupData.manifestSha256) fail("BACKUP_MANIFEST_HASH_MISMATCH");
  if (manifest.backup.checksumsSha256 !== backupData.checksumsSha256) fail("BACKUP_CHECKSUMS_HASH_MISMATCH");
  if (manifest.externalSecretGenerationId !== backupData.manifest.externalSecretGenerationId) fail("BACKUP_GENERATION_MISMATCH");
  if (manifest.protectedRecoveryMaterial.relativePath !== backupData.protectedRelativePath || manifest.protectedRecoveryMaterial.size !== backupData.protectedArtifact.size) fail("PROTECTED_ARTIFACT_SIZE");
  if (manifest.protectedRecoveryMaterial.sha256 !== backupData.protectedArtifact.sha256) fail("PROTECTED_ARTIFACT_HASH");
  return { manifestSha256: digest(Buffer.from(stableJson(manifest))), operationId: manifest.operationId };
}

function cliOptions(args) {
  const verb = args.shift();
  const values = {};
  while (args.length) { const key = args.shift(); if (!key?.startsWith("--") || !["--backup", "--protected-root", "--output", "--manifest"].includes(key) || values[key]) fail("USAGE"); values[key] = args.shift(); if (!values[key]) fail("USAGE"); }
  if (!["create", "validate"].includes(verb) || !values["--backup"] || !values["--protected-root"] || (verb === "create" ? !values["--output"] : !values["--manifest"])) fail("USAGE");
  return { verb, values };
}

async function main() {
  try {
    const { verb, values } = cliOptions(process.argv.slice(2));
    if (verb === "create") { const result = await createReconstructionManifest({ backup: values["--backup"], protectedRoot: values["--protected-root"], output: values["--output"] }); console.log("[ops:portability:manifest] PASS operation=" + result.manifest.operationId + " sha256=" + result.manifestSha256 + " output=" + basename(result.outputPath)); }
    else { const { manifest } = await readReconstructionManifest({ manifestPath: values["--manifest"] }); const result = await validateReconstructionManifestAgainstRepository({ manifest, backup: values["--backup"], protectedRoot: values["--protected-root"] }); console.log("[ops:portability:manifest] PASS operation=" + result.operationId + " sha256=" + result.manifestSha256); }
  } catch (error) { console.error("[ops:portability:manifest] FAIL " + (error instanceof Error ? error.message : "PORTABILITY_MANIFEST_UNKNOWN")); process.exitCode = 1; }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await main();
