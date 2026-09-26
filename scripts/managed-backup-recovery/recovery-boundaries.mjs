import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const RECOVERY_PARENT_ENV = "GODEL_MANAGED_RECOVERY_PARENT";
export const RECOVERY_BACKUP_OUTPUT_ROOT_ENV = "GODEL_MANAGED_RECOVERY_BACKUP_OUTPUT_ROOT";

const boundaryDetails = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryBoundaryError";
  error.code = code;
  throw error;
}

function contained(parent, candidate) {
  const value = relative(parent, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function overlaps(left, right) {
  return contained(left, right) || contained(right, left);
}

async function admitExistingRealDirectory(value, { missingCode, relativeCode, invalidCode }) {
  if (typeof value !== "string" || value.trim() === "") fail(missingCode, "Explicit recovery boundary is required");
  if (!isAbsolute(value)) fail(relativeCode, "Recovery boundary must be absolute");
  const resolved = resolve(value);
  const state = await lstat(resolved).catch(() => null);
  if (!state?.isDirectory() || state.isSymbolicLink()) fail(invalidCode, "Recovery boundary must be an existing real directory");
  const actual = await realpath(resolved);
  if (actual !== resolved) fail(invalidCode, "Recovery boundary resolved unexpectedly");
  return actual;
}

export async function admitRealRecoveryBoundaries({ environment = process.env, repoRoot = process.cwd(), governedRoots = [] } = {}) {
  const parent = await admitExistingRealDirectory(environment?.[RECOVERY_PARENT_ENV], {
    missingCode: "RECOVERY_PARENT_REQUIRED",
    relativeCode: "RECOVERY_PARENT_PATH_INVALID",
    invalidCode: "RECOVERY_PARENT_UNSAFE",
  });
  const backupOutputRoot = await admitExistingRealDirectory(environment?.[RECOVERY_BACKUP_OUTPUT_ROOT_ENV], {
    missingCode: "RECOVERY_BACKUP_OUTPUT_ROOT_REQUIRED",
    relativeCode: "RECOVERY_BACKUP_OUTPUT_ROOT_PATH_INVALID",
    invalidCode: "RECOVERY_BACKUP_OUTPUT_ROOT_UNSAFE",
  });
  const roots = [repoRoot, backupOutputRoot, ...governedRoots].filter((value) => typeof value === "string" && value.length > 0);
  const admittedRoots = await Promise.all(roots.map(async (value) => {
    const resolved = resolve(value);
    return realpath(resolved).catch(() => resolved);
  }));
  if (admittedRoots.some((root) => overlaps(parent, root))) fail("RECOVERY_PARENT_UNSAFE", "Recovery parent overlaps a governed boundary");
  const handle = Object.freeze({ status: "ADMITTED", toJSON: () => ({ status: "ADMITTED" }) });
  boundaryDetails.set(handle, Object.freeze({ parent, backupOutputRoot }));
  return handle;
}

export function accessRealRecoveryBoundaries(handle, callback) {
  const details = boundaryDetails.get(handle);
  if (!details || typeof callback !== "function") fail("RECOVERY_BOUNDARY_HANDLE_INVALID", "Admitted recovery boundary authority is required");
  return callback(details);
}
