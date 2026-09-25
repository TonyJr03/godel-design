import assert from "node:assert/strict";
import test from "node:test";

import { buildRuntimeGitPlans, loadProductionRuntimeAuthority, MANAGED_BASELINE_MIGRATIONS } from "./runtime-authority.mjs";

const SHA = "c".repeat(40);

function executor({ names = MANAGED_BASELINE_MIGRATIONS, missingCommit = false } = {}) {
  const calls = [];
  const execute = async (plan) => {
    calls.push(plan);
    if (plan.args[0] === "cat-file" && missingCommit) throw new Error("missing");
    if (plan.args[0] === "ls-tree") return { stdout: `${names.join("\0")}\0` };
    if (plan.args[0] === "show" && plan.args[1].endsWith("config.toml")) return { stdout: "project_id = \"runtime\"\n" };
    if (plan.args[0] === "show") return { stdout: `-- exact ${plan.args[1]}\n` };
    return { stdout: "" };
  };
  return { execute, calls };
}

test("runtime authority reads exact config and six migrations from a valid commit without worktree mutation", async () => {
  const fake = executor();
  const result = await loadProductionRuntimeAuthority({ runtimeSha: SHA, repoRoot: "C:\\repo", execute: fake.execute, environment: {} });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.evidence.migrationCount, 6);
  assert.equal(result.evidence.digests.length, 6);
  assert.ok(!JSON.stringify(result).includes("exact supabase/migrations"));
  assert.ok(fake.calls.every((plan) => ["cat-file", "ls-tree", "show"].includes(plan.args[0])));
  assert.ok(fake.calls.every((plan) => !plan.args.some((arg) => ["checkout", "reset", "switch", "fetch"].includes(arg))));
});

test("runtime authority rejects an unavailable commit", async () => {
  await assert.rejects(loadProductionRuntimeAuthority({ runtimeSha: SHA, repoRoot: "C:\\repo", execute: executor({ missingCommit: true }).execute }), { code: "RECOVERY_RUNTIME_COMMIT_UNAVAILABLE" });
});

for (const [label, names] of [
  ["missing", MANAGED_BASELINE_MIGRATIONS.slice(0, 5)],
  ["extra", [...MANAGED_BASELINE_MIGRATIONS, "20260811131830_07_extra.sql"]],
  ["unexpected", [...MANAGED_BASELINE_MIGRATIONS.slice(0, 5), "20260811131829_wrong.sql"]],
]) test(`runtime authority rejects ${label} baseline migration`, async () => {
  await assert.rejects(loadProductionRuntimeAuthority({ runtimeSha: SHA, repoRoot: "C:\\repo", execute: executor({ names }).execute }), { code: "RECOVERY_RUNTIME_BASELINE_MISMATCH" });
});

test("runtime Git plans reject invalid SHAs and expose only read-only commands", () => {
  assert.throws(() => buildRuntimeGitPlans({ runtimeSha: "A".repeat(40), repoRoot: "C:\\repo" }), { code: "RECOVERY_RUNTIME_SHA_INVALID" });
  const plans = buildRuntimeGitPlans({ runtimeSha: SHA, repoRoot: "C:\\repo", environment: {} });
  assert.deepEqual(plans.verifyCommit.args, ["cat-file", "-e", `${SHA}^{commit}`]);
  assert.deepEqual(plans.listMigrations.args.slice(0, 3), ["ls-tree", "-z", "--name-only"]);
});
