import assert from "node:assert/strict";
import test from "node:test";

import {
  RECOVERY_DRILL_BACKUP_ID_ENV,
  RECOVERY_DRILL_CONFIRMATION,
  RECOVERY_DRILL_CONFIRM_ENV,
  RECOVERY_DRILL_TOOLING_SHA_ENV,
  RECOVERY_TOOLING_BRANCH,
  runRealProductBackupLocalRestoreDrill,
  sanitizeRealRestoreDrillFailure,
} from "./real-restore-drill-core.mjs";

const HEAD = "a".repeat(40);
const RUNTIME = "b".repeat(40);
const BACKUP_ID = "GDBK-20260925T120000Z-AAAAAAAA";

function environment(overrides = {}) {
  return { [RECOVERY_DRILL_CONFIRM_ENV]: RECOVERY_DRILL_CONFIRMATION, [RECOVERY_DRILL_TOOLING_SHA_ENV]: HEAD, [RECOVERY_DRILL_BACKUP_ID_ENV]: BACKUP_ID, ...overrides };
}

function fixture(behavior = {}) {
  const events = [];
  const commandPlans = { start: { name: "start" }, status: { name: "status" }, discoverDb: { name: "discover" }, stop: { name: "stop" }, verifyCleanupContainers: {}, verifyCleanupVolumes: {}, verifyCleanupNetworks: {} };
  const prepared = { status: "PREPARED", target: { projectId: "godel-m53-restore-abcdef123456", workdir: "C:\\session\\target" }, authority: { evidence: { versions: ["1", "2", "3", "4", "5", "6"] } }, commandPlans };
  const restoreSql = Object.freeze({ status: "READY" });
  const validations = { tableCounts: ["count-a", "count-b"], migrationHistory: "migrations", replicationRole: "role", auth: "auth", constraints: "constraints", foreignKeyCatalog: "fk-catalog", storageMetadata: "metadata" };
  const storageExpectation = Object.freeze({ status: "EXPECTED" });
  const restorePlan = {
    storage: { status: behavior.nonemptyStorage ? "PENDING_METADATA_GATE" : "VALIDATED_NO_OP", objectCount: behavior.nonemptyStorage ? 1 : 0, totalBytes: behavior.nonemptyStorage ? 4 : 0 },
    restoreSql, mutable: Object.freeze({ status: "ADMITTED" }), validations, expectations: { tableCounts: {}, auth: {}, storage: storageExpectation }, loginExpectation: Object.freeze({ status: "ADMITTED" }),
  };
  let restorePlans = 0;
  const dependencies = {
    resolveToolingAuthority: async () => ({ branch: behavior.branch ?? RECOVERY_TOOLING_BRANCH, head: behavior.head ?? HEAD, clean: behavior.clean ?? true }),
    preflightTools: async () => { events.push("preflight-tools"); return []; },
    admitRecoveryBoundaries: async () => Object.freeze({ status: "ADMITTED" }),
    accessRecoveryBoundaries: (_handle, callback) => callback({ parent: "C:\\recovery-parent", backupOutputRoot: "C:\\backup-boundary" }),
    sourceAdapterFactory: () => ({
      async inspectCandidate() { events.push("source-inspect"); if (behavior.sourcePhase === "SOURCE_INSPECT") throw Object.assign(new Error("secret path C:\\private"), { code: "RECOVERY_R2_CANDIDATE_INCOMPLETE" }); return { status: "VERIFIED" }; },
      async downloadReceipt() { events.push("source-receipt"); if (behavior.sourcePhase === "SOURCE_DOWNLOAD") throw Object.assign(new Error("secret receipt"), { code: "RECOVERY_RECEIPT_INVALID" }); return {}; },
      async downloadCiphertext() { events.push("source-ciphertext"); return "cipher"; },
    }),
    decryptAdapterFactory: () => ({ async decryptToTar() { events.push("source-decrypt"); if (behavior.sourcePhase === "SOURCE_DECRYPT") throw Object.assign(new Error("identity C:\\secret"), { code: "COMMAND_FAILED" }); } }),
    withVerifiedSource: async (options, callback) => {
      let primary;
      let value;
      try {
        options.dependencies.onPhase("SOURCE_INSPECT");
        const source = options.sourceAdapterFactory({});
        await source.inspectCandidate();
        options.dependencies.onPhase("SOURCE_DOWNLOAD");
        await source.downloadReceipt();
        await source.downloadCiphertext({});
        options.dependencies.onPhase("SOURCE_DECRYPT");
        await options.decryptAdapterFactory({ session: { plaintext: "C:\\session\\plaintext" } }).decryptToTar({});
        options.dependencies.onPhase("SOURCE_VERIFY");
        if (behavior.sourcePhase === "SOURCE_VERIFY") throw Object.assign(new Error("bundle secret"), { code: behavior.sourceCode ?? "RECOVERY_BUNDLE_EXACT_TREE_MISMATCH" });
        value = await callback({ session: { target: prepared.target.workdir }, bundleRoot: "C:\\session\\plaintext\\bundle", sql: { managedData: {} } });
      } catch (error) { primary = error; }
      events.push("source-cleanup");
      if (behavior.sourceCleanupFailure) throw Object.assign(new Error("cleanup path"), { code: "RECOVERY_CLEANUP_INCOMPLETE" });
      if (primary) throw primary;
      return value;
    },
    readManifest: async () => ({ status: "COMPLETE", productionRuntimeSha: RUNTIME }),
    prepareTarget: async () => { events.push("target-prepare"); if (behavior.targetPhase === "TARGET_PREPARE") throw Object.assign(new Error("prepare"), { code: "RECOVERY_RUNTIME_BASELINE_MISMATCH" }); return prepared; },
    createTargetExecutor: () => Object.freeze({ status: "READY" }),
    executeTargetPlan: async (_executor, plan) => {
      if (plan === commandPlans.start) { events.push("target-start"); if (behavior.targetPhase === "TARGET_START") throw Object.assign(new Error("start secret"), { code: "COMMAND_FAILED" }); return { stdout: "" }; }
      if (plan === commandPlans.status) { events.push("target-status"); return { stdout: "status" }; }
      if (plan === commandPlans.discoverDb) { events.push("target-discover"); return { stdout: "docker" }; }
      if (plan.operation === "restore") { events.push("restore-execute"); if (behavior.restoreFailure) throw Object.assign(new Error("SQL secret"), { code: "COMMAND_FAILED" }); return { stdout: "" }; }
      if (plan.operation === "query") { events.push(`query:${plan.validationQuery}`); return { stdout: plan.validationQuery === "metadata" ? JSON.stringify({ bucketExists: true, bucketPublic: false, objectCount: 0, unexpectedObjectCount: 0 }) : "synthetic" }; }
      throw new Error("unexpected plan");
    },
    admitStatus: () => { if (behavior.targetPhase === "STATUS") throw Object.assign(new Error("remote url"), { code: "RECOVERY_TARGET_STATUS_REMOTE_FORBIDDEN" }); return Object.freeze({ status: "ADMITTED" }); },
    admitDocker: () => { if (behavior.targetPhase === "DOCKER") throw Object.assign(new Error("container id"), { code: "RECOVERY_TARGET_DB_CONTAINER_INVALID" }); return Object.freeze({ status: "VERIFIED" }); },
    proveIsolation: () => behavior.targetPhase === "ISOLATION" ? { LOCAL_ONLY: false } : { LOCAL_ONLY: true, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: RUNTIME },
    runBaselineGate: async () => { events.push("baseline"); if (behavior.targetPhase === "BASELINE") throw Object.assign(new Error("catalog"), { code: "RECOVERY_TARGET_BASELINE_MISMATCH" }); return Object.freeze({ baseline: { migrationCount: 6 } }); },
    accessBaselineEvidence: (_handle, callback) => callback({ targetState: {}, targetTables: [] }),
    buildRestorePlan: async () => { events.push("restore-plan"); if (behavior.planFailure) throw Object.assign(new Error("roles sql secret"), { code: behavior.planFailure }); return restorePlan; },
    buildTargetPsql: (input) => { if (input.operation === "restore") restorePlans += 1; return { operation: input.operation, validationQuery: input.validationQuery, restoreSql: input.restoreSql }; },
    admitStorageMetadata: (input) => { events.push("metadata-gate"); if (behavior.metadataFailure) throw Object.assign(new Error("metadata"), { code: "RECOVERY_STORAGE_METADATA_GATE_FAILED" }); return Object.freeze({ status: "PASS", input }); },
    authorizeStorage: () => ({ status: "VALIDATED_NO_OP", invokeTransfer: false, objectCount: 0 }),
    buildStorageInventoryPlan: () => Object.freeze({ status: "READY" }),
    accessStorageCommandPlan: (_handle, callback) => callback({ operation: "local-storage-inventory" }),
    executeStoragePlan: async () => { events.push("storage-inventory"); return { stdout: "[]" }; },
    parseStorageInventory: () => ({ objectCount: 0, totalBytes: 0, inventoryDigest: "a".repeat(64), unexpectedObjectCount: 0 }),
    parseValidationOutputs: () => { if (behavior.validationFailure) throw Object.assign(new Error("digest secret"), { code: behavior.validationFailure }); return {}; },
    parseForeignKeyCatalog: () => Object.freeze({ status: "ADMITTED" }),
    buildForeignKeyQueries: () => ["fk-check"],
    validateForeignKeyOutputs: () => { if (behavior.foreignKeyFailure) throw Object.assign(new Error("relation secret"), { code: "RECOVERY_FOREIGN_KEY_INTEGRITY_FAILED" }); return Object.freeze({ status: "PASS", referentialIntegrity: "PASS" }); },
    validateRestore: () => ({ status: "PASS", database: "PASS", auth: "PASS", storage: "PASS", referentialIntegrity: "PASS", sessionReplicationRole: "origin" }),
    credentialProvider: { getCredentials: async () => ({ identifier: "secret@example.invalid", password: "secret-password" }) },
    performLogin: async () => { events.push("login"); if (behavior.loginFailure) throw Object.assign(new Error("token secret-token"), { code: "RECOVERY_AUTH_LOGIN_FAILED" }); return { status: "PASS" }; },
    createCleanupAdapter: () => Object.freeze({}),
    cleanupTarget: async () => { events.push("target-cleanup"); if (behavior.targetCleanupFailure) throw new Error("container secret"); return { status: "PASS" }; },
  };
  return { dependencies, events, restoreSql, get restorePlans() { return restorePlans; } };
}

