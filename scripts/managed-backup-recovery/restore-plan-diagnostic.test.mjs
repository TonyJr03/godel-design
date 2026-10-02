import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLocalManagedRecoveryPlanDiagnosticConfirmation,
  RESTORE_PLAN_DIAGNOSTIC_CODES,
  RESTORE_PLAN_DIAGNOSTIC_CONFIRMATION,
  RESTORE_PLAN_DIAGNOSTIC_CONFIRM_ENV,
  runLocalManagedRecoveryPlanDiagnostic,
} from "./restore-plan-diagnostic.mjs";
import { RECOVERY_DRILL_BACKUP_ID_ENV, RECOVERY_DRILL_TOOLING_SHA_ENV } from "./real-restore-drill-core.mjs";
import { admitManagedDataSql } from "./sql-admission.mjs";
import { preflightManagedRecoveryPlanDiagnosticTools } from "./tool-preflight.mjs";
import { TEST_BACKUP_ID, TEST_TOOLING_SHA } from "./test-helpers.mjs";

const INCOMPATIBLE_CONFIRMATIONS = [
  "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM",
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
    [RESTORE_PLAN_DIAGNOSTIC_CONFIRM_ENV]: RESTORE_PLAN_DIAGNOSTIC_CONFIRMATION,
    [RECOVERY_DRILL_TOOLING_SHA_ENV]: TEST_TOOLING_SHA,
    [RECOVERY_DRILL_BACKUP_ID_ENV]: TEST_BACKUP_ID,
    GODEL_MANAGED_RECOVERY_PARENT: "C:\\recovery",
    GODEL_MANAGED_RECOVERY_BACKUP_OUTPUT_ROOT: "C:\\backup",
    GODEL_MANAGED_RECOVERY_IDENTITY_FILE: "C:\\identity.txt",
    ...extra,
  };
}

