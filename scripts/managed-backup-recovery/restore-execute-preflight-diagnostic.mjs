import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { isManagedBackupId, readManagedBackupManifest } from "../managed-backup/manifest.mjs";
import { createAgeDecryptAdapter } from "./age-decrypt.mjs";
import { createLocalRecoverySourceAdapter } from "./local-recovery-source.mjs";
import { accessRealRecoveryBoundaries, admitRealRecoveryBoundaries } from "./recovery-boundaries.mjs";
import { assertRecoveryToolingAuthority, resolveRecoveryToolingAuthority } from "./recovery-tooling-authority.mjs";
import {
  accessRestoreExecutePreflightFinding,
  buildRestoreExecutePreflight,
  evaluateRestoreExecutePreflight,
  RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES,
} from "./restore-execute-preflight.mjs";
import { withVerifiedManagedRecoverySource } from "./source-verification.mjs";
import { accessTargetBaselineEvidence, runTargetBaselineGate } from "./target-baseline.mjs";
import { createGovernedTargetCleanupAdapter, createGovernedTargetExecutor, buildGovernedTargetReadOnlyDiagnosticPsqlPlan, executeGovernedTargetPlan } from "./target-executor.mjs";
import { admitDockerDbDiscovery } from "./target-commands.mjs";
import { buildManagedRestorePlan, cleanupManagedRecoveryTarget, prepareManagedRecoveryTarget, provePreparedRecoveryTargetIsolation } from "./target-restore.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";
import { preflightManagedRecoveryPlanDiagnosticTools } from "./tool-preflight.mjs";

export const RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRM_ENV = "GODEL_MANAGED_RECOVERY_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRM";
export const RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRMATION = "ALLOW_LOCAL_MANAGED_RECOVERY_EXECUTE_PREFLIGHT_DIAGNOSTIC";

