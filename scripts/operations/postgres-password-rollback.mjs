import {
  POSTGRES_PASSWORD_ROTATION_REASON,
  POSTGRES_ROTATED_ROLES,
  validatePostgresPasswordRotationCandidate,
} from "./postgres-password-rotation.mjs";
import {
  POSTGRES_PASSWORD_NON_RECREATED_SERVICES,
  POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER,
} from "./postgres-password-runtime.mjs";

export const POSTGRES_PASSWORD_ROLLBACK_STAGES = Object.freeze([
  "ROLLBACK_PREFLIGHT_TARGET",
  "ROLLBACK_SUPAVISOR_SOURCE",
  "ROLLBACK_DATABASE_SOURCE",
  "ROLLBACK_DATABASE_SOURCE_VERIFIED",
  "ROLLBACK_ENV_SOURCE",
  "ROLLBACK_ENV_SOURCE_VERIFIED",
  "ROLLBACK_POINTER_SOURCE",
  "ROLLBACK_DB_RUNTIME_SOURCE",
  "ROLLBACK_RUNTIME_SOURCE",
  "ROLLBACK_ACCEPTANCE_SOURCE",
  "ROLLBACK_SOURCE_ACCEPTED",
  "ROLLBACK_MAINTENANCE_OPEN",
  "ROLLBACK_COMPLETE",
]);

const STAGES = new Set(POSTGRES_PASSWORD_ROLLBACK_STAGES);

function fail(code) {
  throw new Error(code);
}

function generationId(value) {
  if (!value || typeof value !== "object" || typeof value.generationId !== "string" || !value.generationId) {
    fail("POSTGRES_ROLLBACK_GENERATION_RELATION_INVALID");
  }
  return value.generationId;
}

function structuralResult({ state, code = null, sourceGenerationId, targetGenerationId, stage, services = [] }) {
  return Object.freeze({
    state,
    ...(code ? { code } : {}),
    sourceGenerationId,
    targetGenerationId,
    stage,
    services: Object.freeze([...services]),
  });
}

function stage(value) {
  if (!STAGES.has(value)) fail("POSTGRES_ROLLBACK_STAGE_INVALID");
  return value;
}

async function invoke(runtime, method, payload = {}) {
  if (!runtime || typeof runtime[method] !== "function") fail("POSTGRES_ROLLBACK_ADAPTER_INVALID");
  if (await runtime[method](payload) !== true) fail("POSTGRES_ROLLBACK_ADAPTER_REJECTED");
}

async function identity(runtime, service) {
  if (!runtime || typeof runtime.getServiceIdentity !== "function") fail("POSTGRES_ROLLBACK_ADAPTER_INVALID");
  const value = await runtime.getServiceIdentity({ service });
  if (typeof value !== "string" || !value) fail("POSTGRES_ROLLBACK_IDENTITY_INVALID");
  return value;
}

