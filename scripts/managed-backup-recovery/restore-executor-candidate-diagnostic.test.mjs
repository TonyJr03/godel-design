import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLocalManagedRecoveryRestoreExecutorCandidateDiagnosticConfirmation,
  RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_CONFIRMATION,
  RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_CONFIRM_ENV,
  runLocalManagedRecoveryRestoreExecutorCandidateDiagnostic,
} from "./restore-executor-candidate-diagnostic.mjs";
import {
  accessRestoreExecutePreflightFinding,
  accessSupabaseAdminRestoreExecutorQuerySql,
  buildSupabaseAdminRestoreExecutorPreflight,
  evaluateSupabaseAdminRestoreExecutorPreflight,
  RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES,
  SUPABASE_ADMIN_RESTORE_EXECUTOR,
} from "./restore-execute-preflight.mjs";
import { buildMutableTablePlan, prepareTargetCompatibleManagedData } from "./restore-planning.mjs";
import { admitManagedDataSql } from "./sql-admission.mjs";
import { buildTargetSupabaseAdminReadOnlyDiagnosticPsqlPlan, resolveTargetDbContainer } from "./target-commands.mjs";
import { TEST_BACKUP_ID, TEST_TOOLING_SHA } from "./test-helpers.mjs";

const INCOMPATIBLE_CONFIRMATIONS = [
  "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM",
  "GODEL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC_CONFIRM",
  "GODEL_MANAGED_RECOVERY_SOURCE_DIAGNOSTIC_CONFIRM",
  "GODEL_MANAGED_RECOVERY_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRM",
  "GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM",
  "GODEL_MANAGED_RECOVERY_APP_LOCAL_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
  "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM",
];

function environment(extra = {}) {
  return {
    [RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_CONFIRM_ENV]: RESTORE_EXECUTOR_CANDIDATE_DIAGNOSTIC_CONFIRMATION,
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
    ...tables.flatMap(({ identity, columns, rows }) => [
      `COPY ${identity} (${columns.join(", ")}) FROM stdin;`,
      ...(rows ?? [columns.map(() => "value")]).map((row) => Array.isArray(row) ? row.join("\t") : row),
      "\\.",
    ]),
    ...sequences.map((identity) => {
      const [schema, sequence] = identity.split(".");
      return `SELECT pg_catalog.setval('\"${schema}\".\"${sequence}\"', 1, true);`;
    }),
    "",
  ].join("\n");
  const admission = admitManagedDataSql(sql);
  const catalog = targetTables ?? admission.mutableTables;
  return Object.freeze({
    status: "READY",
    storage: Object.freeze({ objectCount: 0, totalBytes: 0 }),
    targetCompatibility: prepareTargetCompatibleManagedData({ admission, targetTables: catalog }),
    mutable: buildMutableTablePlan({ admission, targetTables: catalog }),
  });
}

function column(identity, columnName, overrides = {}) {
  const [tableSchema, tableName] = identity.split(".");
  return { tableSchema, tableName, columnName, ordinalPosition: overrides.ordinalPosition ?? 1, isNullable: false, hasDefault: false, isIdentity: false, isGenerated: false, ...overrides };
}

