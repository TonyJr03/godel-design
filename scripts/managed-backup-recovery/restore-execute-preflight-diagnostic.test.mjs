import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLocalManagedRecoveryExecutePreflightDiagnosticConfirmation,
  RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRMATION,
  RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRM_ENV,
  runLocalManagedRecoveryExecutePreflightDiagnostic,
} from "./restore-execute-preflight-diagnostic.mjs";
import {
  accessRestoreExecutePreflightFinding,
  accessRestoreExecutePreflightQuerySql,
  buildRestoreExecutePreflight,
  evaluateRestoreExecutePreflight,
  RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES,
} from "./restore-execute-preflight.mjs";
import { buildMutableTablePlan, prepareTargetCompatibleManagedData } from "./restore-planning.mjs";
import { admitManagedDataSql } from "./sql-admission.mjs";
import { TEST_BACKUP_ID, TEST_TOOLING_SHA } from "./test-helpers.mjs";

const INCOMPATIBLE_CONFIRMATIONS = [
  "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM",
  "GODEL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC_CONFIRM",
  "GODEL_MANAGED_RECOVERY_SOURCE_DIAGNOSTIC_CONFIRM",
  "GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM",
  "GODEL_MANAGED_RECOVERY_APP_LOCAL_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
  "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM",
];

function environment(extra = {}) {
  return {
    [RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRM_ENV]: RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRMATION,
    GODEL_MANAGED_RECOVERY_DRILL_TOOLING_SHA: TEST_TOOLING_SHA,
    GODEL_MANAGED_RECOVERY_BACKUP_ID: TEST_BACKUP_ID,
    GODEL_MANAGED_RECOVERY_PARENT: "C:\\recovery",
    GODEL_MANAGED_RECOVERY_BACKUP_OUTPUT_ROOT: "C:\\backup",
    GODEL_MANAGED_RECOVERY_IDENTITY_FILE: "C:\\identity.txt",
    ...extra,
  };
}

function restoreFixture({ tables = [{ identity: "public.items", columns: ["id"] }], sequences = [], targetTables } = {}) {
  const sql = [
    ...tables.flatMap(({ identity, columns }) => [`COPY ${identity} (${columns.join(", ")}) FROM stdin;`, columns.map(() => "value").join("\t"), "\\."]),
    ...sequences.map((identity) => {
      const [schema, sequence] = identity.split(".");
      return `SELECT pg_catalog.setval('\"${schema}\".\"${sequence}\"', 1, true);`;
    }),
    "",
  ].join("\n");
  const admission = admitManagedDataSql(sql);
  const catalog = targetTables ?? admission.mutableTables;
  const targetCompatibility = prepareTargetCompatibleManagedData({ admission, targetTables: catalog });
  const mutable = buildMutableTablePlan({ admission, targetTables: catalog });
  return Object.freeze({ status: "READY", storage: Object.freeze({ objectCount: 0, totalBytes: 0 }), targetCompatibility, mutable });
}

function column(identity, columnName, overrides = {}) {
  const [tableSchema, tableName] = identity.split(".");
  return { tableSchema, tableName, columnName, ordinalPosition: overrides.ordinalPosition ?? 1, isNullable: false, hasDefault: false, isIdentity: false, isGenerated: false, ...overrides };
}

function outputs({ columns = [column("public.items", "id")], foreignKeys = [], sequences = [], privileges = [{ identity: "public.items", canTruncate: true, canInsert: true }], replication = { currentUserIsPostgres: true, canSetSessionReplicationRole: true } } = {}) {
  return {
    replicationAuthority: JSON.stringify(replication),
    columnCatalog: JSON.stringify(columns),
    foreignKeyCatalog: JSON.stringify(foreignKeys),
    sequenceCatalog: JSON.stringify(sequences),
    tablePrivileges: JSON.stringify(privileges),
  };
}

function governedFinding(callback) {
  try { callback(); } catch (error) {
    let result;
    accessRestoreExecutePreflightFinding(error, (value) => { result = value; });
    return result;
  }
  assert.fail("expected governed finding");
}

