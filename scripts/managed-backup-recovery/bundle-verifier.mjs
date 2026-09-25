import { lstat, readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { parseChecksums, sha256File } from "../managed-backup/checksums.mjs";
import { validateExternalReceipt } from "../managed-backup/external-receipt.mjs";
import { validateAuthInventory, validateConfigSnapshot, validateStorageDurableInventory } from "../managed-backup/inventory.mjs";
import { readManagedBackupManifest } from "../managed-backup/manifest.mjs";
import { validateWriterFreezeRecord } from "../managed-backup/production-contract.mjs";
import { resolveContainedPath } from "../managed-backup/safety.mjs";

export const MANAGED_RECOVERY_BASE_ARTIFACTS = Object.freeze([
  "auth/inventory.json",
  "configuration/snapshot.json",
  "database/managed-data.sql",
  "database/managed-schema.sql",
  "database/migration-history-data.sql",
  "database/migration-history-schema.sql",
  "database/roles.sql",
  "inventory/checksums.sha256",
  "operations/writer-freeze.json",
  "storage/durable-inventory.json",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryBundleError";
  error.code = code;
  throw error;
}

async function readJson(root, pathname, code) {
  try {
    return JSON.parse(await readFile(resolveContainedPath(root, pathname), "utf8"));
  } catch {
    fail(code, "Managed recovery JSON artifact is invalid");
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

function same(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function walkTree(root, directory, files, directories) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const pathname = resolve(directory, entry.name);
    const state = await lstat(pathname);
    const rel = relative(root, pathname).split(sep).join("/");
    if (state.isSymbolicLink()) fail("RECOVERY_BUNDLE_LINK_FORBIDDEN", "Managed recovery tree contains a link or reparse point");
    if (state.isDirectory()) {
      directories.push(rel);
      await walkTree(root, pathname, files, directories);
    } else if (state.isFile()) files.push(rel);
    else fail("RECOVERY_BUNDLE_SPECIAL_TYPE_FORBIDDEN", "Managed recovery tree contains a special entry");
  }
}

function expectedDirectories(files) {
  const output = new Set();
  for (const pathname of files) {
    const parts = pathname.split("/");
    for (let index = 1; index < parts.length; index += 1) output.add(parts.slice(0, index).join("/"));
  }
  return sorted(output);
}

export async function verifyManagedBundleTree({ root, receipt, selectedBackupId } = {}) {
  validateExternalReceipt(receipt);
  if (receipt.externalPublicationStatus !== "VERIFIED" || receipt.backupId !== selectedBackupId) {
    fail("RECOVERY_AUTHORITY_MISMATCH", "External receipt does not match the selected recovery candidate");
  }
  const rootState = await lstat(root).catch(() => null);
  if (!rootState?.isDirectory() || rootState.isSymbolicLink()) fail("RECOVERY_BUNDLE_ROOT_INVALID", "Managed recovery bundle root must be a real directory");

  const manifest = await readManagedBackupManifest(resolveContainedPath(root, "internal-manifest.json"));
  if (manifest.status !== "COMPLETE" || Object.values(manifest.gates).some((value) => value !== true)) {
    fail("RECOVERY_MANIFEST_INCOMPLETE", "Managed recovery manifest is not COMPLETE");
  }
  if (
    manifest.backupId !== selectedBackupId
    || manifest.toolingGitSha !== receipt.toolingGitSha
    || manifest.productionRuntimeSha !== receipt.productionRuntimeSha
  ) fail("RECOVERY_AUTHORITY_MISMATCH", "Manifest and external receipt authorities disagree");

  const authInventory = validateAuthInventory(await readJson(root, "auth/inventory.json", "RECOVERY_AUTH_INVENTORY_INVALID"));
  const storageSource = await readJson(root, "storage/durable-inventory.json", "RECOVERY_STORAGE_INVENTORY_INVALID");
  const storageInventory = validateStorageDurableInventory(storageSource);
  const snapshot = validateConfigSnapshot(await readJson(root, "configuration/snapshot.json", "RECOVERY_CONFIG_SNAPSHOT_INVALID"));
  if (
    snapshot.toolingGitSha !== manifest.toolingGitSha
    || snapshot.productionRuntimeSha !== manifest.productionRuntimeSha
    || manifest.configurationSnapshotVersion !== snapshot.schemaVersion
  ) fail("RECOVERY_AUTHORITY_MISMATCH", "Configuration snapshot and manifest authorities disagree");
  if (
    manifest.authCounts.users !== authInventory.userCount
    || manifest.authCounts.identities !== authInventory.identityCount
    || manifest.storageDurable.objectCount !== storageInventory.objectCount
    || manifest.storageDurable.totalBytes !== storageInventory.totalBytes
  ) fail("RECOVERY_INVENTORY_MANIFEST_MISMATCH", "Managed inventories disagree with manifest counts");

  validateWriterFreezeRecord(await readJson(root, "operations/writer-freeze.json", "RECOVERY_WRITER_FREEZE_INVALID"));

  let checksumEntries;
  try {
    checksumEntries = parseChecksums(await readFile(resolveContainedPath(root, "inventory/checksums.sha256"), "utf8"));
  } catch {
    fail("RECOVERY_CHECKSUM_INVENTORY_INVALID", "Managed recovery checksum inventory is invalid");
  }
  const checksumPaths = checksumEntries.map((entry) => entry.path);
  const storagePaths = storageInventory.objects.map((entry) => `storage/${entry.path}`);
  const expectedManifestPaths = sorted([...MANAGED_RECOVERY_BASE_ARTIFACTS, ...storagePaths]);
  if (new Set(expectedManifestPaths).size !== expectedManifestPaths.length) fail("RECOVERY_ARTIFACT_SET_INVALID", "Managed recovery artifact set contains a collision");
  const manifestPaths = manifest.artifacts.map((entry) => entry.path);
  if (!same(manifestPaths, expectedManifestPaths)) fail("RECOVERY_MANIFEST_TREE_MISMATCH", "Manifest artifact set is not the exact managed recovery contract");

  const expectedChecksumPaths = expectedManifestPaths.filter((pathname) => pathname !== "inventory/checksums.sha256");
  if (!same(checksumPaths, expectedChecksumPaths)) fail("RECOVERY_MANIFEST_CHECKSUM_MISMATCH", "Manifest and checksum inventory artifact sets disagree");
  const manifestByPath = new Map(manifest.artifacts.map((entry) => [entry.path, entry]));
  for (const entry of checksumEntries) {
    const manifestEntry = manifestByPath.get(entry.path);
    if (!manifestEntry || manifestEntry.size !== entry.size || manifestEntry.sha256 !== entry.sha256) {
      fail("RECOVERY_MANIFEST_CHECKSUM_MISMATCH", "Manifest and checksum metadata disagree");
    }
  }

  const checksumArtifact = await sha256File(resolveContainedPath(root, "inventory/checksums.sha256"));
  const checksumManifest = manifestByPath.get("inventory/checksums.sha256");
  if (checksumArtifact.size !== checksumManifest.size || checksumArtifact.sha256 !== checksumManifest.sha256) {
    fail("RECOVERY_CHECKSUM_FILE_MISMATCH", "Checksum inventory digest disagrees with the manifest");
  }
  for (const artifact of manifest.artifacts) {
    const actual = await sha256File(resolveContainedPath(root, artifact.path)).catch(() => {
      fail("RECOVERY_ARTIFACT_INVALID", "Managed recovery artifact is missing or unsafe");
    });
    if (actual.size !== artifact.size || actual.sha256 !== artifact.sha256) {
      fail("RECOVERY_ARTIFACT_DIGEST_MISMATCH", "Managed recovery artifact size or digest is invalid");
    }
  }

  for (const object of storageInventory.objects) {
    const actual = await sha256File(resolveContainedPath(root, `storage/${object.path}`)).catch(() => {
      fail("RECOVERY_STORAGE_BYTE_MISSING", "Managed recovery Storage byte is missing");
    });
    if (actual.size !== object.size || actual.sha256 !== object.sha256) {
      fail("RECOVERY_STORAGE_BYTE_MISMATCH", "Managed recovery Storage byte size or digest is invalid");
    }
  }

  const files = [];
  const directories = [];
  await walkTree(resolve(root), resolve(root), files, directories);
  const expectedFiles = sorted([...expectedManifestPaths, "internal-manifest.json"]);
  if (!same(sorted(files), expectedFiles) || !same(sorted(directories), expectedDirectories(expectedFiles))) {
    fail("RECOVERY_BUNDLE_EXACT_TREE_MISMATCH", "Managed recovery filesystem is not the exact governed tree");
  }

  return Object.freeze({
    status: "VERIFIED",
    artifactCount: expectedFiles.length,
    authUserCount: authInventory.userCount,
    authIdentityCount: authInventory.identityCount,
    storageObjectCount: storageInventory.objectCount,
    storageTotalBytes: storageInventory.totalBytes,
    authorityAgreement: true,
    writerFreeze: "VERIFIED",
  });
}