async function readPointer(runtime) {
  if (!runtime || typeof runtime.readCurrentPointer !== "function") return null;
  try {
    const value = await runtime.readCurrentPointer();
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

async function readLockState(runtime) {
  if (!runtime || typeof runtime.readOperationLockState !== "function") return "UNKNOWN";
  try {
    const value = await runtime.readOperationLockState();
    return value === "PRESENT" || value === "ABSENT" ? value : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function topologyVerified(topology) {
  return topology?.apiGatewayHostPorts?.length === 0 && topology?.supavisorHostPorts?.length === 0;
}

export function validatePostgresPasswordRollbackRelationship({ source, target }) {
  const sourceGenerationId = generationId(source);
  const targetGenerationId = generationId(target);
  try {
    if (sourceGenerationId === targetGenerationId
      || target?.metadata?.reason !== POSTGRES_PASSWORD_ROTATION_REASON
      || target?.metadata?.sourceGenerationId !== sourceGenerationId) {
      fail("POSTGRES_ROLLBACK_GENERATION_RELATION_INVALID");
    }
    validatePostgresPasswordRotationCandidate({
      sourceSupabaseSnapshot: source.supabaseSnapshot,
      candidateSupabaseSnapshot: target.supabaseSnapshot,
      sourceGodelSnapshot: source.godelSnapshot,
      candidateGodelSnapshot: target.godelSnapshot,
    });
  } catch {
    fail("POSTGRES_ROLLBACK_GENERATION_RELATION_INVALID");
  }
  return Object.freeze({ sourceGenerationId, targetGenerationId });
}

function validTargetPreflight(evidence, targetGenerationId) {
  return evidence?.currentGenerationId === targetGenerationId
    && evidence.liveEnvironmentGenerationId === targetGenerationId
    && evidence.targetAccepted === false
    && evidence.retainedLock?.exists === true
    && evidence.retainedLock?.operation === POSTGRES_PASSWORD_ROTATION_REASON
    && evidence.retainedLock?.targetGenerationId === targetGenerationId
    && evidence.maintenanceClosed === true
    && evidence.nginxStopped === true
    && evidence.ecGeneration7Preserved === true
    && topologyVerified(evidence.ingressTopology);
}

function validSourceResumePreflight(evidence, sourceGenerationId, targetGenerationId) {
  return evidence?.currentGenerationId === sourceGenerationId
    && evidence.liveEnvironmentGenerationId === sourceGenerationId
    && evidence.retainedLock?.exists === true
    && evidence.retainedLock?.operation === POSTGRES_PASSWORD_ROTATION_REASON
    && evidence.retainedLock?.targetGenerationId === targetGenerationId
    && evidence.maintenanceClosed === true
    && evidence.nginxStopped === true
    && evidence.ecGeneration7Preserved === true
    && topologyVerified(evidence.ingressTopology);
}

async function captureNonRecreated(runtime) {
  const identities = new Map();
  for (const service of POSTGRES_PASSWORD_NON_RECREATED_SERVICES) identities.set(service, await identity(runtime, service));
  return identities;
}

async function compensateToTarget({ runtime, sourceGenerationId, targetGenerationId, rollbackStage, attempts }) {
  try {
    if (attempts.environment) await invoke(runtime, "restoreEnvironmentTarget", { generationId: targetGenerationId, allowedNames: ["POSTGRES_PASSWORD"] });
    if (attempts.database) {
      await invoke(runtime, "restoreDatabaseRolesTarget", { generationId: targetGenerationId, roles: POSTGRES_ROTATED_ROLES });
      await invoke(runtime, "verifyDatabaseAuthentication", { generationId: targetGenerationId, roles: POSTGRES_ROTATED_ROLES });
    }
    if (attempts.supavisor) {
      await invoke(runtime, "restoreSupavisorManagerTarget", { generationId: targetGenerationId });
      await invoke(runtime, "verifySupavisorManager", { generationId: targetGenerationId });
    }
    await invoke(runtime, "verifyLiveEnvironment", { generationId: targetGenerationId });
    if (await readPointer(runtime) !== targetGenerationId) fail("POSTGRES_ROLLBACK_TARGET_POINTER_UNVERIFIED");
    return structuralResult({
      state: "ROLLBACK_FAILED_TARGET_RESTORED",
      code: "POSTGRES_ROLLBACK_FAILED_TARGET_RESTORED",
      sourceGenerationId,
      targetGenerationId,
      stage: rollbackStage,
    });
  } catch {
    return structuralResult({
      state: "ROLLBACK_PRECOMMIT_COMPENSATION_FAILED",
      code: "POSTGRES_ROLLBACK_PRECOMMIT_COMPENSATION_FAILED",
      sourceGenerationId,
      targetGenerationId,
      stage: rollbackStage,
    });
  }
}

async function convergeSourceRuntime({ runtime, sourceGenerationId, nonRecreatedIdentities, onRuntimeConsumers }) {
  for (const [index, service] of POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER.entries()) {
    const before = await identity(runtime, service);
    if (service === "db") {
      await invoke(runtime, "recreateDatabase");
      await invoke(runtime, "waitDatabaseHealthy");
    } else {
      await invoke(runtime, "recreateConsumer", { service });
      await invoke(runtime, "waitServiceHealthy", { service });
    }
    if (await identity(runtime, service) === before) fail("POSTGRES_ROLLBACK_RUNTIME_IDENTITY_UNCHANGED");
    if (!runtime || typeof runtime.verifyRuntimeSecretHygiene !== "function") fail("POSTGRES_ROLLBACK_ADAPTER_INVALID");
    const hygiene = await runtime.verifyRuntimeSecretHygiene({ service, generationId: sourceGenerationId });
    if (hygiene?.sourceMatch !== true || hygiene.targetAbsent !== true) fail("POSTGRES_ROLLBACK_RUNTIME_SECRET_HYGIENE_FAILED");
    if (index === 0) onRuntimeConsumers?.();
  }
  for (const [service, before] of nonRecreatedIdentities) {
    if (await identity(runtime, service) !== before) fail("POSTGRES_ROLLBACK_NONRECREATED_IDENTITY_CHANGED");
  }
}

async function recoverAcceptedSourceMaintenance({ runtime, sourceGenerationId, targetGenerationId }) {
  try {
    await invoke(runtime, "closeMaintenance");
    await invoke(runtime, "verifyNginxStopped");
    return structuralResult({ state: "ROLLBACK_SOURCE_ACCEPTED_MAINTENANCE_CLOSED", code: "POSTGRES_ROLLBACK_SOURCE_ACCEPTED_MAINTENANCE_CLOSED", sourceGenerationId, targetGenerationId, stage: "ROLLBACK_SOURCE_ACCEPTED" });
  } catch {
    return structuralResult({ state: "ROLLBACK_MAINTENANCE_STATE_UNVERIFIED", code: "POSTGRES_ROLLBACK_MAINTENANCE_STATE_UNVERIFIED", sourceGenerationId, targetGenerationId, stage: "ROLLBACK_SOURCE_ACCEPTED" });
  }
}

async function finalizeAcceptedSource({ runtime, sourceGenerationId, targetGenerationId }) {
  try {
    await invoke(runtime, "openMaintenance");
    await invoke(runtime, "verifyNginxRunning");
  } catch {
    return recoverAcceptedSourceMaintenance({ runtime, sourceGenerationId, targetGenerationId });
  }
  try {
    await invoke(runtime, "releaseLock");
  } catch {
    // The independently-read lock state is authoritative.
  }
  const lockState = await readLockState(runtime);
  if (lockState === "ABSENT") return structuralResult({ state: "ROLLBACK_COMPLETE", sourceGenerationId, targetGenerationId, stage: "ROLLBACK_COMPLETE", services: POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER });
  if (lockState === "PRESENT") return structuralResult({ state: "ROLLBACK_SOURCE_ACCEPTED_LOCK_RETAINED", code: "POSTGRES_ROLLBACK_SOURCE_ACCEPTED_LOCK_RETAINED", sourceGenerationId, targetGenerationId, stage: "ROLLBACK_SOURCE_ACCEPTED" });
  return structuralResult({ state: "ROLLBACK_LOCK_STATE_UNVERIFIED", code: "POSTGRES_ROLLBACK_LOCK_STATE_UNVERIFIED", sourceGenerationId, targetGenerationId, stage: "ROLLBACK_SOURCE_ACCEPTED" });
}

async function completeCommittedSource({ runtime, sourceGenerationId, targetGenerationId, nonRecreatedIdentities }) {
  let rollbackStage = "ROLLBACK_DB_RUNTIME_SOURCE";
  try {
    await convergeSourceRuntime({
      runtime,
      sourceGenerationId,
      nonRecreatedIdentities,
      onRuntimeConsumers: () => { rollbackStage = "ROLLBACK_RUNTIME_SOURCE"; },
    });
    rollbackStage = "ROLLBACK_ACCEPTANCE_SOURCE";
    await invoke(runtime, "acceptRollbackSource", { sourceGenerationId, targetGenerationId });
  } catch {
    return structuralResult({ state: "ROLLBACK_COMMITTED_RECOVERY_INCOMPLETE", code: "POSTGRES_ROLLBACK_COMMITTED_RECOVERY_INCOMPLETE", sourceGenerationId, targetGenerationId, stage: stage(rollbackStage) });
  }
  return finalizeAcceptedSource({ runtime, sourceGenerationId, targetGenerationId });
}

export async function orchestratePostgresPasswordRollback({ source, target, runtime }) {
  let relation;
  try {
    relation = validatePostgresPasswordRollbackRelationship({ source, target });
  } catch {
    return structuralResult({ state: "ROLLBACK_PREFLIGHT_FAILED", code: "POSTGRES_ROLLBACK_GENERATION_RELATION_INVALID", sourceGenerationId: source?.generationId ?? null, targetGenerationId: target?.generationId ?? null, stage: "ROLLBACK_PREFLIGHT_TARGET" });
  }
  const { sourceGenerationId, targetGenerationId } = relation;
  try {
    if (!runtime || typeof runtime.preflightRollback !== "function" || !validTargetPreflight(await runtime.preflightRollback({ sourceGenerationId, targetGenerationId }), targetGenerationId)) {
      fail("POSTGRES_ROLLBACK_PREFLIGHT_FAILED");
    }
    const nonRecreatedIdentities = await captureNonRecreated(runtime);
    const attempts = { supavisor: false, database: false, environment: false };
    let rollbackStage = "ROLLBACK_SUPAVISOR_SOURCE";
    try {
      attempts.supavisor = true;
      await invoke(runtime, "updateSupavisorManager", { generationId: sourceGenerationId });
      rollbackStage = "ROLLBACK_DATABASE_SOURCE";
      attempts.database = true;
      await invoke(runtime, "rotateDatabaseRoles", { generationId: sourceGenerationId, roles: POSTGRES_ROTATED_ROLES });
      rollbackStage = "ROLLBACK_DATABASE_SOURCE_VERIFIED";
      await invoke(runtime, "verifyDatabaseAuthentication", { generationId: sourceGenerationId, roles: POSTGRES_ROTATED_ROLES });
      rollbackStage = "ROLLBACK_ENV_SOURCE";
      attempts.environment = true;
      await invoke(runtime, "writeEnvironment", { generationId: sourceGenerationId, allowedNames: ["POSTGRES_PASSWORD"] });
      rollbackStage = "ROLLBACK_ENV_SOURCE_VERIFIED";
      await invoke(runtime, "verifyLiveEnvironment", { generationId: sourceGenerationId });
    } catch {
      return compensateToTarget({ runtime, sourceGenerationId, targetGenerationId, rollbackStage: stage(rollbackStage), attempts });
    }
    rollbackStage = "ROLLBACK_POINTER_SOURCE";
    try {
      await invoke(runtime, "replacePointer", { fromGenerationId: targetGenerationId, toGenerationId: sourceGenerationId });
    } catch {
      const pointer = await readPointer(runtime);
      if (pointer === targetGenerationId) return compensateToTarget({ runtime, sourceGenerationId, targetGenerationId, rollbackStage, attempts });
      if (pointer !== sourceGenerationId) return structuralResult({ state: "ROLLBACK_SECRET_STATE_UNVERIFIED", code: "POSTGRES_ROLLBACK_SECRET_STATE_UNVERIFIED", sourceGenerationId, targetGenerationId, stage: rollbackStage });
    }
    if (await readPointer(runtime) !== sourceGenerationId) return structuralResult({ state: "ROLLBACK_SECRET_STATE_UNVERIFIED", code: "POSTGRES_ROLLBACK_SECRET_STATE_UNVERIFIED", sourceGenerationId, targetGenerationId, stage: rollbackStage });
    return completeCommittedSource({ runtime, sourceGenerationId, targetGenerationId, nonRecreatedIdentities });
  } catch {
    return structuralResult({ state: "ROLLBACK_PREFLIGHT_FAILED", code: "POSTGRES_ROLLBACK_PREFLIGHT_FAILED", sourceGenerationId, targetGenerationId, stage: "ROLLBACK_PREFLIGHT_TARGET" });
  }
}

export async function resumePostgresPasswordRollback({ source, target, runtime }) {
  let relation;
  try {
    relation = validatePostgresPasswordRollbackRelationship({ source, target });
  } catch {
    return structuralResult({ state: "ROLLBACK_RESUME_PREFLIGHT_FAILED", code: "POSTGRES_ROLLBACK_GENERATION_RELATION_INVALID", sourceGenerationId: source?.generationId ?? null, targetGenerationId: target?.generationId ?? null, stage: "ROLLBACK_PREFLIGHT_TARGET" });
  }
  const { sourceGenerationId, targetGenerationId } = relation;
  try {
    if (!runtime || typeof runtime.preflightRollbackResume !== "function" || !validSourceResumePreflight(await runtime.preflightRollbackResume({ sourceGenerationId, targetGenerationId }), sourceGenerationId, targetGenerationId)) {
      fail("POSTGRES_ROLLBACK_RESUME_PREFLIGHT_FAILED");
    }
    await invoke(runtime, "verifyDatabaseAuthentication", { generationId: sourceGenerationId, roles: POSTGRES_ROTATED_ROLES });
    await invoke(runtime, "verifySupavisorManager", { generationId: sourceGenerationId });
    const nonRecreatedIdentities = await captureNonRecreated(runtime);
    return completeCommittedSource({ runtime, sourceGenerationId, targetGenerationId, nonRecreatedIdentities });
  } catch {
    return structuralResult({ state: "ROLLBACK_RESUME_PREFLIGHT_FAILED", code: "POSTGRES_ROLLBACK_RESUME_PREFLIGHT_FAILED", sourceGenerationId, targetGenerationId, stage: "ROLLBACK_PREFLIGHT_TARGET" });
  }
}