test("execute preflight queries are opaque, fixed SELECT-only handles", () => {
  const preflight = buildRestoreExecutePreflight({ restorePlan: restoreFixture() });
  assert.deepEqual(Object.keys(preflight.queries), [...RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES]);
  for (const query of Object.values(preflight.queries)) {
    assert.deepEqual(Object.keys(query), ["name", "statementClass"]);
    accessRestoreExecutePreflightQuerySql(query, (sql) => {
      assert.match(sql, /^SELECT\b/);
      assert.equal((sql.match(/;/g) ?? []).length, 1);
      assert.doesNotMatch(sql, /\b(?:COPY|ALTER|DELETE)\b/i);
      assert.doesNotMatch(sql, /SET\s+session_replication_role|setval\s*\(/i);
    });
  }
});

test("all execute preflight checks pass without exposing catalog metadata", () => {
  const preflight = buildRestoreExecutePreflight({ restorePlan: restoreFixture({ sequences: ["public.items_id_seq"] }) });
  const result = evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ sequences: [{ identity: "public.items_id_seq", canUpdate: true }] }) });
  assert.deepEqual(result, {
    status: "PASS", phase: "RESTORE_EXECUTE_PREFLIGHT", restorePlan: "READY",
    replicationRoleAuthority: "PASS", copyColumnCompatibility: "PASS", targetRequiredColumns: "PASS",
    truncateFkClosure: "PASS", sequenceCompatibility: "PASS", mutationPrivileges: "PASS",
  });
  assert.doesNotMatch(JSON.stringify(result), /columnName|ordinalPosition|items_id_seq/);
});

test("replication parameter privilege false produces its bounded finding", () => {
  const preflight = buildRestoreExecutePreflight({ restorePlan: restoreFixture() });
  const result = governedFinding(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ replication: { currentUserIsPostgres: true, canSetSessionReplicationRole: false } }) }));
  assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTE_REPLICATION_ROLE_UNAUTHORIZED", metadata: {} });
});

test("source COPY column absent in target publishes identity and count only", () => {
  const preflight = buildRestoreExecutePreflight({ restorePlan: restoreFixture({ tables: [{ identity: "public.items", columns: ["id", "legacy"] }] }) });
  const result = governedFinding(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs() }));
  assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING", metadata: { identity: "public.items", missingColumnCount: 1 } });
  assert.doesNotMatch(JSON.stringify(result), /legacy|columnName/);
});

test("required target column absent from COPY produces its bounded finding", () => {
  const preflight = buildRestoreExecutePreflight({ restorePlan: restoreFixture() });
  const result = governedFinding(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ columns: [column("public.items", "id"), column("public.items", "required_value", { ordinalPosition: 2 })] }) }));
  assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTE_TARGET_REQUIRED_COLUMN_MISSING", metadata: { identity: "public.items", requiredMissingCount: 1 } });
  assert.doesNotMatch(JSON.stringify(result), /required_value/);
});

test("generated target column supplied by COPY produces its bounded finding", () => {
  const preflight = buildRestoreExecutePreflight({ restorePlan: restoreFixture() });
  const result = governedFinding(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ columns: [column("public.items", "id", { isGenerated: true })] }) }));
  assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTE_GENERATED_COLUMN_CONFLICT", metadata: { identity: "public.items", generatedConflictCount: 1 } });
});

test("open incoming FK for TRUNCATE publishes only bounded edge identities", () => {
  const preflight = buildRestoreExecutePreflight({ restorePlan: restoreFixture() });
  const result = governedFinding(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ foreignKeys: [{ parentIdentity: "public.items", childIdentity: "public.outside" }] }) }));
  assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTE_TRUNCATE_FK_OPEN", metadata: { edgeCount: 1, parentIdentities: ["public.items"], childIdentities: ["public.outside"] } });
});

test("missing setval sequence and missing UPDATE authority remain separate findings", () => {
  const restorePlan = restoreFixture({ sequences: ["public.items_id_seq"] });
  let preflight = buildRestoreExecutePreflight({ restorePlan });
  assert.equal(governedFinding(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs() })).code, "RECOVERY_RESTORE_EXECUTE_SEQUENCE_MISSING");
  preflight = buildRestoreExecutePreflight({ restorePlan });
  assert.equal(governedFinding(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ sequences: [{ identity: "public.items_id_seq", canUpdate: false }] }) })).code, "RECOVERY_RESTORE_EXECUTE_SEQUENCE_UNAUTHORIZED");
});

test("missing table TRUNCATE and INSERT privileges are classified exactly", () => {
  const restorePlan = restoreFixture();
  for (const [canTruncate, canInsert, expected] of [[false, true, ["TRUNCATE"]], [true, false, ["INSERT"]]]) {
    const preflight = buildRestoreExecutePreflight({ restorePlan });
    const result = governedFinding(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ privileges: [{ identity: "public.items", canTruncate, canInsert }] }) }));
    assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTE_TABLE_PRIVILEGE_MISSING", metadata: { identity: "public.items", missingPrivileges: expected } });
  }
});

