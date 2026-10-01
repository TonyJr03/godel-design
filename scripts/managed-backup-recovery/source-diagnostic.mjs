import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { isManagedBackupId } from "../managed-backup/manifest.mjs";
import { createAgeDecryptAdapter } from "./age-decrypt.mjs";
import { createLocalRecoverySourceAdapter } from "./local-recovery-source.mjs";
import {
  RECOVERY_DRILL_BACKUP_ID_ENV,
  RECOVERY_DRILL_TOOLING_SHA_ENV,
  RECOVERY_TOOLING_BRANCH,
} from "./real-restore-drill-core.mjs";
import { assertRecoveryToolingAuthority, resolveRecoveryToolingAuthority } from "./recovery-tooling-authority.mjs";
import { accessRealRecoveryBoundaries, admitRealRecoveryBoundaries } from "./recovery-boundaries.mjs";
import { runManagedRecoverySourceVerification } from "./source-verification.mjs";
import { preflightManagedRecoverySourceDiagnosticTools } from "./tool-preflight.mjs";

export const SOURCE_DIAGNOSTIC_CONFIRM_ENV = "GODEL_MANAGED_RECOVERY_SOURCE_DIAGNOSTIC_CONFIRM";
export const SOURCE_DIAGNOSTIC_CONFIRMATION = "ALLOW_LOCAL_MANAGED_RECOVERY_SOURCE_DIAGNOSTIC";

const SHA = /^[a-f0-9]{40}$/;
const SAFE_STATEMENT_CLASSES = new Set([
  "SET_PARAMETER",
  "SELECT_PG_CATALOG_SETVAL_VARIANT",
  "SELECT_OTHER",
  "INSERT",
  "UPDATE",
  "DELETE",
  "DDL",
  "TRANSACTION_CONTROL",
  "OTHER_SQL",
]);
const INCOMPATIBLE_CONFIRMATIONS = Object.freeze([
  "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM",
  "GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
  "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM",
]);
const PHASES = new Set(["PREFLIGHT", "SOURCE_INSPECT", "SOURCE_DOWNLOAD", "SOURCE_DECRYPT", "SOURCE_VERIFY", "SQL_ADMISSION"]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoverySourceDiagnosticError";
  error.code = code;
  throw error;
}

export function assertLocalManagedRecoverySourceDiagnosticConfirmation(environment = {}) {
  if (environment[SOURCE_DIAGNOSTIC_CONFIRM_ENV] !== SOURCE_DIAGNOSTIC_CONFIRMATION) fail("RECOVERY_SOURCE_DIAGNOSTIC_CONFIRMATION_REQUIRED", "Exact local recovery source diagnostic confirmation is required");
  if (INCOMPATIBLE_CONFIRMATIONS.some((name) => typeof environment[name] === "string" && environment[name].length > 0)) fail("RECOVERY_SOURCE_DIAGNOSTIC_INCOMPATIBLE_CONFIRMATION", "An incompatible recovery or Production confirmation is present");
  if (!SHA.test(environment[RECOVERY_DRILL_TOOLING_SHA_ENV] ?? "")) fail("RECOVERY_DRILL_TOOLING_SHA_REQUIRED", "Exact recovery diagnostic tooling SHA authority is required");
  if (!isManagedBackupId(environment[RECOVERY_DRILL_BACKUP_ID_ENV])) fail("RECOVERY_BACKUP_ID_INVALID", "Explicit managed backup selection is required");
}

function initialState() {
  return { phase: "PREFLIGHT", localAgeDecrypts: 0 };
}

