import { lstat, mkdir } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { validateExternalReceipt, verifyExternalCiphertext } from "../managed-backup/external-receipt.mjs";
import { isManagedBackupId } from "../managed-backup/manifest.mjs";
import { verifyManagedBundleTree } from "./bundle-verifier.mjs";
import {
  admitRecoveryIdentity,
  cleanupRecoverySession,
  createRecoverySession,
} from "./recovery-contract.mjs";
import { extractSafeTarArchive, inspectSafeTarArchive } from "./safe-tar.mjs";
import { classifyManagedSqlArtifacts } from "./sql-admission.mjs";
import { preflightManagedRecoveryTools } from "./tool-preflight.mjs";

const SOURCE_METHODS = Object.freeze(["inspectCandidate", "downloadReceipt", "downloadCiphertext"]);

function fail(code, message, extra = {}) {
  const error = new Error(message);
  error.name = "ManagedRecoverySourceVerificationError";
  error.code = code;
  Object.assign(error, extra);
  throw error;
}

export function assertRecoveryOnlySourceAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") fail("RECOVERY_SOURCE_ADAPTER_INVALID", "Recovery source adapter is required");
  const keys = Object.keys(adapter);
  if (keys.length !== SOURCE_METHODS.length || SOURCE_METHODS.some((name) => typeof adapter[name] !== "function") || keys.some((name) => !SOURCE_METHODS.includes(name))) {
    fail("RECOVERY_SOURCE_ADAPTER_INVALID", "Recovery source adapter must expose only read operations");
  }
  return adapter;
}

export function admitExternalRecoveryReceipt(receipt, selectedBackupId) {
  validateExternalReceipt(receipt);
  if (!isManagedBackupId(selectedBackupId) || receipt.backupId !== selectedBackupId) fail("RECOVERY_RECEIPT_IDENTITY_MISMATCH", "Recovery receipt identity does not match the selected candidate");
  if (receipt.status !== "COMPLETE" || receipt.externalPublicationStatus !== "VERIFIED") {
    fail("RECOVERY_RECEIPT_STATUS_INVALID", "Recovery receipt is not COMPLETE and VERIFIED");
  }
  return receipt;
}

export async function admitExternalRecoveryCiphertext({ receipt, selectedBackupId, ciphertextPath } = {}) {
  admitExternalRecoveryReceipt(receipt, selectedBackupId);
  if (basename(ciphertextPath ?? "") !== receipt.ciphertextFilename) fail("RECOVERY_CIPHERTEXT_FILENAME_MISMATCH", "Recovery ciphertext filename does not match its receipt");
  await verifyExternalCiphertext(receipt, ciphertextPath);
  return Object.freeze({ status: "VERIFIED", size: receipt.ciphertextSize, sha256: receipt.ciphertextSha256 });
}

async function assertSessionDownload(pathname, session, expectedName) {
  if (typeof pathname !== "string" || resolve(pathname) !== pathname || dirname(pathname) !== session.download || basename(pathname) !== expectedName) {
    fail("RECOVERY_DOWNLOAD_PATH_INVALID", "Recovery source returned a file outside the session download boundary");
  }
  const state = await lstat(pathname).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || state.size <= 0) fail("RECOVERY_DOWNLOAD_INVALID", "Recovery source returned an invalid local file");
}