test("invalid, duplicate, external, oversized, and fabricated evidence fails closed", () => {
  const restorePlan = restoreFixture();
  let preflight = buildRestoreExecutePreflight({ restorePlan });
  assert.throws(() => evaluateRestoreExecutePreflight({ preflight, outputs: { ...outputs(), columnCatalog: "not-json" } }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" });
  preflight = buildRestoreExecutePreflight({ restorePlan });
  assert.throws(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ columns: [column("public.items", "id"), column("public.items", "id", { ordinalPosition: 2 })] }) }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" });
  preflight = buildRestoreExecutePreflight({ restorePlan });
  assert.throws(() => evaluateRestoreExecutePreflight({ preflight, outputs: outputs({ columns: [{ ...column("public.items", "id"), tableSchema: "external" }] }) }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" });

  const manyTables = Array.from({ length: 33 }, (_, index) => ({ identity: `public.table_${String(index).padStart(2, "0")}`, columns: ["id"] }));
  const manyPlan = restoreFixture({ tables: manyTables });
  const manyPreflight = buildRestoreExecutePreflight({ restorePlan: manyPlan });
  assert.throws(() => evaluateRestoreExecutePreflight({ preflight: manyPreflight, outputs: outputs({ columns: [], privileges: [] }) }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" });
  assert.throws(() => buildRestoreExecutePreflight({ restorePlan: { status: "READY", storage: { objectCount: 0, totalBytes: 0 }, targetCompatibility: {}, mutable: {} } }));
  const otherPlan = restoreFixture({ tables: [{ identity: "public.other", columns: ["id"] }] });
  assert.throws(() => buildRestoreExecutePreflight({ restorePlan: { ...restorePlan, mutable: otherPlan.mutable } }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_PLAN_INVALID" });
  assert.throws(() => evaluateRestoreExecutePreflight({ preflight: { status: "READY" }, outputs: outputs() }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" });
});

function syntheticDependencies({ events = [], findingError, cleanupError, sourceCleanupError } = {}) {
  const start = Object.freeze({ name: "start" });
  const status = Object.freeze({ name: "status" });
  const discoverDb = Object.freeze({ name: "discover" });
  const authority = Object.freeze({ runtimeSha: "a".repeat(40) });
  const queryHandles = Object.freeze(Object.fromEntries(RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES.map((name) => [name, Object.freeze({ name })])));
  const prepared = Object.freeze({ status: "PREPARED", authority, target: Object.freeze({ projectId: "godel-recovery-test", workdir: "C:\\target" }), commandPlans: Object.freeze({ start, status, discoverDb }) });
  return {
    resolveToolingAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TEST_TOOLING_SHA, clean: true }),
    assertToolingAuthority: () => undefined,
    preflightTools: async () => { events.push("PREFLIGHT"); return []; },
    admitRecoveryBoundaries: async () => ({}),
    accessRecoveryBoundaries: (_handle, callback) => callback({ parent: "C:\\recovery", backupOutputRoot: "C:\\backup" }),
    decryptAdapterFactory: () => ({ async decryptToTar() { events.push("AGE_DECRYPT"); } }),
    withVerifiedSource: async (options, consume) => {
      events.push("SOURCE_VERIFY");
      await options.decryptAdapterFactory({}).decryptToTar({});
      options.dependencies.onPhase("SOURCE_VERIFY");
      try {
        const result = await consume({ session: { root: "C:\\session" }, bundleRoot: "C:\\bundle", sql: { managedData: { status: "ADMITTED" } } });
        if (sourceCleanupError) throw sourceCleanupError;
        return result;
      } finally { events.push("SOURCE_CLEANUP"); }
    },
    readManifest: async () => ({ status: "COMPLETE", productionRuntimeSha: authority.runtimeSha }),
    prepareTarget: async () => prepared,
    createTargetExecutor: () => ({}),
    executeTargetPlan: async (_executor, plan) => {
      if (plan === start) { events.push("TARGET_START"); return { stdout: "" }; }
      if (plan === status) return { stdout: "status" };
      if (plan === discoverDb) return { stdout: "docker" };
      events.push(`QUERY:${plan.name}`);
      return { stdout: "synthetic" };
    },
    admitStatus: () => ({}),
    admitDocker: () => ({}),
    proveIsolation: () => ({ LOCAL_ONLY: true, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: authority.runtimeSha }),
    runBaselineGate: async () => ({}),
    accessBaselineEvidence: (_handle, callback) => callback({ targetState: {}, targetTables: [] }),
    buildRestorePlan: async () => ({ status: "READY", storage: { objectCount: 0, totalBytes: 0 } }),
    buildExecutePreflight: () => ({ queries: queryHandles }),
    buildTargetReadOnlyPsql: ({ executePreflightQuery }) => ({ name: executePreflightQuery.name }),
    evaluateExecutePreflight: () => {
      if (findingError) throw findingError;
      return { status: "PASS", phase: "RESTORE_EXECUTE_PREFLIGHT", restorePlan: "READY", replicationRoleAuthority: "PASS", copyColumnCompatibility: "PASS", targetRequiredColumns: "PASS", truncateFkClosure: "PASS", sequenceCompatibility: "PASS", mutationPrivileges: "PASS" };
    },
    createCleanupAdapter: () => ({}),
    cleanupTarget: async () => { events.push("TARGET_CLEANUP"); if (cleanupError) throw cleanupError; },
  };
}

test("diagnostic confirmation is exclusive from every operational confirmation", () => {
  assert.throws(() => assertLocalManagedRecoveryExecutePreflightDiagnosticConfirmation({}), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRMATION_REQUIRED" });
  for (const name of INCOMPATIBLE_CONFIRMATIONS) assert.throws(() => assertLocalManagedRecoveryExecutePreflightDiagnosticConfirmation(environment({ [name]: "present" })), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION" });
});

test("diagnostic reaches five read-only queries and returns exact zero-mutation PASS", async () => {
  const events = [];
  const result = await runLocalManagedRecoveryExecutePreflightDiagnostic({ environment: environment({ GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "must-not-read" }), repoRoot: "C:\\repo", dependencies: syntheticDependencies({ events }) });
  assert.deepEqual(result, {
    status: "PASS", operation: "local-managed-recovery-execute-preflight-diagnostic", phase: "RESTORE_EXECUTE_PREFLIGHT",
    localAgeDecrypts: 1, realTargetStarts: 1, sqlExecutions: 0, targetMutations: 0, realR2Reads: 0, remoteActivity: 0, productionMutations: 0,
    targetCleanup: "PASS", sourceCleanup: "PASS", restorePlan: "READY", replicationRoleAuthority: "PASS", copyColumnCompatibility: "PASS",
    targetRequiredColumns: "PASS", truncateFkClosure: "PASS", sequenceCompatibility: "PASS", mutationPrivileges: "PASS",
  });
  assert.equal(events.filter((event) => event.startsWith("QUERY:")).length, 5);
  assert.ok(events.indexOf("TARGET_CLEANUP") < events.indexOf("SOURCE_CLEANUP"));
  assert.doesNotMatch(JSON.stringify(result), /must-not-read|stderr|columnName/);
});

test("cleanup failure overrides a preflight result and remains sanitized", async () => {
  const result = await runLocalManagedRecoveryExecutePreflightDiagnostic({ environment: environment(), dependencies: syntheticDependencies({ cleanupError: new Error("private cleanup") }) });
  assert.equal(result.status, "FAIL");
  assert.equal(result.code, "RECOVERY_TARGET_CLEANUP_INCOMPLETE");
  assert.equal(result.phase, "TARGET_CLEANUP");
  assert.equal(result.sqlExecutions, 0);
  assert.doesNotMatch(JSON.stringify(result), /private cleanup/);
});

test("governed finding metadata is the only diagnostic metadata published", async () => {
  const corePreflight = buildRestoreExecutePreflight({ restorePlan: restoreFixture({ tables: [{ identity: "public.items", columns: ["id", "legacy"] }] }) });
  let findingError;
  try { evaluateRestoreExecutePreflight({ preflight: corePreflight, outputs: outputs() }); } catch (error) { findingError = error; }
  const result = await runLocalManagedRecoveryExecutePreflightDiagnostic({ environment: environment(), dependencies: syntheticDependencies({ findingError }) });
  assert.equal(result.status, "FINDING");
  assert.equal(result.code, "RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING");
  assert.equal(result.identity, "public.items");
  assert.equal(result.missingColumnCount, 1);
  assert.doesNotMatch(JSON.stringify(result), /legacy|columnName|stderr/);
});

test("source cleanup failure overrides PASS after target cleanup", async () => {
  const error = Object.assign(new Error("private source cleanup"), { code: "RECOVERY_CLEANUP_INCOMPLETE" });
  const result = await runLocalManagedRecoveryExecutePreflightDiagnostic({ environment: environment(), dependencies: syntheticDependencies({ sourceCleanupError: error }) });
  assert.equal(result.status, "FAIL");
  assert.equal(result.code, "RECOVERY_CLEANUP_INCOMPLETE");
  assert.equal(result.phase, "SOURCE_CLEANUP");
  assert.equal(result.targetCleanup, "PASS");
  assert.equal(result.sourceCleanup, "FAIL");
  assert.doesNotMatch(JSON.stringify(result), /private source cleanup/);
});
