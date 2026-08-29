import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, parse, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const EXTERNAL_SECRET_GENERATION_FORMAT = "godel-external-secret-generation";
export const EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION = 1;
export const EXTERNAL_SECRET_SNAPSHOT_FILES = Object.freeze({
  supabaseEnv: "supabase.env",
  godelEnv: "godel.env",
});

const CURRENT_FILE = "current.json";
const GENERATIONS_DIR = "generations";
const REASONS = new Set(["bootstrap", "dashboard-rotation", "opaque-api-key-rotation", "legacy-jwt-rotation", "ec-signing-key-rotation", "postgres-password-rotation", "planned-rotation", "emergency-recovery", "restore-alignment"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMIT = /^[0-9a-f]{40}$/;

function fail(code) {
  throw new Error(code);
}

function isMissing(error) {
  return error?.code === "ENOENT";
}

export function isCanonicalGenerationId(value) {
  return typeof value === "string" && UUID.test(value);
}

function registryPaths(protectedRoot) {
  const root = resolve(protectedRoot, "external-secrets");
  return {
    root,
    generations: join(root, GENERATIONS_DIR),
    current: join(root, CURRENT_FILE),
  };
}

function generationPaths(protectedRoot, generationId) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_GENERATION_ID");
  const registry = registryPaths(protectedRoot);
  const directory = join(registry.generations, generationId);
  if (relative(registry.generations, directory).startsWith("..")) fail("INVALID_GENERATION_PATH");
  return {
    ...registry,
    directory,
    metadata: join(directory, "metadata.json"),
    supabaseSnapshot: join(directory, EXTERNAL_SECRET_SNAPSHOT_FILES.supabaseEnv),
    godelSnapshot: join(directory, EXTERNAL_SECRET_SNAPSHOT_FILES.godelEnv),
  };
}

async function lstatOrNull(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

async function assertRegularFile(path, code) {
  const entry = await lstatOrNull(path);
  if (!entry) fail(`${code}_MISSING`);
  if (entry.isSymbolicLink()) fail(`${code}_SYMLINK`);
  if (!entry.isFile()) fail(`${code}_NOT_REGULAR`);
  return entry;
}

async function assertDirectory(path, code) {
  const entry = await lstatOrNull(path);
  if (!entry) return false;
  if (entry.isSymbolicLink()) fail(`${code}_SYMLINK`);
  if (!entry.isDirectory()) fail(`${code}_NOT_DIRECTORY`);
  return true;
}

async function ensureSafeDirectory(path) {
  const target = resolve(path);
  const parsed = parse(target);
  const segments = relative(parsed.root, target).split(sep).filter(Boolean);
  let current = parsed.root;
  for (const segment of segments) {
    current = join(current, segment);
    const entry = await lstatOrNull(current);
    if (entry) {
      if (entry.isSymbolicLink()) fail("REGISTRY_DIRECTORY_SYMLINK");
      if (!entry.isDirectory()) fail("REGISTRY_DIRECTORY_NOT_DIRECTORY");
      if (current === target) await chmod(current, 0o700);
      continue;
    }
    try {
      await mkdir(current, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    const created = await lstatOrNull(current);
    if (!created || created.isSymbolicLink() || !created.isDirectory()) fail("REGISTRY_DIRECTORY_UNSAFE");
    if (current === target) await chmod(current, 0o700);
  }
}

function parseJson(buffer, code) {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    fail(code);
  }
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) fail(code);
}

function validatePointer(pointer) {
  exactKeys(pointer, ["generationId", "schemaVersion"], "INVALID_CURRENT_POINTER");
  if (pointer.schemaVersion !== EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION) fail("INVALID_CURRENT_POINTER");
  if (!isCanonicalGenerationId(pointer.generationId)) fail("INVALID_CURRENT_POINTER");
  return pointer.generationId;
}

function validateMetadata(metadata, expectedGenerationId) {
  exactKeys(metadata, ["createdAt", "files", "format", "generationId", "reason", "repositoryCommit", "schemaVersion", "sourceGenerationId"], "INVALID_GENERATION_METADATA");
  if (metadata.format !== EXTERNAL_SECRET_GENERATION_FORMAT || metadata.schemaVersion !== EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION) fail("INVALID_GENERATION_METADATA");
  if (!isCanonicalGenerationId(metadata.generationId) || metadata.generationId !== expectedGenerationId) fail("INVALID_GENERATION_METADATA");
  if (typeof metadata.createdAt !== "string" || Number.isNaN(Date.parse(metadata.createdAt))) fail("INVALID_GENERATION_METADATA");
  if (typeof metadata.repositoryCommit !== "string" || !COMMIT.test(metadata.repositoryCommit)) fail("INVALID_GENERATION_METADATA");
  if (!REASONS.has(metadata.reason)) fail("INVALID_GENERATION_METADATA");
  if (metadata.sourceGenerationId !== null && !isCanonicalGenerationId(metadata.sourceGenerationId)) fail("INVALID_GENERATION_METADATA");
  exactKeys(metadata.files, ["godelEnv", "supabaseEnv"], "INVALID_GENERATION_METADATA");
  if (metadata.files.supabaseEnv !== EXTERNAL_SECRET_SNAPSHOT_FILES.supabaseEnv || metadata.files.godelEnv !== EXTERNAL_SECRET_SNAPSHOT_FILES.godelEnv) fail("INVALID_GENERATION_METADATA");
  return metadata;
}

async function readGeneration(protectedRoot, generationId) {
  const paths = generationPaths(protectedRoot, generationId);
  if (!await assertDirectory(paths.directory, "GENERATION_DIRECTORY")) fail("GENERATION_DIRECTORY_MISSING");
  await assertRegularFile(paths.metadata, "GENERATION_METADATA");
  await assertRegularFile(paths.supabaseSnapshot, "SUPABASE_SNAPSHOT");
  await assertRegularFile(paths.godelSnapshot, "GODEL_SNAPSHOT");
  const metadata = validateMetadata(parseJson(await readFile(paths.metadata), "INVALID_GENERATION_METADATA"), generationId);
  return {
    generationId,
    metadata,
    paths,
    supabaseSnapshot: await readFile(paths.supabaseSnapshot),
    godelSnapshot: await readFile(paths.godelSnapshot),
  };
}

export async function readSecretGeneration({ protectedRoot, generationId }) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  return readGeneration(protectedRoot, generationId);
}

async function readCurrent(protectedRoot) {
  const paths = registryPaths(protectedRoot);
  const rootExists = await assertDirectory(paths.root, "REGISTRY_ROOT");
  if (!rootExists) return null;
  const currentExists = await lstatOrNull(paths.current);
  if (!currentExists) return null;
  await assertDirectory(paths.generations, "GENERATIONS_DIRECTORY");
  await assertRegularFile(paths.current, "CURRENT_POINTER");
  return validatePointer(parseJson(await readFile(paths.current), "INVALID_CURRENT_POINTER"));
}

async function liveEnvironmentPair({ supabaseEnvPath, godelEnvPath }) {
  await assertRegularFile(supabaseEnvPath, "SUPABASE_ENV");
  await assertRegularFile(godelEnvPath, "GODEL_ENV");
  return {
    supabase: await readFile(supabaseEnvPath),
    godel: await readFile(godelEnvPath),
  };
}

export async function getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive = true }) {
  const generationId = await readCurrent(protectedRoot);
  if (!generationId) return { state: "UNINITIALIZED", generationId: null, match: null };
  const generation = await readGeneration(protectedRoot, generationId);
  if (!compareLive) return { state: "INITIALIZED", generationId, match: null, generation };
  const live = await liveEnvironmentPair({ supabaseEnvPath, godelEnvPath });
  const match = live.supabase.equals(generation.supabaseSnapshot) && live.godel.equals(generation.godelSnapshot);
  return { state: "INITIALIZED", generationId, match, generation };
}

