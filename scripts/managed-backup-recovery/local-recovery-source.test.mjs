import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createLocalRecoverySourceAdapter } from "./local-recovery-source.mjs";
import { TEST_BACKUP_ID, validReceipt } from "./test-helpers.mjs";

const ciphertext = Buffer.from("synthetic local ciphertext");

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "godel-local-recovery-source-"));
  const custody = join(root, "custody");
  const download = join(root, "download");
  await Promise.all([mkdir(custody), mkdir(download)]);
  const receipt = validReceipt({ ciphertext });
  await writeFile(join(custody, `${TEST_BACKUP_ID}.age`), ciphertext);
  await writeFile(join(custody, `${TEST_BACKUP_ID}.external-receipt.json`), JSON.stringify(receipt));
  return { root, custody, download, receipt };
}

test("local recovery source copies exact artifacts read-only through the recovery source contract", async () => {
  const item = await fixture();
  try {
    const adapter = createLocalRecoverySourceAdapter({ backupId: TEST_BACKUP_ID, backupOutputRoot: item.custody, downloadDirectory: item.download });
    assert.deepEqual(Object.keys(adapter), ["inspectCandidate", "downloadReceipt", "downloadCiphertext"]);
    for (const name of ["upload", "publish", "delete", "move", "sync"]) assert.equal(name in adapter, false);
    assert.deepEqual(await adapter.inspectCandidate(), { status: "VERIFIED", objectCount: 2 });
    const downloaded = await adapter.downloadReceipt();
    const cipherPath = await adapter.downloadCiphertext({ receipt: downloaded.receipt });
    assert.deepEqual(await readFile(cipherPath), ciphertext);
    assert.deepEqual(await readFile(join(item.custody, `${TEST_BACKUP_ID}.age`)), ciphertext);
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("local recovery source requires both regular exact artifacts and never replaces downloads", async () => {
  const item = await fixture();
  try {
    const receiptPath = join(item.custody, `${TEST_BACKUP_ID}.external-receipt.json`);
    await rm(receiptPath);
    let adapter = createLocalRecoverySourceAdapter({ backupId: TEST_BACKUP_ID, backupOutputRoot: item.custody, downloadDirectory: item.download });
    await assert.rejects(adapter.inspectCandidate(), { code: "RECOVERY_LOCAL_SOURCE_ARTIFACT_INVALID" });
    await writeFile(receiptPath, JSON.stringify(item.receipt));
    await writeFile(join(item.download, `${TEST_BACKUP_ID}.external-receipt.json`), "preserve");
    adapter = createLocalRecoverySourceAdapter({ backupId: TEST_BACKUP_ID, backupOutputRoot: item.custody, downloadDirectory: item.download });
    await assert.rejects(adapter.downloadReceipt(), { code: "RECOVERY_DOWNLOAD_EXISTS" });
    assert.equal(await readFile(join(item.download, `${TEST_BACKUP_ID}.external-receipt.json`), "utf8"), "preserve");
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("local recovery source rejects symlinked custody artifacts", async (t) => {
  const item = await fixture();
  try {
    const source = join(item.custody, `${TEST_BACKUP_ID}.age`);
    const external = join(item.root, "external.age");
    await writeFile(external, ciphertext);
    await rm(source);
    try { await symlink(external, source, "file"); } catch (error) { t.skip(`symlink unavailable: ${error.code}`); return; }
    const adapter = createLocalRecoverySourceAdapter({ backupId: TEST_BACKUP_ID, backupOutputRoot: item.custody, downloadDirectory: item.download });
    await assert.rejects(adapter.inspectCandidate(), { code: "RECOVERY_LOCAL_SOURCE_ARTIFACT_INVALID" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});
