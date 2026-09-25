import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { verifyManagedBundleTree } from "./bundle-verifier.mjs";
import { TEST_BACKUP_ID, createValidBundleFixture, validReceipt } from "./test-helpers.mjs";

test("managed bundle exact-tree verifier accepts the real empty Storage contract", async () => {
  const fixture = await createValidBundleFixture();
  const result = await verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.storageObjectCount, 0);
  assert.equal(result.storageTotalBytes, 0);
  assert.equal(result.authorityAgreement, true);
});

test("managed bundle exact-tree verifier accepts governed nonempty Storage bytes", async () => {
  const fixture = await createValidBundleFixture({ nonemptyStorage: true });
  const result = await verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID });
  assert.equal(result.storageObjectCount, 1);
  assert.equal(result.storageTotalBytes, fixture.storageBytes.length);
});

test("managed bundle rejects a missing artifact", async () => {
  const fixture = await createValidBundleFixture();
  await rm(join(fixture.root, "database", "roles.sql"));
  await assert.rejects(verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID }));
});

test("managed bundle rejects an extra file or directory", async () => {
  const fixture = await createValidBundleFixture();
  await mkdir(join(fixture.root, "unexpected"));
  await writeFile(join(fixture.root, "unexpected", "artifact.bin"), "extra");
  await assert.rejects(
    verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID }),
    (error) => error.code === "RECOVERY_BUNDLE_EXACT_TREE_MISMATCH",
  );
});

test("managed bundle rejects checksum tampering", async () => {
  const fixture = await createValidBundleFixture();
  await writeFile(join(fixture.root, "database", "roles.sql"), "-- tampered roles\n");
  await assert.rejects(
    verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID }),
    (error) => error.code === "RECOVERY_ARTIFACT_DIGEST_MISMATCH",
  );
});

test("managed bundle rejects manifest/checksum set disagreement", async () => {
  const fixture = await createValidBundleFixture();
  const pathname = join(fixture.root, "inventory", "checksums.sha256");
  const lines = (await readFile(pathname, "utf8")).trimEnd().split("\n");
  await writeFile(pathname, `${lines.slice(1).join("\n")}\n`);
  await assert.rejects(
    verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID }),
    (error) => error.code === "RECOVERY_MANIFEST_CHECKSUM_MISMATCH",
  );
});

test("managed bundle rejects authority disagreement", async () => {
  const fixture = await createValidBundleFixture();
  const receipt = validReceipt({ productionRuntimeSha: "c".repeat(40) });
  await assert.rejects(
    verifyManagedBundleTree({ root: fixture.root, receipt, selectedBackupId: TEST_BACKUP_ID }),
    (error) => error.code === "RECOVERY_AUTHORITY_MISMATCH",
  );
});

test("managed bundle rejects invalid writer-freeze chronology", async () => {
  const fixture = await createValidBundleFixture();
  const pathname = join(fixture.root, "operations", "writer-freeze.json");
  const freeze = JSON.parse(await readFile(pathname, "utf8"));
  freeze.dbCapture.startedAt = "2026-09-25T11:59:59.000Z";
  await writeFile(pathname, JSON.stringify(freeze));
  await assert.rejects(
    verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID }),
    (error) => error.code === "WRITER_FREEZE_RECORD_INVALID",
  );
});

test("managed bundle rejects missing, extra, and mismatched Storage bytes", async (t) => {
  await t.test("missing", async () => {
    const fixture = await createValidBundleFixture({ nonemptyStorage: true });
    await rm(join(fixture.root, "storage", "orders", "file.pdf"));
    await assert.rejects(verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID }));
  });
  await t.test("extra", async () => {
    const fixture = await createValidBundleFixture();
    await writeFile(join(fixture.root, "storage", "extra.bin"), "extra");
    await assert.rejects(verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID }));
  });
  await t.test("size or SHA mismatch", async () => {
    const fixture = await createValidBundleFixture({ nonemptyStorage: true });
    await writeFile(join(fixture.root, "storage", "orders", "file.pdf"), "xxxx");
    await assert.rejects(verifyManagedBundleTree({ root: fixture.root, receipt: fixture.receipt, selectedBackupId: TEST_BACKUP_ID }));
  });
});