test("confirmation, exact branch/HEAD/clean authority, backup selection, and incompatible confirmations fail before source", async () => {
  for (const [env, behavior, code] of [
    [{}, {}, "RECOVERY_DRILL_CONFIRMATION_REQUIRED"],
    [environment({ [RECOVERY_DRILL_BACKUP_ID_ENV]: "bad" }), {}, "RECOVERY_BACKUP_ID_INVALID"],
    [environment({ GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM: "present" }), {}, "RECOVERY_DRILL_INCOMPATIBLE_CONFIRMATION"],
    [environment(), { branch: "wrong" }, "WRONG_TOOLING_BRANCH"],
    [environment(), { head: "c".repeat(40) }, "WRONG_TOOLING_HEAD"],
    [environment(), { clean: false }, "DIRTY_TOOLING_WORKTREE"],
  ]) {
    const item = fixture(behavior);
    const result = await runRealProductBackupLocalRestoreDrill({ environment: env, repoRoot: "C:\\repo", dependencies: item.dependencies });
    assert.equal(result.code, code);
    assert.equal(result.sqlExecutions, 0);
    assert.ok(!item.events.includes("source-inspect"));
  }
});

test("synthetic PASS follows source-target-mutation-storage-validation-login-cleanup order with exact counters", async () => {
  const item = fixture();
  const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.deepEqual(result, {
    status: "PASS", operation: "real-product-backup-local-restore-drill", sourceVerification: "PASS", targetIsolation: "VERIFIED", baselineMigrationCount: 6,
    restore: "PASS", databaseValidation: "PASS", referentialIntegrity: "PASS", authContinuity: "PASS", realInternalLogin: "PASS", storageValidation: "PASS",
    storageByteRestore: "VALIDATED_NO_OP", sessionReplicationRole: "origin", realTargetStarts: 1, sqlExecutions: 1, targetMutations: 1,
    realR2Reads: 3, realAgeDecrypts: 1, remoteActivity: 3, productionMutations: 0, targetCleanup: "PASS", sourceCleanup: "PASS",
  });
  assert.equal(item.restorePlans, 1);
  assert.ok(item.events.indexOf("baseline") < item.events.indexOf("restore-plan"));
  assert.ok(item.events.indexOf("restore-execute") < item.events.indexOf("metadata-gate"));
  assert.ok(item.events.indexOf("storage-inventory") < item.events.indexOf("login"));
  assert.deepEqual(item.events.slice(-2), ["target-cleanup", "source-cleanup"]);
  assert.ok(!JSON.stringify(result).includes(BACKUP_ID));
  assert.ok(!JSON.stringify(result).includes("secret@example.invalid"));
});

