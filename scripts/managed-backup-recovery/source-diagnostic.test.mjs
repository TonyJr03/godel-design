import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLocalManagedRecoverySourceDiagnosticConfirmation,
  runLocalManagedRecoverySourceDiagnostic,
  sanitizeLocalManagedRecoverySourceDiagnosticFailure,
  SOURCE_DIAGNOSTIC_CONFIRM_ENV,
  SOURCE_DIAGNOSTIC_CONFIRMATION,
} from "./source-diagnostic.mjs";
import { RECOVERY_DRILL_BACKUP_ID_ENV, RECOVERY_DRILL_TOOLING_SHA_ENV } from "./real-restore-drill-core.mjs";
import { TEST_BACKUP_ID, TEST_TOOLING_SHA } from "./test-helpers.mjs";

function environment(extra = {}) {
  return {
    [SOURCE_DIAGNOSTIC_CONFIRM_ENV]: SOURCE_DIAGNOSTIC_CONFIRMATION,
    [RECOVERY_DRILL_BACKUP_ID_ENV]: TEST_BACKUP_ID,
    [RECOVERY_DRILL_TOOLING_SHA_ENV]: TEST_TOOLING_SHA,
    GODEL_MANAGED_RECOVERY_PARENT: "C:\\recovery",
    GODEL_MANAGED_RECOVERY_BACKUP_OUTPUT_ROOT: "C:\\backup",
    GODEL_MANAGED_RECOVERY_IDENTITY_FILE: "C:\\identity.txt",
    ...extra,
  };
}

function dependencies(withVerifiedSource, rolesSql = "CREATE ROLE authenticator;\n") {
  return {
    resolveToolingAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TEST_TOOLING_SHA, clean: true }),
    assertToolingAuthority: () => undefined,
    preflightTools: async () => [{ name: "age", version: "1.3.1" }, { name: "tar", version: "1.35" }],
    admitRecoveryBoundaries: async () => ({}),
    accessRecoveryBoundaries: (_handle, callback) => callback({ parent: "C:\\recovery", backupOutputRoot: "C:\\backup" }),
    decryptAdapterFactory: () => ({ async decryptToTar() {} }),
    withVerifiedSource,
    readRolesSql: async (bundleRoot) => {
      assert.equal(bundleRoot, "C:\\verified-bundle");
      return rolesSql;
    },
  };
}

test("local source diagnostic requires its exact isolated confirmation", () => {
  assert.throws(() => assertLocalManagedRecoverySourceDiagnosticConfirmation({}), { code: "RECOVERY_SOURCE_DIAGNOSTIC_CONFIRMATION_REQUIRED" });
  assert.throws(
    () => assertLocalManagedRecoverySourceDiagnosticConfirmation(environment({ GODEL_MANAGED_RECOVERY_DRILL_CONFIRM: "incompatible" })),
    { code: "RECOVERY_SOURCE_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION" },
  );
});

test("local source diagnostic returns fixed PASS without R2, target, SQL, or Production activity", async () => {
  const result = await runLocalManagedRecoverySourceDiagnostic({
    environment: environment({
      GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "must-not-be-read",
      GODEL_BACKUP_R2_ACCESS_KEY_ID: "must-not-be-read",
    }),
    repoRoot: "C:\\repo",
    dependencies: dependencies(async (options, consumeVerifiedSource) => {
      assert.equal(options.environment.GODEL_BACKUP_R2_SECRET_ACCESS_KEY, "must-not-be-read");
      await options.decryptAdapterFactory({}).decryptToTar({});
      options.dependencies.onPhase("SOURCE_VERIFY");
      return consumeVerifiedSource({ bundleRoot: "C:\\verified-bundle" });
    }),
  });
  assert.deepEqual(result, {
    status: "PASS", operation: "local-managed-recovery-source-diagnostic", phase: "ROLES_AUDIT", localAgeDecrypts: 1,
    realR2Reads: 0, realTargetStarts: 0, sqlExecutions: 0, productionMutations: 0, cleanup: "PASS",
  });
  assert.ok(!JSON.stringify(result).includes("must-not-be-read"));
});

