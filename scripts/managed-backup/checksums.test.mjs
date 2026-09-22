import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createChecksumInventory,
  sha256File,
  verifyChecksumInventory,
} from "./checksums.mjs";
import {
  cleanupPlaintextStaging,
  ensureSafeOutputRoot,
  resolveContainedPath,
} from "./safety.mjs";

test("SHA-256 streams deterministically and inventory ordering is normalized", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-checksum-"));
  await mkdir(join(root, "x"));
  await writeFile(join(root, "x", "a.txt"), "alpha");
  await writeFile(join(root, "b.txt"), "beta");
  const entries = await createChecksumInventory({ root, paths: ["x/a.txt", "b.txt"] });
  assert.deepEqual(entries.map((entry) => entry.path), ["b.txt", "x/a.txt"]);
  assert.deepEqual(await sha256File(join(root, "b.txt")), await sha256File(join(root, "b.txt")));
  assert.deepEqual(await verifyChecksumInventory({ root, entries }), { verified: true, count: 2 });
});

test("checksum verification rejects changed, missing, duplicate, and unsafe artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-checksum-negative-"));
  await writeFile(join(root, "a.txt"), "before");
  const entries = await createChecksumInventory({ root, paths: ["a.txt"] });
  await writeFile(join(root, "a.txt"), "after");
  await assert.rejects(verifyChecksumInventory({ root, entries }), /failed/);
  await rm(join(root, "a.txt"));
  await assert.rejects(verifyChecksumInventory({ root, entries }), /missing/);
  await assert.rejects(createChecksumInventory({ root, paths: ["x", "x"] }), /duplicate/);
  assert.throws(() => resolveContainedPath(root, "../escape"), /traversal|safe portable/);
});

test("output path requires an explicit directory outside the repository", async () => {
  const repoRoot = resolve(process.cwd());
  await assert.rejects(ensureSafeOutputRoot(join(repoRoot, "backups"), { repoRoot }), /outside|inside the repository/);
  const safe = await mkdtemp(join(tmpdir(), "godel-output-"));
  assert.equal(await ensureSafeOutputRoot(safe, { repoRoot }), await ensureSafeOutputRoot(safe, { repoRoot }));
});

test("plaintext cleanup is contained to a direct managed staging directory", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-cleanup-"));
  const stagingPath = join(outputRoot, ".staging-GDBK-20260922T120000Z-AAAAAAAA");
  await mkdir(stagingPath);
  assert.equal(await cleanupPlaintextStaging({ outputRoot, stagingPath }), true);
  await assert.rejects(cleanupPlaintextStaging({ outputRoot, stagingPath: outputRoot }), /direct managed-backup/);
});