test("source verification failures cover inspect/download/decrypt/TAR-bundle-SQL gates and never create target", async () => {
  for (const [sourcePhase, sourceCode] of [
    ["SOURCE_INSPECT", "RECOVERY_R2_CANDIDATE_INCOMPLETE"], ["SOURCE_DOWNLOAD", "RECOVERY_RECEIPT_INVALID"], ["SOURCE_DECRYPT", "COMMAND_FAILED"],
    ["SOURCE_VERIFY", "RECOVERY_TAR_ENTRY_UNSAFE"], ["SOURCE_VERIFY", "RECOVERY_BUNDLE_EXACT_TREE_MISMATCH"], ["SOURCE_VERIFY", "RECOVERY_SQL_STATEMENT_FORBIDDEN"],
  ]) {
    const item = fixture({ sourcePhase, sourceCode });
    const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
    assert.equal(result.code, sourceCode);
    assert.equal(result.sqlExecutions, 0);
    assert.equal(result.targetMutations, 0);
    assert.ok(!item.events.includes("target-prepare"));
    assert.equal(item.events.at(-1), "source-cleanup");
  }
});

test("target start/status/DB/isolation/baseline and restore-plan failures block mutation and clean when started", async () => {
  const cases = [
    [{ targetPhase: "TARGET_START" }, "COMMAND_FAILED"], [{ targetPhase: "STATUS" }, "RECOVERY_TARGET_STATUS_REMOTE_FORBIDDEN"],
    [{ targetPhase: "DOCKER" }, "RECOVERY_TARGET_DB_CONTAINER_INVALID"], [{ targetPhase: "ISOLATION" }, "RECOVERY_TARGET_ISOLATION_FAILED"],
    [{ targetPhase: "BASELINE" }, "RECOVERY_TARGET_BASELINE_MISMATCH"], [{ planFailure: "RECOVERY_ROLES_CREDENTIAL_MATERIAL" }, "RECOVERY_ROLES_CREDENTIAL_MATERIAL"],
    [{ planFailure: "RECOVERY_MUTABLE_TABLE_UNKNOWN" }, "RECOVERY_MUTABLE_TABLE_UNKNOWN"], [{ planFailure: "RECOVERY_LOGIN_EXPECTATION_INVALID" }, "RECOVERY_LOGIN_EXPECTATION_INVALID"],
  ];
  for (const [behavior, code] of cases) {
    const item = fixture(behavior);
    const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
    assert.equal(result.code, code);
    assert.equal(result.sqlExecutions, 0);
    assert.equal(result.targetMutations, 0);
    if (behavior.targetPhase === "TARGET_START") assert.equal(result.realTargetStarts, 0);
    assert.ok(item.events.includes("target-cleanup"));
  }
});

