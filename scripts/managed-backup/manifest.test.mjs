import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  completeManifest,
  createIncompleteManifest,
  createManagedBackupId,
  validateManagedBackupManifest,
  writeManifestAtomic,
} from "./manifest.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function manifest() {
  return createIncompleteManifest({
    backupId: "GDBK-20260922T120000Z-AAAAAAAA",
    createdAt: new Date("2026-09-22T12:00:00.000Z"),
    toolingGitSha: SHA_A,
    toolingGitBranch: "ops/managed-free-production-pilot",
    productionRuntimeSha: SHA_B,
  });
}

test("manifest v1 accepts a strict INCOMPLETE document", () => {
  assert.equal(validateManagedBackupManifest(manifest()).status, "INCOMPLETE");
});

test("manifest rejects unexpected and secret-like fields", () => {
  assert.throws(() => validateManagedBackupManifest({ ...manifest(), surprise: true }), /unexpected|sensitive/i);
  assert.throws(() => validateManagedBackupManifest({ ...manifest(), password: "do-not-store" }), /unexpected|sensitive/i);
});

test("COMPLETE cannot be forged without every prior gate and ciphertext proof", () => {
  assert.throws(() => completeManifest(manifest(), { ciphertextVerified: true }), /artifactsExist/);
  const ready = structuredClone(manifest());
  Object.assign(ready.gates, {
    artifactsExist: true,
    checksumsVerified: true,
    inventoryValid: true,
    crossValidationPassed: true,
  });
  assert.throws(() => completeManifest(ready), /ciphertext verification/);
  assert.equal(completeManifest(ready, { ciphertextVerified: true }).status, "COMPLETE");
});

test("backup IDs have the non-sensitive format and trivial random variation", () => {
  const first = createManagedBackupId({ now: new Date("2026-09-22T12:00:00Z"), random: () => Buffer.from([0, 0, 0, 0, 0]) });
  const second = createManagedBackupId({ now: new Date("2026-09-22T12:00:00Z"), random: () => Buffer.from([0, 0, 0, 0, 1]) });
  assert.match(first, /^GDBK-20260922T120000Z-[A-Z2-7]{8}$/);
  assert.notEqual(first, second);
});

test("atomic manifest writer overwrites via same-directory temporary file", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-manifest-"));
  await writeManifestAtomic(manifest(), { root });
  const changed = structuredClone(manifest());
  changed.createdAt = "2026-09-22T12:00:01.000Z";
  await writeManifestAtomic(changed, { root });
  assert.equal(JSON.parse(await readFile(join(root, "internal-manifest.json"), "utf8")).createdAt, changed.createdAt);
  assert.deepEqual(await readdir(root), ["internal-manifest.json"]);
});