export async function assertCurrentSecretGenerationMatches({ protectedRoot, supabaseEnvPath, godelEnvPath }) {
  const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true });
  if (current.state === "UNINITIALIZED") return null;
  if (!current.match) fail("EXTERNAL_SECRET_GENERATION_MISMATCH");
  return current.generationId;
}

export async function assertReferencedSecretGenerationMatches({ protectedRoot, generationId, supabaseEnvPath, godelEnvPath }) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  const generation = await readGeneration(protectedRoot, generationId);
  const live = await liveEnvironmentPair({ supabaseEnvPath, godelEnvPath });
  if (!live.supabase.equals(generation.supabaseSnapshot) || !live.godel.equals(generation.godelSnapshot)) fail("EXTERNAL_SECRET_GENERATION_MISMATCH");
  return generationId;
}

export async function assertActiveSecretGenerationMatches({ protectedRoot, generationId, supabaseEnvPath, godelEnvPath }) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  const activeGenerationId = await readCurrent(protectedRoot);
  if (activeGenerationId !== generationId) fail("EXTERNAL_SECRET_GENERATION_NOT_ACTIVE");
  return assertReferencedSecretGenerationMatches({ protectedRoot, generationId, supabaseEnvPath, godelEnvPath });
}

export async function assertReferencedSecretGenerationExists({ protectedRoot, generationId }) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  await readGeneration(protectedRoot, generationId);
  return generationId;
}