test("local source diagnostic exposes only bounded SQL finding metadata", async () => {
  const secret = "SELECT secret@example.test FROM private.people";
  const result = await runLocalManagedRecoverySourceDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: dependencies(async (options) => {
      await options.decryptAdapterFactory({}).decryptToTar({});
      options.dependencies.onPhase("SOURCE_VERIFY");
      throw Object.assign(new Error(secret), {
        code: "RECOVERY_SQL_STATEMENT_FORBIDDEN",
        statementClass: "SET_PARAMETER",
        parameter: "default_tablespace",
        rawSql: secret,
      });
    }),
  });
  assert.deepEqual(result, {
    status: "FINDING", operation: "local-managed-recovery-source-diagnostic", phase: "SQL_ADMISSION",
    code: "RECOVERY_SQL_STATEMENT_FORBIDDEN", statementClass: "SET_PARAMETER", setParameter: "default_tablespace",
    localAgeDecrypts: 1, realR2Reads: 0, realTargetStarts: 0, sqlExecutions: 0, productionMutations: 0, cleanup: "PASS",
  });
  assert.ok(!JSON.stringify(result).includes(secret));
});

test("local source diagnostic exposes only bounded roles dialect findings", async () => {
  const secrets = ["private-role", "private-member", "private-value"];
  const rolesSql = [
    `ALTER ROLE "${secrets[0]}" SET "statement_timeout" TO '${secrets[2]}';`,
    "RESET ALL;",
    `GRANT "${secrets[0]}" TO "${secrets[1]}" WITH INHERIT FALSE;`,
    "",
  ].join("\n");
  const result = await runLocalManagedRecoverySourceDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: dependencies(async (options, consumeVerifiedSource) => {
      await options.decryptAdapterFactory({}).decryptToTar({});
      options.dependencies.onPhase("SOURCE_VERIFY");
      return consumeVerifiedSource({ bundleRoot: "C:\\verified-bundle" });
    }, rolesSql),
  });
  assert.deepEqual(result, {
    status: "FINDING",
    operation: "local-managed-recovery-source-diagnostic",
    phase: "ROLES_AUDIT",
    code: "RECOVERY_ROLES_DIALECT_DIAGNOSTIC_FINDING",
    unexpectedStatementCount: 3,
    roleStatementClasses: [
      { statementClass: "ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG", count: 1 },
      { statementClass: "GRANT_ROLE_MEMBERSHIP_VARIANT", count: 1 },
      { statementClass: "RESET_ALL", count: 1 },
    ],
    localAgeDecrypts: 1,
    realR2Reads: 0,
    realTargetStarts: 0,
    sqlExecutions: 0,
    productionMutations: 0,
    cleanup: "PASS",
  });
  const serialized = JSON.stringify(result);
  for (const secret of secrets) assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes("ALTER ROLE"));
});

test("local source diagnostic keeps roles credential material as a hard failure", async () => {
  const secret = "credential-private";
  const result = await runLocalManagedRecoverySourceDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: dependencies(async (options, consumeVerifiedSource) => {
      await options.decryptAdapterFactory({}).decryptToTar({});
      options.dependencies.onPhase("SOURCE_VERIFY");
      return consumeVerifiedSource({ bundleRoot: "C:\\verified-bundle" });
    }, `ALTER ROLE postgres PASSWORD '${secret}';`),
  });
  assert.deepEqual(result, {
    status: "FAIL",
    operation: "local-managed-recovery-source-diagnostic",
    phase: "ROLES_AUDIT",
    code: "RECOVERY_ROLES_CREDENTIAL_MATERIAL",
    localAgeDecrypts: 1,
    realR2Reads: 0,
    realTargetStarts: 0,
    sqlExecutions: 0,
    productionMutations: 0,
    cleanup: "PASS",
  });
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.equal("roleStatementClasses" in result, false);
});

test("diagnostic sanitizer rejects arbitrary classifier metadata", () => {
  const result = sanitizeLocalManagedRecoverySourceDiagnosticFailure(
    Object.assign(new Error("raw secret"), { code: "RECOVERY_SQL_STATEMENT_FORBIDDEN", statementClass: "RAW_SQL", parameter: "secret" }),
    { phase: "SOURCE_VERIFY", localAgeDecrypts: 1 },
  );
  assert.equal(result.status, "FAIL");
  assert.equal("statementClass" in result, false);
  assert.equal("setParameter" in result, false);
});
