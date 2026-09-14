import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir } from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import {
  acquireGenerationMutationLock,
  assertActiveSecretGenerationMatches,
  assertNoGenerationMutationLock,
  assertReferencedSecretGenerationMatches,
  getCurrentSecretGeneration,
  isCanonicalGenerationId,
  publishSecretGeneration,
  readSecretGeneration,
  releaseGenerationMutationLock,
  replaceCurrentGenerationPointer,
  validateSecretGenerationMetadata,
} from "./secret-generation.mjs";
import { readReconstructionManifest } from "./portability-manifest.mjs";

export const SECRET_GENERATION_BUNDLE_FORMAT = "godel-external-secret-generation-bundle";
export const SECRET_GENERATION_BUNDLE_SCHEMA_VERSION = 1;
export const SECRET_GENERATION_BUNDLE_FILES = Object.freeze({ metadata: "metadata.json", supabaseEnv: "supabase.env", godelEnv: "godel.env", commit: "bundle.json" });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_FILE_SIZE = 16 * 1024 * 1024;

function fail(code) { throw new Error(`SECRET_GENERATION_TRANSPORT_${code}`); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function exactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code);
}
function parseJson(bytes, code) { try { return JSON.parse(bytes.toString("utf8")); } catch { fail(code); } }
function canonicalJson(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`); }
function validUuid(value) { return typeof value === "string" && UUID.test(value); }
function validHash(value) { return typeof value === "string" && SHA256.test(value); }
function entry(name, bytes) { return { name, size: bytes.length, sha256: digest(bytes) }; }
function strictlyContained(parent, child) {
  const relation = relative(resolve(parent), resolve(child));
  return relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`);
}

