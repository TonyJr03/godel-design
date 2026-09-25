import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readdir, realpath, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identityPaths = new WeakMap();

export class ManagedRecoveryContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ManagedRecoveryContractError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ManagedRecoveryContractError(code, message);
}

function contained(parent, candidate) {
  const value = relative(parent, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function overlaps(left, right) {
  return contained(left, right) || contained(right, left);
}

async function portableChmod(pathname, mode) {
  try {
    await chmod(pathname, mode);
  } catch (error) {
    if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error;
  }
}

async function realDirectory(pathname, code = "RECOVERY_PATH_UNSAFE") {
  const state = await lstat(pathname).catch(() => null);
  if (!state?.isDirectory() || state.isSymbolicLink()) fail(code, "Recovery path must be a real directory");
  return realpath(pathname);
}

function defineSession({ id, parent, root, download, plaintext, target, evidence }) {
  const session = { sessionId: id };
  for (const [name, value] of Object.entries({ parent, root, download, plaintext, target, evidence })) {
    Object.defineProperty(session, name, { value, enumerable: false });
  }
  Object.defineProperty(session, "toJSON", {
    enumerable: false,
    value: () => ({ sessionId: id, layout: ["download", "plaintext", "target", "evidence"] }),
  });
  return Object.freeze(session);
}

export async function createRecoverySession({
  parent,
  repoRoot = process.cwd(),
  backupOutputRoot,
  governedRoots = [],
  sessionId = randomUUID(),
} = {}) {
  if (typeof parent !== "string" || !isAbsolute(parent)) fail("RECOVERY_PARENT_INVALID", "Recovery parent must be absolute");
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)) fail("RECOVERY_PARENT_INVALID", "Repository root is invalid");
  if (typeof backupOutputRoot !== "string" || !isAbsolute(backupOutputRoot)) fail("RECOVERY_PARENT_INVALID", "Backup output root must be absolute");
  if (!Array.isArray(governedRoots) || governedRoots.some((value) => typeof value !== "string" || !isAbsolute(value))) {
    fail("RECOVERY_PARENT_INVALID", "Governed recovery exclusions must be absolute paths");
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) fail("RECOVERY_SESSION_ID_INVALID", "Recovery session ID is invalid");

  const resolvedParent = resolve(parent);
  const exclusions = [resolve(repoRoot), resolve(backupOutputRoot), ...governedRoots.map((value) => resolve(value))];
  if (exclusions.some((pathname) => overlaps(resolvedParent, pathname))) {
    fail("RECOVERY_PARENT_UNSAFE", "Recovery parent overlaps a governed path");
  }

  await mkdir(resolvedParent, { recursive: true, mode: 0o700 });
  const admittedParent = await realDirectory(resolvedParent, "RECOVERY_PARENT_UNSAFE");
  const realExclusions = await Promise.all(exclusions.map((pathname) => realpath(pathname).catch(() => pathname)));
  if (realExclusions.some((pathname) => overlaps(admittedParent, pathname))) {
    fail("RECOVERY_PARENT_UNSAFE", "Recovery parent resolves across a governed path");
  }
  await portableChmod(admittedParent, 0o700);

  const root = resolve(admittedParent, `recovery-session-${sessionId}`);
  if (dirname(root) !== admittedParent) fail("RECOVERY_SESSION_PATH_INVALID", "Recovery session path is invalid");
  try {
    await mkdir(root, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error?.code === "EEXIST") fail("RECOVERY_SESSION_EXISTS", "Recovery session cannot be reused");
    throw error;
  }

  const children = {};
  try {
    for (const name of ["download", "plaintext", "target", "evidence"]) {
      const pathname = resolve(root, name);
      await mkdir(pathname, { recursive: false, mode: 0o700 });
      children[name] = await realDirectory(pathname);
      await portableChmod(children[name], 0o700);
      if (dirname(children[name]) !== root) fail("RECOVERY_SESSION_PATH_INVALID", "Recovery session layout escaped its root");
    }
    const admittedRoot = await realDirectory(root);
    if (admittedRoot !== root) fail("RECOVERY_SESSION_PATH_INVALID", "Recovery session must not resolve through a link");
    return defineSession({ id: sessionId, parent: admittedParent, root, ...children });
  } catch (error) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function admitRecoveryIdentity({
  environment = process.env,
  repoRoot = process.cwd(),
  backupOutputRoot,
  session,
} = {}) {
  const pathname = environment?.GODEL_MANAGED_RECOVERY_IDENTITY_FILE;
  if (typeof pathname !== "string" || pathname.trim() === "") fail("RECOVERY_IDENTITY_REQUIRED", "External recovery identity path is required");
  if (!isAbsolute(pathname)) fail("RECOVERY_IDENTITY_PATH_INVALID", "Recovery identity path must be absolute");
  const resolved = resolve(pathname);
  const state = await lstat(resolved).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || state.size <= 0) {
    fail("RECOVERY_IDENTITY_FILE_INVALID", "Recovery identity must be a nonempty external regular file");
  }
  const actual = await realpath(resolved);
  const forbiddenInputs = [resolve(repoRoot), resolve(backupOutputRoot), session?.parent, session?.root, session?.download, session?.target].filter(Boolean);
  const forbidden = await Promise.all(forbiddenInputs.map((root) => realpath(root).catch(() => root)));
  if (forbidden.some((root) => contained(root, actual))) {
    fail("RECOVERY_IDENTITY_LOCATION_FORBIDDEN", "Recovery identity is inside a forbidden boundary");
  }
  const handle = Object.freeze({ admitted: true, size: state.size, toJSON: () => ({ admitted: true }) });
  identityPaths.set(handle, actual);
  return handle;
}

