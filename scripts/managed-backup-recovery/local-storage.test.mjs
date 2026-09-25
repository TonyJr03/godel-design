import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { accessLocalStorageCommandPlan, buildLocalStorageInventoryPlan, buildLocalStorageTransferPlans, parseLocalStorageInventory } from "./local-storage.mjs";
import { authorizeStorageByteRestore, buildStorageByteRestorePlan } from "./restore-planning.mjs";
import { deriveStorageExpectation } from "./restore-validation.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

function status() {
  return admitLocalSupabaseStatus(JSON.stringify({
    API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:db-secret@127.0.0.1:54322/postgres",
    ANON_KEY: "anon-secret", SERVICE_ROLE_KEY: "role-secret", STORAGE_S3_URL: "http://127.0.0.1:54321/storage/v1/s3",
    S3_PROTOCOL_ACCESS_KEY_ID: "access-secret", S3_PROTOCOL_ACCESS_KEY_SECRET: "key-secret", S3_PROTOCOL_REGION: "local",
  }));
}

test("empty Storage remains a validated no-op and final inventory proves zero bytes", () => {
  const inventory = { valid: true, objectCount: 0, totalBytes: 0, objects: [] };
  const pending = buildStorageByteRestorePlan({ storageInventory: inventory, bundleRoot: "C:\\bundle" });
  const authorized = authorizeStorageByteRestore(pending, { status: "PASS", bucket: "godel-files", public: false, objectCount: 0 });
  const transfer = buildLocalStorageTransferPlans({ authorizedStorageByteRestore: authorized, localStatus: status(), cwd: process.cwd(), environment: {} });
  assert.deepEqual(transfer, { status: "VALIDATED_NO_OP", invokeTransfer: false, objectCount: 0, plans: [] });
  const expectation = deriveStorageExpectation(inventory);
  assert.deepEqual(parseLocalStorageInventory({ rawOutput: "[]", storageExpectation: expectation }), { objectCount: 0, totalBytes: 0, inventoryDigest: expectation.inventoryDigest, unexpectedObjectCount: 0 });
});

test("nonempty local S3 plans use exact paths, local-only endpoint, and environment-only secrets", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-local-storage-"));
  try {
    const object = { path: "orders/a.pdf", size: 4, sha256: "a".repeat(64) };
    const inventory = { valid: true, objectCount: 1, totalBytes: 4, objects: [object] };
    const pending = buildStorageByteRestorePlan({ storageInventory: inventory, bundleRoot: root });
    const authorized = authorizeStorageByteRestore(pending, { status: "PASS", bucket: "godel-files", public: false, objectCount: 1 });
    const transfer = buildLocalStorageTransferPlans({ authorizedStorageByteRestore: authorized, localStatus: status(), cwd: root, environment: {} });
    assert.equal(transfer.invokeTransfer, true);
    accessLocalStorageCommandPlan(transfer.plans[0], (plan) => {
      assert.deepEqual(plan.args.slice(0, 3), ["copyto", join(root, "storage", "orders", "a.pdf"), "GODELM53LOCAL:godel-files/orders/a.pdf"]);
      assert.ok(!plan.args.join(" ").includes("secret"));
      assert.match(plan.allowedEnvironment.RCLONE_CONFIG_GODELM53LOCAL_ENDPOINT, /^http:\/\/(?:127\.0\.0\.1|localhost)/);
      assert.equal(plan.allowedEnvironment.RCLONE_CONFIG_GODELM53LOCAL_SECRET_ACCESS_KEY, "key-secret");
      assert.doesNotMatch(JSON.stringify(transfer.plans[0]), /key-secret|http:\/\//);
    });
    const listing = buildLocalStorageInventoryPlan({ localStatus: status(), cwd: root, environment: {} });
    accessLocalStorageCommandPlan(listing, (plan) => {
      assert.deepEqual(plan.args, ["lsjson", "GODELM53LOCAL:godel-files", "--recursive", "--files-only", "--hash"]);
      assert.ok(!plan.args.join(" ").includes("secret"));
      assert.doesNotMatch(plan.args.join(" "), /production|r2|cloudflare/i);
    });
    const expectation = deriveStorageExpectation(inventory);
    const raw = JSON.stringify([{ Path: object.path, Name: "a.pdf", Size: 4, IsDir: false, Hashes: { "SHA-256": object.sha256 } }]);
    assert.deepEqual(parseLocalStorageInventory({ rawOutput: raw, storageExpectation: expectation }), { objectCount: 1, totalBytes: 4, inventoryDigest: expectation.inventoryDigest, unexpectedObjectCount: 0 });
    const unexpected = JSON.stringify([{ Path: "unexpected.pdf", Name: "unexpected.pdf", Size: 4, IsDir: false, Hashes: { "SHA-256": object.sha256 } }]);
    assert.equal(parseLocalStorageInventory({ rawOutput: unexpected, storageExpectation: expectation }).unexpectedObjectCount, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
