import { randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import { validateRelativeArtifactPath } from "./safety.mjs";

export const MANAGED_BACKUP_MANIFEST_SCHEMA_VERSION = 1;
export const MANAGED_BACKUP_STATUSES = Object.freeze(["INCOMPLETE", "COMPLETE"]);
export const MANAGED_BACKUP_TOOL_NAMES = Object.freeze([
  "node",
  "npm",
  "supabase",
  "docker",
  "pg_dump",
  "psql",
  "age",
  "rclone",
  "aws",
]);

const BACKUP_ID_PATTERN = /^GDBK-\d{8}T\d{6}Z-[A-Z2-7]{8}$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const SAFE_NAME_PATTERN = /^[A-Za-z0-9._/-]+$/;
const SECRET_FIELD_PATTERN = /(password|secret|token|cookie|connection.?string|db.?url|jwt|private.?key|age.?identity|s3.?secret)/i;
const SECRET_VALUE_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i,
  /AGE-SECRET-KEY-[A-Z0-9-]+/,
  /\bsb_secret_[A-Za-z0-9_-]+/,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];

export class ManagedBackupManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ManagedBackupManifestError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ManagedBackupManifestError(code, message);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, label) {
  if (!plain(value)) fail("MANIFEST_INVALID", `${label} must be an object`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key) || SECRET_FIELD_PATTERN.test(key))) {
    fail("MANIFEST_INVALID", `${label} contains an unexpected or sensitive field`);
  }
}

function assertSafeString(value, label, { pattern = SAFE_NAME_PATTERN, max = 512 } = {}) {
  if (typeof value !== "string" || value.length === 0 || value.length > max || !pattern.test(value)) {
    fail("MANIFEST_INVALID", `${label} is invalid`);
  }
  if (SECRET_VALUE_PATTERNS.some((candidate) => candidate.test(value))) {
    fail("MANIFEST_SECRET_REJECTED", `${label} contains secret-like material`);
  }
}

function assertTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || new Date(value).toISOString() !== value) {
    fail("MANIFEST_INVALID", "createdAt must be an ISO UTC timestamp");
  }
}

function assertNonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail("MANIFEST_INVALID", `${label} must be a nonnegative integer`);
}

function validateArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) fail("MANIFEST_INVALID", "artifacts must be an array");
  let previous = "";
  for (const artifact of artifacts) {
    exactKeys(artifact, ["path", "size", "sha256"], "artifact");
    validateRelativeArtifactPath(artifact.path);
    if (previous && previous >= artifact.path) fail("MANIFEST_INVALID", "artifacts must be unique and sorted");
    previous = artifact.path;
    assertNonnegativeInteger(artifact.size, "artifact size");
    if (!SHA256_PATTERN.test(artifact.sha256)) fail("MANIFEST_INVALID", "artifact SHA-256 is invalid");
  }
}

function validateDatabaseCounts(databaseCounts) {
  exactKeys(databaseCounts, ["tables"], "databaseCounts");
  if (!Array.isArray(databaseCounts.tables)) fail("MANIFEST_INVALID", "database table counts must be an array");
  let previous = "";
  for (const table of databaseCounts.tables) {
    exactKeys(table, ["schema", "name", "rowCount"], "database table count");
    assertSafeString(table.schema, "database schema", { pattern: /^[a-z][a-z0-9_]*$/, max: 63 });
    assertSafeString(table.name, "database table", { pattern: /^[a-z][a-z0-9_]*$/, max: 63 });
    const identity = `${table.schema}.${table.name}`;
    if (previous && previous >= identity) fail("MANIFEST_INVALID", "database table counts must be unique and sorted");
    previous = identity;
    assertNonnegativeInteger(table.rowCount, "database row count");
  }
}

