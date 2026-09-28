import { join } from "node:path";

import { isManagedBackupId, readManagedBackupManifest } from "../managed-backup/manifest.mjs";
import { runCommand } from "../managed-backup/command-runner.mjs";
import { createAgeDecryptAdapter } from "./age-decrypt.mjs";
import { verifyLocalRecoveryAppVolumeTopology } from "./application-runtime-topology.mjs";
import { verifyRecoveryAppRuntimeAuthority } from "./app-runtime-authority.mjs";
import { createInteractiveCredentialProvider } from "./interactive-credentials.mjs";
import { buildLocalStorageInventoryPlan, accessLocalStorageCommandPlan, parseLocalStorageInventory } from "./local-storage.mjs";
import { performLocalAuthLogin } from "./local-auth-login.mjs";
import { RECOVERY_APP_CLEANUP_FAILURE_CODES, startLocalRecoveryApp, stopLocalRecoveryApp } from "./local-recovery-app.mjs";
import { createR2RecoverySourceAdapter } from "./r2-recovery-source.mjs";
import { assertRecoveryToolingAuthority, resolveRecoveryToolingAuthority } from "./recovery-tooling-authority.mjs";
import { accessRealRecoveryBoundaries, admitRealRecoveryBoundaries } from "./recovery-boundaries.mjs";
import { admitStorageMetadataGate, authorizeStorageByteRestore } from "./restore-planning.mjs";
import { buildForeignKeyIntegrityQueries, parseForeignKeyCatalog, parsePostRestoreValidationOutputs, validateForeignKeyIntegrityOutputs, validateManagedRestoreResult } from "./restore-validation.mjs";
import {
  probeLocalRecoveryAppLive,
  probeLocalRecoveryAppReady,
  probeLocalRecoveryTargetAuthHealth,
  runRecoveryApplicationBrowserSmoke,
  verifyRlsGrantBaselineAuthority,
} from "./recovery-application-validation.mjs";
import { withVerifiedManagedRecoverySource } from "./source-verification.mjs";
import { accessTargetBaselineEvidence, runTargetBaselineGate } from "./target-baseline.mjs";
import { buildGovernedTargetPsqlPlan, createGovernedTargetCleanupAdapter, createGovernedTargetExecutor, executeGovernedTargetPlan } from "./target-executor.mjs";
import { admitDockerDbDiscovery } from "./target-commands.mjs";
import { cleanupManagedRecoveryTarget, prepareManagedRecoveryTarget, provePreparedRecoveryTargetIsolation, buildManagedRestorePlan } from "./target-restore.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";
import { preflightManagedRecoveryTools } from "./tool-preflight.mjs";

export const RECOVERY_DRILL_CONFIRMATION = "ALLOW_REAL_PRODUCT_BACKUP_LOCAL_RESTORE_DRILL";
export const RECOVERY_DRILL_CONFIRM_ENV = "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM";
export const RECOVERY_DRILL_TOOLING_SHA_ENV = "GODEL_MANAGED_RECOVERY_DRILL_TOOLING_SHA";
export const RECOVERY_DRILL_BACKUP_ID_ENV = "GODEL_MANAGED_RECOVERY_BACKUP_ID";
export const RECOVERY_TOOLING_BRANCH = "ops/managed-free-production-pilot";

