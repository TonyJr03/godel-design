import { randomBytes, randomUUID } from "node:crypto";
import { lstat, readFile, rm } from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

import { runCommand } from "./command-runner.mjs";
import { validateExternalReceipt, verifyExternalCiphertext } from "./external-receipt.mjs";
import { isManagedBackupId } from "./manifest.mjs";
import { publishCiphertextNoReplace } from "./publication.mjs";
import { ensureSafeOutputRoot, validateRelativeArtifactPath } from "./safety.mjs";

export const R2_REMOTE_NAME = "godelr2";
export const R2_PRODUCTION_LOCK_CONFIRMATION = "CONFIRM_R2_PRODUCTION_PREFIX_LOCK_8D";
export const R2_PROOF_RUN_ID_PATTERN = /^GDR2-\d{8}T\d{6}Z-[A-Z2-7]{8}$/;

const MODES = new Set(["integration", "production"]);
const OPERATIONS = new Set(["inspect", "upload-immutable", "download"]);
const BUCKET_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/;

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedBackupR2CustodyError";
  error.code = code;
  throw error;
}

function required(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || value.length === 0) fail("R2_CONFIG_MISSING", `${name} is required`);
  return value;
}

function cleanR2Endpoint(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("R2_ENDPOINT_INVALID", "R2 endpoint must be a clean HTTPS URL");
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || (parsed.pathname !== "/" && parsed.pathname !== "")
    || parsed.port
  ) {
    fail("R2_ENDPOINT_INVALID", "R2 endpoint must be a clean HTTPS URL");
  }
  const suffix = ".r2.cloudflarestorage.com";
  const prefix = parsed.hostname.endsWith(suffix) ? parsed.hostname.slice(0, -suffix.length) : "";
  if (!prefix || prefix.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    fail("R2_ENDPOINT_INVALID", "R2 endpoint hostname is not a Cloudflare R2 S3 endpoint");
  }
  return `https://${parsed.hostname}`;
}

export function readR2CustodyConfiguration(environment = {}) {
  const bucket = required(environment, "GODEL_BACKUP_R2_BUCKET");
  if (!BUCKET_PATTERN.test(bucket)) fail("R2_BUCKET_INVALID", "R2 bucket name is invalid");
  return Object.freeze({
    endpoint: cleanR2Endpoint(required(environment, "GODEL_BACKUP_R2_ENDPOINT")),
    bucket,
    accessKeyId: required(environment, "GODEL_BACKUP_R2_ACCESS_KEY_ID"),
    secretAccessKey: required(environment, "GODEL_BACKUP_R2_SECRET_ACCESS_KEY"),
  });
}

function systemEnvironment(source = {}) {
  const environment = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") environment[key] = source[key];
  }
  return environment;
}

export function buildR2CustodyEnvironment(configuration, sourceEnvironment = {}) {
  if (!configuration || typeof configuration !== "object") fail("R2_CONFIG_INVALID", "R2 configuration is required");
  const allowedEnvironment = {
    ...systemEnvironment(sourceEnvironment),
    RCLONE_CONFIG_GODELR2_TYPE: "s3",
    RCLONE_CONFIG_GODELR2_PROVIDER: "Cloudflare",
    RCLONE_CONFIG_GODELR2_ENV_AUTH: "true",
    RCLONE_CONFIG_GODELR2_ENDPOINT: configuration.endpoint,
    RCLONE_CONFIG_GODELR2_REGION: "auto",
    RCLONE_CONFIG_GODELR2_NO_CHECK_BUCKET: "true",
    AWS_ACCESS_KEY_ID: configuration.accessKeyId,
    AWS_SECRET_ACCESS_KEY: configuration.secretAccessKey,
  };
  return Object.freeze({
    allowedEnvironment: Object.freeze(allowedEnvironment),
    secretValues: Object.freeze([configuration.accessKeyId, configuration.secretAccessKey, configuration.endpoint]),
  });
}

export function createR2ProofRunId({ now = new Date(), random = randomBytes } = {}) {
  const timestamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = random(5);
  if (!Buffer.isBuffer(bytes) || bytes.length < 5) fail("R2_PROOF_RUN_ID_INVALID", "Proof random source is invalid");
  let bits = 0n;
  let bitCount = 0n;
  let suffix = "";
  for (const byte of bytes.subarray(0, 5)) {
    bits = (bits << 8n) | BigInt(byte);
    bitCount += 8n;
    while (bitCount >= 5n) {
      suffix += alphabet[Number((bits >> (bitCount - 5n)) & 31n)];
      bitCount -= 5n;
    }
  }
  const runId = `GDR2-${timestamp}-${suffix.slice(0, 8)}`;
  if (!R2_PROOF_RUN_ID_PATTERN.test(runId)) fail("R2_PROOF_RUN_ID_INVALID", "Generated proof run ID is invalid");
  return runId;
}

function assertMode(mode) {
  if (!MODES.has(mode)) fail("R2_MODE_INVALID", "R2 custody mode must be integration or production");
}