export function sanitizeLocalManagedRecoverySourceDiagnosticFailure(error, state = initialState()) {
  const count = Number.isSafeInteger(state.localAgeDecrypts) && state.localAgeDecrypts >= 0 ? state.localAgeDecrypts : 0;
  if (error?.code === "RECOVERY_SQL_STATEMENT_FORBIDDEN" && SAFE_STATEMENT_CLASSES.has(error.statementClass)) {
    const setParameter = error.statementClass === "SET_PARAMETER" && /^[a-z][a-z0-9_]*$/.test(error.parameter ?? "")
      ? error.parameter
      : "NOT_APPLICABLE";
    return Object.freeze({
      status: "FINDING",
      operation: "local-managed-recovery-source-diagnostic",
      phase: "SQL_ADMISSION",
      code: "RECOVERY_SQL_STATEMENT_FORBIDDEN",
      statementClass: error.statementClass,
      setParameter,
      localAgeDecrypts: count,
      realR2Reads: 0,
      realTargetStarts: 0,
      sqlExecutions: 0,
      productionMutations: 0,
      cleanup: "PASS",
    });
  }
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{3,100}$/.test(error.code) ? error.code : "RECOVERY_SOURCE_DIAGNOSTIC_FAILED";
  return Object.freeze({
    status: "FAIL",
    operation: "local-managed-recovery-source-diagnostic",
    phase: PHASES.has(state.phase) ? state.phase : "PREFLIGHT",
    code,
    localAgeDecrypts: count,
    realR2Reads: 0,
    realTargetStarts: 0,
    sqlExecutions: 0,
    productionMutations: 0,
    cleanup: code === "RECOVERY_CLEANUP_INCOMPLETE" ? "FAIL" : state.phase === "PREFLIGHT" ? "NOT_STARTED" : "PASS",
  });
}

export async function runLocalManagedRecoverySourceDiagnostic({ environment = process.env, repoRoot = process.cwd(), dependencies = {} } = {}) {
  const state = initialState();
  try {
    assertLocalManagedRecoverySourceDiagnosticConfirmation(environment);
    const execute = dependencies.execute ?? runCommand;
    const authority = await (dependencies.resolveToolingAuthority ?? resolveRecoveryToolingAuthority)({ repoRoot, environment, execute });
    (dependencies.assertToolingAuthority ?? assertRecoveryToolingAuthority)({
      authority,
      expectedBranch: RECOVERY_TOOLING_BRANCH,
      expectedHead: environment[RECOVERY_DRILL_TOOLING_SHA_ENV],
    });
    const tools = await (dependencies.preflightTools ?? preflightManagedRecoverySourceDiagnosticTools)({ environment, repoRoot, execute });
    const boundaryAuthority = await (dependencies.admitRecoveryBoundaries ?? admitRealRecoveryBoundaries)({ environment, repoRoot });
    let locations;
    (dependencies.accessRecoveryBoundaries ?? accessRealRecoveryBoundaries)(boundaryAuthority, (value) => { locations = value; });
    const decryptFactory = dependencies.decryptAdapterFactory ?? ((options) => createAgeDecryptAdapter({ ...options, execute }));
    const sourceFactory = dependencies.sourceAdapterFactory ?? ((options) => createLocalRecoverySourceAdapter({ ...options, backupOutputRoot: locations.backupOutputRoot }));
    await (dependencies.runSourceVerification ?? runManagedRecoverySourceVerification)({
      selectedBackupId: environment[RECOVERY_DRILL_BACKUP_ID_ENV],
      recoveryParent: locations.parent,
      backupOutputRoot: locations.backupOutputRoot,
      repoRoot,
      environment,
      sourceAdapterFactory: sourceFactory,
      decryptAdapterFactory: (options) => {
        const adapter = decryptFactory(options);
        return Object.freeze({
          async decryptToTar(input) {
            state.localAgeDecrypts += 1;
            return adapter.decryptToTar(input);
          },
        });
      },
      dependencies: {
        ...(dependencies.sourceDependencies ?? {}),
        preflight: async () => tools,
        onPhase: (phase) => { state.phase = phase; },
      },
    });
    return Object.freeze({
      status: "PASS",
      operation: "local-managed-recovery-source-diagnostic",
      phase: "SQL_ADMISSION",
      localAgeDecrypts: state.localAgeDecrypts,
      realR2Reads: 0,
      realTargetStarts: 0,
      sqlExecutions: 0,
      productionMutations: 0,
      cleanup: "PASS",
    });
  } catch (error) {
    return sanitizeLocalManagedRecoverySourceDiagnosticFailure(error, state);
  }
}

export async function main() {
  const result = await runLocalManagedRecoverySourceDiagnostic();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
