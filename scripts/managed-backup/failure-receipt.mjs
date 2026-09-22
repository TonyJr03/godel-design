import { randomUUID } from "node:crypto";
import { chmod, link, mkdir, open, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { isManagedBackupId } from "./manifest.mjs";

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SAFE_BRANCH_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/;
const SAFE_FAILURE_VALUE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedBackupFailureReceiptError";
  error.code = code;
  throw error;
}

function exactKeys(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("FAILURE_RECEIPT_INVALID", "Failure receipt must be an object");
  }
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) {
    fail("FAILURE_RECEIPT_INVALID", "Failure receipt contains unexpected fields");
  }
}

function validTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && new Date(value).toISOString() === value;
}

async function portableChmod(pathname, mode) {
  try {
    await chmod(pathname, mode);
  } catch (error) {
    if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error;
  }
}

export function sanitizeFailureValue(value, fallback) {
  return typeof value === "string" && SAFE_FAILURE_VALUE_PATTERN.test(value) ? value : fallback;
}

export function createIncompleteFailureReceipt({
  backupId,
  failedAt = new Date(),
  toolingGitSha,
  toolingGitBranch,
  productionRuntimeSha,
  failureCode,
  failurePhase,
} = {}) {
  const receipt = {
    schemaVersion: 1,
    backupId,
    failedAt: new Date(failedAt).toISOString(),
    toolingGitSha,
    toolingGitBranch,
    productionRuntimeSha,
    status: "INCOMPLETE",
    failureCode,
    failurePhase,
  };
  return validateIncompleteFailureReceipt(receipt);
}

export function validateIncompleteFailureReceipt(receipt) {
  exactKeys(receipt, [
    "schemaVersion",
    "backupId",
    "failedAt",
    "toolingGitSha",
    "toolingGitBranch",
    "productionRuntimeSha",
    "status",
    "failureCode",
    "failurePhase",
  ]);
  if (receipt.schemaVersion !== 1 || receipt.status !== "INCOMPLETE") fail("FAILURE_RECEIPT_INVALID", "Failure receipt status or schema is invalid");
  if (!isManagedBackupId(receipt.backupId)) fail("FAILURE_RECEIPT_INVALID", "Failure receipt backup ID is invalid");
  if (!validTimestamp(receipt.failedAt)) fail("FAILURE_RECEIPT_INVALID", "Failure receipt timestamp is invalid");
  if (!SHA_PATTERN.test(receipt.toolingGitSha ?? "") || !SHA_PATTERN.test(receipt.productionRuntimeSha ?? "")) {
    fail("FAILURE_RECEIPT_INVALID", "Failure receipt Git authority is invalid");
  }
  if (!SAFE_BRANCH_PATTERN.test(receipt.toolingGitBranch ?? "")) fail("FAILURE_RECEIPT_INVALID", "Failure receipt branch is invalid");
  if (!SAFE_FAILURE_VALUE_PATTERN.test(receipt.failureCode ?? "") || !SAFE_FAILURE_VALUE_PATTERN.test(receipt.failurePhase ?? "")) {
    fail("FAILURE_RECEIPT_INVALID", "Failure receipt code or phase is invalid");
  }
  return receipt;
}

export async function writeFailureReceiptAtomic(receipt, { outputRoot } = {}) {
  validateIncompleteFailureReceipt(receipt);
  if (typeof outputRoot !== "string" || outputRoot.length === 0) fail("FAILURE_RECEIPT_PATH_INVALID", "Failure receipt output root is required");
  const root = resolve(outputRoot);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const finalPath = join(root, `${receipt.backupId}.incomplete.json`);
  const temporaryPath = join(root, `.${receipt.backupId}.incomplete.${randomUUID()}.tmp`);
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
    await rm(temporaryPath, { force: true });
    throw writeError;
  }
  await portableChmod(temporaryPath, 0o600);
  try {
    await link(temporaryPath, finalPath);
    await rm(temporaryPath, { force: true });
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
  await portableChmod(finalPath, 0o600);
  return finalPath;
}