test("FK data failure occurs after aggregate validation and blocks real login", async () => {
  const item = fixture({ foreignKeyFailure: true });
  const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.equal(result.code, "RECOVERY_FOREIGN_KEY_INTEGRITY_FAILED");
  assert.ok(item.events.includes("query:fk-catalog"));
  assert.ok(item.events.includes("query:fk-check"));
  assert.ok(!item.events.includes("login"));
  assert.ok(item.events.includes("target-cleanup"));
});

test("nonempty Product Storage is refused without restore SQL while empty Storage requires metadata and final local inventory", async () => {
  const blocked = fixture({ nonemptyStorage: true });
  const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: blocked.dependencies });
  assert.equal(result.code, "RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED");
  assert.equal(result.sqlExecutions, 0);
  assert.ok(!blocked.events.includes("storage-inventory"));
  const metadata = fixture({ metadataFailure: true });
  const failed = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: metadata.dependencies });
  assert.equal(failed.code, "RECOVERY_STORAGE_METADATA_GATE_FAILED");
  assert.equal(failed.sqlExecutions, 1);
  assert.equal(failed.targetMutations, 1);
  assert.ok(!metadata.events.includes("storage-inventory"));
});

test("restore attempt is counted once, successful mutation only after success, and every post-start failure cleans", async () => {
  const failedRestore = fixture({ restoreFailure: true });
  const restoreResult = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: failedRestore.dependencies });
  assert.equal(restoreResult.sqlExecutions, 1);
  assert.equal(restoreResult.targetMutations, 0);
  assert.equal(failedRestore.restorePlans, 1);
  assert.ok(failedRestore.events.includes("target-cleanup"));
  for (const code of ["RECOVERY_DB_ROW_COUNT_MISMATCH", "RECOVERY_AUTH_PASSWORD_CONTINUITY_FAILED", "RECOVERY_AUTH_CONTINUITY_FAILED", "RECOVERY_AUTH_RELATION_INVALID", "RECOVERY_AUTH_EPHEMERAL_STATE_PRESENT", "RECOVERY_DB_VALIDATION_FAILED", "RECOVERY_REPLICATION_ROLE_NOT_ORIGIN", "RECOVERY_STORAGE_VALIDATION_FAILED"]) {
    const item = fixture({ validationFailure: code });
    const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
    assert.equal(result.code, code);
    assert.equal(result.sqlExecutions, 1);
    assert.equal(result.targetMutations, 1);
    assert.ok(item.events.includes("target-cleanup"));
  }
});

