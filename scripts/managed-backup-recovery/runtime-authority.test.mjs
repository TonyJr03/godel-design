import assert from "node:assert/strict";
import { resolve } from "node:path";
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
  const repoRoot = "C:\\Recovery Work\\Godel Design";
  const result = await loadProductionRuntimeAuthority({
    runtimeSha: SHA,
    repoRoot,
    execute: fake.execute,
    environment: {
      PATH: "C:\\tools",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "safe.directory",
      GIT_CONFIG_VALUE_0: "*",
      GIT_CONFIG_GLOBAL: "C:\\untrusted\\global.config",
      DATABASE_URL: "postgresql://secret",
    },
  });
  assert.equal(result.status, "VERIFIED");
  assert.equal(result.evidence.migrationCount, 6);
  assert.equal(result.evidence.digests.length, 6);
  assert.ok(!JSON.stringify(result).includes("exact supabase/migrations"));
  assert.ok(fake.calls.every((plan) => ["cat-file", "ls-tree", "show"].includes(plan.args[0])));
  assert.ok(fake.calls.every((plan) => !plan.args.some((arg) => ["checkout", "reset", "switch", "fetch"].includes(arg))));
  const expectedGitEnvironment = {
    PATH: "C:\\tools",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "safe.directory",
    GIT_CONFIG_VALUE_0: "",
    GIT_CONFIG_KEY_1: "safe.directory",
    GIT_CONFIG_VALUE_1: resolve(repoRoot),
  };
  assert.equal(fake.calls.length, 9);
  for (const plan of fake.calls) {
    assert.deepEqual(plan.allowedEnvironment, expectedGitEnvironment);
    assert.ok(Object.isFrozen(plan.allowedEnvironment));
    assert.ok(!plan.args.includes(resolve(repoRoot)));
  }
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
