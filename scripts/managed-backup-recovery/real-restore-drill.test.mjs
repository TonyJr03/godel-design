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
  let directLoginCredentials;
  const application = Object.freeze({ status: "RUNNING" });
  const dependencies = {
    platform: "win32",
    resolveToolingAuthority: async () => ({ branch: behavior.branch ?? RECOVERY_TOOLING_BRANCH, head: behavior.head ?? HEAD, clean: behavior.clean ?? true }),
    preflightTools: async () => { events.push("preflight-tools"); return []; },
    admitRecoveryBoundaries: async () => Object.freeze({ status: "ADMITTED" }),
    accessRecoveryBoundaries: (_handle, callback) => callback({ parent: behavior.recoveryParent ?? "C:\\recovery-parent", backupOutputRoot: "C:\\backup-boundary" }),
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
        value = await callback({ session: { root: "C:\\session", target: prepared.target.workdir, evidence: "C:\\session\\evidence" }, bundleRoot: "C:\\session\\plaintext\\bundle", sql: { managedData: {} } });
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
    credentialProvider: { getCredentials: async () => { events.push("credential-prompt"); return { identifier: "secret@example.invalid", password: "secret-password" }; } },
    performLogin: async ({ credentials }) => { events.push("login"); directLoginCredentials = credentials; if (behavior.loginFailure) throw Object.assign(new Error("token secret-token"), { code: "RECOVERY_AUTH_LOGIN_FAILED" }); return { status: "PASS" }; },
    probeTargetAuthHealth: async () => { events.push("target-auth-health"); if (behavior.appFailure === "TARGET_AUTH") throw Object.assign(new Error("local auth endpoint"), { code: "RECOVERY_TARGET_AUTH_HEALTH_FAILED" }); return Object.freeze({ targetAuthHealth: "PASS" }); },
    verifyAppRuntimeAuthority: async () => { events.push("app-runtime-authority"); if (behavior.appFailure === "RUNTIME") throw Object.assign(new Error("changed private path"), { code: "RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH" }); return Object.freeze({ status: "VERIFIED" }); },
    verifyRlsGrantBaseline: () => { events.push("rls-grant-baseline"); if (behavior.appFailure === "ACCESS") throw Object.assign(new Error("baseline detail"), { code: "RECOVERY_RLS_GRANT_BASELINE_UNVERIFIED" }); return Object.freeze({ status: "VERIFIED", rlsGrantBaseline: "VERIFIED" }); },
    startRecoveryApp: async () => {
      events.push("app-start");
      if (behavior.appFailure === "START") throw Object.assign(new Error("local path"), { code: "RECOVERY_APP_START_FAILED" });
      if (behavior.appStartCode) throw Object.assign(new Error("private dependency path"), { code: behavior.appStartCode });
      return application;
    },
    probeRecoveryAppLive: async () => {
      events.push("app-live");
      if (behavior.liveCode) throw Object.assign(new Error("local live endpoint"), { code: behavior.liveCode });
      return Object.freeze({ applicationLive: "PASS" });
    },
    probeRecoveryAppReady: async () => {
      events.push("app-ready");
      if (behavior.readyCode) throw Object.assign(new Error("local ready endpoint"), { code: behavior.readyCode });
      return Object.freeze({ applicationReady: "PASS" });
    },
    validateRecoveryApp: async ({ credentials }) => {
      events.push("app-browser");
      assert.strictEqual(credentials, directLoginCredentials);
      if (behavior.appFailure === "BROWSER") throw Object.assign(new Error("credential endpoint token"), { code: "RECOVERY_APP_LOGIN_FAILED" });
      return Object.freeze({ applicationLogin: "PASS", internalScreen: "PASS", applicationRead: "PASS", anonymousInternalAccess: "REJECTED", applicationRemoteIsolation: "VERIFIED" });
    },
    stopRecoveryApp: async (handle) => {
      assert.strictEqual(handle, application);
      events.push("app-cleanup");
      if (behavior.appCleanupFailure || behavior.appCleanupCode) {
        throw Object.assign(new Error("app process path"), behavior.appCleanupCode ? { code: behavior.appCleanupCode } : {});
      }
      return { status: "PASS" };
    },
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

test("real restore rejects a cross-volume recovery parent before source or target activity", async () => {
  const item = fixture({ recoveryParent: "C:\\recovery-parent" });
  const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "D:\\repo", dependencies: item.dependencies });
  assert.deepEqual(result, {
    status: "FAIL",
    code: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH",
    phase: "PREFLIGHT",
    message: "Real managed recovery drill failed safely",
    realTargetStarts: 0,
    sqlExecutions: 0,
    targetMutations: 0,
    realR2Reads: 0,
    realAgeDecrypts: 0,
    productionMutations: 0,
  });
  for (const forbiddenEvent of ["source-inspect", "source-receipt", "source-ciphertext", "source-decrypt", "target-prepare", "target-start"]) {
    assert.ok(!item.events.includes(forbiddenEvent));
  }
  assert.doesNotMatch(JSON.stringify(result), /C:|D:|recovery-parent|repo/i);
});

