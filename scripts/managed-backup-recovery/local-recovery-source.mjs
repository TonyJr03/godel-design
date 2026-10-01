import { constants } from "node:fs";
import { copyFile, lstat, readFile, realpath, rm } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { validateExternalReceipt, verifyExternalCiphertext } from "../managed-backup/external-receipt.mjs";
import { isManagedBackupId } from "../managed-backup/manifest.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryLocalSourceError";
  error.code = code;
  throw error;
}

async function admitRealDirectory(pathname, code) {
  const resolved = resolve(pathname ?? "");
  const state = await lstat(resolved).catch(() => null);
  if (!state?.isDirectory() || state.isSymbolicLink()) fail(code, "Local recovery source directory is invalid");
  const actual = await realpath(resolved);
  if (actual !== resolved) fail(code, "Local recovery source directory resolves unexpectedly");
  return actual;
}

async function admitSourceFile(root, name) {
  const pathname = resolve(root, name);
  if (dirname(pathname) !== root || basename(pathname) !== name) fail("RECOVERY_LOCAL_SOURCE_ARTIFACT_INVALID", "Local recovery source artifact identity is invalid");
  const state = await lstat(pathname).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || state.size <= 0) fail("RECOVERY_LOCAL_SOURCE_ARTIFACT_INVALID", "Local recovery source artifact is invalid");
  const actual = await realpath(pathname);
  if (actual !== pathname) fail("RECOVERY_LOCAL_SOURCE_ARTIFACT_INVALID", "Local recovery source artifact resolves unexpectedly");
  return pathname;
}

async function copyNoReplace(source, downloadDirectory, name) {
  const root = await admitRealDirectory(downloadDirectory, "RECOVERY_DOWNLOAD_DIRECTORY_INVALID");
  const target = resolve(root, name);
  if (dirname(target) !== root || basename(target) !== name) fail("RECOVERY_DOWNLOAD_PATH_INVALID", "Local recovery download path is invalid");
  try {
    await copyFile(source, target, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error?.code === "EEXIST") fail("RECOVERY_DOWNLOAD_EXISTS", "Local recovery download target already exists");
    fail("RECOVERY_LOCAL_SOURCE_COPY_FAILED", "Local recovery source artifact could not be copied");
  }
  const state = await lstat(target).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || state.size <= 0) {
    await rm(target, { force: true }).catch(() => undefined);
    fail("RECOVERY_DOWNLOAD_INVALID", "Local recovery copied artifact is invalid");
  }
  return target;
}

export function createLocalRecoverySourceAdapter({ backupId, backupOutputRoot, downloadDirectory } = {}) {
  if (!isManagedBackupId(backupId)) fail("RECOVERY_BACKUP_ID_INVALID", "Selected managed backup identity is invalid");
  if (typeof backupOutputRoot !== "string" || typeof downloadDirectory !== "string") fail("RECOVERY_LOCAL_SOURCE_ADAPTER_INVALID", "Local recovery source adapter configuration is invalid");
  const ciphertextName = `${backupId}.age`;
  const receiptName = `${backupId}.external-receipt.json`;

  async function sourceArtifacts() {
    const root = await admitRealDirectory(backupOutputRoot, "RECOVERY_LOCAL_SOURCE_ROOT_INVALID");
    const [ciphertext, receipt] = await Promise.all([
      admitSourceFile(root, ciphertextName),
      admitSourceFile(root, receiptName),
    ]);
    return Object.freeze({ ciphertext, receipt });
  }

  return Object.freeze({
    async inspectCandidate() {
      await sourceArtifacts();
      return Object.freeze({ status: "VERIFIED", objectCount: 2 });
    },
    async downloadReceipt() {
      const source = await sourceArtifacts();
      const path = await copyNoReplace(source.receipt, downloadDirectory, receiptName);
      let receipt;
      try {
        receipt = validateExternalReceipt(JSON.parse(await readFile(path, "utf8")));
      } catch {
        fail("RECOVERY_RECEIPT_INVALID", "Local recovery receipt is invalid");
      }
      if (receipt.backupId !== backupId || receipt.externalPublicationStatus !== "VERIFIED") fail("RECOVERY_RECEIPT_INVALID", "Local recovery receipt does not match the selected candidate");
      return Object.freeze({ path, receipt });
    },
    async downloadCiphertext({ receipt } = {}) {
      validateExternalReceipt(receipt);
      if (receipt.backupId !== backupId || receipt.externalPublicationStatus !== "VERIFIED") fail("RECOVERY_RECEIPT_INVALID", "Local recovery receipt does not match the selected candidate");
      const source = await sourceArtifacts();
      const path = await copyNoReplace(source.ciphertext, downloadDirectory, ciphertextName);
      await verifyExternalCiphertext(receipt, path);
      return path;
    },
  });
}