function syntheticDependencies({
  events = [],
  planError,
  planResult = Object.freeze({
    status: "READY",
    storage: Object.freeze({ objectCount: 0, totalBytes: 0 }),
  }),
  mutableCatalogDiagnostic,
  mutableDataOccupancy,
  managedData: suppliedManagedData,
  targetTables: suppliedTargetTables,
  cleanupError,
  sourceCleanupError,
} = {}) {
  const start = Object.freeze({ name: "start" });
  const status = Object.freeze({ name: "status" });
  const discoverDb = Object.freeze({ name: "discover-db" });
  const authority = Object.freeze({ runtimeSha: "a".repeat(40), evidence: Object.freeze({ versions: Object.freeze(["1", "2", "3", "4", "5", "6"]) }) });
  const targetState = Object.freeze({ marker: "target-state" });
  const targetTables = suppliedTargetTables ?? Object.freeze(["auth.users", "auth.identities", "public.perfiles", "storage.buckets", "storage.objects"]);
  const managedData = suppliedManagedData ?? Object.freeze({ status: "ADMITTED" });
  const prepared = Object.freeze({
    status: "PREPARED",
    authority,
    target: Object.freeze({ projectId: "godel-recovery-test", workdir: "C:\\target" }),
    commandPlans: Object.freeze({ start, status, discoverDb }),
  });
  return {
    resolveToolingAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TEST_TOOLING_SHA, clean: true }),
    assertToolingAuthority: () => undefined,
    preflightTools: async () => { events.push("PREFLIGHT"); return Object.freeze([]); },
    admitRecoveryBoundaries: async () => ({}),
    accessRecoveryBoundaries: (_handle, callback) => callback({ parent: "C:\\recovery", backupOutputRoot: "C:\\backup" }),
    decryptAdapterFactory: () => ({ async decryptToTar() { events.push("AGE_DECRYPT"); } }),
    withVerifiedSource: async (options, consume) => {
      events.push("LOCAL_SOURCE_VERIFY");
      const source = options.sourceAdapterFactory({ backupId: TEST_BACKUP_ID, downloadDirectory: "C:\\download" });
      assert.deepEqual(Object.keys(source), ["inspectCandidate", "downloadReceipt", "downloadCiphertext"]);
      await options.decryptAdapterFactory({}).decryptToTar({});
      options.dependencies.onPhase("SOURCE_VERIFY");
      try {
        const result = await consume({
          session: Object.freeze({ root: "C:\\session" }),
          bundleRoot: "C:\\verified-bundle",
          sql: Object.freeze({ managedData }),
        });
        if (sourceCleanupError) throw sourceCleanupError;
        return result;
      } finally {
        events.push("SOURCE_CLEANUP");
      }
    },
    readManifest: async (path) => {
      assert.equal(path, "C:\\verified-bundle\\internal-manifest.json");
      return Object.freeze({ status: "COMPLETE", productionRuntimeSha: authority.runtimeSha });
    },
    prepareTarget: async () => { events.push("TARGET_PREPARE"); return prepared; },
    createTargetExecutor: () => Object.freeze({ status: "READY" }),
    executeTargetPlan: async (_executor, plan) => {
      if (plan === start) { events.push("TARGET_START"); return { stdout: "" }; }
      if (plan === status) { events.push("TARGET_STATUS"); return { stdout: "local-status" }; }
      if (plan === discoverDb) { events.push("TARGET_DISCOVERY"); return { stdout: "docker-db" }; }
      throw new Error("unexpected target command");
    },
    admitStatus: () => Object.freeze({ status: "ADMITTED" }),
    admitDocker: () => Object.freeze({ status: "ADMITTED" }),
    proveIsolation: () => Object.freeze({ LOCAL_ONLY: true, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: authority.runtimeSha }),
    runBaselineGate: async () => { events.push("TARGET_BASELINE"); return Object.freeze({ status: "PASS" }); },
    accessBaselineEvidence: (_handle, callback) => callback({ targetState, targetTables }),
    buildRestorePlan: async (input) => {
      events.push("RESTORE_PLAN");
      assert.equal(input.authority, authority);
      assert.equal(input.targetState, targetState);
      assert.equal(input.targetTables, targetTables);
      if (planError) throw planError;
      return planResult;
    },
    ...(mutableCatalogDiagnostic ? {
      classifyMutableCatalogMismatch: (input) => {
        events.push("MUTABLE_CATALOG_DIAGNOSTIC");
        assert.equal(input.admission, managedData);
        assert.equal(input.targetTables, targetTables);
        return mutableCatalogDiagnostic(input);
      },
    } : {}),
    ...(mutableDataOccupancy ? {
      classifyMissingMutableDataOccupancy: (input) => {
        events.push("MUTABLE_DATA_OCCUPANCY");
        assert.equal(input.admission, managedData);
        return mutableDataOccupancy(input);
      },
    } : {}),
    createCleanupAdapter: () => Object.freeze({ status: "READY" }),
    cleanupTarget: async () => {
      events.push("TARGET_CLEANUP");
      if (cleanupError) throw cleanupError;
    },
  };
}

test("plan diagnostic requires its exact isolated confirmation and all local authorities", () => {
  assert.throws(() => assertLocalManagedRecoveryPlanDiagnosticConfirmation({}), { code: "RECOVERY_PLAN_DIAGNOSTIC_CONFIRMATION_REQUIRED" });
  for (const name of INCOMPATIBLE_CONFIRMATIONS) {
    assert.throws(
      () => assertLocalManagedRecoveryPlanDiagnosticConfirmation(environment({ [name]: "present" })),
      { code: "RECOVERY_PLAN_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION" },
    );
  }
  for (const name of ["GODEL_MANAGED_RECOVERY_PARENT", "GODEL_MANAGED_RECOVERY_BACKUP_OUTPUT_ROOT", "GODEL_MANAGED_RECOVERY_IDENTITY_FILE"]) {
    assert.throws(() => assertLocalManagedRecoveryPlanDiagnosticConfirmation(environment({ [name]: "" })));
  }
});

test("plan diagnostic reaches the real plan boundary and stops with zero mutation", async () => {
  const events = [];
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment({ GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "must-not-be-read" }),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({ events }),
  });
  assert.deepEqual(result, {
    status: "PASS",
    operation: "local-managed-recovery-plan-diagnostic",
    phase: "RESTORE_PLAN",
    localAgeDecrypts: 1,
    realTargetStarts: 1,
    sqlExecutions: 0,
    targetMutations: 0,
    realR2Reads: 0,
    remoteActivity: 0,
    productionMutations: 0,
    targetCleanup: "PASS",
    sourceCleanup: "PASS",
    restorePlan: "READY",
    storageScope: "EMPTY_ONLY",
  });
  assert.deepEqual(events, [
    "PREFLIGHT", "LOCAL_SOURCE_VERIFY", "AGE_DECRYPT", "TARGET_PREPARE", "TARGET_START",
    "TARGET_STATUS", "TARGET_DISCOVERY", "TARGET_BASELINE", "RESTORE_PLAN", "TARGET_CLEANUP", "SOURCE_CLEANUP",
  ]);
  assert.ok(!JSON.stringify(result).includes("must-not-be-read"));
});

