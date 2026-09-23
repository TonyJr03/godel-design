import { randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, open, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

import { sha256File } from "./checksums.mjs";
import { isManagedBackupId } from "./manifest.mjs";

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const EXTERNAL_STATUSES = new Set(["PENDING", "PUBLISHED", "VERIFIED"]);
const RECEIPT_KEYS = [
  "schemaVersion",
  "backupId",
  "createdAt",
  "toolingGitSha",
  "productionRuntimeSha",
  "ciphertextFilename",
  "ciphertextSize",
  "ciphertextSha256",
  "status",
  "externalPublicationStatus",
];

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedBackupExternalReceiptError";
  error.code = code;
  throw error;
}

function exactObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("EXTERNAL_RECEIPT_INVALID", "External receipt must be a plain object");
  }
  const keys = Object.keys(value);
  if (keys.length !== RECEIPT_KEYS.length || keys.some((key) => !RECEIPT_KEYS.includes(key))) {
    fail("EXTERNAL_RECEIPT_INVALID", "External receipt contains unexpected fields");
  }
}

function validTimestamp(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value;
}

export function validateExternalReceipt(receipt) {
  exactObject(receipt);
  if (receipt.schemaVersion !== 1 || receipt.status !== "COMPLETE") fail("EXTERNAL_RECEIPT_INVALID", "External receipt status or schema is invalid");
  if (!isManagedBackupId(receipt.backupId) || !validTimestamp(receipt.createdAt)) fail("EXTERNAL_RECEIPT_INVALID", "External receipt identity or timestamp is invalid");
  if (!SHA_PATTERN.test(receipt.toolingGitSha ?? "") || !SHA_PATTERN.test(receipt.productionRuntimeSha ?? "")) fail("EXTERNAL_RECEIPT_INVALID", "External receipt Git authority is invalid");
  if (typeof receipt.ciphertextFilename !== "string" || basename(receipt.ciphertextFilename) !== receipt.ciphertextFilename || receipt.ciphertextFilename !== `${receipt.backupId}.age`) {
    fail("EXTERNAL_RECEIPT_INVALID", "External receipt ciphertext filename is invalid");
  }
  if (!Number.isSafeInteger(receipt.ciphertextSize) || receipt.ciphertextSize <= 0 || !SHA256_PATTERN.test(receipt.ciphertextSha256 ?? "")) {
    fail("EXTERNAL_RECEIPT_INVALID", "External receipt ciphertext size or checksum is invalid");
  }
  if (!EXTERNAL_STATUSES.has(receipt.externalPublicationStatus)) fail("EXTERNAL_RECEIPT_INVALID", "External publication status is invalid");
  return receipt;
}

export async function createExternalReceipt({ backupId, createdAt = new Date(), toolingGitSha, productionRuntimeSha, ciphertextPath, externalPublicationStatus = "PENDING" } = {}) {
  const state = await lstat(ciphertextPath).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || state.size <= 0) fail("CIPHERTEXT_INVALID", "Receipt ciphertext must be a nonempty regular file");
  const checksum = await sha256File(ciphertextPath);
  return validateExternalReceipt({
    schemaVersion: 1,
    backupId,
    createdAt: new Date(createdAt).toISOString(),
    toolingGitSha,
    productionRuntimeSha,
    ciphertextFilename: basename(ciphertextPath),
    ciphertextSize: checksum.size,
    ciphertextSha256: checksum.sha256,
    status: "COMPLETE",
    externalPublicationStatus,
  });
}

async function portableChmod(pathname, mode) {
  try {
    await chmod(pathname, mode);
  } catch (error) {
    if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error;
  }
}

export async function writeExternalReceiptAtomic(receipt, {
  outputRoot,
  linkFile = link,
  removeTemporary = (pathname) => rm(pathname, { force: true }),
} = {}) {
  validateExternalReceipt(receipt);
  if (typeof outputRoot !== "string" || outputRoot.length === 0) fail("EXTERNAL_RECEIPT_PATH_INVALID", "External receipt output root is required");
  if (typeof linkFile !== "function" || typeof removeTemporary !== "function") fail("EXTERNAL_RECEIPT_PATH_INVALID", "External receipt publication adapters are invalid");
  const root = resolve(outputRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const finalPath = join(root, `${receipt.backupId}.external-receipt.json`);
  const temporaryPath = join(root, `.${receipt.backupId}.${randomUUID()}.external-receipt.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  let writeError;
  try {
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    writeError = error;
  } finally {
    await handle.close();
  }
  if (writeError) {
    await removeTemporary(temporaryPath).catch(() => undefined);
    throw writeError;
  }
  await portableChmod(temporaryPath, 0o600);
  try {
    await linkFile(temporaryPath, finalPath);
  } catch (error) {
    await removeTemporary(temporaryPath).catch(() => undefined);
    if (error?.code === "EEXIST") fail("EXTERNAL_RECEIPT_ALREADY_EXISTS", "External receipt already exists");
    fail("EXTERNAL_RECEIPT_PUBLICATION_FAILED", "Atomic external receipt publication failed");
  }
  await removeTemporary(temporaryPath).catch(() => undefined);
  return finalPath;
}

export async function verifyExternalCiphertext(receipt, downloadedCiphertextPath) {
  validateExternalReceipt(receipt);
  const state = await lstat(downloadedCiphertextPath).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || state.size !== receipt.ciphertextSize) fail("EXTERNAL_CIPHERTEXT_MISMATCH", "External ciphertext size does not match its receipt");
  const checksum = await sha256File(downloadedCiphertextPath);
  if (checksum.sha256 !== receipt.ciphertextSha256) fail("EXTERNAL_CIPHERTEXT_MISMATCH", "External ciphertext checksum does not match its receipt");
  return { verified: true, size: checksum.size, sha256: checksum.sha256 };
}

export function assertExternalPublicationAdapter(adapter) {
  if (!adapter || typeof adapter.publishCiphertext !== "function" || typeof adapter.downloadCiphertext !== "function" || typeof adapter.publishReceipt !== "function") {
    fail("EXTERNAL_CUSTODY_ADAPTER_INVALID", "External custody adapter must publish/download ciphertext and publish its receipt");
  }
  return adapter;
}