export async function isSecretGenerationRegistryAvailable({ protectedRoot }) {
  return assertDirectory(registryPaths(protectedRoot).root, "REGISTRY_ROOT");
}

export function generationMutationLockPath(protectedRoot) {
  return join(registryPaths(protectedRoot).root, ".operation.lock");
}

export async function readGenerationMutationLock({ protectedRoot }) {
  const lock = generationMutationLockPath(protectedRoot);
  const entry = await lstatOrNull(lock);
  if (!entry) return Object.freeze({ state: "ABSENT" });
  if (entry.isSymbolicLink()) fail("GENERATION_MUTATION_LOCK_SYMLINK");
  if (!entry.isFile()) fail("GENERATION_MUTATION_LOCK_NOT_REGULAR");
  const value = parseJson(await readFile(lock), "INVALID_GENERATION_MUTATION_LOCK");
  exactKeys(value, ["schemaVersion", "operation", "generationId", "startedAt"], "INVALID_GENERATION_MUTATION_LOCK");
  if (value.schemaVersion !== 1
    || typeof value.operation !== "string" || !value.operation
    || (value.generationId !== null && !isCanonicalGenerationId(value.generationId))
    || typeof value.startedAt !== "string" || Number.isNaN(Date.parse(value.startedAt))) {
    fail("INVALID_GENERATION_MUTATION_LOCK");
  }
  return Object.freeze({
    state: "PRESENT",
    schemaVersion: value.schemaVersion,
    operation: value.operation,
    generationId: value.generationId,
    startedAt: value.startedAt,
  });
}

export async function assertNoGenerationMutationLock({ protectedRoot }) {
  const lock = generationMutationLockPath(protectedRoot);
  const entry = await lstatOrNull(lock);
  if (!entry) return;
  if (entry.isSymbolicLink()) fail("GENERATION_MUTATION_LOCK_SYMLINK");
  fail("GENERATION_MUTATION_IN_PROGRESS");
}

export async function acquireGenerationMutationLock({ protectedRoot, operation, generationId = null }) {
  const paths = registryPaths(protectedRoot);
  await ensureSafeDirectory(paths.root);
  const lock = generationMutationLockPath(protectedRoot);
  try {
    await writeExclusive(lock, `${JSON.stringify({ schemaVersion: 1, operation, generationId, startedAt: new Date().toISOString() })}\n`);
  } catch (error) {
    if (error?.code === "EEXIST") fail("GENERATION_MUTATION_IN_PROGRESS");
    throw error;
  }
  return lock;
}

export async function releaseGenerationMutationLock(lock) {
  await rm(lock, { force: true });
}

export async function replaceCurrentGenerationPointer({ protectedRoot, generationId, expectedGenerationId }) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_GENERATION_ID");
  const paths = registryPaths(protectedRoot);
  await ensureSafeDirectory(paths.root);
  const current = await lstatOrNull(paths.current);
  if (expectedGenerationId === null) {
    if (current) fail("REGISTRY_ALREADY_INITIALIZED");
  } else {
    if (!isCanonicalGenerationId(expectedGenerationId) || !current) fail("EXTERNAL_SECRET_GENERATION_NOT_ACTIVE");
    await assertRegularFile(paths.current, "CURRENT_POINTER");
    if (validatePointer(parseJson(await readFile(paths.current), "INVALID_CURRENT_POINTER")) !== expectedGenerationId) fail("EXTERNAL_SECRET_GENERATION_NOT_ACTIVE");
  }
  const temporary = join(paths.root, `.current-${randomUUID()}.tmp`);
  try {
    await writeExclusive(temporary, `${JSON.stringify({ schemaVersion: EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION, generationId }, null, 2)}\n`);
    await rename(temporary, paths.current);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function repositoryCommit(root) {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true });
  const commit = stdout.trim();
  if (!COMMIT.test(commit)) fail("INVALID_REPOSITORY_COMMIT");
  return commit;
}