async function lstatOrNull(path) {
  try { return await lstat(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

async function assertRegularFile(path, code) {
  const value = await lstatOrNull(path);
  if (!value) fail(`${code}_MISSING`);
  if (value.isSymbolicLink()) fail(`${code}_SYMLINK`);
  if (!value.isFile()) fail(`${code}_NOT_REGULAR`);
  return value;
}

async function assertSafeDirectory(path, code) {
  const target = resolve(path);
  const parsed = parse(target);
  let current = parsed.root;
  for (const segment of relative(parsed.root, target).split(sep).filter(Boolean)) {
    current = join(current, segment);
    const value = await lstatOrNull(current);
    if (!value) fail(`${code}_MISSING`);
    if (value.isSymbolicLink()) fail(`${code}_SYMLINK`);
    if (!value.isDirectory()) fail(`${code}_NOT_DIRECTORY`);
  }
  return target;
}

export async function assertProtectedTransportPath({ protectedRoot, path, code = "TRANSPORT_PATH" }) {
  if (typeof protectedRoot !== "string" || !protectedRoot || protectedRoot.includes("\0") || typeof path !== "string" || !path || path.includes("\0")) fail(code);
  const root = resolve(protectedRoot);
  const candidate = resolve(path);
  if (!strictlyContained(root, candidate)) fail(code);
  if (strictlyContained(join(root, "external-secrets"), candidate) || candidate === resolve(root, "external-secrets")) fail(`${code}_REGISTRY`);
  await assertSafeDirectory(root, "PROTECTED_ROOT");
  return candidate;
}

async function writeExclusive(path, bytes) {
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); } finally { await handle.close(); }
  await chmod(path, 0o600);
}

function validateFileDescriptor(value, expectedName, code) {
  exactKeys(value, ["name", "sha256", "size"], code);
  if (value.name !== expectedName || !Number.isSafeInteger(value.size) || value.size < 1 || value.size > MAX_FILE_SIZE || !validHash(value.sha256)) fail(code);
}

export function validateSecretGenerationBundle(bundle) {
  exactKeys(bundle, ["files", "format", "generationId", "reconstruction", "schemaVersion"], "BUNDLE_SCHEMA");
  if (bundle.format !== SECRET_GENERATION_BUNDLE_FORMAT || bundle.schemaVersion !== SECRET_GENERATION_BUNDLE_SCHEMA_VERSION || !isCanonicalGenerationId(bundle.generationId)) fail("BUNDLE_SCHEMA");
  exactKeys(bundle.reconstruction, ["manifestSha256", "operationId"], "BUNDLE_SCHEMA");
  if (!validUuid(bundle.reconstruction.operationId) || !validHash(bundle.reconstruction.manifestSha256)) fail("BUNDLE_SCHEMA");
  exactKeys(bundle.files, ["godelEnv", "metadata", "supabaseEnv"], "BUNDLE_SCHEMA");
  validateFileDescriptor(bundle.files.metadata, SECRET_GENERATION_BUNDLE_FILES.metadata, "BUNDLE_SCHEMA");
  validateFileDescriptor(bundle.files.supabaseEnv, SECRET_GENERATION_BUNDLE_FILES.supabaseEnv, "BUNDLE_SCHEMA");
  validateFileDescriptor(bundle.files.godelEnv, SECRET_GENERATION_BUNDLE_FILES.godelEnv, "BUNDLE_SCHEMA");
  return bundle;
}

export async function readSecretGenerationBundle({ bundlePath }) {
  if (typeof bundlePath !== "string" || !bundlePath || bundlePath.includes("\0")) fail("BUNDLE_PATH");
  const bundle = resolve(bundlePath);
  await assertSafeDirectory(bundle, "BUNDLE_DIRECTORY");
  const names = await readdir(bundle);
  const expected = Object.values(SECRET_GENERATION_BUNDLE_FILES).sort();
  if (names.length !== expected.length || names.sort().some((name, index) => name !== expected[index])) fail("BUNDLE_ENTRIES");
  const paths = Object.fromEntries(Object.entries(SECRET_GENERATION_BUNDLE_FILES).map(([key, name]) => [key, join(bundle, name)]));
  const fileEntries = await Promise.all(Object.values(paths).map((path) => assertRegularFile(path, "BUNDLE_FILE")));
  if (fileEntries.some((file) => file.size < 1 || file.size > MAX_FILE_SIZE)) fail("BUNDLE_FILE_SIZE");
  const [bundleBytes, metadataBytes, supabaseSnapshot, godelSnapshot] = await Promise.all([readFile(paths.commit), readFile(paths.metadata), readFile(paths.supabaseEnv), readFile(paths.godelEnv)]);
  if (!supabaseSnapshot.length || !godelSnapshot.length) fail("BUNDLE_SNAPSHOT_EMPTY");
  const bundleManifest = validateSecretGenerationBundle(parseJson(bundleBytes, "BUNDLE_JSON"));
  const metadata = validateSecretGenerationMetadata(parseJson(metadataBytes, "BUNDLE_METADATA"), bundleManifest.generationId);
  const contents = { metadata: metadataBytes, supabaseEnv: supabaseSnapshot, godelEnv: godelSnapshot };
  for (const [key, bytes] of Object.entries(contents)) {
    const descriptor = bundleManifest.files[key];
    if (descriptor.size !== bytes.length || descriptor.sha256 !== digest(bytes)) fail("BUNDLE_INTEGRITY");
  }
  return { bundlePath: bundle, bundle: bundleManifest, metadata, metadataBytes, supabaseSnapshot, godelSnapshot };
}

async function readBoundReconstructionManifest(manifestPath) {
  const reconstruction = await readReconstructionManifest({ manifestPath });
  return reconstruction;
}

function assertReconstructionBinding({ reconstruction, bundle }) {
  if (bundle.generationId !== reconstruction.manifest.externalSecretGenerationId) fail("GENERATION_BINDING");
  if (bundle.reconstruction.operationId !== reconstruction.manifest.operationId) fail("RECONSTRUCTION_OPERATION_BINDING");
  if (bundle.reconstruction.manifestSha256 !== reconstruction.manifestSha256) fail("RECONSTRUCTION_MANIFEST_BINDING");
}

async function createBundleDirectory(output) {
  if (typeof output !== "string" || !output || output.includes("\0")) fail("OUTPUT_PATH");
  const target = resolve(output);
  await assertSafeDirectory(dirname(target), "OUTPUT_PARENT");
  try { await mkdir(target, { mode: 0o700 }); } catch (error) { if (error?.code === "EEXIST") fail("OUTPUT_EXISTS"); throw error; }
  const directory = await lstatOrNull(target);
  if (!directory || directory.isSymbolicLink() || !directory.isDirectory()) fail("OUTPUT_DIRECTORY");
  await chmod(target, 0o700);
  return target;
}

export async function exportSecretGenerationBundle({ manifestPath, output, protectedRoot, hooks = {} }) {
  hooks.onEvent?.("validate-manifest");
  const reconstruction = await readBoundReconstructionManifest(manifestPath);
  const generationId = reconstruction.manifest.externalSecretGenerationId;
  await assertNoGenerationMutationLock({ protectedRoot });
  const generation = await readSecretGeneration({ protectedRoot, generationId });
  const metadataBytes = canonicalJson(generation.metadata);
  const files = {
    metadata: entry(SECRET_GENERATION_BUNDLE_FILES.metadata, metadataBytes),
    supabaseEnv: entry(SECRET_GENERATION_BUNDLE_FILES.supabaseEnv, generation.supabaseSnapshot),
    godelEnv: entry(SECRET_GENERATION_BUNDLE_FILES.godelEnv, generation.godelSnapshot),
  };
  const bundle = {
    schemaVersion: SECRET_GENERATION_BUNDLE_SCHEMA_VERSION,
    format: SECRET_GENERATION_BUNDLE_FORMAT,
    generationId,
    reconstruction: { operationId: reconstruction.manifest.operationId, manifestSha256: reconstruction.manifestSha256 },
    files,
  };
  validateSecretGenerationBundle(bundle);
  const bundlePath = await createBundleDirectory(await assertProtectedTransportPath({ protectedRoot, path: output, code: "OUTPUT_PATH" }));
  await writeExclusive(join(bundlePath, SECRET_GENERATION_BUNDLE_FILES.metadata), metadataBytes);
  await writeExclusive(join(bundlePath, SECRET_GENERATION_BUNDLE_FILES.supabaseEnv), generation.supabaseSnapshot);
  await writeExclusive(join(bundlePath, SECRET_GENERATION_BUNDLE_FILES.godelEnv), generation.godelSnapshot);
  await writeExclusive(join(bundlePath, SECRET_GENERATION_BUNDLE_FILES.commit), canonicalJson(bundle));
  hooks.onEvent?.("bundle-committed");
  return { state: "EXPORTED", generationId, operationId: reconstruction.manifest.operationId, bundlePath };
}

async function assertSafeLiveEnvironmentPath(path, code) {
  if (typeof path !== "string" || !path || path.includes("\0")) fail(code);
  await assertSafeDirectory(dirname(resolve(path)), `${code}_PARENT`);
  const value = await lstatOrNull(path);
  if (!value) return null;
  if (value.isSymbolicLink()) fail(`${code}_SYMLINK`);
  if (!value.isFile()) fail(`${code}_NOT_REGULAR`);
  return value;
}

async function materializeExactFile({ path, bytes, code }) {
  const existing = await assertSafeLiveEnvironmentPath(path, code);
  if (existing) {
    if ((await readFile(path)).equals(bytes)) return "ALREADY_PRESENT_MATCH";
    fail(`${code}_CONFLICT`);
  }
  try { await writeExclusive(path, bytes); } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    return materializeExactFile({ path, bytes, code });
  }
  return "CREATED";
}

