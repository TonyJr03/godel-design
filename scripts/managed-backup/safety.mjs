import { lstat, mkdir, readdir, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export class ManagedBackupSafetyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ManagedBackupSafetyError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ManagedBackupSafetyError(code, message);
}

function isContained(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function validateRelativeArtifactPath(value) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 4096
    || isAbsolute(value)
    || value.includes("\\")
    || /[\0-\x1f]/.test(value)
  ) {
    fail("UNSAFE_PATH", "Artifact path must be a safe portable relative path");
  }
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    fail("UNSAFE_PATH", "Artifact path traversal is forbidden");
  }
  return value;
}

export function resolveContainedPath(root, relativePath) {
  validateRelativeArtifactPath(relativePath);
  const resolvedRoot = resolve(root);
  const target = resolve(resolvedRoot, ...relativePath.split("/"));
  if (!isContained(resolvedRoot, target) || target === resolvedRoot) {
    fail("UNSAFE_PATH", "Artifact path escapes its root");
  }
  return target;
}

async function assertDirectoryWithoutLinks(pathname) {
  const state = await lstat(pathname);
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail("UNSAFE_PATH", "Output path must be a real directory");
  }
}

export async function ensureSafeOutputRoot(outputRoot, { repoRoot = process.cwd() } = {}) {
  if (typeof outputRoot !== "string" || outputRoot.trim() === "") {
    fail("OUTPUT_ROOT_REQUIRED", "An explicit managed backup output root is required");
  }
  if (!isAbsolute(outputRoot)) {
    fail("UNSAFE_OUTPUT_ROOT", "Managed backup output root must be absolute");
  }

  const resolvedOutput = resolve(outputRoot);
  const resolvedRepo = resolve(repoRoot);
  if (isContained(resolvedRepo, resolvedOutput)) {
    fail("UNSAFE_OUTPUT_ROOT", "Managed backup output cannot be inside the repository");
  }

  await mkdir(resolvedOutput, { recursive: true, mode: 0o700 });
  await assertDirectoryWithoutLinks(resolvedOutput);
  const [realOutput, realRepo] = await Promise.all([realpath(resolvedOutput), realpath(resolvedRepo)]);
  if (isContained(realRepo, realOutput)) {
    fail("UNSAFE_OUTPUT_ROOT", "Managed backup output resolves inside the repository");
  }
  return realOutput;
}

async function assertTreeHasNoLinks(root) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const entryPath = resolve(root, entry.name);
    const state = await lstat(entryPath);
    if (state.isSymbolicLink()) {
      fail("UNSAFE_CLEANUP", "Plaintext staging contains a symbolic link or reparse point");
    }
    if (state.isDirectory()) await assertTreeHasNoLinks(entryPath);
  }
}

export async function cleanupPlaintextStaging({ outputRoot, stagingPath }) {
  const resolvedOutput = resolve(outputRoot);
  const resolvedStaging = resolve(stagingPath);
  if (
    dirname(resolvedStaging) !== resolvedOutput
    || !/^\.staging-GDBK-[A-Z0-9-]+$/.test(relative(resolvedOutput, resolvedStaging))
  ) {
    fail("UNSAFE_CLEANUP", "Only a direct managed-backup staging directory can be removed");
  }

  let state;
  try {
    state = await lstat(resolvedStaging);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!state.isDirectory() || state.isSymbolicLink()) {
    fail("UNSAFE_CLEANUP", "Plaintext staging is not a real directory");
  }
  await assertTreeHasNoLinks(resolvedStaging);
  await rm(resolvedStaging, { recursive: true, force: false });
  return true;
}

export async function cleanupProductionCapture({ outputRoot, capturePath }) {
  const resolvedOutput = resolve(outputRoot);
  const resolvedCapture = resolve(capturePath);
  if (
    dirname(resolvedCapture) !== resolvedOutput
    || !/^\.capture-GDBK-\d{8}T\d{6}Z-[A-Z2-7]{8}$/.test(relative(resolvedOutput, resolvedCapture))
  ) {
    fail("UNSAFE_CLEANUP", "Only a direct managed Production capture directory can be removed");
  }
  let state;
  try {
    state = await lstat(resolvedCapture);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  if (!state.isDirectory() || state.isSymbolicLink()) fail("UNSAFE_CLEANUP", "Production capture is not a real directory");
  await assertTreeHasNoLinks(resolvedCapture);
  await rm(resolvedCapture, { recursive: true, force: false });
  return true;
}
