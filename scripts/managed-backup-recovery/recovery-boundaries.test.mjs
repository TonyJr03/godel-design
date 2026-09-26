import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { admitRecoveryIdentity } from "./recovery-contract.mjs";
import { accessRealRecoveryBoundaries, admitRealRecoveryBoundaries, RECOVERY_BACKUP_OUTPUT_ROOT_ENV, RECOVERY_PARENT_ENV } from "./recovery-boundaries.mjs";

async function layout() {
  const root = await mkdtemp(join(tmpdir(), "godel-recovery-boundaries-"));
  const repo = join(root, "repo");
  const parent = join(root, "recovery-parent");
  const backup = join(root, "backup-output");
  await Promise.all([mkdir(repo), mkdir(parent), mkdir(backup)]);
  return { root, repo, parent, backup };
}

function environment(parent, backup) {
  return { [RECOVERY_PARENT_ENV]: parent, [RECOVERY_BACKUP_OUTPUT_ROOT_ENV]: backup };
}

test("operator recovery boundaries are explicit, absolute, existing, real, and opaque", async () => {
  const item = await layout();
  try {
    for (const [env, code] of [
      [{ [RECOVERY_BACKUP_OUTPUT_ROOT_ENV]: item.backup }, "RECOVERY_PARENT_REQUIRED"],
      [{ ...environment("relative-parent", item.backup) }, "RECOVERY_PARENT_PATH_INVALID"],
      [{ [RECOVERY_PARENT_ENV]: item.parent }, "RECOVERY_BACKUP_OUTPUT_ROOT_REQUIRED"],
      [environment(item.parent, "relative-backup"), "RECOVERY_BACKUP_OUTPUT_ROOT_PATH_INVALID"],
      [environment(item.parent, join(item.root, "missing")), "RECOVERY_BACKUP_OUTPUT_ROOT_UNSAFE"],
    ]) await assert.rejects(admitRealRecoveryBoundaries({ environment: env, repoRoot: item.repo }), { code });
    const handle = await admitRealRecoveryBoundaries({ environment: environment(item.parent, item.backup), repoRoot: item.repo });
    assert.deepEqual(JSON.parse(JSON.stringify(handle)), { status: "ADMITTED" });
    accessRealRecoveryBoundaries(handle, (value) => assert.deepEqual(value, { parent: item.parent, backupOutputRoot: item.backup }));
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("recovery parent cannot overlap the repository, backup output, or governed roots", async () => {
  const item = await layout();
  try {
    const governed = join(item.root, "governed");
    await mkdir(governed);
    for (const parent of [item.repo, join(item.repo, "child"), item.backup, governed]) {
      if (parent.endsWith("child")) await mkdir(parent);
      await assert.rejects(admitRealRecoveryBoundaries({ environment: environment(parent, item.backup), repoRoot: item.repo, governedRoots: [governed] }), { code: "RECOVERY_PARENT_UNSAFE" });
    }
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("backup output symlinks or unexpected resolution fail closed", async (t) => {
  const item = await layout();
  try {
    const link = join(item.root, "backup-link");
    try { await symlink(item.backup, link, "junction"); } catch (error) { t.skip(`symlink unavailable: ${error.code}`); return; }
    await assert.rejects(admitRealRecoveryBoundaries({ environment: environment(item.parent, link), repoRoot: item.repo }), { code: "RECOVERY_BACKUP_OUTPUT_ROOT_UNSAFE" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});

test("recovery identity inside the admitted real backup output remains forbidden", async () => {
  const item = await layout();
  try {
    const identity = join(item.backup, "identity.txt");
    await writeFile(identity, "AGE-SECRET-KEY-synthetic\n", "utf8");
    const handle = await admitRealRecoveryBoundaries({ environment: environment(item.parent, item.backup), repoRoot: item.repo });
    let boundaries;
    accessRealRecoveryBoundaries(handle, (value) => { boundaries = value; });
    await assert.rejects(admitRecoveryIdentity({ environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: identity }, repoRoot: item.repo, backupOutputRoot: boundaries.backupOutputRoot, session: { parent: boundaries.parent } }), { code: "RECOVERY_IDENTITY_LOCATION_FORBIDDEN" });
  } finally { await rm(item.root, { recursive: true, force: true }); }
});