export async function runManagedRecoverySourceVerification({
  selectedBackupId,
  recoveryParent,
  backupOutputRoot,
  repoRoot = process.cwd(),
  environment = process.env,
  sourceAdapter,
  sourceAdapterFactory,
  decryptAdapter,
  dependencies = {},
} = {}) {
  if (!isManagedBackupId(selectedBackupId)) fail("RECOVERY_BACKUP_ID_INVALID", "Selected managed backup identity is invalid");
  if (sourceAdapter === undefined && typeof sourceAdapterFactory !== "function") {
    fail("RECOVERY_SOURCE_ADAPTER_INVALID", "Recovery source adapter or factory is required");
  }
  if (sourceAdapter !== undefined) assertRecoveryOnlySourceAdapter(sourceAdapter);
  if (!decryptAdapter || typeof decryptAdapter.decryptToTar !== "function" || Object.keys(decryptAdapter).some((key) => key !== "decryptToTar")) {
    fail("RECOVERY_DECRYPT_ADAPTER_INVALID", "Recovery decrypt adapter contract is invalid");
  }

  const preflight = dependencies.preflight ?? preflightManagedRecoveryTools;
  const tools = await preflight({ environment, repoRoot });
  let session;
  let primaryError;
  let result;
  try {
    session = await (dependencies.createSession ?? createRecoverySession)({
      parent: recoveryParent,
      repoRoot,
      backupOutputRoot,
      governedRoots: dependencies.governedRoots ?? [],
      sessionId: dependencies.sessionId,
    });
    const identity = await (dependencies.admitIdentity ?? admitRecoveryIdentity)({ environment, repoRoot, backupOutputRoot, session });
    const activeSource = assertRecoveryOnlySourceAdapter(sourceAdapter ?? sourceAdapterFactory({
      backupId: selectedBackupId,
      downloadDirectory: session.download,
      environment,
      repoRoot,
    }));
    const inspection = await activeSource.inspectCandidate();
    if (inspection?.status !== "VERIFIED" || inspection.objectCount !== 2) fail("RECOVERY_SOURCE_CANDIDATE_INVALID", "Recovery source candidate is incomplete");
    const downloadedReceipt = await activeSource.downloadReceipt();
    await assertSessionDownload(downloadedReceipt?.path, session, `${selectedBackupId}.external-receipt.json`);
    const receipt = admitExternalRecoveryReceipt(downloadedReceipt?.receipt, selectedBackupId);
    const ciphertextPath = await activeSource.downloadCiphertext({ receipt });
    await assertSessionDownload(ciphertextPath, session, `${selectedBackupId}.age`);
    await admitExternalRecoveryCiphertext({ receipt, selectedBackupId, ciphertextPath });

    const archivePath = resolve(session.plaintext, "managed-recovery.tar");
    await decryptAdapter.decryptToTar({ ciphertextPath, archivePath, identity });
    const archiveState = await lstat(archivePath).catch(() => null);
    if (!archiveState?.isFile() || archiveState.isSymbolicLink() || archiveState.size <= 0) fail("RECOVERY_DECRYPT_OUTPUT_INVALID", "Recovery decrypt output is not an admitted tar file");
    const archiveInspection = await inspectSafeTarArchive(archivePath);
    const bundleRoot = resolve(session.plaintext, "bundle");
    await mkdir(bundleRoot, { recursive: false, mode: 0o700 });
    await extractSafeTarArchive({ archivePath, destination: bundleRoot, inspection: archiveInspection });
    const bundle = await verifyManagedBundleTree({ root: bundleRoot, receipt, selectedBackupId });
    const sql = await classifyManagedSqlArtifacts(bundleRoot);
    result = Object.freeze({
      status: "PASS",
      tools,
      source: Object.freeze({ candidate: "VERIFIED", receipt: "VERIFIED", ciphertext: "VERIFIED" }),
      archive: Object.freeze({ safety: "VERIFIED", entryCount: archiveInspection.entries.length }),
      bundle,
      sql,
      remoteMutationOperations: 0,
      targetMutations: 0,
      sqlExecutions: 0,
    });
  } catch (error) {
    primaryError = error;
  }

  if (session) {
    try {
      await (dependencies.cleanup ?? cleanupRecoverySession)(session);
    } catch (cleanupError) {
      fail("RECOVERY_CLEANUP_INCOMPLETE", "Recovery source verification cleanup did not complete", {
        primaryCode: typeof primaryError?.code === "string" ? primaryError.code : primaryError ? "RECOVERY_SOURCE_VERIFICATION_FAILED" : "NONE",
        cleanupCode: typeof cleanupError?.code === "string" ? cleanupError.code : "RECOVERY_CLEANUP_FAILED",
      });
    }
  }
  if (primaryError) throw primaryError;
  return result;
}