const TOOLING_SHA_ENV = "GODEL_MANAGED_RECOVERY_DRILL_TOOLING_SHA";
const BACKUP_ID_ENV = "GODEL_MANAGED_RECOVERY_BACKUP_ID";
const TOOLING_BRANCH = "ops/managed-free-production-pilot";
const SHA = /^[a-f0-9]{40}$/;
const REQUIRED_PATH_ENV = Object.freeze([
  ["GODEL_MANAGED_RECOVERY_PARENT", "RECOVERY_PARENT_REQUIRED"],
  ["GODEL_MANAGED_RECOVERY_BACKUP_OUTPUT_ROOT", "RECOVERY_BACKUP_OUTPUT_ROOT_REQUIRED"],
  ["GODEL_MANAGED_RECOVERY_IDENTITY_FILE", "RECOVERY_IDENTITY_REQUIRED"],
]);
const INCOMPATIBLE_CONFIRMATIONS = Object.freeze([
  "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM",
  "GODEL_MANAGED_RECOVERY_PLAN_DIAGNOSTIC_CONFIRM",
  "GODEL_MANAGED_RECOVERY_SOURCE_DIAGNOSTIC_CONFIRM",
  "GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM",
  "GODEL_MANAGED_RECOVERY_APP_LOCAL_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
  "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM",
]);
const PHASES = new Set([
  "PREFLIGHT", "SOURCE_INSPECT", "SOURCE_DOWNLOAD", "SOURCE_DECRYPT", "SOURCE_VERIFY",
  "TARGET_PREPARE", "TARGET_START", "TARGET_BASELINE", "RESTORE_PLAN",
  "RESTORE_EXECUTE_PREFLIGHT", "TARGET_CLEANUP", "SOURCE_CLEANUP",
]);
const PREFLIGHT_FINDING_CODES = new Set([
  "RECOVERY_RESTORE_EXECUTE_REPLICATION_ROLE_UNAUTHORIZED",
  "RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING",
  "RECOVERY_RESTORE_EXECUTE_TARGET_REQUIRED_COLUMN_MISSING",
  "RECOVERY_RESTORE_EXECUTE_GENERATED_COLUMN_CONFLICT",
  "RECOVERY_RESTORE_EXECUTE_TRUNCATE_FK_OPEN",
  "RECOVERY_RESTORE_EXECUTE_SEQUENCE_MISSING",
  "RECOVERY_RESTORE_EXECUTE_SEQUENCE_UNAUTHORIZED",
  "RECOVERY_RESTORE_EXECUTE_TABLE_PRIVILEGE_MISSING",
]);
const PUBLIC_FAILURE_CODES = new Set([
  "COMMAND_FAILED", "EXECUTABLE_UNAVAILABLE", "WRONG_TOOLING_BRANCH", "WRONG_TOOLING_HEAD", "DIRTY_TOOLING_WORKTREE",
  "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRMATION_REQUIRED",
  "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION",
  "RECOVERY_DRILL_TOOLING_SHA_REQUIRED", "RECOVERY_BACKUP_ID_INVALID",
  "RECOVERY_PARENT_REQUIRED", "RECOVERY_PARENT_PATH_INVALID", "RECOVERY_PARENT_UNSAFE",
  "RECOVERY_BACKUP_OUTPUT_ROOT_REQUIRED", "RECOVERY_BACKUP_OUTPUT_ROOT_PATH_INVALID", "RECOVERY_BACKUP_OUTPUT_ROOT_UNSAFE",
  "RECOVERY_IDENTITY_REQUIRED", "RECOVERY_IDENTITY_PATH_INVALID", "RECOVERY_IDENTITY_FILE_INVALID", "RECOVERY_IDENTITY_LOCATION_FORBIDDEN",
  "RECOVERY_TOOL_REQUIRED", "RECOVERY_TOOL_VERSION_INVALID", "RECOVERY_AGE_VERSION_MISMATCH",
  "RECOVERY_TARGET_ISOLATION_FAILED", "RECOVERY_TARGET_CLEANUP_INCOMPLETE", "RECOVERY_CLEANUP_INCOMPLETE",
  "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_PLAN_INVALID", "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryRestoreExecutePreflightDiagnosticError";
  error.code = code;
  throw error;
}

export function assertLocalManagedRecoveryExecutePreflightDiagnosticConfirmation(environment = {}) {
  if (environment[RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRM_ENV] !== RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRMATION) {
    fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_CONFIRMATION_REQUIRED", "Exact local managed recovery execute preflight diagnostic confirmation is required");
  }
  if (INCOMPATIBLE_CONFIRMATIONS.some((name) => typeof environment[name] === "string" && environment[name].length > 0)) {
    fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION", "An incompatible recovery or Production confirmation is present");
  }
  if (!SHA.test(environment[TOOLING_SHA_ENV] ?? "")) fail("RECOVERY_DRILL_TOOLING_SHA_REQUIRED", "Exact recovery diagnostic tooling SHA authority is required");
  if (!isManagedBackupId(environment[BACKUP_ID_ENV])) fail("RECOVERY_BACKUP_ID_INVALID", "Explicit managed backup selection is required");
  for (const [name, code] of REQUIRED_PATH_ENV) {
    if (typeof environment[name] !== "string" || environment[name].trim() === "") fail(code, "Explicit local recovery path authority is required");
  }
}

function initialState() {
  return { phase: "PREFLIGHT", localAgeDecrypts: 0, realTargetStarts: 0, targetCleanup: "NOT_STARTED", sourceCleanup: "NOT_STARTED" };
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function cleanupStatus(value) {
  return value === "PASS" || value === "FAIL" ? value : "NOT_STARTED";
}

function fixedEvidence(state) {
  return {
    operation: "local-managed-recovery-execute-preflight-diagnostic",
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

export function sanitizeLocalManagedRecoveryExecutePreflightDiagnosticFailure(error, state = initialState()) {
  const evidence = fixedEvidence(state);
  if (state.phase === "RESTORE_EXECUTE_PREFLIGHT" && PREFLIGHT_FINDING_CODES.has(error?.code)) {
    try {
      return accessRestoreExecutePreflightFinding(error, ({ code, metadata }) => Object.freeze({ status: "FINDING", ...evidence, code, ...metadata }));
    } catch {
      return Object.freeze({ status: "FAIL", ...evidence, code: "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_FINDING_INVALID" });
    }
  }
  return Object.freeze({
    status: "FAIL",
    ...evidence,
    code: PUBLIC_FAILURE_CODES.has(error?.code) ? error.code : "RECOVERY_RESTORE_EXECUTE_PREFLIGHT_DIAGNOSTIC_FAILED",
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

function assertRestorePlan(restorePlan) {
  if (restorePlan?.status !== "READY" || restorePlan?.storage?.objectCount !== 0 || restorePlan?.storage?.totalBytes !== 0) {
    fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_PLAN_INVALID", "Ready empty-Storage restore plan is required for execute preflight diagnosis");
  }
}

export async function runLocalManagedRecoveryExecutePreflightDiagnostic({ environment = process.env, repoRoot = process.cwd(), dependencies = {} } = {}) {
  const state = initialState();
  try {
    assertLocalManagedRecoveryExecutePreflightDiagnosticConfirmation(environment);
    const execute = dependencies.execute ?? runCommand;
    const authority = await (dependencies.resolveToolingAuthority ?? resolveRecoveryToolingAuthority)({ repoRoot, environment, execute });
    (dependencies.assertToolingAuthority ?? assertRecoveryToolingAuthority)({ authority, expectedBranch: TOOLING_BRANCH, expectedHead: environment[TOOLING_SHA_ENV] });
    const tools = await (dependencies.preflightTools ?? preflightManagedRecoveryPlanDiagnosticTools)({ environment, repoRoot, execute, admitSupabaseCli: dependencies.admitSupabaseCli });
    const boundaryAuthority = await (dependencies.admitRecoveryBoundaries ?? admitRealRecoveryBoundaries)({ environment, repoRoot, governedRoots: dependencies.sourceDependencies?.governedRoots ?? [] });
    let locations;
    (dependencies.accessRecoveryBoundaries ?? accessRealRecoveryBoundaries)(boundaryAuthority, (value) => { locations = value; });
    const sourceFactory = dependencies.sourceAdapterFactory ?? ((options) => createLocalRecoverySourceAdapter({ ...options, backupOutputRoot: locations.backupOutputRoot }));
    const decryptFactory = trackedDecryptFactory(state, dependencies.decryptAdapterFactory ?? ((options) => createAgeDecryptAdapter({ ...options, execute })));
    const withVerifiedSource = dependencies.withVerifiedSource ?? withVerifiedManagedRecoverySource;

    let passEvidence;
    await withVerifiedSource({
      selectedBackupId: environment[BACKUP_ID_ENV],
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
        if (isolation?.LOCAL_ONLY !== true || isolation.LINKED_PRODUCTION !== false || isolation.DISPOSABLE !== true || isolation.BASELINE_AUTHORITY !== manifest.productionRuntimeSha) fail("RECOVERY_TARGET_ISOLATION_FAILED", "Disposable recovery target isolation could not be proven");
        const baseline = await (dependencies.runBaselineGate ?? runTargetBaselineGate)({ executor, containerAuthority, authority: prepared.authority, environment });
        let baselineDetails;
        (dependencies.accessBaselineEvidence ?? accessTargetBaselineEvidence)(baseline, (value) => { baselineDetails = value; });

        state.phase = "RESTORE_PLAN";
        const restorePlan = await (dependencies.buildRestorePlan ?? buildManagedRestorePlan)({ verifiedSource, authority: prepared.authority, targetState: baselineDetails.targetState, targetTables: baselineDetails.targetTables });
        assertRestorePlan(restorePlan);

        state.phase = "RESTORE_EXECUTE_PREFLIGHT";
        const preflight = (dependencies.buildExecutePreflight ?? buildRestoreExecutePreflight)({ restorePlan });
        const outputs = {};
        for (const queryName of RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES) {
          const commandPlan = (dependencies.buildTargetReadOnlyPsql ?? buildGovernedTargetReadOnlyDiagnosticPsqlPlan)({ executor, containerAuthority, environment, executePreflightQuery: preflight.queries[queryName] });
          outputs[queryName] = (await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, commandPlan)).stdout;
        }
        passEvidence = (dependencies.evaluateExecutePreflight ?? evaluateRestoreExecutePreflight)({ preflight, outputs });
      } catch (error) {
        primaryError = error;
      } finally {
        if (startAttempted && prepared && executor) {
          try {
            await (dependencies.cleanupTarget ?? cleanupManagedRecoveryTarget)({ session: verifiedSource.session, target: prepared.target, adapter: (dependencies.createCleanupAdapter ?? createGovernedTargetCleanupAdapter)(executor) });
            state.targetCleanup = "PASS";
          } catch {
            state.phase = "TARGET_CLEANUP";
            state.targetCleanup = "FAIL";
            throw Object.assign(new Error("Disposable recovery target cleanup did not complete"), { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" });
          }
        }
      }
      if (primaryError) throw primaryError;
      return passEvidence;
    });
    state.phase = "RESTORE_EXECUTE_PREFLIGHT";
    state.sourceCleanup = "PASS";
    return Object.freeze({ status: "PASS", ...fixedEvidence(state), ...passEvidence });
  } catch (error) {
    if (error?.code === "RECOVERY_CLEANUP_INCOMPLETE") {
      state.phase = "SOURCE_CLEANUP";
      state.sourceCleanup = "FAIL";
    } else if (state.phase !== "PREFLIGHT") {
      state.sourceCleanup = "PASS";
    }
    return sanitizeLocalManagedRecoveryExecutePreflightDiagnosticFailure(error, state);
  }
}

export async function main() {
  const result = await runLocalManagedRecoveryExecutePreflightDiagnostic();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
