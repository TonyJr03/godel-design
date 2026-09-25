import { lstat, readdir, realpath, rm } from "node:fs/promises";
import { resolve } from "node:path";

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryTargetCleanupError";
  error.code = code;
  throw error;
}

async function safeTree(pathname) {
  for (const entry of await readdir(pathname, { withFileTypes: true })) {
    const child = resolve(pathname, entry.name);
    const state = await lstat(child);
    if (state.isSymbolicLink()) fail("RECOVERY_TARGET_CLEANUP_UNSAFE", "Target cleanup tree contains a link or reparse point");
    if (state.isDirectory()) await safeTree(child);
    else if (!state.isFile()) fail("RECOVERY_TARGET_CLEANUP_UNSAFE", "Target cleanup tree contains a special entry");
  }
}

export async function cleanupManagedRecoveryTarget({ session, target, adapter, remove = rm } = {}) {
  if (!session || !target || target.workdir !== session.target || typeof target.projectId !== "string" || !adapter || typeof adapter.stop !== "function" || typeof adapter.listOwnedResources !== "function") {
    fail("RECOVERY_TARGET_CLEANUP_INVALID", "Exact recovery target cleanup authority is required");
  }
  try {
    await adapter.stop({ projectId: target.projectId, workdir: target.workdir });
    const remaining = await adapter.listOwnedResources({ projectId: target.projectId });
    if (!Array.isArray(remaining) || remaining.length !== 0) fail("RECOVERY_TARGET_CLEANUP_INCOMPLETE", "Owned target resources remain after stop");
    const state = await lstat(session.target);
    if (!state.isDirectory() || state.isSymbolicLink() || await realpath(session.target) !== resolve(session.target)) fail("RECOVERY_TARGET_CLEANUP_UNSAFE", "Target cleanup root is unsafe");
    await safeTree(session.target);
    for (const entry of await readdir(session.target)) await remove(resolve(session.target, entry), { recursive: true, force: false });
    if ((await readdir(session.target)).length !== 0) fail("RECOVERY_TARGET_CLEANUP_INCOMPLETE", "Target workdir contents remain after cleanup");
    return Object.freeze({ status: "PASS", projectScoped: true, foreignResourcesTouched: 0, secureEraseClaimed: false });
  } catch (error) {
    if (error?.code === "RECOVERY_TARGET_CLEANUP_UNSAFE") throw error;
    fail("RECOVERY_TARGET_CLEANUP_INCOMPLETE", "Disposable recovery target cleanup did not complete");
  }
}