function assertProofRunId(value) {
  if (!R2_PROOF_RUN_ID_PATTERN.test(value ?? "")) fail("R2_PROOF_RUN_ID_INVALID", "R2 proof run ID is invalid");
}

function objectLayout({ mode, proofRunId, backupId }) {
  assertMode(mode);
  if (!isManagedBackupId(backupId)) fail("BACKUP_ID_INVALID", "Managed backup ID is invalid");
  if (mode === "integration") assertProofRunId(proofRunId);
  const prefix = mode === "integration" ? `integration/${proofRunId}` : `production/${backupId}`;
  const ciphertextName = mode === "integration" ? "synthetic.age" : `${backupId}.age`;
  const receiptName = mode === "integration" ? "synthetic.external-receipt.json" : `${backupId}.external-receipt.json`;
  for (const value of [prefix, `${prefix}/${ciphertextName}`, `${prefix}/${receiptName}`]) validateRelativeArtifactPath(value);
  return Object.freeze({
    prefix,
    ciphertextName,
    receiptName,
    ciphertextKey: `${prefix}/${ciphertextName}`,
    receiptKey: `${prefix}/${receiptName}`,
  });
}

export function deriveR2ObjectKeys(options = {}) {
  return objectLayout(options);
}

function remoteTarget(bucket, relativePath) {
  if (!BUCKET_PATTERN.test(bucket) || typeof relativePath !== "string") fail("R2_COMMAND_INVALID", "R2 command target is invalid");
  validateRelativeArtifactPath(relativePath);
  return `${R2_REMOTE_NAME}:${bucket}/${relativePath}`;
}

function r2Command({ operation, bucket, prefix, objectKey, localPath }) {
  if (!OPERATIONS.has(operation)) fail("R2_OPERATION_FORBIDDEN", "R2 custody operation is forbidden");
  if (operation === "inspect") {
    return Object.freeze({ operation: "inspect R2 custody namespace", executable: "rclone", args: Object.freeze(["lsjson", remoteTarget(bucket, prefix), "--recursive", "--files-only"]) });
  }
  if (typeof localPath !== "string" || !isAbsolute(localPath)) fail("R2_COMMAND_INVALID", "R2 local path must be absolute");
  const remote = remoteTarget(bucket, objectKey);
  const args = operation === "upload-immutable"
    ? ["copyto", resolve(localPath), remote, "--immutable"]
    : ["copyto", remote, resolve(localPath), "--immutable"];
  return Object.freeze({ operation: operation === "download" ? "download R2 custody object" : "publish immutable R2 custody object", executable: "rclone", args: Object.freeze(args) });
}

function parseListing(stdout, layout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    fail("R2_LISTING_INVALID", "R2 listing is not valid JSON");
  }
  if (!Array.isArray(value) || value.length > 2) fail("R2_LISTING_INVALID", "R2 listing has an invalid object count");
  const expected = new Set([layout.ciphertextName, layout.receiptName]);
  const names = [];
  for (const entry of value) {
    if (
      !entry
      || typeof entry !== "object"
      || Array.isArray(entry)
      || Object.getPrototypeOf(entry) !== Object.prototype
      || entry.IsDir !== false
      || typeof entry.Path !== "string"
      || typeof entry.Name !== "string"
    ) {
      fail("R2_LISTING_INVALID", "R2 listing contains a non-file entry");
    }
    const name = entry.Path;
    if (name !== basename(name) || name.includes("/") || name.includes("\\") || name.includes(":") || !expected.has(name) || entry.Name !== name) {
      fail("R2_LISTING_INVALID", "R2 listing contains an unexpected object");
    }
    if (names.includes(name)) fail("R2_LISTING_INVALID", "R2 listing contains a duplicate object");
    names.push(name);
  }
  return Object.freeze(names.sort());
}

function assertListing(names, expected) {
  const sorted = [...expected].sort();
  if (names.length !== sorted.length || names.some((name, index) => name !== sorted[index])) {
    fail("R2_LISTING_STATE_INVALID", "R2 namespace does not contain exactly the expected objects");
  }
}

async function assertRegularFile(pathname, { emptyAllowed = false } = {}) {
  const state = await lstat(pathname).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || (!emptyAllowed && state.size <= 0)) {
    fail("R2_LOCAL_FILE_INVALID", "R2 custody local file must be a nonempty regular file");
  }
  return state;
}

