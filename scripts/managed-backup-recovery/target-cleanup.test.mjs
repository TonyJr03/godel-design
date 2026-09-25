import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { cleanupManagedRecoveryTarget } from "./target-cleanup.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "godel-target-cleanup-"));
  const targetPath = join(root, "target");
  await mkdir(join(targetPath, "supabase"), { recursive: true });
  await writeFile(join(targetPath, "supabase", "config.toml"), "fixture");
  return { root, session: { target: targetPath }, target: { workdir: targetPath, projectId: "godel-m53-restore-abcdef123456" } };
}

test("cleanup stops and removes only exact target-owned resources and contents", async () => {
  const item = await fixture();
  const calls = [];
  try {
    const result = await cleanupManagedRecoveryTarget({ session: item.session, target: item.target, adapter: {
      stop: async (input) => calls.push(["stop", input]), listOwnedResources: async (input) => { calls.push(["list", input]); return []; },
    } });
    assert.equal(result.status, "PASS");
    assert.equal(result.foreignResourcesTouched, 0);
    assert.deepEqual(await readdir(item.session.target), []);
    assert.equal(calls[0][1].projectId, item.target.projectId);
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("cleanup failure and owned residue are visible", async () => {
  const item = await fixture();
  try {
    await assert.rejects(cleanupManagedRecoveryTarget({ session: item.session, target: item.target, adapter: { stop: async () => undefined, listOwnedResources: async () => ["owned-volume"] } }), { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" });
    await assert.rejects(cleanupManagedRecoveryTarget({ session: item.session, target: item.target, adapter: { stop: async () => { throw new Error("failed"); }, listOwnedResources: async () => [] } }), { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("cleanup refuses a foreign workdir and never invokes adapter", async () => {
  const item = await fixture();
  let invoked = false;
  try {
    await assert.rejects(cleanupManagedRecoveryTarget({ session: item.session, target: { ...item.target, workdir: join(item.root, "foreign") }, adapter: { stop: async () => { invoked = true; }, listOwnedResources: async () => [] } }), { code: "RECOVERY_TARGET_CLEANUP_INVALID" });
    assert.equal(invoked, false);
  } finally { await rm(item.root, { recursive: true, force: true }); }
});
