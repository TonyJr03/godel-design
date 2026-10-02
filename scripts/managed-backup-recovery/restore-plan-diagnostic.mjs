import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { isManagedBackupId, readManagedBackupManifest } from "../managed-backup/manifest.mjs";
import { createAgeDecryptAdapter } from "./age-decrypt.mjs";
import { createLocalRecoverySourceAdapter } from "./local-recovery-source.mjs";
import { accessRealRecoveryBoundaries, admitRealRecoveryBoundaries } from "./recovery-boundaries.mjs";
import { assertRecoveryToolingAuthority, resolveRecoveryToolingAuthority } from "./recovery-tooling-authority.mjs";
import { withVerifiedManagedRecoverySource } from "./source-verification.mjs";
import { accessTargetBaselineEvidence, runTargetBaselineGate } from "./target-baseline.mjs";
import { createGovernedTargetCleanupAdapter, createGovernedTargetExecutor, executeGovernedTargetPlan } from "./target-executor.mjs";
import { admitDockerDbDiscovery } from "./target-commands.mjs";
import {
  buildManagedRestorePlan,
  cleanupManagedRecoveryTarget,
  prepareManagedRecoveryTarget,
  provePreparedRecoveryTargetIsolation,
} from "./target-restore.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";
import { preflightManagedRecoveryPlanDiagnosticTools } from "./tool-preflight.mjs";
import { classifyMutableCatalogMismatch, validateMutableCatalogDiagnostic } from "./restore-planning.mjs";

export const RESTORE_PLAN_DIAGNOSTIC_CONFIRM_ENV = "GODEL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC_CONFIRM";
export const RESTORE_PLAN_DIAGNOSTIC_CONFIRMATION = "ALLOW_LOCAL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC";

const RECOVERY_DRILL_TOOLING_SHA_ENV = "GODEL_MANAGED_RECOVERY_DRILL_TOOLING_SHA";
const RECOVERY_DRILL_BACKUP_ID_ENV = "GODEL_MANAGED_RECOVERY_BACKUP_ID";
const RECOVERY_TOOLING_BRANCH = "ops/managed-free-production-pilot";
const SHA = /^[a-f0-9]{40}$/;
const REQUIRED_PATH_ENV = Object.freeze([
  ["GODEL_MANAGED_RECOVERY_PARENT", "RECOVERY_PARENT_REQUIRED"],
  ["GODEL_MANAGED_RECOVERY_BACKUP_OUTPUT_ROOT", "RECOVERY_BACKUP_OUTPUT_ROOT_REQUIRED"],
  ["GODEL_MANAGED_RECOVERY_IDENTITY_FILE", "RECOVERY_IDENTITY_REQUIRED"],
]);
const INCOMPATIBLE_CONFIRMATIONS = Object.freeze([
  "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM",
  "GODEL_MANAGED_RECOVERY_SOURCE_DIAGNOSTIC_CONFIRM",
  "GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM",
  "GODEL_MANAGED_RECOVERY_APP_LOCAL_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
  "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM",
]);
const PHASES = new Set([
  "PREFLIGHT",
  "SOURCE_INSPECT",
  "SOURCE_DOWNLOAD",
  "SOURCE_DECRYPT",
  "SOURCE_VERIFY",
  "TARGET_PREPARE",
  "TARGET_START",
  "TARGET_BASELINE",
  "RESTORE_PLAN",
  "TARGET_CLEANUP",
  "SOURCE_CLEANUP",
]);