test("synthetic PASS follows source-target-mutation-storage-validation-login-cleanup order with exact counters", async () => {
  const item = fixture();
  const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.deepEqual(result, {
    status: "PASS", operation: "real-product-backup-local-restore-drill", sourceVerification: "PASS", targetIsolation: "VERIFIED", baselineMigrationCount: 6,
    restore: "PASS", databaseValidation: "PASS", referentialIntegrity: "PASS", authContinuity: "PASS", realInternalLogin: "PASS", storageValidation: "PASS",
    storageByteRestore: "VALIDATED_NO_OP", targetAuthHealth: "PASS", applicationLive: "PASS", applicationReady: "PASS", applicationLogin: "PASS", internalScreen: "PASS",
    applicationRead: "PASS", anonymousInternalAccess: "REJECTED", applicationRemoteIsolation: "VERIFIED", rlsGrantBaseline: "VERIFIED",
    privateDownload: "NOT_EXERCISED_EMPTY_STORAGE", sessionReplicationRole: "origin", realTargetStarts: 1, sqlExecutions: 1, targetMutations: 1,
    realR2Reads: 3, realAgeDecrypts: 1, remoteActivity: 3, productionMutations: 0, applicationCleanup: "PASS", targetCleanup: "PASS", sourceCleanup: "PASS",
  });
  assert.equal(item.restorePlans, 1);
  assert.ok(item.events.indexOf("baseline") < item.events.indexOf("restore-plan"));
  assert.ok(item.events.indexOf("restore-execute") < item.events.indexOf("metadata-gate"));
  assert.ok(item.events.indexOf("storage-inventory") < item.events.indexOf("login"));
  assert.ok(item.events.indexOf("login") < item.events.indexOf("target-auth-health"));
  assert.ok(item.events.indexOf("target-auth-health") < item.events.indexOf("app-runtime-authority"));
  assert.ok(item.events.indexOf("login") < item.events.indexOf("app-runtime-authority"));
  assert.ok(item.events.indexOf("app-live") < item.events.indexOf("app-ready"));
  assert.ok(item.events.indexOf("app-ready") < item.events.indexOf("app-browser"));
  assert.equal(item.events.filter((event) => event === "credential-prompt").length, 1);
  assert.deepEqual(item.events.slice(-3), ["app-cleanup", "target-cleanup", "source-cleanup"]);
  const serialized = JSON.stringify(result);
  for (const forbidden of [BACKUP_ID, "secret@example.invalid", "secret-password", "127.0.0.1", "local-anon-key", "secret-token", "C:\\session", "C:\\repo"]) assert.ok(!serialized.includes(forbidden));
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

test("target Auth, application authority, start, split health, and browser failures preserve phase and cleanup", async () => {
  const moduleCodes = [
    "PROJECT_ALIAS", "RELATIVE_IMPORT", "NEXT_INTERNAL", "DECLARED_PACKAGE", "OTHER_BARE_PACKAGE", "NODE_BUILTIN",
    "ABSOLUTE_PATH", "REDACTED_PATH", "LOADER_REQUEST", "UNPARSED", "MIXED", "UNKNOWN",
  ].map((category) => `MODULE_${category}_FAILED`);
  const liveCodes = ["REQUEST_FAILED", "REDIRECTED", "NOT_FOUND", "HTTP_REJECTED", "SERVER_ERROR", "BODY_INVALID", "MODULE_RESOLUTION_FAILED", ...moduleCodes, "COMPILE_FAILED", "RUNTIME_FAILED"].map((suffix) => `RECOVERY_APP_LIVE_${suffix}`);
  const readyCodes = ["REQUEST_FAILED", "REDIRECTED", "NOT_FOUND", "HTTP_REJECTED", "SERVER_ERROR", "BODY_INVALID", "MODULE_RESOLUTION_FAILED", ...moduleCodes, "COMPILE_FAILED", "RUNTIME_FAILED"].map((suffix) => `RECOVERY_APP_READY_${suffix}`);
  for (const [behavior, code, phase, appStarted] of [
    [{ appFailure: "TARGET_AUTH" }, "RECOVERY_TARGET_AUTH_HEALTH_FAILED", "TARGET_AUTH_HEALTH", false],
    [{ appFailure: "RUNTIME" }, "RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH", "APP_RUNTIME_AUTHORITY", false],
    [{ appFailure: "START" }, "RECOVERY_APP_START_FAILED", "APP_START", false],
    [{ appStartCode: "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID" }, "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "APP_START", false],
    [{ appStartCode: "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID" }, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "APP_START", false],
    [{ appStartCode: "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH" }, "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH", "APP_START", false],
    [{ appStartCode: "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH" }, "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH", "APP_START", false],
    [{ appStartCode: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH" }, "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH", "APP_START", false],
    ...liveCodes.map((code) => [{ liveCode: code }, code, "APP_LIVE", true]),
    ...readyCodes.map((code) => [{ readyCode: code }, code, "APP_READY", true]),
    [{ appFailure: "BROWSER" }, "RECOVERY_APP_LOGIN_FAILED", "APP_LOGIN", true],
    [{ appFailure: "ACCESS" }, "RECOVERY_RLS_GRANT_BASELINE_UNVERIFIED", "APP_ACCESS", true],
  ]) {
    const item = fixture(behavior);
    const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
    assert.equal(result.code, code);
    assert.equal(result.phase, phase);
    assert.equal(item.events.includes("app-cleanup"), appStarted);
    assert.ok(item.events.includes("target-cleanup"));
    assert.equal(item.events.at(-1), "source-cleanup");
  }
});

test("real restore preserves dependency unmount failure as sanitized APP_CLEANUP evidence", async () => {
  const item = fixture({ appCleanupCode: "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED" });
  const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.equal(result.code, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  assert.equal(result.phase, "APP_CLEANUP");
  assert.doesNotMatch(JSON.stringify(result), /private dependency|path/i);
});

test("cleanup precedence is source over target over application over primary", async () => {
  let item = fixture({ appFailure: "BROWSER", appCleanupFailure: true });
  let result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.equal(result.code, "RECOVERY_APP_CLEANUP_INCOMPLETE");
  assert.equal(result.phase, "APP_CLEANUP");
  assert.ok(item.events.includes("target-cleanup"));

  item = fixture({ appFailure: "BROWSER", appCleanupFailure: true, targetCleanupFailure: true });
  result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.equal(result.code, "RECOVERY_TARGET_CLEANUP_INCOMPLETE");
  assert.equal(result.phase, "TARGET_CLEANUP");

  item = fixture({ appFailure: "BROWSER", appCleanupFailure: true, targetCleanupFailure: true, sourceCleanupFailure: true });
  result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
  assert.equal(result.code, "RECOVERY_CLEANUP_INCOMPLETE");
  assert.equal(result.phase, "SOURCE_CLEANUP");
});

test("real restore preserves fixed shutdown codes as sanitized APP_CLEANUP failures", async () => {
  for (const code of [
    "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED",
    "RECOVERY_APP_SHUTDOWN_EXIT_FAILED",
    "RECOVERY_APP_SHUTDOWN_PORT_OPEN",
  ]) {
    const item = fixture({ appCleanupCode: code });
    const result = await runRealProductBackupLocalRestoreDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: item.dependencies });
    assert.equal(result.status, "FAIL");
    assert.equal(result.code, code);
    assert.equal(result.phase, "APP_CLEANUP");
    assert.doesNotMatch(JSON.stringify(result), /app process path/i);
    assert.ok(item.events.includes("target-cleanup"));
    assert.equal(item.events.at(-1), "source-cleanup");
  }
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
  const result = sanitizeRealRestoreDrillFailure(Object.assign(new Error("token secret UUID 11111111-1111-4111-8111-111111111111 C:\\private"), {
    code: "RECOVERY_SQL_STATEMENT_FORBIDDEN",
    statementClass: "SET_PARAMETER",
    parameter: "default_tablespace",
    rawSql: "SET default_tablespace = 'secret';",
  }), { phase: "SOURCE_VERIFY", realTargetStarts: 0, sqlExecutions: 0, targetMutations: 0, realR2Reads: 2, realAgeDecrypts: 1 });
  assert.deepEqual(result, { status: "FAIL", code: "RECOVERY_SQL_STATEMENT_FORBIDDEN", phase: "SOURCE_VERIFY", message: "Real managed recovery drill failed safely", realTargetStarts: 0, sqlExecutions: 0, targetMutations: 0, realR2Reads: 2, realAgeDecrypts: 1, productionMutations: 0 });
});

test("R2 local environment admission codes remain sanitized in the real restore public contract", () => {
  for (const code of ["RECOVERY_R2_LOCAL_ENV_FILE_MISSING", "RECOVERY_R2_LOCAL_ENV_INVALID", "RECOVERY_R2_LOCAL_ENV_CONFLICT"]) {
    const result = sanitizeRealRestoreDrillFailure(Object.assign(new Error("secret path and value"), { code, path: "C:\\private", value: "secret" }));
    assert.equal(result.code, code);
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  }
});
