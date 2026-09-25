import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createR2RecoverySourceAdapter } from "./r2-recovery-source.mjs";
import { TEST_BACKUP_ID, validReceipt } from "./test-helpers.mjs";

const ciphertext = Buffer.from("synthetic ciphertext");

function environment() {
  return {
    PATH: process.env.PATH ?? "",
    GODEL_BACKUP_R2_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com",
    GODEL_BACKUP_R2_BUCKET: "godel-backups",
    GODEL_BACKUP_R2_ACCESS_KEY_ID: "synthetic-access-key",
    GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "synthetic-secret-key",
  };
}

function fakeReadOnlyRclone(receipt = validReceipt({ ciphertext })) {
  const calls = [];
  return {
    calls,
    execute: async (plan) => {
      calls.push(plan);
      if (plan.args[0] === "lsjson") {
        return {
          stdout: JSON.stringify([
            { Path: `${TEST_BACKUP_ID}.age`, Name: `${TEST_BACKUP_ID}.age`, IsDir: false },
            { Path: `${TEST_BACKUP_ID}.external-receipt.json`, Name: `${TEST_BACKUP_ID}.external-receipt.json`, IsDir: false },
          ]),
          stderr: "",
        };
      }
      assert.equal(plan.args[0], "copyto");
      assert.match(plan.args[1], new RegExp(`^godelr2:godel-backups/production/${TEST_BACKUP_ID}/`));
      await writeFile(plan.args[2], plan.args[1].endsWith(".json") ? JSON.stringify(receipt) : ciphertext);
      return { stdout: "", stderr: "" };
    },
  };
}

test("R2 recovery adapter is read-only by construction and uses exact candidate keys", async () => {
  const downloadDirectory = await mkdtemp(join(tmpdir(), "godel-r2-recovery-"));
  const remote = fakeReadOnlyRclone();
  const adapter = createR2RecoverySourceAdapter({
    backupId: TEST_BACKUP_ID,
    downloadDirectory,
    environment: environment(),
    execute: remote.execute,
  });
  assert.deepEqual(Object.keys(adapter), ["inspectCandidate", "downloadReceipt", "downloadCiphertext"]);
  for (const name of ["upload", "publish", "delete", "move", "purge", "sync", "copyToRemote"]) assert.equal(name in adapter, false);
  assert.deepEqual(await adapter.inspectCandidate(), { status: "VERIFIED", objectCount: 2 });
  const downloaded = await adapter.downloadReceipt();
  const cipherPath = await adapter.downloadCiphertext({ receipt: downloaded.receipt });
  assert.deepEqual(await readFile(cipherPath), ciphertext);
  assert.deepEqual(remote.calls.map((call) => call.args[0]), ["lsjson", "copyto", "copyto"]);
  for (const call of remote.calls) {
    assert.ok(!call.args.join(" ").includes(environment().GODEL_BACKUP_R2_ACCESS_KEY_ID));
    assert.ok(!call.args.join(" ").includes(environment().GODEL_BACKUP_R2_SECRET_ACCESS_KEY));
  }
});

test("R2 recovery candidate inspection requires exactly its two deterministic objects", async () => {
  const downloadDirectory = await mkdtemp(join(tmpdir(), "godel-r2-recovery-list-"));
  for (const listing of [
    [],
    [{ Path: `${TEST_BACKUP_ID}.age`, Name: `${TEST_BACKUP_ID}.age`, IsDir: false }],
    [
      { Path: `${TEST_BACKUP_ID}.age`, Name: `${TEST_BACKUP_ID}.age`, IsDir: false },
      { Path: "unexpected.json", Name: "unexpected.json", IsDir: false },
    ],
  ]) {
    const adapter = createR2RecoverySourceAdapter({
      backupId: TEST_BACKUP_ID,
      downloadDirectory,
      environment: environment(),
      execute: async () => ({ stdout: JSON.stringify(listing), stderr: "" }),
    });
    await assert.rejects(adapter.inspectCandidate());
  }
});

test("R2 recovery adapter rejects arbitrary candidate identity before any command", () => {
  let calls = 0;
  assert.throws(
    () => createR2RecoverySourceAdapter({ backupId: "../arbitrary", downloadDirectory: "C:/tmp", environment: environment(), execute: async () => { calls += 1; } }),
    (error) => error.code === "RECOVERY_BACKUP_ID_INVALID",
  );
  assert.equal(calls, 0);
});

test("R2 recovery downloads never replace an existing exact local artifact", async () => {
  const downloadDirectory = await mkdtemp(join(tmpdir(), "godel-r2-recovery-existing-"));
  await writeFile(join(downloadDirectory, `${TEST_BACKUP_ID}.external-receipt.json`), "preserve");
  const remote = fakeReadOnlyRclone();
  const adapter = createR2RecoverySourceAdapter({ backupId: TEST_BACKUP_ID, downloadDirectory, environment: environment(), execute: remote.execute });
  await assert.rejects(adapter.downloadReceipt(), (error) => error.code === "RECOVERY_DOWNLOAD_EXISTS");
  assert.equal(remote.calls.length, 0);
  assert.equal(await readFile(join(downloadDirectory, `${TEST_BACKUP_ID}.external-receipt.json`), "utf8"), "preserve");
});