async function writeExclusive(path, data, mode = 0o600) {
  const handle = await open(path, "wx", mode);
  try {
    await handle.writeFile(data);
  } finally {
    await handle.close();
  }
}

export async function publishSecretGeneration({ protectedRoot, generationId, metadata, supabaseSnapshot, godelSnapshot }) {
  if (!isCanonicalGenerationId(generationId) || !Buffer.isBuffer(supabaseSnapshot) || !Buffer.isBuffer(godelSnapshot)) fail("INVALID_EXTERNAL_SECRET_GENERATION_PUBLICATION");
  validateMetadata(metadata, generationId);
  const target = generationPaths(protectedRoot, generationId);
  const staging = join(target.generations, `.staging-${randomUUID()}`);
  await ensureSafeDirectory(target.root);
  await ensureSafeDirectory(target.generations);
  if (await lstatOrNull(target.directory)) fail("UNEXPECTED_EXISTING_GENERATION_DIRECTORY");
  const originalUmask = process.umask(0o077);
  try {
    await mkdir(staging, { mode: 0o700 });
    await writeExclusive(join(staging, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    await writeExclusive(join(staging, EXTERNAL_SECRET_SNAPSHOT_FILES.supabaseEnv), supabaseSnapshot);
    await writeExclusive(join(staging, EXTERNAL_SECRET_SNAPSHOT_FILES.godelEnv), godelSnapshot);
    await rename(staging, target.directory);
    return { generationId, directory: target.directory };
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    process.umask(originalUmask);
  }
}

export async function bootstrapSecretGeneration({ root, protectedRoot, supabaseEnvPath, godelEnvPath, apply = false, hooks = {} }) {
  const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false });
  if (current.state !== "UNINITIALIZED") fail("REGISTRY_ALREADY_INITIALIZED");
  const paths = registryPaths(protectedRoot);
  const rootExists = await lstatOrNull(paths.root);
  if (rootExists) {
    await assertDirectory(paths.root, "REGISTRY_ROOT");
    const generations = await lstatOrNull(paths.generations);
    if (generations) {
      await assertDirectory(paths.generations, "GENERATIONS_DIRECTORY");
      const entries = await readdir(paths.generations);
      if (entries.length) fail("UNEXPECTED_EXISTING_GENERATION_DIRECTORY");
    }
  }
  if (!apply) {
    await liveEnvironmentPair({ supabaseEnvPath, godelEnvPath });
    return { state: "DRY_RUN", generationId: null };
  }

  const mutationLock = await acquireGenerationMutationLock({ protectedRoot, operation: "bootstrap" });
  const originalUmask = process.umask(0o077);
  const generationId = randomUUID();
  const target = generationPaths(protectedRoot, generationId);
  const staging = join(target.generations, `.staging-${randomUUID()}`);
  const pointerTemp = join(target.root, `.current-${randomUUID()}.tmp`);
  let published = false;
  let pointerCommitted = false;
  let releaseLock = true;
  try {
    const rechecked = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false });
    if (rechecked.state !== "UNINITIALIZED") fail("REGISTRY_ALREADY_INITIALIZED");
    const live = await liveEnvironmentPair({ supabaseEnvPath, godelEnvPath });
    await ensureSafeDirectory(target.root);
    await ensureSafeDirectory(target.generations);
    if (await lstatOrNull(target.directory)) fail("UNEXPECTED_EXISTING_GENERATION_DIRECTORY");
    if (await lstatOrNull(target.current)) fail("REGISTRY_ALREADY_INITIALIZED");
    await mkdir(staging, { mode: 0o700 });
    const metadata = {
      format: EXTERNAL_SECRET_GENERATION_FORMAT,
      schemaVersion: EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION,
      generationId,
      createdAt: new Date().toISOString(),
      repositoryCommit: await repositoryCommit(root),
      reason: "bootstrap",
      sourceGenerationId: null,
      files: EXTERNAL_SECRET_SNAPSHOT_FILES,
    };
    await writeExclusive(join(staging, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
    await writeExclusive(join(staging, EXTERNAL_SECRET_SNAPSHOT_FILES.supabaseEnv), live.supabase);
    await writeExclusive(join(staging, EXTERNAL_SECRET_SNAPSHOT_FILES.godelEnv), live.godel);
    await rename(staging, target.directory);
    published = true;
    await hooks.afterCaptureBeforePointer?.({ generationId });
    const liveBeforePointer = await liveEnvironmentPair({ supabaseEnvPath, godelEnvPath });
    if (!liveBeforePointer.supabase.equals(live.supabase) || !liveBeforePointer.godel.equals(live.godel)) fail("EXTERNAL_SECRET_GENERATION_LIVE_ENV_CHANGED");
    await rm(pointerTemp, { force: true });
    await replaceCurrentGenerationPointer({ protectedRoot, generationId, expectedGenerationId: null });
    pointerCommitted = true;
    await hooks.afterPointerCommit?.({ generationId });
    const verified = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true });
    if (verified.state !== "INITIALIZED" || verified.generationId !== generationId || !verified.match) fail("SECRET_GENERATION_BOOTSTRAP_COMMITTED_UNVERIFIED");
    return { state: "INITIALIZED", generationId };
  } catch (error) {
    if (pointerCommitted) {
      releaseLock = false;
      throw new Error("SECRET_GENERATION_BOOTSTRAP_COMMITTED_UNVERIFIED", { cause: error });
    }
    await rm(pointerTemp, { force: true }).catch(() => {});
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    if (published) await rm(target.directory, { recursive: true, force: true }).catch(() => {});
    const safe = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false });
    if (safe.state !== "UNINITIALIZED") { releaseLock = false; throw new Error("SECRET_GENERATION_BOOTSTRAP_COMPENSATION_FAILED"); }
    throw error;
  } finally {
    process.umask(originalUmask);
    if (releaseLock) await releaseGenerationMutationLock(mutationLock);
  }
}