function outputs({
  columns = [column("public.items", "id")],
  foreignKeys = [],
  sequences = [],
  privileges = [{ identity: "public.items", canTruncate: true, canInsert: true }],
  authority = { currentUserIsSupabaseAdmin: true, canSetSessionReplicationRole: true, isSuperuser: false },
} = {}) {
  return {
    replicationAuthority: JSON.stringify(authority),
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

function candidatePreflight(restorePlan = restoreFixture()) {
  return buildSupabaseAdminRestoreExecutorPreflight({ restorePlan, executorAuthority: SUPABASE_ADMIN_RESTORE_EXECUTOR });
}

test("Supabase Admin executor authority is exact, opaque, and cannot select an arbitrary role", () => {
  const preflight = candidatePreflight();
  assert.deepEqual(Object.keys(preflight.queries), [...RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES]);
  assert.throws(() => buildSupabaseAdminRestoreExecutorPreflight({ restorePlan: restoreFixture(), executorAuthority: {} }), { code: "RECOVERY_RESTORE_EXECUTOR_AUTHORITY_REQUIRED" });

  const projectId = "godel-m53-restore-abcdef123456";
  const containerAuthority = resolveTargetDbContainer({ projectId, containers: [{
    name: `supabase_db_${projectId}`,
    labels: { "com.supabase.cli.project": projectId, "com.docker.compose.project": projectId, "com.docker.compose.service": "db" },
    image: "supabase/postgres:15.8.1.060",
    state: "running",
    health: "healthy",
  }] });
  for (const query of Object.values(preflight.queries)) {
    accessSupabaseAdminRestoreExecutorQuerySql({ executorAuthority: SUPABASE_ADMIN_RESTORE_EXECUTOR, query }, (sql) => {
      assert.match(sql, /^SELECT\b/);
      assert.equal((sql.match(/;/g) ?? []).length, 1);
      assert.doesNotMatch(sql, /^\s*(?:TRUNCATE|COPY|INSERT|UPDATE|DELETE|ALTER|GRANT)\b/im);
      assert.doesNotMatch(sql, /SET\s+session_replication_role|setval\s*\(/i);
    });
    const plan = buildTargetSupabaseAdminReadOnlyDiagnosticPsqlPlan({
      containerAuthority,
      cwd: "C:\\target",
      executorAuthority: SUPABASE_ADMIN_RESTORE_EXECUTOR,
      executePreflightQuery: query,
      role: "arbitrary_role_must_be_ignored",
    });
    assert.deepEqual(plan.args.slice(plan.args.indexOf("-U"), plan.args.indexOf("-U") + 2), ["-U", "supabase_admin"]);
    assert.doesNotMatch(plan.args.join(" "), /arbitrary_role/);
  }
  assert.throws(() => buildTargetSupabaseAdminReadOnlyDiagnosticPsqlPlan({ containerAuthority, cwd: "C:\\target", executorAuthority: SUPABASE_ADMIN_RESTORE_EXECUTOR, executePreflightQuery: { name: "fabricated", sql: "SELECT 1" } }), { code: "RECOVERY_RESTORE_EXECUTOR_QUERY_REQUIRED" });
  assert.throws(() => accessSupabaseAdminRestoreExecutorQuerySql({ executorAuthority: {}, query: preflight.queries.replicationAuthority }, () => undefined), { code: "RECOVERY_RESTORE_EXECUTOR_QUERY_REQUIRED" });
});

test("Supabase Admin identity and concrete replication authority pass without requiring superuser", () => {
  const result = evaluateSupabaseAdminRestoreExecutorPreflight({ preflight: candidatePreflight(), outputs: outputs() });
  assert.deepEqual(result, {
    status: "PASS", phase: "RESTORE_EXECUTOR_PREFLIGHT", restorePlan: "READY", executorCandidate: "SUPABASE_ADMIN",
    executorIdentity: "VERIFIED", replicationRoleAuthority: "PASS", copyColumnCompatibility: "PASS",
    targetRequiredColumns: "PASS", truncateFkClosure: "PASS", sequenceCompatibility: "PASS", mutationPrivileges: "PASS",
  });
  assert.doesNotMatch(JSON.stringify(result), /isSuperuser|columnName|raw SQL/i);
});

test("identity mismatch stops before privilege and catalog evaluation", () => {
  const preflight = candidatePreflight();
  const result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight,
    outputs: { ...outputs(), replicationAuthority: JSON.stringify({ currentUserIsSupabaseAdmin: false, canSetSessionReplicationRole: true, isSuperuser: true }), columnCatalog: "not-json" },
  }));
  assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTOR_IDENTITY_MISMATCH", metadata: {} });
});

test("replication SET denial has its candidate-specific finding", () => {
  const result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(),
    outputs: outputs({ authority: { currentUserIsSupabaseAdmin: true, canSetSessionReplicationRole: false, isSuperuser: false } }),
  }));
  assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTOR_REPLICATION_ROLE_UNAUTHORIZED", metadata: {} });
});

test("table TRUNCATE and INSERT denials reuse bounded preflight findings", () => {
  for (const [canTruncate, canInsert, expected] of [[false, true, ["TRUNCATE"]], [true, false, ["INSERT"]]]) {
    const result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
      preflight: candidatePreflight(),
      outputs: outputs({ privileges: [{ identity: "public.items", canTruncate, canInsert }] }),
    }));
    assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTE_TABLE_PRIVILEGE_MISSING", metadata: { identity: "public.items", missingPrivileges: expected } });
  }
});

