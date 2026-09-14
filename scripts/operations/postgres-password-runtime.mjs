import {
  POSTGRES_PASSWORD_ROTATION_STAGES,
  POSTGRES_ROTATED_ROLES,
} from "./postgres-password-rotation.mjs";

export const DB_RUNTIME_RECREATE_POLICY = "RECREATE_REQUIRED_POST_POINTER";
export const POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER = Object.freeze([
  "db",
  "supavisor",
  "meta",
  "auth",
  "rest",
  "realtime",
  "storage",
  "functions",
  "studio",
]);
export const POSTGRES_PASSWORD_NON_RECREATED_SERVICES = Object.freeze([
  "api-gw",
  "imgproxy",
  "godel-app",
  "godel-nginx",
]);

const RUNTIME_STAGES = new Set(POSTGRES_PASSWORD_ROTATION_STAGES);

function fail(code) {
  throw new Error(code);
}

function generationId(reference, code) {
  if (!reference || typeof reference !== "object" || typeof reference.generationId !== "string" || !reference.generationId) {
    fail(code);
  }
  return reference.generationId;
}

function result({ state, code = null, sourceGenerationId, targetGenerationId, stage, services = [] }) {
  return Object.freeze({
    state,
    ...(code ? { code } : {}),
    sourceGenerationId,
    targetGenerationId,
    stage,
    services: Object.freeze([...services]),
  });
}

function assertStage(stage) {
  if (!RUNTIME_STAGES.has(stage)) fail("POSTGRES_ROTATION_RUNTIME_STAGE_INVALID");
  return stage;
}

async function invoke(runtime, method, payload = {}) {
  if (!runtime || typeof runtime[method] !== "function") fail("POSTGRES_ROTATION_RUNTIME_ADAPTER_INVALID");
  if (await runtime[method](payload) !== true) fail("POSTGRES_ROTATION_RUNTIME_ADAPTER_REJECTED");
}

