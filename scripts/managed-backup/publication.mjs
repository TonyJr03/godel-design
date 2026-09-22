import { lstat, link, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedBackupPublicationError";
  error.code = code;
  throw error;
}

export async function publishCiphertextNoReplace(candidatePath, finalPath, {
  linkFile = link,
  unlinkCandidate = unlink,
} = {}) {
  if (typeof candidatePath !== "string" || typeof finalPath !== "string" || candidatePath.length === 0 || finalPath.length === 0) {
    fail("FINAL_PUBLICATION_INVALID", "Ciphertext publication paths are required");
  }
  const candidate = resolve(candidatePath);
  const final = resolve(finalPath);
  if (candidate === final || dirname(candidate) !== dirname(final)) {
    fail("FINAL_PUBLICATION_INVALID", "Ciphertext candidate and final must be distinct files in one output directory");
  }
  if (typeof linkFile !== "function" || typeof unlinkCandidate !== "function") {
    fail("FINAL_PUBLICATION_INVALID", "Ciphertext publication adapters are invalid");
  }

  const state = await lstat(candidate).catch((error) => {
    if (error?.code === "ENOENT") fail("CIPHERTEXT_MISSING", "Ciphertext candidate is missing");
    throw error;
  });
  if (!state.isFile() || state.isSymbolicLink() || state.size === 0) {
    fail("CIPHERTEXT_INVALID", "Ciphertext candidate must be a nonempty regular file");
  }

  try {
    await linkFile(candidate, final);
  } catch (error) {
    if (error?.code === "EEXIST") fail("FINAL_ALREADY_EXISTS", "Final backup already exists");
    fail("FINAL_PUBLICATION_FAILED", "Atomic no-replace publication failed");
  }

  try {
    await unlinkCandidate(candidate);
    return { published: true, candidateRemoved: true, warning: null };
  } catch {
    return { published: true, candidateRemoved: false, warning: "CANDIDATE_CLEANUP_PENDING" };
  }
}
