import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { validateStorageDurableInventory } from "../managed-backup/inventory.mjs";
import { cleanupManagedRecoveryTarget } from "./target-cleanup.mjs";
import { admitDockerDbDiscovery, buildTargetCommandPlans, proveTargetIsolation } from "./target-commands.mjs";
import { buildManagedRestoreSql, buildMutableTablePlan, buildStorageByteRestorePlan, sanitizeEphemeralAuthState, verifyManagedDataCounts } from "./restore-planning.mjs";
import { buildPostRestoreValidationQueries, createFutureLoginGateContract, deriveConfidentialAuthExpectationFromAdmission, deriveStorageExpectation, validateManagedRestoreResult } from "./restore-validation.mjs";
import { loadProductionRuntimeAuthority } from "./runtime-authority.mjs";
import { auditManagedSchemaSql, auditMigrationHistorySql, auditRolesSql, validateTargetBaseline } from "./sql-audit.mjs";
import { allocateTargetPorts, createRecoveryProjectId, materializeRecoveryTarget } from "./target-workspace.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryTargetRestoreError";
  error.code = code;
  throw error;
}

async function readText(root, pathname) {
  const value = await readFile(resolve(root, ...pathname.split("/")), "utf8").catch(() => null);
  if (typeof value !== "string" || value.length === 0) fail("RECOVERY_RESTORE_ARTIFACT_INVALID", "Verified recovery artifact is unavailable");
  return value;
}

export async function prepareManagedRecoveryTarget({ session, manifest, repoRoot, environment = process.env, executeGit, probePort, projectId } = {}) {
  if (!manifest || manifest.status !== "COMPLETE" || typeof manifest.productionRuntimeSha !== "string") fail("RECOVERY_SOURCE_MANIFEST_REQUIRED", "Complete managed manifest is required");
  const authority = await loadProductionRuntimeAuthority({ runtimeSha: manifest.productionRuntimeSha, repoRoot, environment, execute: executeGit });
  const ports = await allocateTargetPorts({ probe: probePort });
  const target = await materializeRecoveryTarget({ session, runtimeAuthority: authority, projectId: projectId ?? createRecoveryProjectId(), ports });
  const commandPlans = buildTargetCommandPlans({ repoRoot, target, environment });
  const prepared = { status: "PREPARED", authority, target, commandPlans, realTargetStarts: 0, targetMutations: 0, sqlExecutions: 0 };
  Object.defineProperty(prepared, "toJSON", { enumerable: false, value: () => ({ status: "PREPARED", baselineAuthority: authority.runtimeSha, baselineMigrationCount: 6, realTargetStarts: 0, targetMutations: 0, sqlExecutions: 0 }) });
  return Object.freeze(prepared);
}

export function provePreparedRecoveryTargetIsolation({ prepared, session, manifest, localStatus, productionProjectRef, environment = {} } = {}) {
  if (prepared?.status !== "PREPARED") fail("RECOVERY_TARGET_PREPARATION_REQUIRED", "Prepared recovery target is required");
  return proveTargetIsolation({ session, target: prepared.target, runtimeSha: manifest?.productionRuntimeSha, commandPlans: prepared.commandPlans, status: localStatus, productionProjectRef, environment });
}

export function admitPreparedRecoveryTargetRuntime({ prepared, session, manifest, rawStatusOutput, rawDockerOutput, productionProjectRef, environment = {} } = {}) {
  if (prepared?.status !== "PREPARED") fail("RECOVERY_TARGET_PREPARATION_REQUIRED", "Prepared recovery target is required");
  const localStatus = admitLocalSupabaseStatus(rawStatusOutput);
  const isolation = provePreparedRecoveryTargetIsolation({ prepared, session, manifest, localStatus, productionProjectRef, environment });
  const containerAuthority = admitDockerDbDiscovery({ projectId: prepared.target.projectId, rawOutput: rawDockerOutput });
  const result = { status: "ADMITTED", localStatus, isolation, containerAuthority, realTargetStarts: 0, targetMutations: 0, sqlExecutions: 0 };
  Object.defineProperty(result, "toJSON", { enumerable: false, value: () => ({ status: "ADMITTED", isolation, realTargetStarts: 0, targetMutations: 0, sqlExecutions: 0 }) });
  return Object.freeze(result);
}

export async function buildManagedRestorePlan({ verifiedSource, authority, targetState, targetTables, requiredExtensions = ["pgcrypto"] } = {}) {
  if (!verifiedSource || typeof verifiedSource.bundleRoot !== "string" || verifiedSource.sql?.managedData?.status !== "ADMITTED") fail("RECOVERY_VERIFIED_SOURCE_REQUIRED", "Verified managed recovery source is required");
  const baseline = validateTargetBaseline({ authority, targetState, requiredExtensions });
  const roles = auditRolesSql(await readText(verifiedSource.bundleRoot, "database/roles.sql"));
  const schema = auditManagedSchemaSql(await readText(verifiedSource.bundleRoot, "database/managed-schema.sql"), { requiredExtensions });
  const history = auditMigrationHistorySql({
    schemaSql: await readText(verifiedSource.bundleRoot, "database/migration-history-schema.sql"),
    dataSql: await readText(verifiedSource.bundleRoot, "database/migration-history-data.sql"),
    baselineVersions: authority.evidence.versions,
  });
  const manifest = JSON.parse(await readText(verifiedSource.bundleRoot, "internal-manifest.json"));
  const dataCounts = verifyManagedDataCounts({ admission: verifiedSource.sql.managedData, manifestTableCounts: manifest?.databaseCounts?.tables });
  const mutable = buildMutableTablePlan({ admission: verifiedSource.sql.managedData, targetTables });
  const sanitized = sanitizeEphemeralAuthState({ admission: verifiedSource.sql.managedData, mutablePlan: mutable });
  const restoreSql = buildManagedRestoreSql({ mutablePlan: mutable, sanitized });
  const storageSource = JSON.parse(await readText(verifiedSource.bundleRoot, "storage/durable-inventory.json"));
  const storageInventory = validateStorageDurableInventory(storageSource);
  const storage = buildStorageByteRestorePlan({ storageInventory, bundleRoot: verifiedSource.bundleRoot });
  const storageExpectation = deriveStorageExpectation(storageInventory);
  const mutableIdentities = new Set(mutable.mutableTables);
  const expectations = Object.freeze({
    tableCounts: Object.freeze(Object.fromEntries(dataCounts.tableCounts.filter(({ identity }) => mutableIdentities.has(identity)).map(({ identity, rowCount }) => [identity, rowCount]))),
    auth: deriveConfidentialAuthExpectationFromAdmission(verifiedSource.sql.managedData),
    storage: storageExpectation,
  });
  const validations = buildPostRestoreValidationQueries({ mutablePlan: mutable, runtimeVersions: authority.evidence.versions, storageExpectation });
  return Object.freeze({
    status: "READY",
    baseline,
    auditOnly: Object.freeze({ roles, schema, history }),
    dataCounts,
    mutable,
    sanitized,
    restoreSql,
    storage,
    expectations,
    validations,
    loginGate: createFutureLoginGateContract(),
    order: Object.freeze(["DB_DATA_RESTORE", "STORAGE_METADATA_GATE", "STORAGE_BYTE_RESTORE", "POST_RESTORE_VALIDATION"]),
    sqlExecutions: 0,
  });
}

export { cleanupManagedRecoveryTarget, validateManagedRestoreResult };