test("login occurs only after full validation and exposes no credential, token, UUID, path, or raw error", async () => {
  const item = fixture({ loginFailure: true });
  const result = await runRealProductBackupLocalRestoreDrill({ environment: environment({ LOGIN_IDENTIFIER: "must-not-be-read", LOGIN_PASSWORD: "must-not-be-read" }), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.equal(result.code, "RECOVERY_AUTH_LOGIN_FAILED");
  assert.equal(result.phase, "AUTH_LOGIN");
  const serialized = JSON.stringify(result);
  for (const secret of ["secret-token", "secret@example.invalid", "secret-password", "C:\\session", BACKUP_ID]) assert.ok(!serialized.includes(secret));
  assert.ok(item.events.indexOf("query:constraints") < item.events.indexOf("query:fk-catalog"));
  assert.ok(item.events.indexOf("query:fk-check") < item.events.indexOf("login"));
});

test("target cleanup failure is visible and source cleanup failure overrides primary failure", async () => {
  let item = fixture({ targetCleanupFailure: true });
  let result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.equal(result.code, "RECOVERY_TARGET_CLEANUP_INCOMPLETE");
  assert.equal(result.phase, "TARGET_CLEANUP");
  assert.equal(item.events.at(-1), "source-cleanup");
  item = fixture({ restoreFailure: true, sourceCleanupFailure: true });
  result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.equal(result.code, "RECOVERY_CLEANUP_INCOMPLETE");
  assert.equal(result.phase, "SOURCE_CLEANUP");
});

test("failure sanitizer is strict and never propagates arbitrary secrets", () => {
  const result = sanitizeRealRestoreDrillFailure(Object.assign(new Error("token secret UUID 11111111-1111-4111-8111-111111111111 C:\\private"), { code: "RECOVERY_SQL_STATEMENT_FORBIDDEN" }), { phase: "SOURCE_VERIFY", realTargetStarts: 0, sqlExecutions: 0, targetMutations: 0, realR2Reads: 2, realAgeDecrypts: 1 });
  assert.deepEqual(result, { status: "FAIL", code: "RECOVERY_SQL_STATEMENT_FORBIDDEN", phase: "SOURCE_VERIFY", message: "Real managed recovery drill failed safely", realTargetStarts: 0, sqlExecutions: 0, targetMutations: 0, realR2Reads: 2, realAgeDecrypts: 1, productionMutations: 0 });
});