const SHA = /^[a-f0-9]{40}$/;
const INCOMPATIBLE_CONFIRMATIONS = Object.freeze([
  "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
  "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM",
]);
const PHASES = new Set([
  "PREFLIGHT", "SOURCE_INSPECT", "SOURCE_DOWNLOAD", "SOURCE_DECRYPT", "SOURCE_VERIFY", "TARGET_PREPARE", "TARGET_START",
  "TARGET_BASELINE", "RESTORE_PLAN", "PRE_MUTATION_REVALIDATION", "RESTORE_EXECUTE", "STORAGE_METADATA", "STORAGE_BYTES",
  "POST_RESTORE_VALIDATION", "AUTH_LOGIN", "TARGET_CLEANUP", "SOURCE_CLEANUP",
  "TARGET_AUTH_HEALTH", "APP_RUNTIME_AUTHORITY", "APP_START", "APP_HEALTH", "APP_LIVE", "APP_READY", "APP_LOGIN", "APP_ACCESS", "APP_CLEANUP",
]);
const PUBLIC_FAILURE_CODES = new Set([
  "COMMAND_FAILED", "EXECUTABLE_UNAVAILABLE", "WRONG_TOOLING_BRANCH", "WRONG_TOOLING_HEAD", "DIRTY_TOOLING_WORKTREE",
  "RECOVERY_DRILL_CONFIRMATION_REQUIRED", "RECOVERY_DRILL_INCOMPATIBLE_CONFIRMATION", "RECOVERY_DRILL_TOOLING_SHA_REQUIRED", "RECOVERY_BACKUP_ID_INVALID",
  "RECOVERY_TOOL_REQUIRED", "RECOVERY_TOOL_VERSION_INVALID", "RECOVERY_AGE_VERSION_MISMATCH", "RECOVERY_SOURCE_CANDIDATE_INVALID",
  "RECOVERY_R2_CANDIDATE_INCOMPLETE", "RECOVERY_R2_LISTING_INVALID", "RECOVERY_RECEIPT_INVALID", "RECOVERY_RECEIPT_IDENTITY_MISMATCH",
  "RECOVERY_CIPHERTEXT_FILENAME_MISMATCH", "RECOVERY_ARTIFACT_DIGEST_MISMATCH", "RECOVERY_DECRYPT_OUTPUT_INVALID", "RECOVERY_TAR_ENTRY_UNSAFE",
  "RECOVERY_ARCHIVE_PATH_UNSAFE", "RECOVERY_ARCHIVE_FORMAT_UNSUPPORTED", "RECOVERY_BUNDLE_EXACT_TREE_MISMATCH", "RECOVERY_SQL_STATEMENT_FORBIDDEN",
  "RECOVERY_RUNTIME_BASELINE_MISMATCH", "RECOVERY_TARGET_STATUS_REMOTE_FORBIDDEN", "RECOVERY_TARGET_DB_CONTAINER_INVALID", "RECOVERY_TARGET_ISOLATION_FAILED",
  "RECOVERY_TARGET_BASELINE_MISMATCH", "RECOVERY_TARGET_SCHEMA_MISSING", "RECOVERY_TARGET_EXTENSION_MISSING", "RECOVERY_TARGET_BUCKET_INVALID",
  "RECOVERY_ROLES_CREDENTIAL_MATERIAL", "RECOVERY_ROLES_DIALECT_UNEXPECTED", "RECOVERY_SCHEMA_UNEXPECTED", "RECOVERY_MIGRATION_HISTORY_MISMATCH",
  "RECOVERY_MANAGED_DATA_COUNTS_MISMATCH", "RECOVERY_MUTABLE_TABLE_UNKNOWN", "RECOVERY_MUTABLE_TABLE_FORBIDDEN", "RECOVERY_LOGIN_EXPECTATION_INVALID",
  "RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED", "RECOVERY_STORAGE_METADATA_GATE_FAILED", "RECOVERY_LOCAL_STORAGE_INVENTORY_INVALID",
  "RECOVERY_VALIDATION_OUTPUT_INVALID", "RECOVERY_DB_ROW_COUNT_MISMATCH", "RECOVERY_DB_VALIDATION_FAILED", "RECOVERY_AUTH_CONTINUITY_FAILED",
  "RECOVERY_AUTH_PASSWORD_CONTINUITY_FAILED", "RECOVERY_AUTH_RELATION_INVALID", "RECOVERY_AUTH_EPHEMERAL_STATE_PRESENT",
  "RECOVERY_REPLICATION_ROLE_NOT_ORIGIN", "RECOVERY_STORAGE_VALIDATION_FAILED", "RECOVERY_AUTH_LOGIN_FAILED", "RECOVERY_AUTH_LOGIN_IDENTITY_MISMATCH",
  "RECOVERY_LOGIN_CANCELLED", "RECOVERY_LOGIN_TTY_REQUIRED", "RECOVERY_TARGET_CLEANUP_INCOMPLETE", "RECOVERY_CLEANUP_INCOMPLETE",
  "RECOVERY_LOGIN_UTF8_INVALID", "RECOVERY_PARENT_REQUIRED", "RECOVERY_PARENT_PATH_INVALID", "RECOVERY_PARENT_UNSAFE",
  "RECOVERY_BACKUP_OUTPUT_ROOT_REQUIRED", "RECOVERY_BACKUP_OUTPUT_ROOT_PATH_INVALID", "RECOVERY_BACKUP_OUTPUT_ROOT_UNSAFE", "RECOVERY_BOUNDARY_HANDLE_INVALID",
  "RECOVERY_FOREIGN_KEY_CATALOG_INVALID", "RECOVERY_FOREIGN_KEY_CATALOG_REQUIRED", "RECOVERY_FOREIGN_KEY_INTEGRITY_OUTPUT_INVALID",
  "RECOVERY_FOREIGN_KEY_INTEGRITY_FAILED", "RECOVERY_FOREIGN_KEY_INTEGRITY_REQUIRED", "RECOVERY_FOREIGN_KEY_TRIGGER_DISABLED",
  "RECOVERY_APP_RUNTIME_AUTHORITY_INVALID", "RECOVERY_APP_RUNTIME_AUTHORITY_UNAVAILABLE", "RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH", "RECOVERY_APP_PACKAGE_MANIFEST_INVALID",
  "RECOVERY_APP_RUNTIME_AUTHORITY_REQUIRED", "RECOVERY_APP_WORKSPACE_INVALID", "RECOVERY_APP_WORKSPACE_HANDLE_INVALID",
  "RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED", "RECOVERY_APP_DIST_DIR_UNSUPPORTED", "RECOVERY_APP_PORT_INVALID", "RECOVERY_APP_HANDLE_INVALID",
  "RECOVERY_TARGET_AUTH_HEALTH_FAILED", "RECOVERY_APP_PROCESS_FAILED", "RECOVERY_APP_START_FAILED", "RECOVERY_APP_HEALTH_FAILED",
  "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH", "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH",
  "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH",
  "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED",
  "RECOVERY_APP_LIVE_REQUEST_FAILED", "RECOVERY_APP_LIVE_RESPONSE_INVALID", "RECOVERY_APP_LIVE_REDIRECTED", "RECOVERY_APP_LIVE_NOT_FOUND",
  "RECOVERY_APP_LIVE_HTTP_REJECTED", "RECOVERY_APP_LIVE_SERVER_ERROR", "RECOVERY_APP_LIVE_BODY_INVALID", "RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED",
  "RECOVERY_APP_LIVE_MODULE_PROJECT_ALIAS_FAILED", "RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED", "RECOVERY_APP_LIVE_MODULE_NEXT_INTERNAL_FAILED",
  "RECOVERY_APP_LIVE_MODULE_DECLARED_PACKAGE_FAILED", "RECOVERY_APP_LIVE_MODULE_OTHER_BARE_PACKAGE_FAILED", "RECOVERY_APP_LIVE_MODULE_NODE_BUILTIN_FAILED",
  "RECOVERY_APP_LIVE_MODULE_ABSOLUTE_PATH_FAILED", "RECOVERY_APP_LIVE_MODULE_REDACTED_PATH_FAILED", "RECOVERY_APP_LIVE_MODULE_LOADER_REQUEST_FAILED",
  "RECOVERY_APP_LIVE_MODULE_UNPARSED_FAILED", "RECOVERY_APP_LIVE_MODULE_MIXED_FAILED", "RECOVERY_APP_LIVE_MODULE_UNKNOWN_FAILED",
  "RECOVERY_APP_LIVE_COMPILE_FAILED", "RECOVERY_APP_LIVE_RUNTIME_FAILED", "RECOVERY_APP_READY_REQUEST_FAILED", "RECOVERY_APP_READY_RESPONSE_INVALID",
  "RECOVERY_APP_READY_REDIRECTED", "RECOVERY_APP_READY_NOT_FOUND", "RECOVERY_APP_READY_HTTP_REJECTED", "RECOVERY_APP_READY_SERVER_ERROR",
  "RECOVERY_APP_READY_BODY_INVALID", "RECOVERY_APP_READY_MODULE_RESOLUTION_FAILED", "RECOVERY_APP_READY_COMPILE_FAILED", "RECOVERY_APP_READY_RUNTIME_FAILED",
  "RECOVERY_APP_READY_MODULE_PROJECT_ALIAS_FAILED", "RECOVERY_APP_READY_MODULE_RELATIVE_IMPORT_FAILED", "RECOVERY_APP_READY_MODULE_NEXT_INTERNAL_FAILED",
  "RECOVERY_APP_READY_MODULE_DECLARED_PACKAGE_FAILED", "RECOVERY_APP_READY_MODULE_OTHER_BARE_PACKAGE_FAILED", "RECOVERY_APP_READY_MODULE_NODE_BUILTIN_FAILED",
  "RECOVERY_APP_READY_MODULE_ABSOLUTE_PATH_FAILED", "RECOVERY_APP_READY_MODULE_REDACTED_PATH_FAILED", "RECOVERY_APP_READY_MODULE_LOADER_REQUEST_FAILED",
  "RECOVERY_APP_READY_MODULE_UNPARSED_FAILED", "RECOVERY_APP_READY_MODULE_MIXED_FAILED", "RECOVERY_APP_READY_MODULE_UNKNOWN_FAILED",
  "RECOVERY_APP_DIAGNOSTIC_CHECKPOINT_INVALID",
  "RECOVERY_APP_LOGIN_EMAIL_REQUIRED",
  "RECOVERY_APP_LOGIN_FAILED", "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED", "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN",
  "RECOVERY_APP_CLEANUP_INCOMPLETE", "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED", "RECOVERY_APP_SHUTDOWN_EXIT_FAILED",
  "RECOVERY_APP_SHUTDOWN_PORT_OPEN", "RECOVERY_RLS_GRANT_BASELINE_UNVERIFIED",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryRealRestoreDrillError";
  error.code = code;
  throw error;
}

export function assertRealRestoreDrillConfirmation(environment = {}) {
  if (environment[RECOVERY_DRILL_CONFIRM_ENV] !== RECOVERY_DRILL_CONFIRMATION) fail("RECOVERY_DRILL_CONFIRMATION_REQUIRED", "Exact real product backup local restore drill confirmation is required");
  if (INCOMPATIBLE_CONFIRMATIONS.some((name) => typeof environment[name] === "string" && environment[name].length > 0)) fail("RECOVERY_DRILL_INCOMPATIBLE_CONFIRMATION", "An incompatible recovery or Production confirmation is present");
  if (!SHA.test(environment[RECOVERY_DRILL_TOOLING_SHA_ENV] ?? "")) fail("RECOVERY_DRILL_TOOLING_SHA_REQUIRED", "Exact recovery drill tooling SHA authority is required");
  if (!isManagedBackupId(environment[RECOVERY_DRILL_BACKUP_ID_ENV])) fail("RECOVERY_BACKUP_ID_INVALID", "Explicit managed backup selection is required");
}

function initialState() {
  return { phase: "PREFLIGHT", realTargetStarts: 0, sqlExecutions: 0, targetMutations: 0, realR2Reads: 0, realAgeDecrypts: 0, remoteActivity: 0 };
}

export function sanitizeRealRestoreDrillFailure(error, state = initialState()) {
  const code = PUBLIC_FAILURE_CODES.has(error?.code) ? error.code : "RECOVERY_DRILL_FAILED";
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return Object.freeze({
    status: "FAIL",
    code,
    phase: PHASES.has(state.phase) ? state.phase : "PREFLIGHT",
    message: "Real managed recovery drill failed safely",
    realTargetStarts: count(state.realTargetStarts),
    sqlExecutions: count(state.sqlExecutions),
    targetMutations: count(state.targetMutations),
    realR2Reads: count(state.realR2Reads),
    realAgeDecrypts: count(state.realAgeDecrypts),
    productionMutations: 0,
  });
}

export function sanitizeRealRestoreDrillPass(value) {
  const fixed = {
    status: "PASS", operation: "real-product-backup-local-restore-drill", sourceVerification: "PASS", targetIsolation: "VERIFIED",
    baselineMigrationCount: 6, restore: "PASS", databaseValidation: "PASS", referentialIntegrity: "PASS", authContinuity: "PASS", realInternalLogin: "PASS",
    storageValidation: "PASS", storageByteRestore: "VALIDATED_NO_OP", targetAuthHealth: "PASS", applicationLive: "PASS", applicationReady: "PASS",
    applicationLogin: "PASS", internalScreen: "PASS", applicationRead: "PASS", anonymousInternalAccess: "REJECTED",
    applicationRemoteIsolation: "VERIFIED", rlsGrantBaseline: "VERIFIED", privateDownload: "NOT_EXERCISED_EMPTY_STORAGE",
    sessionReplicationRole: "origin", realTargetStarts: 1,
    sqlExecutions: 1, targetMutations: 1, realR2Reads: 3, realAgeDecrypts: 1, remoteActivity: 3, productionMutations: 0,
    applicationCleanup: "PASS", targetCleanup: "PASS", sourceCleanup: "PASS",
  };
  if (!value || Object.keys(value).length !== Object.keys(fixed).length || Object.entries(fixed).some(([key, expected]) => value[key] !== expected)) fail("RECOVERY_DRILL_FAILED", "Real managed recovery drill PASS evidence is invalid");
  return Object.freeze({ ...fixed });
}

async function executeValidationQuery({ executor, containerAuthority, query, environment, buildPsql = buildGovernedTargetPsqlPlan, executePlan = executeGovernedTargetPlan }) {
  const plan = buildPsql({ executor, containerAuthority, environment, operation: "query", validationQuery: query });
  return (await executePlan(executor, plan)).stdout;
}

function trackedSourceFactory({ state, factory }) {
  return (options) => {
    const source = factory(options);
    return Object.freeze({
      async inspectCandidate() { state.realR2Reads += 1; state.remoteActivity += 1; return source.inspectCandidate(); },
      async downloadReceipt() { state.realR2Reads += 1; state.remoteActivity += 1; return source.downloadReceipt(); },
      async downloadCiphertext(input) { state.realR2Reads += 1; state.remoteActivity += 1; return source.downloadCiphertext(input); },
    });
  };
}

function trackedDecryptFactory({ state, factory }) {
  return (options) => {
    const adapter = factory(options);
    return Object.freeze({ async decryptToTar(input) { state.realAgeDecrypts += 1; return adapter.decryptToTar(input); } });
  };
}

export async function runRealProductBackupLocalRestoreDrill({ environment = process.env, repoRoot = process.cwd(), dependencies = {} } = {}) {
  const state = initialState();
  try {
    assertRealRestoreDrillConfirmation(environment);
    const execute = dependencies.execute ?? runCommand;
    const authority = await (dependencies.resolveToolingAuthority ?? resolveRecoveryToolingAuthority)({ repoRoot, environment, execute });
    (dependencies.assertToolingAuthority ?? assertRecoveryToolingAuthority)({ authority, expectedBranch: RECOVERY_TOOLING_BRANCH, expectedHead: environment[RECOVERY_DRILL_TOOLING_SHA_ENV] });
    const tools = await (dependencies.preflightTools ?? preflightManagedRecoveryTools)({ environment, repoRoot, execute, admitSupabaseCli: dependencies.admitSupabaseCli });
    const boundaryAuthority = await (dependencies.admitRecoveryBoundaries ?? admitRealRecoveryBoundaries)({ environment, repoRoot, governedRoots: dependencies.sourceDependencies?.governedRoots ?? [] });
    let locations;
    (dependencies.accessRecoveryBoundaries ?? accessRealRecoveryBoundaries)(boundaryAuthority, (value) => { locations = value; });
    await (dependencies.verifyVolumeTopology ?? verifyLocalRecoveryAppVolumeTopology)({
      repoRoot,
      applicationDir: locations.parent,
      platform: dependencies.platform ?? process.platform,
      pathApi: dependencies.pathApi,
    });
    let finalEvidence;
    const withVerifiedSource = dependencies.withVerifiedSource ?? withVerifiedManagedRecoverySource;
    const sourceFactory = trackedSourceFactory({ state, factory: dependencies.sourceAdapterFactory ?? createR2RecoverySourceAdapter });
    const decryptFactory = trackedDecryptFactory({ state, factory: dependencies.decryptAdapterFactory ?? ((options) => createAgeDecryptAdapter({ ...options, execute })) });
    await withVerifiedSource({
      selectedBackupId: environment[RECOVERY_DRILL_BACKUP_ID_ENV], recoveryParent: locations.parent, backupOutputRoot: locations.backupOutputRoot,
      repoRoot, environment, sourceAdapterFactory: sourceFactory, decryptAdapterFactory: decryptFactory,
      dependencies: { ...(dependencies.sourceDependencies ?? {}), preflight: async () => tools, onPhase: (phase) => { state.phase = phase; } },
    }, async (verifiedSource) => {
      let prepared;
      let executor;
      let application;
      let startAttempted = false;
      let primaryError;
      try {
        state.phase = "TARGET_PREPARE";
        const manifest = await (dependencies.readManifest ?? readManagedBackupManifest)(join(verifiedSource.bundleRoot, "internal-manifest.json"));
        prepared = await (dependencies.prepareTarget ?? prepareManagedRecoveryTarget)({ session: verifiedSource.session, manifest, repoRoot, environment, executeGit: execute, probePort: dependencies.probePort, projectId: dependencies.projectId });
        executor = (dependencies.createTargetExecutor ?? createGovernedTargetExecutor)({ prepared, execute });
        state.phase = "TARGET_START";
        startAttempted = true;
        await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.start);
        state.realTargetStarts += 1;

        state.phase = "TARGET_BASELINE";
        const statusOutput = await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.status);
        const localStatus = (dependencies.admitStatus ?? admitLocalSupabaseStatus)(statusOutput.stdout);
        const dockerOutput = await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.discoverDb);
        const containerAuthority = (dependencies.admitDocker ?? admitDockerDbDiscovery)({ projectId: prepared.target.projectId, rawOutput: dockerOutput.stdout });
        const isolation = (dependencies.proveIsolation ?? provePreparedRecoveryTargetIsolation)({ prepared, session: verifiedSource.session, manifest, localStatus, environment: {} });
        if (isolation?.LOCAL_ONLY !== true || isolation?.LINKED_PRODUCTION !== false || isolation?.DISPOSABLE !== true || isolation?.BASELINE_AUTHORITY !== manifest.productionRuntimeSha) fail("RECOVERY_TARGET_ISOLATION_FAILED", "Disposable recovery target isolation could not be proven");
        const baseline = await (dependencies.runBaselineGate ?? runTargetBaselineGate)({ executor, containerAuthority, authority: prepared.authority, environment });

        state.phase = "RESTORE_PLAN";
        let baselineDetails;
        (dependencies.accessBaselineEvidence ?? accessTargetBaselineEvidence)(baseline, (value) => { baselineDetails = value; });
        const restorePlan = await (dependencies.buildRestorePlan ?? buildManagedRestorePlan)({ verifiedSource, authority: prepared.authority, targetState: baselineDetails.targetState, targetTables: baselineDetails.targetTables });
        if (restorePlan.storage.objectCount !== 0 || restorePlan.storage.totalBytes !== 0) fail("RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED", "Nonempty Storage recovery is not authorized while TD-BACKUP-004 remains open");

        state.phase = "PRE_MUTATION_REVALIDATION";
        const freshStatus = (dependencies.admitStatus ?? admitLocalSupabaseStatus)(((await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.status))).stdout);
        const freshContainer = (dependencies.admitDocker ?? admitDockerDbDiscovery)({ projectId: prepared.target.projectId, rawOutput: (await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.discoverDb)).stdout });
        const freshIsolation = (dependencies.proveIsolation ?? provePreparedRecoveryTargetIsolation)({ prepared, session: verifiedSource.session, manifest, localStatus: freshStatus, environment: {} });
        if (freshIsolation?.LOCAL_ONLY !== true || freshIsolation?.LINKED_PRODUCTION !== false || freshIsolation?.DISPOSABLE !== true || freshIsolation?.BASELINE_AUTHORITY !== manifest.productionRuntimeSha) fail("RECOVERY_TARGET_ISOLATION_FAILED", "Recovery target identity changed before mutation");

        state.phase = "RESTORE_EXECUTE";
        const restoreCommand = (dependencies.buildTargetPsql ?? buildGovernedTargetPsqlPlan)({ executor, containerAuthority: freshContainer, environment, operation: "restore", restoreSql: restorePlan.restoreSql });
        state.sqlExecutions += 1;
        await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, restoreCommand);
        state.targetMutations += 1;

        state.phase = "STORAGE_METADATA";
        const metadataOutput = await executeValidationQuery({ executor, containerAuthority: freshContainer, query: restorePlan.validations.storageMetadata, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan });
        const metadataGate = (dependencies.admitStorageMetadata ?? admitStorageMetadataGate)({ rawOutput: metadataOutput, expectedObjectCount: 0 });
        const authorizedStorage = (dependencies.authorizeStorage ?? authorizeStorageByteRestore)(restorePlan.storage, metadataGate);
        if (authorizedStorage.invokeTransfer !== false || authorizedStorage.objectCount !== 0) fail("RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED", "Only empty Storage recovery is authorized");

        state.phase = "STORAGE_BYTES";
        const inventoryPlan = (dependencies.buildStorageInventoryPlan ?? buildLocalStorageInventoryPlan)({ localStatus: freshStatus, cwd: prepared.target.workdir, environment });
        let inventoryCommand;
        (dependencies.accessStorageCommandPlan ?? accessLocalStorageCommandPlan)(inventoryPlan, (value) => { inventoryCommand = value; });
        const inventoryRaw = (await (dependencies.executeStoragePlan ?? execute)(inventoryCommand)).stdout;
        const storageInventory = (dependencies.parseStorageInventory ?? parseLocalStorageInventory)({ rawOutput: inventoryRaw, storageExpectation: restorePlan.expectations.storage });

        state.phase = "POST_RESTORE_VALIDATION";
        const validationOutputs = { tableCounts: [] };
        for (const query of restorePlan.validations.tableCounts) validationOutputs.tableCounts.push(await executeValidationQuery({ executor, containerAuthority: freshContainer, query, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan }));
        validationOutputs.migrationHistory = await executeValidationQuery({ executor, containerAuthority: freshContainer, query: restorePlan.validations.migrationHistory, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan });
        validationOutputs.replicationRole = await executeValidationQuery({ executor, containerAuthority: freshContainer, query: restorePlan.validations.replicationRole, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan });
        validationOutputs.auth = await executeValidationQuery({ executor, containerAuthority: freshContainer, query: restorePlan.validations.auth, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan });
        validationOutputs.constraints = await executeValidationQuery({ executor, containerAuthority: freshContainer, query: restorePlan.validations.constraints, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan });
        validationOutputs.storageMetadata = await executeValidationQuery({ executor, containerAuthority: freshContainer, query: restorePlan.validations.storageMetadata, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan });
        validationOutputs.storageInventory = storageInventory;
        const actual = (dependencies.parseValidationOutputs ?? parsePostRestoreValidationOutputs)({ plan: restorePlan.validations, outputs: validationOutputs });
        const foreignKeyCatalogOutput = await executeValidationQuery({ executor, containerAuthority: freshContainer, query: restorePlan.validations.foreignKeyCatalog, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan });
        const foreignKeyCatalog = (dependencies.parseForeignKeyCatalog ?? parseForeignKeyCatalog)({ mutablePlan: restorePlan.mutable, rawOutput: foreignKeyCatalogOutput });
        const foreignKeyQueries = (dependencies.buildForeignKeyQueries ?? buildForeignKeyIntegrityQueries)(foreignKeyCatalog);
        const foreignKeyOutputs = [];
        for (const query of foreignKeyQueries) foreignKeyOutputs.push(await executeValidationQuery({ executor, containerAuthority: freshContainer, query, environment, buildPsql: dependencies.buildTargetPsql, executePlan: dependencies.executeTargetPlan }));
        const referentialIntegrity = (dependencies.validateForeignKeyOutputs ?? validateForeignKeyIntegrityOutputs)({ catalog: foreignKeyCatalog, outputs: foreignKeyOutputs });
        const validation = (dependencies.validateRestore ?? validateManagedRestoreResult)({ expected: restorePlan.expectations, actual, referentialIntegrity });

        state.phase = "AUTH_LOGIN";
        const provider = dependencies.credentialProvider ?? createInteractiveCredentialProvider();
        let credentials = await provider.getCredentials();
        const login = await (dependencies.performLogin ?? performLocalAuthLogin)({ localStatus: freshStatus, loginExpectation: restorePlan.loginExpectation, credentials, createSupabaseClient: dependencies.createSupabaseClient });
        if (login?.status !== "PASS") fail("RECOVERY_AUTH_LOGIN_FAILED", "Local recovery Auth login failed");
        let targetAuthHealth;
        let live;
        let ready;
        let appValidation;
        let rlsGrantBaseline;
        try {
          state.phase = "TARGET_AUTH_HEALTH";
          targetAuthHealth = await (dependencies.probeTargetAuthHealth ?? probeLocalRecoveryTargetAuthHealth)(freshStatus, { request: dependencies.targetAuthHealthRequest });
          if (targetAuthHealth?.targetAuthHealth !== "PASS") fail("RECOVERY_TARGET_AUTH_HEALTH_FAILED", "Recovery target Auth health gate failed");
          state.phase = "APP_RUNTIME_AUTHORITY";
          const appRuntimeAuthority = await (dependencies.verifyAppRuntimeAuthority ?? verifyRecoveryAppRuntimeAuthority)({ runtimeSha: manifest.productionRuntimeSha, toolingSha: authority.head, repoRoot, environment, execute });
          state.phase = "APP_START";
          application = await (dependencies.startRecoveryApp ?? startLocalRecoveryApp)({ localStatus: freshStatus, session: verifiedSource.session, runtimeAuthority: appRuntimeAuthority, repoRoot, sourceEnvironment: environment, execute, allocatePort: dependencies.allocateAppPort, forkProcess: dependencies.forkAppProcess });
          state.phase = "APP_LIVE";
          live = await (dependencies.probeRecoveryAppLive ?? probeLocalRecoveryAppLive)(application, { request: dependencies.appHealthRequest });
          if (live?.applicationLive !== "PASS") fail("RECOVERY_APP_LIVE_BODY_INVALID", "Recovery application live response is invalid");
          state.phase = "APP_READY";
          ready = await (dependencies.probeRecoveryAppReady ?? probeLocalRecoveryAppReady)(application, { request: dependencies.appHealthRequest });
          if (ready?.applicationReady !== "PASS") fail("RECOVERY_APP_READY_BODY_INVALID", "Recovery application ready response is invalid");
          state.phase = "APP_LOGIN";
          appValidation = await (dependencies.validateRecoveryApp ?? runRecoveryApplicationBrowserSmoke)({ app: application, localStatus: freshStatus, credentials, launchBrowser: dependencies.launchRecoveryBrowser });
          state.phase = "APP_ACCESS";
          rlsGrantBaseline = (dependencies.verifyRlsGrantBaseline ?? verifyRlsGrantBaselineAuthority)({ baseline, restorePlan });
        } finally {
          credentials = undefined;
        }
        finalEvidence = {
          status: "PASS", operation: "real-product-backup-local-restore-drill", sourceVerification: "PASS", targetIsolation: "VERIFIED",
          baselineMigrationCount: baseline.baseline.migrationCount, restore: "PASS", databaseValidation: validation.database,
          referentialIntegrity: validation.referentialIntegrity, authContinuity: validation.auth, realInternalLogin: "PASS", storageValidation: validation.storage,
          storageByteRestore: "VALIDATED_NO_OP", targetAuthHealth: targetAuthHealth.targetAuthHealth,
          applicationLive: live.applicationLive, applicationReady: ready.applicationReady,
          applicationLogin: appValidation.applicationLogin, internalScreen: appValidation.internalScreen, applicationRead: appValidation.applicationRead,
          anonymousInternalAccess: appValidation.anonymousInternalAccess, applicationRemoteIsolation: appValidation.applicationRemoteIsolation,
          rlsGrantBaseline: rlsGrantBaseline.rlsGrantBaseline, privateDownload: "NOT_EXERCISED_EMPTY_STORAGE", sessionReplicationRole: validation.sessionReplicationRole,
          realTargetStarts: state.realTargetStarts, sqlExecutions: state.sqlExecutions, targetMutations: state.targetMutations,
          realR2Reads: state.realR2Reads, realAgeDecrypts: state.realAgeDecrypts, remoteActivity: state.remoteActivity,
          productionMutations: 0, applicationCleanup: "PENDING", targetCleanup: "PENDING", sourceCleanup: "PENDING",
        };
      } catch (error) {
        primaryError = error;
      } finally {
        let applicationCleanupError;
        let targetCleanupError;
        if (application) {
          try {
            await (dependencies.stopRecoveryApp ?? stopLocalRecoveryApp)(application);
            if (finalEvidence) finalEvidence.applicationCleanup = "PASS";
          } catch (error) {
            const code = RECOVERY_APP_CLEANUP_FAILURE_CODES.includes(error?.code) ? error.code : "RECOVERY_APP_CLEANUP_INCOMPLETE";
            applicationCleanupError = Object.assign(new Error("Recovery application cleanup did not complete"), { code });
          }
        }
        if (startAttempted && prepared && executor) {
          try {
            await (dependencies.cleanupTarget ?? cleanupManagedRecoveryTarget)({ session: verifiedSource.session, target: prepared.target, adapter: (dependencies.createCleanupAdapter ?? createGovernedTargetCleanupAdapter)(executor) });
            if (finalEvidence) finalEvidence.targetCleanup = "PASS";
          } catch {
            targetCleanupError = Object.assign(new Error("Disposable recovery target cleanup did not complete"), { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" });
          }
        }
        if (targetCleanupError) { state.phase = "TARGET_CLEANUP"; throw targetCleanupError; }
        if (applicationCleanupError) { state.phase = "APP_CLEANUP"; throw applicationCleanupError; }
      }
      if (primaryError) throw primaryError;
      return { status: "PASS", phase: "APP_ACCESS", remoteActivity: state.remoteActivity, realTargetStarts: state.realTargetStarts, targetMutations: state.targetMutations, sqlExecutions: state.sqlExecutions, realR2Reads: state.realR2Reads, realAgeDecrypts: state.realAgeDecrypts };
    });
    state.phase = "SOURCE_CLEANUP";
    finalEvidence.sourceCleanup = "PASS";
    return sanitizeRealRestoreDrillPass(finalEvidence);
  } catch (error) {
    if (error?.code === "RECOVERY_CLEANUP_INCOMPLETE") state.phase = "SOURCE_CLEANUP";
    return sanitizeRealRestoreDrillFailure(error, state);
  }
}