export function createR2ExternalPublicationAdapter({
  mode,
  proofRunId,
  environment = process.env,
  repoRoot = process.cwd(),
  execute = runCommand,
} = {}) {
  assertMode(mode);
  if (mode === "integration") assertProofRunId(proofRunId);
  if (mode === "production" && environment.GODEL_MANAGED_R2_PRODUCTION_LOCK_CONFIRM !== R2_PRODUCTION_LOCK_CONFIRMATION) {
    fail("R2_PRODUCTION_LOCK_CONFIRMATION_REQUIRED", "Exact R2 Production prefix lock confirmation is required");
  }
  if (typeof execute !== "function") fail("R2_RUNNER_INVALID", "R2 command runner is required");
  const configuration = readR2CustodyConfiguration(environment);
  const commandEnvironment = buildR2CustodyEnvironment(configuration, environment);

  const invoke = (plan) => execute({
    ...plan,
    cwd: repoRoot,
    allowedEnvironment: commandEnvironment.allowedEnvironment,
    secretValues: commandEnvironment.secretValues,
  });

  async function inspect(backupId) {
    const layout = objectLayout({ mode, proofRunId, backupId });
    const result = await invoke(r2Command({ operation: "inspect", bucket: configuration.bucket, prefix: layout.prefix }));
    return { layout, names: parseListing(result.stdout, layout) };
  }

  async function downloadObject({ backupId, outputRoot, kind }) {
    const root = await ensureSafeOutputRoot(outputRoot, { repoRoot });
    const layout = objectLayout({ mode, proofRunId, backupId });
    const isReceipt = kind === "receipt";
    const finalName = isReceipt ? `${backupId}.r2-external-receipt.json` : `${backupId}.r2-download.age`;
    const finalPath = join(root, finalName);
    if (await lstat(finalPath).then(() => true, (error) => error?.code === "ENOENT" ? false : Promise.reject(error))) {
      fail("R2_LOCAL_TARGET_EXISTS", "R2 download target already exists");
    }
    const temporaryPath = join(root, `.${backupId}.${randomUUID()}.r2-download.tmp`);
    const objectKey = isReceipt ? layout.receiptKey : layout.ciphertextKey;
    try {
      await invoke(r2Command({ operation: "download", bucket: configuration.bucket, objectKey, localPath: temporaryPath }));
      await assertRegularFile(temporaryPath);
      await publishCiphertextNoReplace(temporaryPath, finalPath);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      if (error?.code === "FINAL_ALREADY_EXISTS") fail("R2_LOCAL_TARGET_EXISTS", "R2 download target already exists");
      throw error;
    }
    return finalPath;
  }

  const adapter = {
    async inspectObjects({ backupId } = {}) {
      const result = await inspect(backupId);
      return Object.freeze({ objectCount: result.names.length, ciphertextPresent: result.names.includes(result.layout.ciphertextName), receiptPresent: result.names.includes(result.layout.receiptName) });
    },

    async publishCiphertext({ ciphertextPath, receipt } = {}) {
      validateExternalReceipt(receipt);
      if (receipt.externalPublicationStatus !== "PENDING") fail("R2_RECEIPT_STATUS_INVALID", "Ciphertext publication requires a PENDING receipt");
      await assertRegularFile(ciphertextPath);
      if (basename(ciphertextPath) !== receipt.ciphertextFilename) fail("R2_LOCAL_FILE_INVALID", "Ciphertext filename does not match its receipt");
      await verifyExternalCiphertext(receipt, ciphertextPath);
      const before = await inspect(receipt.backupId);
      if (before.names.length !== 0) fail("R2_OBJECT_ALREADY_EXISTS", "R2 custody namespace already contains an object");
      await invoke(r2Command({ operation: "upload-immutable", bucket: configuration.bucket, objectKey: before.layout.ciphertextKey, localPath: ciphertextPath }));
      const after = await inspect(receipt.backupId);
      assertListing(after.names, [after.layout.ciphertextName]);
    },

    async downloadCiphertext({ backupId, outputRoot } = {}) {
      return downloadObject({ backupId, outputRoot, kind: "ciphertext" });
    },

    async publishReceipt({ receiptPath, receipt } = {}) {
      validateExternalReceipt(receipt);
      if (receipt.externalPublicationStatus !== "VERIFIED") fail("R2_RECEIPT_STATUS_INVALID", "R2 receipt publication requires VERIFIED status");
      await assertRegularFile(receiptPath);
      const localReceipt = validateExternalReceipt(JSON.parse(await readFile(receiptPath, "utf8")));
      if (JSON.stringify(localReceipt) !== JSON.stringify(receipt)) fail("R2_RECEIPT_MISMATCH", "Receipt file does not match the admitted receipt");
      const before = await inspect(receipt.backupId);
      if (before.names.includes(before.layout.receiptName)) fail("R2_OBJECT_ALREADY_EXISTS", "R2 custody receipt already exists");
      assertListing(before.names, [before.layout.ciphertextName]);
      await invoke(r2Command({ operation: "upload-immutable", bucket: configuration.bucket, objectKey: before.layout.receiptKey, localPath: receiptPath }));
      const after = await inspect(receipt.backupId);
      assertListing(after.names, [after.layout.ciphertextName, after.layout.receiptName]);
    },

    async downloadReceipt({ backupId, outputRoot } = {}) {
      const path = await downloadObject({ backupId, outputRoot, kind: "receipt" });
      let receipt;
      try {
        receipt = validateExternalReceipt(JSON.parse(await readFile(path, "utf8")));
      } catch {
        fail("R2_RECEIPT_INVALID", "Downloaded R2 receipt is invalid");
      }
      if (receipt.backupId !== backupId || receipt.externalPublicationStatus !== "VERIFIED") fail("R2_RECEIPT_INVALID", "Downloaded R2 receipt is not the expected VERIFIED receipt");
      return Object.freeze({ path, receipt });
    },
  };
  return Object.freeze(adapter);
}