export const RESTORE_PLAN_DIAGNOSTIC_CODES = Object.freeze([
  "RECOVERY_VERIFIED_SOURCE_REQUIRED",
  "RECOVERY_TARGET_BASELINE_INVALID",
  "RECOVERY_TARGET_BASELINE_MISMATCH",
  "RECOVERY_TARGET_SCHEMA_MISSING",
  "RECOVERY_TARGET_EXTENSION_MISSING",
  "RECOVERY_TARGET_BUCKET_INVALID",
  "RECOVERY_ROLES_CREDENTIAL_MATERIAL",
  "RECOVERY_ROLES_DIALECT_UNEXPECTED",
  "RECOVERY_SQL_AUDIT_INVALID",
  "RECOVERY_SCHEMA_ROLE_FORBIDDEN",
  "RECOVERY_SCHEMA_UNEXPECTED",
  "RECOVERY_SCHEMA_MISSING",
  "RECOVERY_EXTENSION_UNEXPECTED",
  "RECOVERY_MIGRATION_HISTORY_EXPECTATION_INVALID",
  "RECOVERY_MIGRATION_HISTORY_SCHEMA_INVALID",
  "RECOVERY_MIGRATION_HISTORY_DATA_INVALID",
  "RECOVERY_MIGRATION_HISTORY_MISMATCH",
  "RECOVERY_RESTORE_ARTIFACT_INVALID",
  "RECOVERY_MANAGED_DATA_COUNTS_INVALID",
  "RECOVERY_MANAGED_DATA_COUNTS_MISMATCH",
  "RECOVERY_MUTABLE_PLAN_INVALID",
  "RECOVERY_TARGET_CATALOG_IDENTITY_INVALID",
  "RECOVERY_TARGET_CATALOG_DUPLICATE",
  "RECOVERY_MUTABLE_TABLE_FORBIDDEN",
  "RECOVERY_MUTABLE_TABLE_UNKNOWN",
  "RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID",
  "RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_TOO_LARGE",
  "RECOVERY_MUTABLE_PLAN_EMPTY",
  "RECOVERY_AUTH_SANITIZATION_FAILED",
  "RECOVERY_SQL_INVALID",
  "RECOVERY_SQL_ADMISSION_REQUIRED",
  "RECOVERY_SQL_STATEMENT_FORBIDDEN",
  "RECOVERY_SQL_META_COMMAND_FORBIDDEN",
  "RECOVERY_SQL_COPY_UNSUPPORTED",
  "RECOVERY_SQL_COPY_INVALID",
  "RECOVERY_SQL_COPY_DUPLICATE",
  "RECOVERY_SQL_COPY_MISSING",
  "RECOVERY_SQL_SCHEMA_FORBIDDEN",
  "RECOVERY_SQL_SEQUENCE_SCHEMA_FORBIDDEN",
  "RECOVERY_MUTABLE_PLAN_REQUIRED",
  "RECOVERY_RESTORE_AUTHORITY_INVALID",
  "RECOVERY_RESTORE_PLAN_INVALID",
  "RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED",
  "RECOVERY_RESTORE_TRANSACTION_FORBIDDEN",
  "RECOVERY_STORAGE_PLAN_INVALID",
  "RECOVERY_AUTH_EXPECTATION_INVALID",
  "RECOVERY_AUTH_RELATION_INVALID",
  "RECOVERY_STORAGE_EXPECTATION_INVALID",
  "RECOVERY_STORAGE_EXPECTATION_HANDLE_REQUIRED",
  "RECOVERY_VALIDATION_INPUT_INVALID",
  "RECOVERY_VALIDATION_PLAN_INVALID",
  "RECOVERY_LOGIN_EXPECTATION_INVALID",
  "INVENTORY_INVALID",
  "DUPLICATE_PATH",
  "WRONG_BUCKET",
  "COMMITTED_ITEM_INVALID",
  "TRANSIENT_ITEM_INVALID",
  "ARCHIVO_ROW_MISSING",
  "ARCHIVO_RELATION_MISMATCH",
  "STORAGE_METADATA_MISSING",
  "STORAGE_METADATA_MISMATCH",
  "CAPTURED_BYTE_MISSING",
  "STORAGE_SIZE_MISMATCH",
  "STORAGE_HASH_MISMATCH",
  "UNEXPECTED_CAPTURED_BYTE",
  "STORAGE_COUNT_MISMATCH",
  "UNSAFE_PATH",
]);

