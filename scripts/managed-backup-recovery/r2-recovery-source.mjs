import { randomUUID } from "node:crypto";
import { link, lstat, readFile, realpath, rm, unlink } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { validateExternalReceipt, verifyExternalCiphertext } from "../managed-backup/external-receipt.mjs";
import { isManagedBackupId } from "../managed-backup/manifest.mjs";
import {
  R2_REMOTE_NAME,
  buildR2CustodyEnvironment,
  deriveR2ObjectKeys,
  readR2CustodyConfiguration,
} from "../managed-backup/r2-external-custody.mjs";

const FORBIDDEN_METHODS = Object.freeze(["upload", "publish", "delete", "move", "purge", "sync", "copyToRemote"]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryR2SourceError";
  error.code = code;
  throw error;
}

async function assertDownloadDirectory(pathname) {
  const state = await lstat(pathname).catch(() => null);
  if (!state?.isDirectory() || state.isSymbolicLink()) fail("RECOVERY_DOWNLOAD_DIRECTORY_INVALID", "Recovery download directory must be real");
  const actual = await realpath(pathname);
  if (actual !== resolve(pathname)) fail("RECOVERY_DOWNLOAD_DIRECTORY_INVALID", "Recovery download directory resolves unexpectedly");
  return actual;
}

function remoteTarget(bucket, relativePath) {
  return `${R2_REMOTE_NAME}:${bucket}/${relativePath}`;
}

function parseCandidateListing(source, layout) {
  let entries;
  try {
    entries = JSON.parse(source);
  } catch {
    fail("RECOVERY_R2_LISTING_INVALID", "Recovery candidate listing is invalid");
  }
  if (!Array.isArray(entries) || entries.length !== 2) fail("RECOVERY_R2_CANDIDATE_INCOMPLETE", "Recovery candidate must contain exactly two objects");
  const expected = new Set([layout.ciphertextName, layout.receiptName]);
  const found = new Set();
  for (const entry of entries) {
    if (
      !entry
      || typeof entry !== "object"
      || Array.isArray(entry)
      || Object.getPrototypeOf(entry) !== Object.prototype
      || entry.IsDir !== false
      || typeof entry.Path !== "string"
      || typeof entry.Name !== "string"
      || entry.Path !== entry.Name
      || basename(entry.Path) !== entry.Path
      || !expected.has(entry.Path)
      || found.has(entry.Path)
    ) {
      fail("RECOVERY_R2_LISTING_INVALID", "Recovery candidate listing contains an unexpected object");
    }
    found.add(entry.Path);
  }
  if (found.size !== expected.size) fail("RECOVERY_R2_CANDIDATE_INCOMPLETE", "Recovery candidate is incomplete");
  return Object.freeze({ status: "VERIFIED", objectCount: 2 });
}

async function publishLocalNoReplace(candidate, final) {
  try {
    await link(candidate, final);
  } catch (error) {
    if (error?.code === "EEXIST") fail("RECOVERY_DOWNLOAD_EXISTS", "Recovery download target already exists");
    fail("RECOVERY_DOWNLOAD_PUBLICATION_FAILED", "Recovery download could not be admitted");
  }
  try {
    await unlink(candidate);
  } catch {
    await rm(final, { force: true }).catch(() => undefined);
    fail("RECOVERY_DOWNLOAD_CLEANUP_FAILED", "Recovery download temporary cleanup failed");
  }
}

export function createR2RecoverySourceAdapter({
  backupId,
  downloadDirectory,
  environment = process.env,
  repoRoot = process.cwd(),
  execute = runCommand,
} = {}) {
  if (!isManagedBackupId(backupId)) fail("RECOVERY_BACKUP_ID_INVALID", "Selected managed backup identity is invalid");
  if (typeof downloadDirectory !== "string" || typeof execute !== "function") fail("RECOVERY_R2_ADAPTER_INVALID", "Recovery R2 adapter configuration is invalid");
  const configuration = readR2CustodyConfiguration(environment);
  const commandEnvironment = buildR2CustodyEnvironment(configuration, environment);
  const layout = deriveR2ObjectKeys({ mode: "production", backupId });

  const invoke = (plan) => execute({
    ...plan,
    cwd: repoRoot,
    allowedEnvironment: commandEnvironment.allowedEnvironment,
    secretValues: commandEnvironment.secretValues,
    redactionValues: Object.freeze([resolve(downloadDirectory), resolve(repoRoot)]),
  });

  async function inspectCandidate() {
    await assertDownloadDirectory(downloadDirectory);
    const result = await invoke({
      operation: "inspect selected R2 recovery candidate",
      executable: "rclone",
      args: ["lsjson", remoteTarget(configuration.bucket, layout.prefix), "--recursive", "--files-only"],
    });
    return parseCandidateListing(result.stdout, layout);
  }

  async function download(kind) {
    const root = await assertDownloadDirectory(downloadDirectory);
    const receipt = kind === "receipt";
    const name = receipt ? layout.receiptName : layout.ciphertextName;
    const objectKey = receipt ? layout.receiptKey : layout.ciphertextKey;
    const final = resolve(root, name);
    if (dirname(final) !== root) fail("RECOVERY_DOWNLOAD_PATH_INVALID", "Recovery download path is invalid");
    if (await lstat(final).then(() => true, (error) => error?.code === "ENOENT" ? false : Promise.reject(error))) {
      fail("RECOVERY_DOWNLOAD_EXISTS", "Recovery download target already exists");
    }
    const temporary = resolve(root, `.${randomUUID()}.recovery-download.tmp`);
    try {
      await invoke({
        operation: receipt ? "download selected R2 recovery receipt" : "download selected R2 recovery ciphertext",
        executable: "rclone",
        args: ["copyto", remoteTarget(configuration.bucket, objectKey), temporary, "--immutable"],
      });
      const state = await lstat(temporary).catch(() => null);
      if (!state?.isFile() || state.isSymbolicLink() || state.size <= 0) fail("RECOVERY_DOWNLOAD_INVALID", "Recovery download is not a nonempty regular file");
      await publishLocalNoReplace(temporary, final);
      return final;
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  const adapter = {
    inspectCandidate,
    async downloadReceipt() {
      const path = await download("receipt");
      let receipt;
      try {
        receipt = validateExternalReceipt(JSON.parse(await readFile(path, "utf8")));
      } catch {
        fail("RECOVERY_RECEIPT_INVALID", "Downloaded recovery receipt is invalid");
      }
      if (receipt.backupId !== backupId || receipt.externalPublicationStatus !== "VERIFIED") {
        fail("RECOVERY_RECEIPT_INVALID", "Downloaded recovery receipt does not match the selected candidate");
      }
      return Object.freeze({ path, receipt });
    },
    async downloadCiphertext({ receipt } = {}) {
      validateExternalReceipt(receipt);
      if (receipt.backupId !== backupId || receipt.externalPublicationStatus !== "VERIFIED") {
        fail("RECOVERY_RECEIPT_INVALID", "Recovery receipt does not match the selected candidate");
      }
      const path = await download("ciphertext");
      await verifyExternalCiphertext(receipt, path);
      return path;
    },
  };
  for (const name of FORBIDDEN_METHODS) {
    if (Object.hasOwn(adapter, name)) fail("RECOVERY_R2_MUTATION_FORBIDDEN", "Recovery adapter exposes a mutating operation");
  }
  return Object.freeze(adapter);
}