test("sequence UPDATE denial is evaluated under the candidate session", () => {
  const restorePlan = restoreFixture({ sequences: ["public.items_id_seq"] });
  const result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(restorePlan),
    outputs: outputs({ sequences: [{ identity: "public.items_id_seq", canUpdate: false }] }),
  }));
  assert.equal(result.code, "RECOVERY_RESTORE_EXECUTE_SEQUENCE_UNAUTHORIZED");
});

test("persistent COPY finding publishes only exact column data-state metadata", () => {
  let result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(restoreFixture({ tables: [{ identity: "public.items", columns: ["id", "legacy"] }] })),
    outputs: outputs(),
  }));
  assert.deepEqual(result, { code: "RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING", metadata: { identity: "public.items", missingColumns: [{ name: "legacy", dataState: "HAS_NON_NULL" }] } });
  assert.doesNotMatch(JSON.stringify(result), /value|columnName|rowCount/i);

  for (const [rows, dataState] of [[[], "COPY_EMPTY"], [[["value", "\\N"]], "ALL_NULL"]]) {
    result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
      preflight: candidatePreflight(restoreFixture({ tables: [{ identity: "public.items", columns: ["id", "legacy"], rows }] })),
      outputs: outputs(),
    }));
    assert.deepEqual(result.metadata.missingColumns, [{ name: "legacy", dataState }]);
  }
});

test("required-column, generated-column, and FK findings are reused exactly", () => {
  let result;

  result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(),
    outputs: outputs({ columns: [column("public.items", "id"), column("public.items", "required_value", { ordinalPosition: 2 })] }),
  }));
  assert.equal(result.code, "RECOVERY_RESTORE_EXECUTE_TARGET_REQUIRED_COLUMN_MISSING");

  result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(),
    outputs: outputs({ columns: [column("public.items", "id", { isGenerated: true })] }),
  }));
  assert.equal(result.code, "RECOVERY_RESTORE_EXECUTE_GENERATED_COLUMN_CONFLICT");

  result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(),
    outputs: outputs({ foreignKeys: [{ parentIdentity: "public.items", childIdentity: "public.outside" }] }),
  }));
  assert.equal(result.code, "RECOVERY_RESTORE_EXECUTE_TRUNCATE_FK_OPEN");
});

test("ephemeral COPY columns are excluded while the table still requires TRUNCATE only", () => {
  const restorePlan = restoreFixture({
    tables: [
      { identity: "auth.one_time_tokens", columns: ["id", "source_only"], rows: [["ephemeral-secret", "source-secret"]] },
      { identity: "public.items", columns: ["id"] },
    ],
  });
  const passing = evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(restorePlan),
    outputs: outputs({
      columns: [column("auth.one_time_tokens", "id"), column("public.items", "id")],
      privileges: [
        { identity: "auth.one_time_tokens", canTruncate: true, canInsert: false },
        { identity: "public.items", canTruncate: true, canInsert: true },
      ],
    }),
  });
  assert.equal(passing.copyColumnCompatibility, "PASS");
  assert.equal(passing.mutationPrivileges, "PASS");

  const denied = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(restorePlan),
    outputs: outputs({
      columns: [column("auth.one_time_tokens", "id"), column("public.items", "id")],
      privileges: [
        { identity: "auth.one_time_tokens", canTruncate: false, canInsert: false },
        { identity: "public.items", canTruncate: true, canInsert: true },
      ],
    }),
  }));
  assert.deepEqual(denied, { code: "RECOVERY_RESTORE_EXECUTE_TABLE_PRIVILEGE_MISSING", metadata: { identity: "auth.one_time_tokens", missingPrivileges: ["TRUNCATE"] } });
});