const RESTORE_PLAN_CODE_SET = new Set(RESTORE_PLAN_DIAGNOSTIC_CODES);
const PUBLIC_FAILURE_CODES = new Set([
  "COMMAND_FAILED",
  "EXECUTABLE_UNAVAILABLE",
  "WRONG_TOOLING_BRANCH",
  "WRONG_TOOLING_HEAD",
  "DIRTY_TOOLING_WORKTREE",
  "RECOVERY_PLAN_DIAGNOSTIC_CONFIRMATION_REQUIRED",
  "RECOVERY_PLAN_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION",
  "RECOVERY_DRILL_TOOLING_SHA_REQUIRED",
  "RECOVERY_BACKUP_ID_INVALID",
  "RECOVERY_PARENT_REQUIRED",
  "RECOVERY_PARENT_PATH_INVALID",
  "RECOVERY_PARENT_UNSAFE",
  "RECOVERY_BACKUP_OUTPUT_ROOT_REQUIRED",
  "RECOVERY_BACKUP_OUTPUT_ROOT_PATH_INVALID",
  "RECOVERY_BACKUP_OUTPUT_ROOT_UNSAFE",
  "RECOVERY_IDENTITY_REQUIRED",
  "RECOVERY_IDENTITY_PATH_INVALID",
  "RECOVERY_IDENTITY_FILE_INVALID",
  "RECOVERY_IDENTITY_LOCATION_FORBIDDEN",
  "RECOVERY_TOOL_REQUIRED",
  "RECOVERY_TOOL_VERSION_INVALID",
  "RECOVERY_AGE_VERSION_MISMATCH",
  "RECOVERY_TARGET_ISOLATION_FAILED",
  "RECOVERY_TARGET_CLEANUP_INCOMPLETE",
  "RECOVERY_CLEANUP_INCOMPLETE",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryPlanDiagnosticError";
  error.code = code;
  throw error;
}

export function assertLocalManagedRecoveryPlanDiagnosticConfirmation(environment = {}) {
  if (environment[RESTORE_PLAN_DIAGNOSTIC_CONFIRM_ENV] !== RESTORE_PLAN_DIAGNOSTIC_CONFIRMATION) {
    fail("RECOVERY_PLAN_DIAGNOSTIC_CONFIRMATION_REQUIRED", "Exact local managed recovery plan diagnostic confirmation is required");
  }
  if (INCOMPATIBLE_CONFIRMATIONS.some((name) => typeof environment[name] === "string" && environment[name].length > 0)) {
    fail("RECOVERY_PLAN_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION", "An incompatible recovery or Production confirmation is present");
  }
  if (!SHA.test(environment[RECOVERY_DRILL_TOOLING_SHA_ENV] ?? "")) {
    fail("RECOVERY_DRILL_TOOLING_SHA_REQUIRED", "Exact recovery diagnostic tooling SHA authority is required");
  }
  if (!isManagedBackupId(environment[RECOVERY_DRILL_BACKUP_ID_ENV])) {
    fail("RECOVERY_BACKUP_ID_INVALID", "Explicit managed backup selection is required");
  }
  for (const [name, code] of REQUIRED_PATH_ENV) {
    if (typeof environment[name] !== "string" || environment[name].trim() === "") fail(code, "Explicit local recovery path authority is required");
  }
}

function initialState() {
  return {
    phase: "PREFLIGHT",
    localAgeDecrypts: 0,
    realTargetStarts: 0,
    sqlExecutions: 0,
    targetMutations: 0,
    targetCleanup: "NOT_STARTED",
    sourceCleanup: "NOT_STARTED",
  };
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function cleanupStatus(value) {
  return value === "PASS" || value === "FAIL" ? value : "NOT_STARTED";
}

function fixedEvidence(state) {
  return {
    operation: "local-managed-recovery-plan-diagnostic",
    phase: PHASES.has(state.phase) ? state.phase : "PREFLIGHT",
    localAgeDecrypts: count(state.localAgeDecrypts),
    realTargetStarts: count(state.realTargetStarts),
    sqlExecutions: 0,
    targetMutations: 0,
    realR2Reads: 0,
    remoteActivity: 0,
    productionMutations: 0,
    targetCleanup: cleanupStatus(state.targetCleanup),
    sourceCleanup: cleanupStatus(state.sourceCleanup),
  };
}

export function sanitizeLocalManagedRecoveryPlanDiagnosticFailure(error, state = initialState()) {
  const evidence = fixedEvidence(state);
  if (state.phase === "RESTORE_PLAN") {
    if (error?.code === "RECOVERY_MUTABLE_TABLE_UNKNOWN") {
      let mutableCatalog;
      try {
        mutableCatalog = validateMutableCatalogDiagnostic(error.mutableCatalog);
      } catch {
        return Object.freeze({
          status: "FINDING",
          ...evidence,
          phase: "RESTORE_PLAN",
          code: "RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID",
        });
      }
      return Object.freeze({
        status: "FINDING",
        ...evidence,
        phase: "RESTORE_PLAN",
        code: "RECOVERY_MUTABLE_TABLE_UNKNOWN",
        mutableCatalog,
      });
    }
    return Object.freeze({
      status: "FINDING",
      ...evidence,
      phase: "RESTORE_PLAN",
      code: RESTORE_PLAN_CODE_SET.has(error?.code) ? error.code : "RECOVERY_RESTORE_PLAN_DIAGNOSTIC_UNCLASSIFIED",
    });
  }
  return Object.freeze({
    status: "FAIL",
    ...evidence,
    code: PUBLIC_FAILURE_CODES.has(error?.code) ? error.code : "RECOVERY_RESTORE_PLAN_DIAGNOSTIC_FAILED",
  });
}

function trackedDecryptFactory(state, factory) {
  return (options) => {
    const adapter = factory(options);
    return Object.freeze({
      async decryptToTar(input) {
        state.localAgeDecrypts += 1;
        return adapter.decryptToTar(input);
      },
    });
  };
}

function assertRestorePlanDiagnosticPostconditions(restorePlan) {
  if (
    restorePlan?.status !== "READY"
    || typeof restorePlan.storage !== "object"
    || restorePlan.storage === null
    || !Number.isSafeInteger(restorePlan.storage.objectCount)
    || restorePlan.storage.objectCount < 0
    || !Number.isSafeInteger(restorePlan.storage.totalBytes)
    || restorePlan.storage.totalBytes < 0
  ) fail("RECOVERY_RESTORE_PLAN_INVALID", "Restore plan is not ready for the authorized diagnostic scope");

  if (restorePlan.storage.objectCount !== 0 || restorePlan.storage.totalBytes !== 0) {
    fail("RECOVERY_NONEMPTY_STORAGE_NOT_AUTHORIZED", "Non-empty Storage is not authorized for this diagnostic");
  }

  return "EMPTY_ONLY";
}

export async function runLocalManagedRecoveryPlanDiagnostic({ environment = process.env, repoRoot = process.cwd(), dependencies = {} } = {}) {
  const state = initialState();
  let storageScope;
  try {
    assertLocalManagedRecoveryPlanDiagnosticConfirmation(environment);
    const execute = dependencies.execute ?? runCommand;
    const authority = await (dependencies.resolveToolingAuthority ?? resolveRecoveryToolingAuthority)({ repoRoot, environment, execute });
    (dependencies.assertToolingAuthority ?? assertRecoveryToolingAuthority)({
      authority,
      expectedBranch: RECOVERY_TOOLING_BRANCH,
      expectedHead: environment[RECOVERY_DRILL_TOOLING_SHA_ENV],
    });
    const tools = await (dependencies.preflightTools ?? preflightManagedRecoveryPlanDiagnosticTools)({
      environment,
      repoRoot,
      execute,
      admitSupabaseCli: dependencies.admitSupabaseCli,
    });
    const boundaryAuthority = await (dependencies.admitRecoveryBoundaries ?? admitRealRecoveryBoundaries)({
      environment,
      repoRoot,
      governedRoots: dependencies.sourceDependencies?.governedRoots ?? [],
    });
    let locations;
    (dependencies.accessRecoveryBoundaries ?? accessRealRecoveryBoundaries)(boundaryAuthority, (value) => { locations = value; });

    const sourceFactory = dependencies.sourceAdapterFactory ?? ((options) => createLocalRecoverySourceAdapter({
      ...options,
      backupOutputRoot: locations.backupOutputRoot,
    }));
    const decryptFactory = trackedDecryptFactory(
      state,
      dependencies.decryptAdapterFactory ?? ((options) => createAgeDecryptAdapter({ ...options, execute })),
    );
    const withVerifiedSource = dependencies.withVerifiedSource ?? withVerifiedManagedRecoverySource;

    await withVerifiedSource({
      selectedBackupId: environment[RECOVERY_DRILL_BACKUP_ID_ENV],
      recoveryParent: locations.parent,
      backupOutputRoot: locations.backupOutputRoot,
      repoRoot,
      environment,
      sourceAdapterFactory: sourceFactory,
      decryptAdapterFactory: decryptFactory,
      dependencies: {
        ...(dependencies.sourceDependencies ?? {}),
        preflight: async () => tools,
        onPhase: (phase) => { state.phase = phase; },
      },
    }, async (verifiedSource) => {
      let prepared;
      let executor;
      let startAttempted = false;
      let primaryError;
      try {
        state.phase = "TARGET_PREPARE";
        const manifest = await (dependencies.readManifest ?? readManagedBackupManifest)(join(verifiedSource.bundleRoot, "internal-manifest.json"));
        prepared = await (dependencies.prepareTarget ?? prepareManagedRecoveryTarget)({
          session: verifiedSource.session,
          manifest,
          repoRoot,
          environment,
          executeGit: execute,
          probePort: dependencies.probePort,
          projectId: dependencies.projectId,
        });
        executor = (dependencies.createTargetExecutor ?? createGovernedTargetExecutor)({ prepared, execute });

        state.phase = "TARGET_START";
        startAttempted = true;
        await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.start);
        state.realTargetStarts += 1;

        state.phase = "TARGET_BASELINE";
        const statusOutput = await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.status);
        const localStatus = (dependencies.admitStatus ?? admitLocalSupabaseStatus)(statusOutput.stdout);
        const dockerOutput = await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.discoverDb);
        const containerAuthority = (dependencies.admitDocker ?? admitDockerDbDiscovery)({
          projectId: prepared.target.projectId,
          rawOutput: dockerOutput.stdout,
        });
        const isolation = (dependencies.proveIsolation ?? provePreparedRecoveryTargetIsolation)({
          prepared,
          session: verifiedSource.session,
          manifest,
          localStatus,
          environment: {},
        });
        if (
          isolation?.LOCAL_ONLY !== true
          || isolation.LINKED_PRODUCTION !== false
          || isolation.DISPOSABLE !== true
          || isolation.BASELINE_AUTHORITY !== manifest.productionRuntimeSha
        ) fail("RECOVERY_TARGET_ISOLATION_FAILED", "Disposable recovery target isolation could not be proven");
        const baseline = await (dependencies.runBaselineGate ?? runTargetBaselineGate)({
          executor,
          containerAuthority,
          authority: prepared.authority,
          environment,
        });

        state.phase = "RESTORE_PLAN";
        let baselineDetails;
        (dependencies.accessBaselineEvidence ?? accessTargetBaselineEvidence)(baseline, (value) => { baselineDetails = value; });
        let restorePlan;
        try {
          restorePlan = await (dependencies.buildRestorePlan ?? buildManagedRestorePlan)({
            verifiedSource,
            authority: prepared.authority,
            targetState: baselineDetails.targetState,
            targetTables: baselineDetails.targetTables,
          });
        } catch (error) {
          if (error?.code !== "RECOVERY_MUTABLE_TABLE_UNKNOWN") throw error;
          let mutableCatalog;
          try {
            mutableCatalog = (dependencies.classifyMutableCatalogMismatch ?? classifyMutableCatalogMismatch)({
              admission: verifiedSource.sql.managedData,
              targetTables: baselineDetails.targetTables,
            });
          } catch (diagnosticError) {
            const code = diagnosticError?.code === "RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_TOO_LARGE"
              ? diagnosticError.code
              : "RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID";
            throw Object.assign(new Error("Mutable catalog diagnosis could not be bounded safely"), { code });
          }
          throw Object.assign(new Error("Mutable source and target catalogs diverge"), {
            code: "RECOVERY_MUTABLE_TABLE_UNKNOWN",
            mutableCatalog,
          });
        }
        storageScope = assertRestorePlanDiagnosticPostconditions(restorePlan);
      } catch (error) {
        primaryError = error;
      } finally {
        if (startAttempted && prepared && executor) {
          try {
            await (dependencies.cleanupTarget ?? cleanupManagedRecoveryTarget)({
              session: verifiedSource.session,
              target: prepared.target,
              adapter: (dependencies.createCleanupAdapter ?? createGovernedTargetCleanupAdapter)(executor),
            });
            state.targetCleanup = "PASS";
          } catch {
            state.phase = "TARGET_CLEANUP";
            state.targetCleanup = "FAIL";
            throw Object.assign(new Error("Disposable recovery target cleanup did not complete"), { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" });
          }
        }
      }
      if (primaryError) throw primaryError;
      return {
        status: "PASS",
        phase: "RESTORE_PLAN",
        remoteActivity: 0,
        realTargetStarts: state.realTargetStarts,
        targetMutations: 0,
        sqlExecutions: 0,
        realR2Reads: 0,
        realAgeDecrypts: state.localAgeDecrypts,
      };
    });
    state.phase = "RESTORE_PLAN";
    state.sourceCleanup = "PASS";
    return Object.freeze({ status: "PASS", ...fixedEvidence(state), restorePlan: "READY", storageScope });
  } catch (error) {
    if (error?.code === "RECOVERY_CLEANUP_INCOMPLETE") {
      state.phase = "SOURCE_CLEANUP";
      state.sourceCleanup = "FAIL";
    } else if (state.phase !== "PREFLIGHT") {
      state.sourceCleanup = "PASS";
    }
    return sanitizeLocalManagedRecoveryPlanDiagnosticFailure(error, state);
  }
}

export async function main() {
  const result = await runLocalManagedRecoveryPlanDiagnostic();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
