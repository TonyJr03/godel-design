import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { buildRecoveryGitEnvironment } from "./git-environment.mjs";

const REPO_ROOT = "C:\\Recovery Work\\Godel Design";

function hostileEnvironment() {
  return {
    PATH: "C:\\tools",
    PATHEXT: ".EXE;.CMD",
    SystemRoot: "C:\\Windows",
    TEMP: "C:\\Temp",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "safe.directory",
    GIT_CONFIG_VALUE_0: "*",
    GIT_CONFIG_GLOBAL: "C:\\untrusted\\global.config",
    GIT_CONFIG_SYSTEM: "C:\\untrusted\\system.config",
    GIT_CONFIG_NOSYSTEM: "0",
    SUPABASE_ACCESS_TOKEN: "supabase-secret",
    SUPABASE_DB_PASSWORD: "database-secret",
    DATABASE_URL: "postgresql://secret",
    AWS_SECRET_ACCESS_KEY: "aws-secret",
    R2_SECRET_ACCESS_KEY: "r2-secret",
    AGE_SECRET: "age-secret",
  };
}

test("recovery Git environment builds the exact protected command-scoped authority", () => {
  const environment = buildRecoveryGitEnvironment({ sourceEnvironment: hostileEnvironment(), repoRoot: REPO_ROOT });
  assert.equal(environment.GIT_CONFIG_COUNT, "2");
  assert.equal(environment.GIT_CONFIG_KEY_0, "safe.directory");
  assert.equal(environment.GIT_CONFIG_VALUE_0, "");
  assert.equal(environment.GIT_CONFIG_KEY_1, "safe.directory");
  assert.equal(environment.GIT_CONFIG_VALUE_1, resolve(REPO_ROOT));
  assert.equal(environment.GIT_TERMINAL_PROMPT, "0");
  assert.equal(environment.GIT_CONFIG_NOSYSTEM, "1");
  assert.ok(Object.isFrozen(environment));
});

test("ambient Git configuration, wildcards, and secret variables cannot override protected authority", () => {
  const environment = buildRecoveryGitEnvironment({ sourceEnvironment: hostileEnvironment(), repoRoot: REPO_ROOT });
  assert.ok(!Object.values(environment).includes("*"));
  for (const key of ["GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "SUPABASE_ACCESS_TOKEN", "SUPABASE_DB_PASSWORD", "DATABASE_URL", "AWS_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY", "AGE_SECRET"]) {
    assert.ok(!Object.hasOwn(environment, key));
  }
  assert.deepEqual(Object.keys(environment).filter((key) => key.startsWith("GIT_CONFIG_")), [
    "GIT_CONFIG_NOSYSTEM",
    "GIT_CONFIG_COUNT",
    "GIT_CONFIG_KEY_0",
    "GIT_CONFIG_VALUE_0",
    "GIT_CONFIG_KEY_1",
    "GIT_CONFIG_VALUE_1",
  ]);
});

test("repoRoot fails closed and a Windows-shaped path with spaces remains one normalized value", () => {
  for (const repoRoot of [undefined, null, "", "   ", "bad\0root", 42]) {
    assert.throws(() => buildRecoveryGitEnvironment({ sourceEnvironment: {}, repoRoot }), { code: "RECOVERY_GIT_REPOSITORY_INVALID" });
  }
  const environment = buildRecoveryGitEnvironment({ sourceEnvironment: {}, repoRoot: REPO_ROOT });
  assert.equal(environment.GIT_CONFIG_VALUE_1, resolve(REPO_ROOT));
  assert.ok(environment.GIT_CONFIG_VALUE_1.includes(" "));
});