function validateToolVersions(toolVersions) {
  if (!Array.isArray(toolVersions)) fail("MANIFEST_INVALID", "toolVersions must be an array");
  let previous = "";
  for (const tool of toolVersions) {
    exactKeys(tool, ["name", "present", "version"], "tool version");
    if (!MANAGED_BACKUP_TOOL_NAMES.includes(tool.name) || (previous && previous >= tool.name)) {
      fail("MANIFEST_INVALID", "tool versions must be known, unique, and sorted");
    }
    previous = tool.name;
    if (typeof tool.present !== "boolean") fail("MANIFEST_INVALID", "tool presence must be boolean");
    if (tool.version !== null) assertSafeString(tool.version, "tool version", { pattern: /^[^\0-\x1f]+$/, max: 200 });
    if (!tool.present && tool.version !== null) fail("MANIFEST_INVALID", "absent tool cannot have a version");
  }
}

function validateGates(gates) {
  const names = [
    "artifactsExist",
    "checksumsVerified",
    "inventoryValid",
    "crossValidationPassed",
    "ciphertextVerified",
  ];
  exactKeys(gates, names, "gates");
  for (const name of names) if (typeof gates[name] !== "boolean") fail("MANIFEST_INVALID", `gate ${name} must be boolean`);
  return names.every((name) => gates[name] === true);
}

export function createManagedBackupId({ now = new Date(), random = randomBytes } = {}) {
  const timestamp = new Date(now).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = random(5);
  if (!Buffer.isBuffer(bytes) || bytes.length < 5) fail("BACKUP_ID_INVALID", "Random source did not return enough bytes");
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
  const backupId = `GDBK-${timestamp}-${suffix.slice(0, 8)}`;
  if (!BACKUP_ID_PATTERN.test(backupId)) fail("BACKUP_ID_INVALID", "Generated backup ID is invalid");
  return backupId;
}

export function isManagedBackupId(value) {
  return typeof value === "string" && BACKUP_ID_PATTERN.test(value);
}

export function createIncompleteManifest({
  backupId = createManagedBackupId(),
  createdAt = new Date(),
  toolingGitSha,
  toolingGitBranch,
  productionRuntimeSha,
  artifacts = [],
  databaseCounts = { tables: [] },
  authCounts = { users: 0, identities: 0 },
  storageDurable = { objectCount: 0, totalBytes: 0 },
  toolVersions = [],
  configurationSnapshotVersion = 1,
} = {}) {
  const manifest = {
    schemaVersion: MANAGED_BACKUP_MANIFEST_SCHEMA_VERSION,
    backupId,
    createdAt: new Date(createdAt).toISOString(),
    toolingGitSha,
    toolingGitBranch,
    productionRuntimeSha,
    artifacts,
    databaseCounts,
    authCounts,
    storageDurable,
    toolVersions,
    configurationSnapshotVersion,
    gates: {
      artifactsExist: false,
      checksumsVerified: false,
      inventoryValid: false,
      crossValidationPassed: false,
      ciphertextVerified: false,
    },
    status: "INCOMPLETE",
  };
  return validateManagedBackupManifest(manifest);
}

export function validateManagedBackupManifest(manifest) {
  exactKeys(manifest, [
    "schemaVersion",
    "backupId",
    "createdAt",
    "toolingGitSha",
    "toolingGitBranch",
    "productionRuntimeSha",
    "artifacts",
    "databaseCounts",
    "authCounts",
    "storageDurable",
    "toolVersions",
    "configurationSnapshotVersion",
    "gates",
    "status",
  ], "manifest");
  if (manifest.schemaVersion !== MANAGED_BACKUP_MANIFEST_SCHEMA_VERSION) fail("MANIFEST_INVALID", "Unsupported manifest schema version");
  if (!isManagedBackupId(manifest.backupId)) fail("MANIFEST_INVALID", "backupId is invalid");
  assertTimestamp(manifest.createdAt);
  if (!SHA_PATTERN.test(manifest.toolingGitSha ?? "") || !SHA_PATTERN.test(manifest.productionRuntimeSha ?? "")) {
    fail("MANIFEST_INVALID", "Git authority SHA is invalid");
  }
  assertSafeString(manifest.toolingGitBranch, "toolingGitBranch", { pattern: /^[A-Za-z0-9._/-]+$/, max: 200 });
  validateArtifacts(manifest.artifacts);
  validateDatabaseCounts(manifest.databaseCounts);
  exactKeys(manifest.authCounts, ["users", "identities"], "authCounts");
  assertNonnegativeInteger(manifest.authCounts.users, "Auth user count");
  assertNonnegativeInteger(manifest.authCounts.identities, "Auth identity count");
  exactKeys(manifest.storageDurable, ["objectCount", "totalBytes"], "storageDurable");
  assertNonnegativeInteger(manifest.storageDurable.objectCount, "Storage object count");
  assertNonnegativeInteger(manifest.storageDurable.totalBytes, "Storage total bytes");
  validateToolVersions(manifest.toolVersions);
  if (manifest.configurationSnapshotVersion !== 1) fail("MANIFEST_INVALID", "Configuration snapshot version is unsupported");
  const gatesComplete = validateGates(manifest.gates);
  if (!MANAGED_BACKUP_STATUSES.includes(manifest.status)) fail("MANIFEST_INVALID", "Backup status is invalid");
  if (manifest.status === "COMPLETE" && !gatesComplete) fail("MANIFEST_GATES_INCOMPLETE", "COMPLETE requires every local gate");
  if (manifest.status === "INCOMPLETE" && manifest.gates.ciphertextVerified) {
    fail("MANIFEST_INVALID", "Verified ciphertext requires COMPLETE status");
  }
  return manifest;
}