test("plan diagnostic returns a bounded finding and preserves cleanup", async () => {
  const secret = "private SQL identifier C:\\private";
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({
      planError: Object.assign(new Error(secret), { code: "RECOVERY_MIGRATION_HISTORY_DATA_INVALID", rawSql: secret }),
    }),
  });
  assert.deepEqual(result, {
    status: "FINDING",
    operation: "local-managed-recovery-plan-diagnostic",
    phase: "RESTORE_PLAN",
    localAgeDecrypts: 1,
    realTargetStarts: 1,
    sqlExecutions: 0,
    targetMutations: 0,
    realR2Reads: 0,
    remoteActivity: 0,
    productionMutations: 0,
    targetCleanup: "PASS",
    sourceCleanup: "PASS",
    code: "RECOVERY_MIGRATION_HISTORY_DATA_INVALID",
  });
  assert.ok(!JSON.stringify(result).includes(secret));
});

test("mutable table unknown publishes only the bounded catalog diagnostic and preserves zero mutation", async () => {
  const events = [];
  const managedData = admitManagedDataSql([
    "COPY auth.identities (id) FROM stdin;",
    "private-identity-row",
    "\\.",
    "COPY auth.sessions (id) FROM stdin;",
    "\\.",
  ].join("\n"));
  const targetTables = Object.freeze(["auth.users", "public.perfiles", "storage.buckets", "storage.objects"]);
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({
      events,
      planError: Object.assign(new Error("private catalog details"), { code: "RECOVERY_MUTABLE_TABLE_UNKNOWN" }),
      managedData,
      targetTables,
    }),
  });
  assert.deepEqual(result, {
    status: "FINDING",
    operation: "local-managed-recovery-plan-diagnostic",
    phase: "RESTORE_PLAN",
    localAgeDecrypts: 1,
    realTargetStarts: 1,
    sqlExecutions: 0,
    targetMutations: 0,
    realR2Reads: 0,
    remoteActivity: 0,
    productionMutations: 0,
    targetCleanup: "PASS",
    sourceCleanup: "PASS",
    code: "RECOVERY_MUTABLE_TABLE_UNKNOWN",
    mutableCatalog: {
      missingCount: 2,
      missingClasses: [
        { class: "AUTH_EPHEMERAL_KNOWN", count: 1 },
        { class: "AUTH_OTHER", count: 1 },
      ],
      missingIdentities: ["auth.identities", "auth.sessions"],
      missingData: [
        { identity: "auth.identities", rowState: "NONEMPTY" },
        { identity: "auth.sessions", rowState: "EMPTY" },
      ],
    },
  });
  assert.equal(events.filter((event) => event === "TARGET_START").length, 1);
  assert.ok(!JSON.stringify(result).includes("private catalog details"));
  assert.ok(!JSON.stringify(result).includes("private-identity-row"));
});

test("other restore-plan findings never receive mutable catalog metadata", async () => {
  for (const code of ["RECOVERY_MANAGED_DATA_COUNTS_MISMATCH", "RECOVERY_MUTABLE_PLAN_INVALID"]) {
    const result = await runLocalManagedRecoveryPlanDiagnostic({
      environment: environment(),
      repoRoot: "C:\\repo",
      dependencies: syntheticDependencies({ planError: Object.assign(new Error("private"), { code }) }),
    });
    assert.equal(result.code, code);
    assert.equal("mutableCatalog" in result, false);
  }
});