export function useRecoveryIdentityPath(handle, callback) {
  const pathname = identityPaths.get(handle);
  if (!pathname || typeof callback !== "function") fail("RECOVERY_IDENTITY_HANDLE_INVALID", "Recovery identity handle is invalid");
  return callback(pathname, Object.freeze([pathname]));
}

async function assertCleanupTree(pathname) {
  for (const entry of await readdir(pathname, { withFileTypes: true })) {
    const child = resolve(pathname, entry.name);
    const state = await lstat(child);
    if (state.isSymbolicLink()) fail("RECOVERY_CLEANUP_UNSAFE", "Recovery cleanup tree contains a link or reparse point");
    if (state.isDirectory()) await assertCleanupTree(child);
    else if (!state.isFile()) fail("RECOVERY_CLEANUP_UNSAFE", "Recovery cleanup tree contains a special entry");
  }
}

export async function cleanupRecoverySession(session, { remove = rm } = {}) {
  if (!session || !SESSION_ID_PATTERN.test(session.sessionId ?? "") || typeof session.parent !== "string" || typeof session.root !== "string") {
    fail("RECOVERY_CLEANUP_UNSAFE", "Recovery cleanup session is invalid");
  }
  const expected = resolve(session.parent, `recovery-session-${session.sessionId}`);
  if (session.root !== expected || dirname(expected) !== session.parent) fail("RECOVERY_CLEANUP_UNSAFE", "Recovery cleanup target is not exact");
  const state = await lstat(expected).catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (state === null) return Object.freeze({ status: "PASS", removed: false });
  if (!state.isDirectory() || state.isSymbolicLink()) fail("RECOVERY_CLEANUP_UNSAFE", "Recovery cleanup target is not a real directory");
  const actual = await realpath(expected);
  if (actual !== expected) fail("RECOVERY_CLEANUP_UNSAFE", "Recovery cleanup target resolves unexpectedly");
  await assertCleanupTree(actual);
  try {
    await remove(actual, { recursive: true, force: false });
  } catch {
    fail("RECOVERY_CLEANUP_INCOMPLETE", "Recovery cleanup did not complete");
  }
  const remaining = await lstat(actual).then(() => true, (error) => error?.code === "ENOENT" ? false : Promise.reject(error));
  if (remaining) fail("RECOVERY_CLEANUP_INCOMPLETE", "Recovery cleanup did not complete");
  return Object.freeze({ status: "PASS", removed: true });
}

export function sanitizeRecoveryFailure(error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{3,80}$/.test(error.code) ? error.code : "RECOVERY_SOURCE_VERIFICATION_FAILED";
  return Object.freeze({ status: "FAIL", code, message: "Managed recovery source verification failed safely" });
}