export function updateIncompleteManifest(manifest, updates) {
  validateManagedBackupManifest(manifest);
  if (manifest.status !== "INCOMPLETE") fail("MANIFEST_INVALID", "A complete manifest is immutable");
  const next = structuredClone(manifest);
  for (const key of ["artifacts", "databaseCounts", "authCounts", "storageDurable", "toolVersions", "gates"]) {
    if (updates[key] !== undefined) next[key] = structuredClone(updates[key]);
  }
  next.status = "INCOMPLETE";
  return validateManagedBackupManifest(next);
}

export function completeManifest(manifest, { ciphertextVerified = false } = {}) {
  validateManagedBackupManifest(manifest);
  if (manifest.status !== "INCOMPLETE") fail("MANIFEST_INVALID", "Only an incomplete manifest can be completed");
  for (const gate of ["artifactsExist", "checksumsVerified", "inventoryValid", "crossValidationPassed"]) {
    if (manifest.gates[gate] !== true) fail("MANIFEST_GATES_INCOMPLETE", `Cannot complete before gate ${gate}`);
  }
  if (ciphertextVerified !== true) fail("MANIFEST_GATES_INCOMPLETE", "Cannot complete before ciphertext verification");
  const next = structuredClone(manifest);
  next.gates.ciphertextVerified = true;
  next.status = "COMPLETE";
  return validateManagedBackupManifest(next);
}

async function portableChmod(pathname, mode) {
  try {
    await chmod(pathname, mode);
  } catch (error) {
    if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error;
  }
}

export async function writeManifestAtomic(manifest, { root, fileName = "internal-manifest.json" } = {}) {
  validateManagedBackupManifest(manifest);
  if (typeof root !== "string" || root.length === 0) fail("MANIFEST_PATH_INVALID", "Manifest root is required");
  validateRelativeArtifactPath(fileName);
  if (fileName.includes("/")) fail("MANIFEST_PATH_INVALID", "Manifest file must live directly in its root");
  const resolvedRoot = resolve(root);
  await mkdir(resolvedRoot, { recursive: true, mode: 0o700 });
  await portableChmod(resolvedRoot, 0o700);
  const finalPath = join(resolvedRoot, fileName);
  const temporaryPath = join(resolvedRoot, `.${fileName}.${randomUUID()}.tmp`);
  const handle = await open(temporaryPath, "wx", 0o600);
  let writeError;
  try {
    await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
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
  await rename(temporaryPath, finalPath);
  await portableChmod(finalPath, 0o600);
  return finalPath;
}

export async function readManagedBackupManifest(pathname) {
  let value;
  try {
    value = JSON.parse(await readFile(pathname, "utf8"));
  } catch {
    fail("MANIFEST_INVALID", "Manifest JSON could not be read");
  }
  return validateManagedBackupManifest(value);
}