async function readExistingGeneration(protectedRoot, generationId) {
  try { return await readSecretGeneration({ protectedRoot, generationId }); } catch (error) {
    if (error?.message === "GENERATION_DIRECTORY_MISSING") return null;
    throw error;
  }
}

function assertExistingGenerationMatches(existing, bundle) {
  if (!isDeepStrictEqual(existing.metadata, bundle.metadata)
    || !existing.supabaseSnapshot.equals(bundle.supabaseSnapshot)
    || !existing.godelSnapshot.equals(bundle.godelSnapshot)) {
    fail("GENERATION_IMPORT_CONFLICT");
  }
}

export async function importSecretGenerationBundle({ manifestPath, bundlePath, protectedRoot, supabaseEnvPath, godelEnvPath, apply = false, hooks = {} }) {
  hooks.onEvent?.("validate-manifest");
  const reconstruction = await readBoundReconstructionManifest(manifestPath);
  hooks.onEvent?.("validate-bundle");
  const bundle = await readSecretGenerationBundle({ bundlePath: await assertProtectedTransportPath({ protectedRoot, path: bundlePath, code: "BUNDLE_PATH" }) });
  assertReconstructionBinding({ reconstruction, bundle: bundle.bundle });
  await Promise.all([
    assertSafeLiveEnvironmentPath(supabaseEnvPath, "SUPABASE_ENV"),
    assertSafeLiveEnvironmentPath(godelEnvPath, "GODEL_ENV"),
  ]);
  if (!apply) return { state: "VALIDATED_NOT_APPLIED", generationId: bundle.bundle.generationId, operationId: reconstruction.manifest.operationId };

  const lock = await acquireGenerationMutationLock({ protectedRoot, operation: "clean-host-generation-import", generationId: bundle.bundle.generationId });
  hooks.onEvent?.("acquire-lock");
  try {
    const existing = await readExistingGeneration(protectedRoot, bundle.bundle.generationId);
    if (existing) assertExistingGenerationMatches(existing, bundle);
    else await publishSecretGeneration({ protectedRoot, generationId: bundle.bundle.generationId, metadata: bundle.metadata, supabaseSnapshot: bundle.supabaseSnapshot, godelSnapshot: bundle.godelSnapshot });
    hooks.onEvent?.("publish-or-confirm-generation");
    await materializeExactFile({ path: supabaseEnvPath, bytes: bundle.supabaseSnapshot, code: "SUPABASE_ENV" });
    hooks.onEvent?.("materialize-or-confirm-supabase-env");
    await materializeExactFile({ path: godelEnvPath, bytes: bundle.godelSnapshot, code: "GODEL_ENV" });
    hooks.onEvent?.("materialize-or-confirm-godel-env");
    await assertReferencedSecretGenerationMatches({ protectedRoot, generationId: bundle.bundle.generationId, supabaseEnvPath, godelEnvPath });
    hooks.onEvent?.("assert-referenced-match");
    const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false });
    if (current.state === "UNINITIALIZED") await replaceCurrentGenerationPointer({ protectedRoot, generationId: bundle.bundle.generationId, expectedGenerationId: null });
    else if (current.generationId !== bundle.bundle.generationId) fail("CURRENT_GENERATION_CONFLICT");
    hooks.onEvent?.("activate-or-confirm-current");
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId: bundle.bundle.generationId, supabaseEnvPath, godelEnvPath });
    hooks.onEvent?.("assert-active-match");
    return { state: "IMPORTED", generationId: bundle.bundle.generationId, operationId: reconstruction.manifest.operationId };
  } finally {
    await releaseGenerationMutationLock(lock);
    hooks.onEvent?.("release-lock");
  }
}