async function identity(runtime, service) {
  if (!runtime || typeof runtime.getServiceIdentity !== "function") fail("POSTGRES_ROTATION_RUNTIME_ADAPTER_INVALID");
  const value = await runtime.getServiceIdentity({ service });
  if (typeof value !== "string" || !value) fail("POSTGRES_ROTATION_RUNTIME_IDENTITY_INVALID");
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

async function readOperationLockState(runtime) {
  if (!runtime || typeof runtime.readOperationLockState !== "function") return "UNKNOWN";
  try {
    const value = await runtime.readOperationLockState();
    return value === "PRESENT" || value === "ABSENT" ? value : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function validatePreflight(evidence, sourceGenerationId) {
  const topology = evidence?.ingressTopology;
  const topologyVerified = topology?.godelNginxPublicIngress === true
    && Array.isArray(topology.apiGatewayHostPorts) && topology.apiGatewayHostPorts.length === 0
    && Array.isArray(topology.supavisorHostPorts) && topology.supavisorHostPorts.length === 0;
  if (!topologyVerified) return "POSTGRES_ROTATION_INGRESS_TOPOLOGY_UNVERIFIED";
  return evidence?.repositoryClean === true
    && evidence.currentGenerationId === sourceGenerationId
    && evidence.liveEnvironmentGenerationId === sourceGenerationId
    && evidence.lockAcquired === true
    && evidence.ecGeneration7Preserved === true
    && evidence.supabaseHealthy === true
    && evidence.godelHealthy === true
    && evidence.nginxRunning === true
    ? null
    : "POSTGRES_ROTATION_PREFLIGHT_FAILED";
}

async function compensation({ runtime, sourceGenerationId, targetGenerationId, stage, attempts }) {
  try {
    if (attempts.environment) await invoke(runtime, "restoreEnvironment", { generationId: sourceGenerationId, allowedNames: ["POSTGRES_PASSWORD"] });
    if (attempts.database) {
      await invoke(runtime, "restoreDatabaseRoles", { generationId: sourceGenerationId, roles: POSTGRES_ROTATED_ROLES });
      await invoke(runtime, "verifyDatabaseAuthentication", { generationId: sourceGenerationId, roles: POSTGRES_ROTATED_ROLES });
    }
    if (attempts.supavisor) {
      await invoke(runtime, "restoreSupavisorManager", { generationId: sourceGenerationId });
      await invoke(runtime, "verifySupavisorManager", { generationId: sourceGenerationId });
    }
    await invoke(runtime, "verifyLiveEnvironment", { generationId: sourceGenerationId });
    if (await readPointer(runtime) !== sourceGenerationId) fail("POSTGRES_ROTATION_POINTER_SOURCE_UNVERIFIED");
    await invoke(runtime, "verifySourceRuntimeHealth", { generationId: sourceGenerationId });
  } catch {
    return result({
      state: "PRECOMMIT_COMPENSATION_FAILED",
      code: "POSTGRES_ROTATION_PRECOMMIT_COMPENSATION_FAILED",
      sourceGenerationId,
      targetGenerationId,
      stage,
    });
  }

  const sourceRestoredStage = "SOURCE_RESTORED";
  try {
    await invoke(runtime, "openMaintenance");
    await invoke(runtime, "verifyNginxRunning");
  } catch {
    return recoverSourceRestoredMaintenance({ runtime, sourceGenerationId, targetGenerationId });
  }

  try {
    await invoke(runtime, "releaseLock");
  } catch {
    // Lock release has independently verifiable, ambiguous-command semantics.
  }
  const lockState = await readOperationLockState(runtime);
  if (lockState === "ABSENT") {
    return result({
      state: "FAILED_SOURCE_RESTORED",
      code: "POSTGRES_ROTATION_FAILED_SOURCE_RESTORED",
      sourceGenerationId,
      targetGenerationId,
      stage: sourceRestoredStage,
    });
  }
  if (lockState === "PRESENT") {
    return result({
      state: "SOURCE_RESTORED_LOCK_RETAINED",
      code: "POSTGRES_ROTATION_SOURCE_RESTORED_LOCK_RETAINED",
      sourceGenerationId,
      targetGenerationId,
      stage: sourceRestoredStage,
    });
  }
  return result({
    state: "LOCK_STATE_UNVERIFIED",
    code: "POSTGRES_ROTATION_LOCK_STATE_UNVERIFIED",
    sourceGenerationId,
    targetGenerationId,
    stage: sourceRestoredStage,
  });
}

async function recoverSourceRestoredMaintenance({ runtime, sourceGenerationId, targetGenerationId }) {
  try {
    await invoke(runtime, "closeMaintenance");
    await invoke(runtime, "verifyNginxStopped");
    return result({
      state: "SOURCE_RESTORED_MAINTENANCE_CLOSED",
      code: "POSTGRES_ROTATION_SOURCE_RESTORED_MAINTENANCE_CLOSED",
      sourceGenerationId,
      targetGenerationId,
      stage: "SOURCE_RESTORED",
    });
  } catch {
    return result({
      state: "MAINTENANCE_STATE_UNVERIFIED",
      code: "POSTGRES_ROTATION_MAINTENANCE_STATE_UNVERIFIED",
      sourceGenerationId,
      targetGenerationId,
      stage: "SOURCE_RESTORED",
    });
  }
}

async function recoverTargetAcceptedMaintenance({ runtime, sourceGenerationId, targetGenerationId }) {
  try {
    await invoke(runtime, "closeMaintenance");
    await invoke(runtime, "verifyNginxStopped");
    return result({
      state: "TARGET_ACCEPTED_MAINTENANCE_CLOSED",
      code: "POSTGRES_ROTATION_TARGET_ACCEPTED_MAINTENANCE_CLOSED",
      sourceGenerationId,
      targetGenerationId,
      stage: "TARGET_ACCEPTED",
    });
  } catch {
    return result({
      state: "MAINTENANCE_STATE_UNVERIFIED",
      code: "POSTGRES_ROTATION_MAINTENANCE_STATE_UNVERIFIED",
      sourceGenerationId,
      targetGenerationId,
      stage: "TARGET_ACCEPTED",
    });
  }
}

async function convergeTargetRuntimeService({ runtime, service, targetGenerationId }) {
  const before = await identity(runtime, service);
  if (service === "db") {
    await invoke(runtime, "recreateDatabase");
    await invoke(runtime, "waitDatabaseHealthy");
  } else {
    await invoke(runtime, "recreateConsumer", { service });
    await invoke(runtime, "waitServiceHealthy", { service });
  }
  const after = await identity(runtime, service);
  if (before === after) fail("POSTGRES_ROTATION_RUNTIME_IDENTITY_UNCHANGED");
  if (!runtime || typeof runtime.verifyRuntimeSecretHygiene !== "function") fail("POSTGRES_ROTATION_RUNTIME_ADAPTER_INVALID");
  const hygiene = await runtime.verifyRuntimeSecretHygiene({ service, generationId: targetGenerationId });
  if (hygiene?.targetMatch !== true || hygiene.oldAbsent !== true) fail("POSTGRES_ROTATION_RUNTIME_SECRET_HYGIENE_FAILED");
}

async function verifyNonRecreatedIdentities(runtime, nonRecreatedIdentities) {
  for (const [service, before] of nonRecreatedIdentities) {
    if (await identity(runtime, service) !== before) fail("POSTGRES_ROTATION_NONRECREATED_IDENTITY_CHANGED");
  }
}

export async function orchestratePostgresPasswordCutover({ source, target, runtime }) {
  const sourceGenerationId = generationId(source, "POSTGRES_ROTATION_SOURCE_REFERENCE_INVALID");
  const targetGenerationId = generationId(target, "POSTGRES_ROTATION_TARGET_REFERENCE_INVALID");
  if (sourceGenerationId === targetGenerationId) fail("POSTGRES_ROTATION_TARGET_REFERENCE_INVALID");

  let stage = "PREFLIGHT_SOURCE";
  try {
    if (!runtime || typeof runtime.preflight !== "function") fail("POSTGRES_ROTATION_RUNTIME_ADAPTER_INVALID");
    const preflightCode = validatePreflight(
      await runtime.preflight({ sourceGenerationId, targetGenerationId }),
      sourceGenerationId,
    );
    if (preflightCode) {
      return result({ state: "PREFLIGHT_FAILED", code: preflightCode, sourceGenerationId, targetGenerationId, stage });
    }
  } catch {
    return result({ state: "PREFLIGHT_FAILED", code: "POSTGRES_ROTATION_PREFLIGHT_FAILED", sourceGenerationId, targetGenerationId, stage });
  }

  let nonRecreatedIdentities;
  try {
    nonRecreatedIdentities = new Map();
    for (const service of POSTGRES_PASSWORD_NON_RECREATED_SERVICES) nonRecreatedIdentities.set(service, await identity(runtime, service));
  } catch {
    return result({ state: "PREFLIGHT_FAILED", code: "POSTGRES_ROTATION_PREFLIGHT_FAILED", sourceGenerationId, targetGenerationId, stage });
  }

  stage = "MAINTENANCE_CLOSED";
  try {
    await invoke(runtime, "closeMaintenance");
    await invoke(runtime, "verifyNginxStopped");
  } catch {
    return result({ state: "MAINTENANCE_STATE_UNVERIFIED", code: "POSTGRES_ROTATION_MAINTENANCE_STATE_UNVERIFIED", sourceGenerationId, targetGenerationId, stage });
  }

  const attempts = { supavisor: false, database: false, environment: false };
  try {
    stage = "SUPAVISOR_TARGET";
    attempts.supavisor = true;
    await invoke(runtime, "updateSupavisorManager", { generationId: targetGenerationId });

    stage = "DATABASE_TARGET";
    attempts.database = true;
    await invoke(runtime, "rotateDatabaseRoles", { generationId: targetGenerationId, roles: POSTGRES_ROTATED_ROLES });

    stage = "DATABASE_TARGET_VERIFIED";
    await invoke(runtime, "verifyDatabaseAuthentication", { generationId: targetGenerationId, roles: POSTGRES_ROTATED_ROLES });

    stage = "ENV_TARGET";
    attempts.environment = true;
    await invoke(runtime, "writeEnvironment", { generationId: targetGenerationId, allowedNames: ["POSTGRES_PASSWORD"] });

    stage = "ENV_TARGET_VERIFIED";
    await invoke(runtime, "verifyLiveEnvironment", { generationId: targetGenerationId });
  } catch {
    return compensation({ runtime, sourceGenerationId, targetGenerationId, stage: assertStage(stage), attempts });
  }

  stage = "POINTER_TARGET";
  try {
    await invoke(runtime, "replacePointer", { fromGenerationId: sourceGenerationId, toGenerationId: targetGenerationId });
  } catch {
    const pointer = await readPointer(runtime);
    if (pointer === sourceGenerationId) return compensation({ runtime, sourceGenerationId, targetGenerationId, stage, attempts });
    if (pointer === targetGenerationId) {
      return result({ state: "COMMITTED_REQUIRES_TRACKED_ROLLBACK", code: "POSTGRES_ROTATION_COMMITTED_REQUIRES_TRACKED_ROLLBACK", sourceGenerationId, targetGenerationId, stage });
    }
    return result({ state: "SECRET_STATE_UNVERIFIED", code: "POSTGRES_ROTATION_SECRET_STATE_UNVERIFIED", sourceGenerationId, targetGenerationId, stage });
  }

  if (await readPointer(runtime) !== targetGenerationId) {
    return result({ state: "SECRET_STATE_UNVERIFIED", code: "POSTGRES_ROTATION_SECRET_STATE_UNVERIFIED", sourceGenerationId, targetGenerationId, stage });
  }

  try {
    stage = "DB_RUNTIME_TARGET";
    await convergeTargetRuntimeService({ runtime, service: "db", targetGenerationId });
    stage = "RUNTIME_TARGET";
    for (const service of POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER.slice(1)) {
      await convergeTargetRuntimeService({ runtime, service, targetGenerationId });
    }
    await verifyNonRecreatedIdentities(runtime, nonRecreatedIdentities);
    stage = "ACCEPTANCE_TARGET";
    await invoke(runtime, "acceptTarget", { sourceGenerationId, targetGenerationId });
  } catch {
    return result({ state: "COMMITTED_REQUIRES_TRACKED_ROLLBACK", code: "POSTGRES_ROTATION_COMMITTED_REQUIRES_TRACKED_ROLLBACK", sourceGenerationId, targetGenerationId, stage: assertStage(stage) });
  }

  stage = "TARGET_ACCEPTED";
  try {
    stage = "MAINTENANCE_OPEN";
    await invoke(runtime, "openMaintenance");
    await invoke(runtime, "verifyNginxRunning");
  } catch {
    return recoverTargetAcceptedMaintenance({ runtime, sourceGenerationId, targetGenerationId });
  }

  try {
    await invoke(runtime, "releaseLock");
  } catch {
    // The lock state is authoritative only after independent readback.
  }
  const lockState = await readOperationLockState(runtime);
  if (lockState === "ABSENT") {
    return result({ state: "COMPLETE", sourceGenerationId, targetGenerationId, stage: "COMPLETE", services: POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER });
  }
  if (lockState === "PRESENT") {
    return result({
      state: "TARGET_ACCEPTED_LOCK_RETAINED",
      code: "POSTGRES_ROTATION_TARGET_ACCEPTED_LOCK_RETAINED",
      sourceGenerationId,
      targetGenerationId,
      stage: "TARGET_ACCEPTED",
    });
  }
  return result({
    state: "TARGET_ACCEPTED_LOCK_STATE_UNVERIFIED",
    code: "POSTGRES_ROTATION_LOCK_STATE_UNVERIFIED",
    sourceGenerationId,
    targetGenerationId,
    stage: "TARGET_ACCEPTED",
  });
}
