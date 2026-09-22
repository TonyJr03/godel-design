import assert from "node:assert/strict";
import test from "node:test";

import {
  STORAGE_OBJECTS_BOUNDARY,
  validateAuthInventory,
  validateConfigSnapshot,
  validateStorageDurableInventory,
} from "./inventory.mjs";

const HASH = "a".repeat(64);

function authFixture() {
  return {
    schemaVersion: 1,
    tables: { users: { present: true, count: 2 }, identities: { present: true, count: 2 } },
    assertions: { uuidContinuityAvailable: true, encryptedPasswordCoverageAvailable: true },
    ephemeralState: { sessions: "excluded", refreshTokens: "invalidate-after-restore", otpFlowState: "excluded" },
  };
}

function storageFixture() {
  return {
    schemaVersion: 1,
    bucket: "godel-files",
    items: [
      { id: "item-1", status: "committed", archivoId: "file-1", objectPath: "pedidos/file.pdf", size: 4 },
      { id: "item-2", status: "reserved", archivoId: null, objectPath: "staging/reserved", size: 1 },
      { id: "item-3", status: "expired", archivoId: null, objectPath: "staging/expired", size: 1 },
      { id: "item-4", status: "cancelled", archivoId: null, objectPath: "staging/cancelled", size: 1 },
    ],
    archivos: [{ id: "file-1", bucket: "godel-files", filePath: "pedidos/file.pdf", size: 4 }],
    storageObjects: [{ bucket: "godel-files", name: "pedidos/file.pdf", size: 4, sha256: HASH }],
    capturedObjects: [{ path: "pedidos/file.pdf", size: 4, sha256: HASH }],
  };
}

function configFixture() {
  return {
    schemaVersion: 1,
    supabaseRegion: "us-east-1",
    authSiteUrl: { classification: "ENCRYPTED_INTERNAL_ONLY", value: "https://production.example.test" },
    redirectAllowlist: [],
    signupEnabled: false,
    anonymousEnabled: false,
    bucket: { id: "godel-files", public: false, fileSizeLimit: 1024, allowedMimeTypes: ["application/pdf"] },
    requiredExtensions: ["pgcrypto"],
    realtime: { required: false, publications: [] },
    vercelEnvironmentVariableNames: ["NEXT_PUBLIC_SUPABASE_URL"],
    productionRuntimeSha: "a".repeat(40),
    toolingGitSha: "b".repeat(40),
  };
}

test("Auth inventory requires users, identities, UUID, and password-hash assertions", () => {
  assert.deepEqual(validateAuthInventory(authFixture()), { valid: true, userCount: 2, identityCount: 2 });
  for (const mutate of [
    (value) => { value.tables.users.present = false; },
    (value) => { value.tables.identities.present = false; },
    (value) => { value.assertions.uuidContinuityAvailable = false; },
    (value) => { value.assertions.encryptedPasswordCoverageAvailable = false; },
  ]) {
    const fixture = authFixture();
    mutate(fixture);
    assert.throws(() => validateAuthInventory(fixture));
  }
});

test("Storage durable inventory accepts only committed bytes and excludes transient states", () => {
  const result = validateStorageDurableInventory(storageFixture());
  assert.equal(result.objectCount, 1);
  assert.equal(result.totalBytes, 4);
  assert.equal(result.excludedTransientCount, 3);
  assert.equal(result.boundary.operationalSqlMutation, "FORBIDDEN");
  assert.equal(STORAGE_OBJECTS_BOUNDARY.restoreMechanism, "SUPPORTED_SUPABASE_LOGICAL_METADATA_PLUS_STORAGE_API_OR_S3_BYTES");
});

test("Storage inventory rejects missing relations, metadata, and bytes", () => {
  const missingArchivo = storageFixture();
  missingArchivo.archivos = [];
  assert.throws(() => validateStorageDurableInventory(missingArchivo), /archivos row/);
  const missingMetadata = storageFixture();
  missingMetadata.storageObjects = [];
  assert.throws(() => validateStorageDurableInventory(missingMetadata), /metadata/);
  const missingByte = storageFixture();
  missingByte.capturedObjects = [];
  assert.throws(() => validateStorageDurableInventory(missingByte), /bytes are missing/);
});

test("Storage inventory rejects extra/duplicate paths and wrong bucket or archivo relation", () => {
  const extra = storageFixture();
  extra.capturedObjects.push({ path: "extra.bin", size: 1, sha256: HASH });
  assert.throws(() => validateStorageDurableInventory(extra), /outside the durable set/);
  const duplicate = storageFixture();
  duplicate.capturedObjects.push(structuredClone(duplicate.capturedObjects[0]));
  assert.throws(() => validateStorageDurableInventory(duplicate), /duplicate/);
  const wrongBucket = storageFixture();
  wrongBucket.archivos[0].bucket = "other";
  assert.throws(() => validateStorageDurableInventory(wrongBucket), /wrong bucket/);
  const wrongArchivo = storageFixture();
  wrongArchivo.items[0].archivoId = "not-file-1";
  assert.throws(() => validateStorageDurableInventory(wrongArchivo), /archivos row/);
});

test("Storage inventory rejects path, size, and hash mismatches", () => {
  const pathMismatch = storageFixture();
  pathMismatch.archivos[0].filePath = "pedidos/other.pdf";
  assert.throws(() => validateStorageDurableInventory(pathMismatch), /relation/);
  const sizeMismatch = storageFixture();
  sizeMismatch.capturedObjects[0].size = 5;
  assert.throws(() => validateStorageDurableInventory(sizeMismatch), /sizes/);
  const hashMismatch = storageFixture();
  hashMismatch.capturedObjects[0].sha256 = "b".repeat(64);
  assert.throws(() => validateStorageDurableInventory(hashMismatch), /SHA-256/);
});

test("configuration snapshot accepts names, not secret values", () => {
  assert.equal(validateConfigSnapshot(configFixture()).schemaVersion, 1);
  const secretValue = configFixture();
  secretValue.vercelEnvironmentVariableNames = ["sb_secret_actual_material"];
  assert.throws(() => validateConfigSnapshot(secretValue), /variable name/);
});