export function validateManifestExternalSecretGeneration(manifest) {
  if (!Object.hasOwn(manifest, "externalSecretGenerationId")) return null;
  if (!isCanonicalGenerationId(manifest.externalSecretGenerationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  return manifest.externalSecretGenerationId;
}

export function applyAllowlistedEnvironmentChanges(source, replacements, allowedNames) {
  if (typeof source !== "string" || !replacements || typeof replacements !== "object") fail("INVALID_ENVIRONMENT_UPDATE");
  const allowed = new Set(allowedNames);
  for (const [name, value] of Object.entries(replacements)) {
    if (!allowed.has(name) || typeof value !== "string" || /[\r\n]/.test(value)) fail("INVALID_ENVIRONMENT_UPDATE");
  }
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const endsWithEol = source.endsWith("\n");
  const lines = source.split(/\r?\n/);
  if (endsWithEol) lines.pop();
  const seen = new Set();
  const output = lines.map((line) => {
    const match = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(=.*)$/);
    if (!match) return line;
    const [, prefix, name] = match;
    if (seen.has(name)) fail("DUPLICATE_ENVIRONMENT_VARIABLE");
    seen.add(name);
    return Object.hasOwn(replacements, name) ? `${prefix}${name}=${replacements[name]}` : line;
  });
  for (const name of Object.keys(replacements)) if (!seen.has(name)) fail("MISSING_ENVIRONMENT_VARIABLE");
  return `${output.join(eol)}${endsWithEol ? eol : ""}`;
}

export async function writeAllowlistedEnvironmentFile({ path, replacements, allowedNames }) {
  await assertRegularFile(path, "ENVIRONMENT_FILE");
  const source = (await readFile(path)).toString("utf8");
  const next = applyAllowlistedEnvironmentChanges(source, replacements, allowedNames);
  const originalUmask = process.umask(0o077);
  const temporary = join(dirname(path), `.${randomUUID()}.env.tmp`);
  try {
    await writeExclusive(temporary, next);
    await rename(temporary, path);
  } finally {
    process.umask(originalUmask);
    await rm(temporary, { force: true }).catch(() => {});
  }
}
