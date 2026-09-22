import { constants as fsConstants } from "node:fs";
import { access, chmod, lstat, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  createChecksumInventory,
  listArtifactTree,
  serializeChecksums,
  sha256File,
  verifyChecksumInventory,
} from "./checksums.mjs";
import {
  validateAuthInventory,
  validateConfigSnapshot,
  validateStorageDurableInventory,
} from "./inventory.mjs";
import {
  completeManifest,
  createIncompleteManifest,
  isManagedBackupId,
  updateIncompleteManifest,
  writeManifestAtomic,
} from "./manifest.mjs";
import {
  cleanupPlaintextStaging,
  ensureSafeOutputRoot,
  resolveContainedPath,
  validateRelativeArtifactPath,
} from "./safety.mjs";

const RESERVED_PATHS = new Set([
  "auth/inventory.json",
  "storage/durable-inventory.json",
  "configuration/snapshot.json",
  "inventory/checksums.sha256",
  "internal-manifest.json",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedBackupBundleError";
  error.code = code;
  throw error;
}

async function pathExists(pathname) {
  try {
    await access(pathname, fsConstants.F_OK);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function verifyCiphertextFile(pathname) {
  const state = await lstat(pathname).catch((error) => {
    if (error?.code === "ENOENT") fail("CIPHERTEXT_MISSING", "Encryption did not produce ciphertext");
    throw error;
  });
  if (!state.isFile() || state.isSymbolicLink() || state.size === 0) {
    fail("CIPHERTEXT_INVALID", "Ciphertext must be a nonempty regular file");
  }
  const handle = await open(pathname, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(pathname, 0o600).catch((error) => {
    if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error;
  });
}

async function writeArtifact(root, relativePath, content) {
  validateRelativeArtifactPath(relativePath);
  const target = resolveContainedPath(root, relativePath);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, content, { encoding: typeof content === "string" ? "utf8" : undefined, flag: "wx", mode: 0o600 });
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertEncryptionAdapter(adapter) {
  if (!adapter || typeof adapter.encrypt !== "function" || typeof adapter.verifyCiphertext !== "function") {
    fail("ENCRYPTION_ADAPTER_REQUIRED", "An encryption adapter with encrypt and verifyCiphertext is required");
  }
}

export async function createManagedBackupBundle({
  outputRoot,
  repoRoot = process.cwd(),
  backupId,
  createdAt = new Date(),
  toolingGitSha,
  toolingGitBranch,
  productionRuntimeSha,
  databaseCounts,
  authInventory,
  storageInventory,
  configurationSnapshot,
  toolVersions,
  syntheticArtifacts = [],
  encryptionAdapter,
} = {}) {
  assertEncryptionAdapter(encryptionAdapter);
  const safeOutputRoot = await ensureSafeOutputRoot(outputRoot, { repoRoot });
  let manifest = createIncompleteManifest({
    backupId,
    createdAt,
    toolingGitSha,
    toolingGitBranch,
    productionRuntimeSha,
    databaseCounts,
    toolVersions,
  });
  if (!isManagedBackupId(manifest.backupId)) fail("BACKUP_ID_INVALID", "Managed backup ID is invalid");

  const stagingPath = join(safeOutputRoot, `.staging-${manifest.backupId}`);
  const preflightPath = join(safeOutputRoot, `.${manifest.backupId}.preflight.age`);
  const candidatePath = join(safeOutputRoot, `.${manifest.backupId}.candidate.age`);
  const finalPath = join(safeOutputRoot, `${manifest.backupId}.age`);
  if (await pathExists(finalPath) || await pathExists(stagingPath)) fail("BACKUP_ALREADY_EXISTS", "Backup output already exists");
  await mkdir(stagingPath, { recursive: false, mode: 0o700 });

  try {
    const auth = validateAuthInventory(authInventory);
    const storage = validateStorageDurableInventory(storageInventory);
    validateConfigSnapshot(configurationSnapshot);
    if (configurationSnapshot.toolingGitSha !== toolingGitSha || configurationSnapshot.productionRuntimeSha !== productionRuntimeSha) {
      fail("AUTHORITY_MISMATCH", "Configuration snapshot Git authority does not match the manifest");
    }

    await writeArtifact(stagingPath, "auth/inventory.json", json(authInventory));
    await writeArtifact(stagingPath, "storage/durable-inventory.json", json(storageInventory));
    await writeArtifact(stagingPath, "configuration/snapshot.json", json(configurationSnapshot));
    const seen = new Set();
    for (const artifact of syntheticArtifacts) {
      if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) fail("ARTIFACT_INVALID", "Synthetic artifact is invalid");
      const keys = Object.keys(artifact);
      if (keys.length !== 2 || !keys.includes("path") || !keys.includes("content")) fail("ARTIFACT_INVALID", "Synthetic artifact contains unexpected fields");
      validateRelativeArtifactPath(artifact.path);
      if (RESERVED_PATHS.has(artifact.path) || seen.has(artifact.path)) fail("DUPLICATE_ARTIFACT", "Synthetic artifact path is reserved or duplicated");
      if (typeof artifact.content !== "string" && !Buffer.isBuffer(artifact.content)) fail("ARTIFACT_INVALID", "Synthetic artifact content must be text or bytes");
      seen.add(artifact.path);
      await writeArtifact(stagingPath, artifact.path, artifact.content);
    }

    const paths = await listArtifactTree(stagingPath, { exclude: ["internal-manifest.json", "inventory/checksums.sha256"] });
    const checksumEntries = await createChecksumInventory({ root: stagingPath, paths });
    await writeArtifact(stagingPath, "inventory/checksums.sha256", serializeChecksums(checksumEntries));
    await verifyChecksumInventory({ root: stagingPath, entries: checksumEntries });
    const checksumArtifact = await sha256File(resolveContainedPath(stagingPath, "inventory/checksums.sha256"));
    const artifacts = [...checksumEntries, { path: "inventory/checksums.sha256", ...checksumArtifact }]
      .sort((left, right) => left.path.localeCompare(right.path, "en"));

    manifest = updateIncompleteManifest(manifest, {
      artifacts,
      authCounts: { users: auth.userCount, identities: auth.identityCount },
      storageDurable: { objectCount: storage.objectCount, totalBytes: storage.totalBytes },
      gates: {
        artifactsExist: true,
        checksumsVerified: true,
        inventoryValid: true,
        crossValidationPassed: true,
        ciphertextVerified: false,
      },
    });
    await writeManifestAtomic(manifest, { root: stagingPath });

    await encryptionAdapter.encrypt({ sourceDirectory: stagingPath, outputPath: preflightPath, phase: "preflight" });
    await verifyCiphertextFile(preflightPath);
    const preflight = await encryptionAdapter.verifyCiphertext({ ciphertextPath: preflightPath, phase: "preflight" });
    if (!preflight || preflight.verified !== true) fail("CIPHERTEXT_VERIFICATION_FAILED", "Preflight ciphertext verification failed");
    await rm(preflightPath, { force: true });

    const complete = completeManifest(manifest, { ciphertextVerified: true });
    await writeManifestAtomic(complete, { root: stagingPath });
    await encryptionAdapter.encrypt({ sourceDirectory: stagingPath, outputPath: candidatePath, phase: "final" });
    await verifyCiphertextFile(candidatePath);
    const verification = await encryptionAdapter.verifyCiphertext({ ciphertextPath: candidatePath, phase: "final" });
    if (!verification || verification.verified !== true) fail("CIPHERTEXT_VERIFICATION_FAILED", "Final ciphertext verification failed");
    if (await pathExists(finalPath)) fail("BACKUP_ALREADY_EXISTS", "Backup output appeared during publication");
    await rename(candidatePath, finalPath);
    await chmod(finalPath, 0o600).catch((error) => {
      if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error;
    });
    await cleanupPlaintextStaging({ outputRoot: safeOutputRoot, stagingPath });
    return { backupId: complete.backupId, finalPath, manifest: complete, externalPublication: "NOT_IMPLEMENTED" };
  } catch (error) {
    await rm(preflightPath, { force: true }).catch(() => undefined);
    await rm(candidatePath, { force: true }).catch(() => undefined);
    if (await pathExists(stagingPath)) {
      await writeManifestAtomic(manifest, { root: stagingPath }).catch(() => undefined);
      await cleanupPlaintextStaging({ outputRoot: safeOutputRoot, stagingPath });
    }
    throw error;
  }
}
