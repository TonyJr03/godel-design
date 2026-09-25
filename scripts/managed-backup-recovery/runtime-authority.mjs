import { createHash } from "node:crypto";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { buildRecoveryGitEnvironment } from "./git-environment.mjs";

export const MANAGED_BASELINE_MIGRATIONS = Object.freeze([
  "20260811131824_01_core_schema.sql",
  "20260811131825_02_security_rls_grants.sql",
  "20260811131826_03_business_rpcs.sql",
  "20260811131827_04_storage.sql",
  "20260811131828_05_auth_admin_user_lifecycle.sql",
  "20260811131829_06_final_hardening.sql",
]);

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const MAX_GIT_OBJECT_BYTES = 8 * 1024 * 1024;
const runtimeContents = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryRuntimeAuthorityError";
  error.code = code;
  throw error;
}

function exactList(source) {
  return source.split("\0").filter(Boolean).sort((left, right) => left.localeCompare(right, "en"));
}

function digest(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function gitPlan({ operation, args, repoRoot, environmentSource, preserveOutput = false }) {
  return Object.freeze({
    operation,
    executable: "git",
    args: Object.freeze(args),
    cwd: repoRoot,
    allowedEnvironment: buildRecoveryGitEnvironment({ sourceEnvironment: environmentSource, repoRoot }),
    preserveOutput,
    maxOutputBytes: MAX_GIT_OBJECT_BYTES,
  });
}

export function assertProductionRuntimeSha(value) {
  if (typeof value !== "string" || !SHA_PATTERN.test(value)) fail("RECOVERY_RUNTIME_SHA_INVALID", "Production runtime Git SHA must be 40 lowercase hex characters");
  return value;
}

export function buildRuntimeGitPlans({ runtimeSha, repoRoot, environment: environmentSource = process.env } = {}) {
  const sha = assertProductionRuntimeSha(runtimeSha);
  return Object.freeze({
    verifyCommit: gitPlan({ operation: "verify production runtime Git commit", args: ["cat-file", "-e", `${sha}^{commit}`], repoRoot, environmentSource }),
    listMigrations: gitPlan({ operation: "list production runtime baseline migrations", args: ["ls-tree", "-z", "--name-only", `${sha}:supabase/migrations`], repoRoot, environmentSource, preserveOutput: true }),
    readConfig: gitPlan({ operation: "read production runtime Supabase config", args: ["show", `${sha}:supabase/config.toml`], repoRoot, environmentSource, preserveOutput: true }),
    readMigration: (name) => {
      if (!MANAGED_BASELINE_MIGRATIONS.includes(name)) fail("RECOVERY_RUNTIME_MIGRATION_INVALID", "Runtime migration request is not governed");
      return gitPlan({ operation: "read production runtime baseline migration", args: ["show", `${sha}:supabase/migrations/${name}`], repoRoot, environmentSource, preserveOutput: true });
    },
  });
}

export async function loadProductionRuntimeAuthority({ runtimeSha, repoRoot, environment: environmentSource = process.env, execute = runCommand } = {}) {
  if (typeof execute !== "function") fail("RECOVERY_RUNTIME_EXECUTOR_INVALID", "Runtime Git executor is invalid");
  const plans = buildRuntimeGitPlans({ runtimeSha, repoRoot, environment: environmentSource });
  try {
    await execute(plans.verifyCommit);
  } catch {
    fail("RECOVERY_RUNTIME_COMMIT_UNAVAILABLE", "Production runtime commit is unavailable locally");
  }
  let names;
  try {
    names = exactList((await execute(plans.listMigrations)).stdout);
  } catch {
    fail("RECOVERY_RUNTIME_MIGRATIONS_UNAVAILABLE", "Production runtime baseline migrations are unavailable");
  }
  const expected = [...MANAGED_BASELINE_MIGRATIONS].sort((left, right) => left.localeCompare(right, "en"));
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index])) {
    fail("RECOVERY_RUNTIME_BASELINE_MISMATCH", "Production runtime must contain exactly the governed baseline migrations 01-06");
  }
  const versions = names.map((name) => name.slice(0, 14));
  if (new Set(versions).size !== versions.length) fail("RECOVERY_RUNTIME_BASELINE_DUPLICATE", "Production runtime baseline contains a duplicate migration version");

  let config;
  try {
    config = (await execute(plans.readConfig)).stdout;
  } catch {
    fail("RECOVERY_RUNTIME_CONFIG_UNAVAILABLE", "Production runtime Supabase config is unavailable");
  }
  if (typeof config !== "string" || config.length === 0) fail("RECOVERY_RUNTIME_CONFIG_INVALID", "Production runtime Supabase config is empty");

  const migrations = [];
  for (const name of MANAGED_BASELINE_MIGRATIONS) {
    let content;
    try {
      content = (await execute(plans.readMigration(name))).stdout;
    } catch {
      fail("RECOVERY_RUNTIME_MIGRATION_UNAVAILABLE", "A governed production runtime migration is unavailable");
    }
    if (typeof content !== "string" || content.length === 0) fail("RECOVERY_RUNTIME_MIGRATION_INVALID", "A governed production runtime migration is empty");
    migrations.push(Object.freeze({ name, version: name.slice(0, 14), sha256: digest(content), content }));
  }
  const authority = Object.freeze({
    status: "VERIFIED",
    runtimeSha: assertProductionRuntimeSha(runtimeSha),
    evidence: Object.freeze({ migrationCount: 6, versions: Object.freeze(versions), digests: Object.freeze(migrations.map(({ name, sha256 }) => Object.freeze({ name, sha256 }))) }),
  });
  runtimeContents.set(authority, Object.freeze({ config, migrations: Object.freeze(migrations) }));
  return authority;
}

export function accessProductionRuntimeAuthority(authority, callback) {
  const contents = runtimeContents.get(authority);
  if (!contents || typeof callback !== "function") fail("RECOVERY_RUNTIME_AUTHORITY_REQUIRED", "Verified runtime authority handle is required");
  return callback(contents);
}