test("persistent COPY metadata is deterministic across multiple columns and tables", () => {
  const restorePlan = restoreFixture({ tables: [
    { identity: "storage.objects", columns: ["id", "zeta", "alpha"], rows: [["object-secret", "present-secret", "\\N"]] },
    { identity: "storage.buckets", columns: ["id", "legacy"], rows: [] },
  ] });
  const result = governedFinding(() => evaluateSupabaseAdminRestoreExecutorPreflight({
    preflight: candidatePreflight(restorePlan),
    outputs: outputs({
      columns: [column("storage.objects", "id"), column("storage.buckets", "id")],
      privileges: [
        { identity: "storage.objects", canTruncate: true, canInsert: true },
        { identity: "storage.buckets", canTruncate: true, canInsert: true },
      ],
    }),
  }));
  assert.deepEqual(result, {
    code: "RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING",
    metadata: {
      tableCount: 2,
      tables: [
        { identity: "storage.buckets", missingColumns: [{ name: "legacy", dataState: "COPY_EMPTY" }] },
        { identity: "storage.objects", missingColumns: [{ name: "alpha", dataState: "ALL_NULL" }, { name: "zeta", dataState: "HAS_NON_NULL" }] },
      ],
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /secret|rowCount|sql|token|uuid|path/i);
});

test("persistent COPY finding bounds tables, columns per table, and total columns", () => {
  const cases = [
    Array.from({ length: 33 }, (_, index) => ({ identity: `public.table_${String(index).padStart(2, "0")}`, columns: ["id", "legacy"] })),
    [{ identity: "public.items", columns: ["id", ...Array.from({ length: 33 }, (_, index) => `legacy_${String(index).padStart(2, "0")}`)] }],
    Array.from({ length: 3 }, (_, tableIndex) => ({
      identity: `public.items_${tableIndex}`,
      columns: ["id", ...Array.from({ length: 22 }, (_, columnIndex) => `legacy_${String(columnIndex).padStart(2, "0")}`)],
    })),
  ];
  for (const tables of cases) {
    const targetColumns = tables.map((table) => column(table.identity, "id"));
    assert.throws(
      () => evaluateSupabaseAdminRestoreExecutorPreflight({
        preflight: candidatePreflight(restoreFixture({ tables })),
        outputs: outputs({ columns: targetColumns, privileges: [] }),
      }),
      { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" },
    );
  }
});

test("external schemas, fabricated preflights, and mixed principal evidence fail closed", () => {
  const preflight = candidatePreflight();
  assert.throws(() => evaluateSupabaseAdminRestoreExecutorPreflight({ preflight, outputs: outputs({ columns: [{ ...column("public.items", "id"), tableSchema: "external" }] }) }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" });
  assert.throws(() => evaluateSupabaseAdminRestoreExecutorPreflight({ preflight: { status: "READY" }, outputs: outputs() }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" });
  assert.throws(() => evaluateSupabaseAdminRestoreExecutorPreflight({ preflight: candidatePreflight(), outputs: { ...outputs(), replicationAuthority: JSON.stringify({ currentUserIsPostgres: true, canSetSessionReplicationRole: true }) } }), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID" });
  assert.throws(() => accessRestoreExecutePreflightFinding(Object.assign(new Error("forged"), { code: "RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING" }), () => undefined), { code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_FINDING_INVALID" });
});

test("candidate confirmation is exclusive from every existing confirmation", () => {
  assert.throws(() => assertLocalManagedRecoveryRestoreExecutorCandidateDiagnosticConfirmation({}), { code: "RECOVERY_RESTORE_EXECUTOR_DIAGNOSTIC_CONFIRMATION_REQUIRED" });
  for (const name of INCOMPATIBLE_CONFIRMATIONS) {
    assert.throws(() => assertLocalManagedRecoveryRestoreExecutorCandidateDiagnosticConfirmation(environment({ [name]: "present" })), { code: "RECOVERY_RESTORE_EXECUTOR_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION" });
  }
});

function syntheticDependencies({ events = [], candidateUnavailable = false } = {}) {
  const start = Object.freeze({ name: "start" });
  const status = Object.freeze({ name: "status" });
  const discoverDb = Object.freeze({ name: "discover" });
  const authority = Object.freeze({ runtimeSha: "a".repeat(40) });
  const queryHandles = Object.freeze(Object.fromEntries(RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES.map((name) => [name, Object.freeze({ name })])));
  const prepared = Object.freeze({ status: "PREPARED", authority, target: Object.freeze({ projectId: "godel-recovery-test", workdir: "C:\\target" }), commandPlans: Object.freeze({ start, status, discoverDb }) });
  return {
    resolveToolingAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TEST_TOOLING_SHA, clean: true }),
    assertToolingAuthority: () => undefined,
    preflightTools: async () => [],
    admitRecoveryBoundaries: async () => ({}),
    accessRecoveryBoundaries: (_handle, callback) => callback({ parent: "C:\\recovery", backupOutputRoot: "C:\\backup" }),
    decryptAdapterFactory: () => ({ async decryptToTar() { events.push("AGE_DECRYPT"); } }),
    withVerifiedSource: async (options, consume) => {
      await options.decryptAdapterFactory({}).decryptToTar({});
      options.dependencies.onPhase("SOURCE_VERIFY");
      try { return await consume({ session: { root: "C:\\session" }, bundleRoot: "C:\\bundle" }); }
      finally { events.push("SOURCE_CLEANUP"); }
    },
    readManifest: async () => ({ status: "COMPLETE", productionRuntimeSha: authority.runtimeSha }),
    prepareTarget: async () => prepared,
    createTargetExecutor: () => ({}),
    executeTargetPlan: async (_executor, plan) => {
      if (plan === start) return { stdout: "" };
      if (plan === status) return { stdout: "status" };
      if (plan === discoverDb) return { stdout: "docker" };
      events.push(`QUERY:${plan.name}`);
      if (candidateUnavailable) throw Object.assign(new Error("private connection stderr"), { code: "COMMAND_FAILED", stderr: "secret" });
      return { stdout: "synthetic" };
    },
    admitStatus: () => ({}),
    admitDocker: () => ({}),
    proveIsolation: () => ({ LOCAL_ONLY: true, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: authority.runtimeSha }),
    runBaselineGate: async () => ({}),
    accessBaselineEvidence: (_handle, callback) => callback({ targetState: {}, targetTables: [] }),
    buildRestorePlan: async () => ({ status: "READY", storage: { objectCount: 0, totalBytes: 0 } }),
    buildExecutorPreflight: ({ executorAuthority }) => {
      assert.equal(executorAuthority, SUPABASE_ADMIN_RESTORE_EXECUTOR);
      return { queries: queryHandles };
    },
    buildTargetCandidatePsql: ({ executorAuthority, executePreflightQuery }) => {
      assert.equal(executorAuthority, SUPABASE_ADMIN_RESTORE_EXECUTOR);
      return { name: executePreflightQuery.name };
    },
    evaluateExecutorPreflight: () => ({
      status: "PASS", phase: "RESTORE_EXECUTOR_PREFLIGHT", restorePlan: "READY", executorCandidate: "SUPABASE_ADMIN",
      executorIdentity: "VERIFIED", replicationRoleAuthority: "PASS", copyColumnCompatibility: "PASS",
      targetRequiredColumns: "PASS", truncateFkClosure: "PASS", sequenceCompatibility: "PASS", mutationPrivileges: "PASS",
    }),
    createCleanupAdapter: () => ({}),
    cleanupTarget: async () => { events.push("TARGET_CLEANUP"); },
  };
}

test("full candidate diagnostic runs five read-only queries with exact zero-mutation PASS", async () => {
  const events = [];
  const result = await runLocalManagedRecoveryRestoreExecutorCandidateDiagnostic({ environment: environment(), dependencies: syntheticDependencies({ events }) });
  assert.deepEqual(result, {
    status: "PASS", operation: "local-managed-recovery-executor-candidate-diagnostic", phase: "RESTORE_EXECUTOR_PREFLIGHT",
    localAgeDecrypts: 1, realTargetStarts: 1, sqlExecutions: 0, targetMutations: 0, realR2Reads: 0, remoteActivity: 0, productionMutations: 0,
    targetCleanup: "PASS", sourceCleanup: "PASS", restorePlan: "READY", executorCandidate: "SUPABASE_ADMIN", executorIdentity: "VERIFIED",
    replicationRoleAuthority: "PASS", copyColumnCompatibility: "PASS", targetRequiredColumns: "PASS", truncateFkClosure: "PASS",
    sequenceCompatibility: "PASS", mutationPrivileges: "PASS",
  });
  assert.equal(events.filter((event) => event.startsWith("QUERY:")).length, 5);
  assert.ok(events.indexOf("TARGET_CLEANUP") < events.indexOf("SOURCE_CLEANUP"));
});

test("candidate connection failure is bounded and never publishes stderr", async () => {
  const result = await runLocalManagedRecoveryRestoreExecutorCandidateDiagnostic({ environment: environment(), dependencies: syntheticDependencies({ candidateUnavailable: true }) });
  assert.equal(result.status, "FINDING");
  assert.equal(result.code, "RECOVERY_RESTORE_EXECUTOR_CANDIDATE_UNAVAILABLE");
  assert.equal(result.phase, "RESTORE_EXECUTOR_PREFLIGHT");
  assert.equal(result.sqlExecutions, 0);
  assert.equal(result.targetCleanup, "PASS");
  assert.doesNotMatch(JSON.stringify(result), /private|stderr|secret/);
});