test("mutable catalog classification failure is replaced by a closed diagnostic code", async () => {
  const classifiers = [
    () => { throw new Error("private classifier failure"); },
    () => ({
      missingCount: 1,
      missingClasses: [{ class: "AUTH_OTHER", count: 1 }],
      missingIdentities: ["auth.sessions"],
    }),
  ];
  for (const mutableCatalogDiagnostic of classifiers) {
    const result = await runLocalManagedRecoveryPlanDiagnostic({
      environment: environment(),
      repoRoot: "C:\\repo",
      dependencies: syntheticDependencies({
        planError: Object.assign(new Error("private"), { code: "RECOVERY_MUTABLE_TABLE_UNKNOWN" }),
        mutableCatalogDiagnostic,
      }),
    });
    assert.equal(result.code, "RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID");
    assert.equal("mutableCatalog" in result, false);
    assert.ok(!JSON.stringify(result).includes("private"));
  }
  const managedData = admitManagedDataSql("COPY auth.example (id) FROM stdin;\nprivate\n\\.");
  const forgedOccupancy = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({
      managedData,
      targetTables: Object.freeze([]),
      planError: Object.assign(new Error("private"), { code: "RECOVERY_MUTABLE_TABLE_UNKNOWN" }),
      mutableDataOccupancy: ({ mutableCatalog }) => ({
        ...mutableCatalog,
        missingData: [{ identity: "auth.example", rowState: "NONEMPTY" }],
      }),
    }),
  });
  assert.equal(forgedOccupancy.code, "RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID");
  assert.equal("mutableCatalog" in forgedOccupancy, false);
});

test("plan diagnostic maps unknown plan errors to one fixed unclassified code", async () => {
  const secret = "unknown private failure";
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({ planError: Object.assign(new Error(secret), { code: "PRIVATE_INTERNAL_CODE" }) }),
  });
  assert.equal(result.status, "FINDING");
  assert.equal(result.phase, "RESTORE_PLAN");
  assert.equal(result.code, "RECOVERY_RESTORE_PLAN_DIAGNOSTIC_UNCLASSIFIED");
  assert.ok(!JSON.stringify(result).includes(secret));
});

test("plan diagnostic rejects a plan that is not ready and preserves cleanup", async () => {
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({
      planResult: Object.freeze({
        status: "INVALID",
        storage: Object.freeze({ objectCount: 0, totalBytes: 0 }),
      }),
    }),
  });
  assert.equal(result.status, "FINDING");
  assert.equal(result.phase, "RESTORE_PLAN");
  assert.equal(result.code, "RECOVERY_RESTORE_PLAN_INVALID");
  assert.equal(result.targetCleanup, "PASS");
  assert.equal(result.sourceCleanup, "PASS");
});

test("plan diagnostic rejects non-empty Storage objects", async () => {
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({
      planResult: Object.freeze({
        status: "READY",
        storage: Object.freeze({ objectCount: 1, totalBytes: 128 }),
      }),
    }),
  });
  assert.equal(result.status, "FINDING");
  assert.equal(result.code, "RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED");
  assert.equal(result.targetCleanup, "PASS");
  assert.equal(result.sourceCleanup, "PASS");
});

test("plan diagnostic rejects non-empty Storage bytes even without objects", async () => {
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({
      planResult: Object.freeze({
        status: "READY",
        storage: Object.freeze({ objectCount: 0, totalBytes: 1 }),
      }),
    }),
  });
  assert.equal(result.status, "FINDING");
  assert.equal(result.code, "RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED");
  assert.equal(result.targetCleanup, "PASS");
  assert.equal(result.sourceCleanup, "PASS");
});

test("plan diagnostic rejects invalid Storage shapes without exposing raw values", async () => {
  const invalidPlans = [
    Object.freeze({ status: "READY", privateValue: "missing-storage-secret" }),
    Object.freeze({
      status: "READY",
      storage: Object.freeze({ objectCount: -1, totalBytes: 0, privateValue: "negative-count-secret" }),
    }),
    Object.freeze({
      status: "READY",
      storage: Object.freeze({ objectCount: 0, totalBytes: 0.5, privateValue: "fractional-bytes-secret" }),
    }),
  ];

  for (const planResult of invalidPlans) {
    const result = await runLocalManagedRecoveryPlanDiagnostic({
      environment: environment(),
      repoRoot: "C:\\repo",
      dependencies: syntheticDependencies({ planResult }),
    });
    assert.equal(result.status, "FINDING");
    assert.equal(result.code, "RECOVERY_RESTORE_PLAN_INVALID");
    assert.equal(result.targetCleanup, "PASS");
    assert.equal(result.sourceCleanup, "PASS");
    assert.ok(!JSON.stringify(result).includes("secret"));
    assert.equal("storage" in result, false);
  }
});

