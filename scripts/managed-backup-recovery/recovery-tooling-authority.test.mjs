import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { assertRecoveryToolingAuthority, resolveRecoveryToolingAuthority } from "./recovery-tooling-authority.mjs";

const HEAD = "a".repeat(40);

test("shared recovery tooling authority uses exact protected Git environment", async () => {
  const calls = [];
  const repoRoot = process.cwd();
  const execute = async (plan) => {
    calls.push(plan);
    if (plan.args[0] === "branch") return { stdout: "ops/managed-free-production-pilot\n" };
    if (plan.args[0] === "rev-parse") return { stdout: `${HEAD}\n` };
    return { stdout: "" };
  };
  const authority = await resolveRecoveryToolingAuthority({ repoRoot, environment: { PATH: "tools", GIT_CONFIG_VALUE_0: "*", R2_SECRET_ACCESS_KEY: "secret" }, execute });
  assert.equal(assertRecoveryToolingAuthority({ authority, expectedBranch: "ops/managed-free-production-pilot", expectedHead: HEAD }).clean, true);
  for (const call of calls) assert.deepEqual(call.allowedEnvironment, {
    PATH: "tools", GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: "", GIT_CONFIG_KEY_1: "safe.directory", GIT_CONFIG_VALUE_1: resolve(repoRoot),
  });
});

test("shared recovery tooling authority rejects branch, HEAD, and dirty drift", () => {
  assert.throws(() => assertRecoveryToolingAuthority({ authority: { branch: "wrong", head: HEAD, clean: true }, expectedBranch: "expected", expectedHead: HEAD }), { code: "WRONG_TOOLING_BRANCH" });
  assert.throws(() => assertRecoveryToolingAuthority({ authority: { branch: "expected", head: "b".repeat(40), clean: true }, expectedBranch: "expected", expectedHead: HEAD }), { code: "WRONG_TOOLING_HEAD" });
  assert.throws(() => assertRecoveryToolingAuthority({ authority: { branch: "expected", head: HEAD, clean: false }, expectedBranch: "expected", expectedHead: HEAD }), { code: "DIRTY_TOOLING_WORKTREE" });
});