test("target cleanup failure overrides a plan finding without leaking it", async () => {
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({
      planError: Object.assign(new Error("private plan failure"), { code: "RECOVERY_MIGRATION_HISTORY_DATA_INVALID" }),
      cleanupError: new Error("private cleanup failure"),
    }),
  });
  assert.equal(result.status, "FAIL");
  assert.equal(result.phase, "TARGET_CLEANUP");
  assert.equal(result.code, "RECOVERY_TARGET_CLEANUP_INCOMPLETE");
  assert.equal(result.targetCleanup, "FAIL");
  assert.equal(result.sourceCleanup, "PASS");
  assert.ok(!JSON.stringify(result).includes("private"));
});

test("source cleanup failure overrides successful plan construction", async () => {
  const result = await runLocalManagedRecoveryPlanDiagnostic({
    environment: environment(),
    repoRoot: "C:\\repo",
    dependencies: syntheticDependencies({
      sourceCleanupError: Object.assign(new Error("private source cleanup"), { code: "RECOVERY_CLEANUP_INCOMPLETE" }),
    }),
  });
  assert.equal(result.status, "FAIL");
  assert.equal(result.phase, "SOURCE_CLEANUP");
  assert.equal(result.code, "RECOVERY_CLEANUP_INCOMPLETE");
  assert.equal(result.targetCleanup, "PASS");
  assert.equal(result.sourceCleanup, "FAIL");
});

test("restore plan diagnostic enum contains only construction-time families", () => {
  const codes = new Set(RESTORE_PLAN_DIAGNOSTIC_CODES);
  for (const code of [
    "RECOVERY_TARGET_BASELINE_INVALID",
    "RECOVERY_VERIFIED_SOURCE_REQUIRED",
    "RECOVERY_ROLES_CREDENTIAL_MATERIAL",
    "RECOVERY_MIGRATION_HISTORY_DATA_INVALID",
    "RECOVERY_MANAGED_DATA_COUNTS_MISMATCH",
    "RECOVERY_MUTABLE_TABLE_UNKNOWN",
    "RECOVERY_AUTH_SANITIZATION_FAILED",
    "RECOVERY_SQL_COPY_MISSING",
    "RECOVERY_STORAGE_PLAN_INVALID",
    "RECOVERY_AUTH_EXPECTATION_INVALID",
    "RECOVERY_STORAGE_EXPECTATION_INVALID",
    "RECOVERY_STORAGE_EXPECTATION_HANDLE_REQUIRED",
    "RECOVERY_VALIDATION_PLAN_INVALID",
    "RECOVERY_LOGIN_EXPECTATION_INVALID",
    "INVENTORY_INVALID",
    "STORAGE_HASH_MISMATCH",
    "UNSAFE_PATH",
  ]) assert.equal(codes.has(code), true, code);
  for (const code of [
    "RECOVERY_STORAGE_METADATA_GATE_FAILED",
    "RECOVERY_DB_VALIDATION_FAILED",
    "RECOVERY_AUTH_LOGIN_FAILED",
    "RECOVERY_APP_START_FAILED",
  ]) assert.equal(codes.has(code), false, code);
  assert.equal(codes.has("RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED"), true);
});

test("plan diagnostic preflight requires local tools without rclone", async () => {
  const executables = [];
  const result = await preflightManagedRecoveryPlanDiagnosticTools({
    environment: {},
    repoRoot: "C:\\repo",
    execute: async ({ executable }) => {
      executables.push(executable);
      if (executable === "age") return { stdout: "age 1.3.1", stderr: "" };
      if (executable === "tar") return { stdout: "tar 1.35", stderr: "" };
      if (executable === "docker") return { stdout: "26.1.1/26.1.1", stderr: "" };
      throw new Error("unexpected executable");
    },
    admitSupabaseCli: async () => ({ version: "2.109.1" }),
  });
  assert.deepEqual(result.map(({ name }) => name), ["node", "age", "tar", "docker", "supabase"]);
  assert.deepEqual(executables, ["age", "tar", "docker"]);
  assert.equal(executables.includes("rclone"), false);
});
