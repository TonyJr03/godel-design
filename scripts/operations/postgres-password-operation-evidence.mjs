import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import {
  readGenerationMutationLock,
  readSecretGeneration,
} from "./secret-generation.mjs";
import {
  POSTGRES_PASSWORD_ROTATION_REASON,
  POSTGRES_ROTATED_ROLES,
  validatePostgresPasswordRotationCandidate,
} from "./postgres-password-rotation.mjs";

const execFileAsync = promisify(execFile);
const BACKUP_FORMAT = "godel-selfhosted-backup";
const BACKUP_SCHEMA_VERSION = 3;
const EXPECTED_BRANCH = "preprod/selfhosted-supabase";
const MAX_BACKUP_AGE_MS = 2 * 60 * 60 * 1000;
const SUPABASE_SERVICES = Object.freeze(["db", "supavisor", "meta", "auth", "rest", "realtime", "storage", "functions", "studio", "api-gw", "imgproxy"]);
const HYGIENE_SERVICES = Object.freeze(["db", "supavisor", "meta", "auth", "rest", "realtime", "storage", "functions", "studio"]);
const MAX_PROCESS_OUTPUT = 4096;

export const POSTGRES_PASSWORD_TARGET_ACCEPTANCE = Object.freeze({
  ACCEPTED: "ACCEPTED",
  NOT_ACCEPTED: "NOT_ACCEPTED",
  UNVERIFIED: "UNVERIFIED",
});

function fail(code) { throw new Error(code); }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function required(value, code) { if (!value) fail(code); return value; }
function safeError(error, code) { return error instanceof Error && error.message.startsWith("POSTGRES_OPERATION_EVIDENCE_") ? error : new Error(code); }

async function defaultRepositoryEvidence({ root }) {
  try {
    const options = { cwd: root, windowsHide: true, maxBuffer: MAX_PROCESS_OUTPUT };
    const [status, branch, head] = await Promise.all([
      execFileAsync("git", ["status", "--porcelain"], options),
      execFileAsync("git", ["branch", "--show-current"], options),
      execFileAsync("git", ["rev-parse", "HEAD"], options),
    ]);
    return { clean: status.stdout.trim() === "", branch: branch.stdout.trim(), commit: head.stdout.trim() };
  } catch { fail("POSTGRES_OPERATION_EVIDENCE_REPOSITORY_UNVERIFIED"); }
}

async function defaultReadBackupManifest({ backup }) {
  if (!plainObject(backup) || typeof backup.path !== "string" || !backup.path) fail("POSTGRES_OPERATION_EVIDENCE_BACKUP_INVALID");
  try { return JSON.parse(await readFile(resolve(backup.path, "manifest.json"), "utf8")); }
  catch { fail("POSTGRES_OPERATION_EVIDENCE_BACKUP_MANIFEST_INVALID"); }
}

async function defaultVerifyBackup({ backup, root }) {
  if (!backup?.path) fail("POSTGRES_OPERATION_EVIDENCE_BACKUP_INVALID");
  try {
    await execFileAsync(process.execPath, [resolve(root, "scripts/operations/backup-selfhosted.mjs"), "verify", "--backup", backup.path], {
      cwd: root, windowsHide: true, maxBuffer: MAX_PROCESS_OUTPUT,
    });
    return true;
  } catch { fail("POSTGRES_OPERATION_EVIDENCE_BACKUP_VERIFICATION_FAILED"); }
}

async function defaultVerifySecretContract({ root }) {
  try {
    await execFileAsync(process.execPath, [resolve(root, "scripts/operations/check-selfhosted-secrets.mjs")], {
      cwd: root, windowsHide: true, maxBuffer: MAX_PROCESS_OUTPUT,
    });
    return true;
  } catch { fail("POSTGRES_OPERATION_EVIDENCE_EC_GENERATION7_UNVERIFIED"); }
}

function validManifest(manifest, sourceGenerationId) {
  const repository = manifest?.repository;
  return plainObject(manifest)
    && manifest.format === BACKUP_FORMAT
    && manifest.schemaVersion === BACKUP_SCHEMA_VERSION
    && manifest.status === "COMPLETE"
    && manifest.externalSecretGenerationId === sourceGenerationId
    && plainObject(repository)
    && typeof repository.commit === "string"
    && repository.branch === EXPECTED_BRANCH
    && repository.dirty === false
    && typeof manifest.completedAt === "string";
}

function portList(value) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" && typeof entry !== "number")) fail("POSTGRES_OPERATION_EVIDENCE_TOPOLOGY_UNVERIFIED");
  return [...value];
}

function normalizedTopology(value, { requirePublicIngress }) {
  if (!plainObject(value)) fail("POSTGRES_OPERATION_EVIDENCE_TOPOLOGY_UNVERIFIED");
  const topology = {
    apiGatewayHostPorts: portList(value.apiGatewayHostPorts),
    supavisorHostPorts: portList(value.supavisorHostPorts),
    ...(requirePublicIngress ? { godelNginxPublicIngress: value.godelNginxPublicIngress === true } : {}),
  };
  if (topology.apiGatewayHostPorts.length || topology.supavisorHostPorts.length || (requirePublicIngress && !topology.godelNginxPublicIngress)) {
    fail("POSTGRES_OPERATION_EVIDENCE_TOPOLOGY_INVALID");
  }
  return topology;
}

export function isGodelContainerHealthy(state) {
  return plainObject(state) && state.Running === true && state.Health?.Status === "healthy";
}

async function defaultTopology({ runtime }) {
  async function ports(service) {
    const id = await runtime.getServiceIdentity({ service });
    try {
      const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", id], { windowsHide: true, maxBuffer: MAX_PROCESS_OUTPUT });
      const mappings = JSON.parse(stdout.trim());
      if (!plainObject(mappings)) fail("POSTGRES_OPERATION_EVIDENCE_TOPOLOGY_UNVERIFIED");
      return Object.values(mappings).flatMap((entries) => Array.isArray(entries) ? entries.map((entry) => entry?.HostPort).filter((port) => typeof port === "string" && port) : []);
    } catch (error) { throw safeError(error, "POSTGRES_OPERATION_EVIDENCE_TOPOLOGY_UNVERIFIED"); }
  }
  const [apiGatewayHostPorts, supavisorHostPorts, nginxPorts] = await Promise.all([ports("api-gw"), ports("supavisor"), ports("godel-nginx")]);
  return { godelNginxPublicIngress: nginxPorts.length > 0, apiGatewayHostPorts, supavisorHostPorts };
}

async function defaultVerifyGodelHealthy({ runtime }) {
  for (const service of ["godel-app", "godel-nginx"]) {
    const id = await runtime.getServiceIdentity({ service });
    try {
      const { stdout } = await execFileAsync("docker", ["inspect", "--format", "{{json .State}}", id], { windowsHide: true, maxBuffer: MAX_PROCESS_OUTPUT });
      const state = JSON.parse(stdout.trim());
      if (!isGodelContainerHealthy(state)) fail("POSTGRES_OPERATION_EVIDENCE_GODEL_HEALTH_FAILED");
    } catch (error) { throw safeError(error, "POSTGRES_OPERATION_EVIDENCE_GODEL_HEALTH_FAILED"); }
  }
  return true;
}

async function defaultCheckPublicHealth() {
  try {
    for (const path of ["/api/health/live", "/api/health/ready"]) {
      const response = await fetch(`http://127.0.0.1:8080${path}`, { signal: AbortSignal.timeout(5000) });
      if (response.status !== 200) fail("POSTGRES_OPERATION_EVIDENCE_PUBLIC_HEALTH_FAILED");
    }
    return true;
  } catch (error) { throw safeError(error, "POSTGRES_OPERATION_EVIDENCE_PUBLIC_HEALTH_FAILED"); }
}

export function createPostgresPasswordOperationHooks({
  sourceGenerationId,
  targetGenerationId,
  backup,
  protectedRoot,
  supabaseEnvPath,
  godelEnvPath,
  root = process.cwd(),
  getRuntime,
  secretGeneration = { readSecretGeneration, readGenerationMutationLock },
  readRepositoryEvidence = defaultRepositoryEvidence,
  readBackupManifest = defaultReadBackupManifest,
  verifyBackup = defaultVerifyBackup,
  verifySecretContract = defaultVerifySecretContract,
  inspectTopology = defaultTopology,
  verifyGodelHealthy = defaultVerifyGodelHealthy,
  checkPublicHealth = defaultCheckPublicHealth,
  now = () => Date.now(),
} = {}) {
  if (typeof sourceGenerationId !== "string" || !sourceGenerationId || typeof targetGenerationId !== "string" || !targetGenerationId || sourceGenerationId === targetGenerationId || typeof getRuntime !== "function") {
    fail("POSTGRES_OPERATION_EVIDENCE_CONFIGURATION_INVALID");
  }

  const runtime = async () => required(await getRuntime(), "POSTGRES_OPERATION_EVIDENCE_RUNTIME_UNAVAILABLE");
  const generation = async (generationId) => secretGeneration.readSecretGeneration({ protectedRoot, generationId });

  async function relationship() {
    const [source, target] = await Promise.all([generation(sourceGenerationId), generation(targetGenerationId)]);
    if (!plainObject(target?.metadata) || target.metadata.reason !== POSTGRES_PASSWORD_ROTATION_REASON || target.metadata.sourceGenerationId !== sourceGenerationId) {
      fail("POSTGRES_OPERATION_EVIDENCE_CANDIDATE_RELATION_INVALID");
    }
    validatePostgresPasswordRotationCandidate({
      sourceSupabaseSnapshot: source.supabaseSnapshot,
      candidateSupabaseSnapshot: target.supabaseSnapshot,
      sourceGodelSnapshot: source.godelSnapshot,
      candidateGodelSnapshot: target.godelSnapshot,
    });
    return { source, target };
  }

  async function exactLock() {
    let lock;
    try { lock = await secretGeneration.readGenerationMutationLock({ protectedRoot }); }
    catch { fail("POSTGRES_OPERATION_EVIDENCE_LOCK_UNVERIFIED"); }
    if (!plainObject(lock) || lock.state !== "PRESENT" || lock.operation !== POSTGRES_PASSWORD_ROTATION_REASON || lock.generationId !== targetGenerationId) {
      fail("POSTGRES_OPERATION_EVIDENCE_LOCK_INVALID");
    }
    return { exists: true, operation: POSTGRES_PASSWORD_ROTATION_REASON, targetGenerationId };
  }

  async function currentAndLive(expected) {
    const instance = await runtime();
    if (await instance.readCurrentPointer() !== expected) fail("POSTGRES_OPERATION_EVIDENCE_POINTER_MISMATCH");
    if (await instance.verifyLiveEnvironment({ generationId: expected }) !== true) fail("POSTGRES_OPERATION_EVIDENCE_ENVIRONMENT_MISMATCH");
    return instance;
  }

  async function verifySupabase(instance, generationId) {
    if (await instance.verifyDatabaseAuthentication({ generationId, roles: [...POSTGRES_ROTATED_ROLES] }) !== true) fail("POSTGRES_OPERATION_EVIDENCE_DATABASE_AUTH_FAILED");
    if (await instance.verifySupavisorManager({ generationId }) !== true) fail("POSTGRES_OPERATION_EVIDENCE_SUPAVISOR_FAILED");
    if (await instance.waitDatabaseHealthy() !== true) fail("POSTGRES_OPERATION_EVIDENCE_DATABASE_HEALTH_FAILED");
    for (const service of SUPABASE_SERVICES) if (await instance.waitServiceHealthy({ service }) !== true) fail("POSTGRES_OPERATION_EVIDENCE_SUPABASE_HEALTH_FAILED");
  }

  async function hygiene(instance, generationId, expected) {
    for (const service of HYGIENE_SERVICES) {
      const result = await instance.verifyRuntimeSecretHygiene({ service, generationId });
      if (!plainObject(result) || result[expected.match] !== true || result[expected.absent] !== true) fail("POSTGRES_OPERATION_EVIDENCE_HYGIENE_FAILED");
    }
  }

  async function ecEvidence() {
    await relationship();
    if (await verifySecretContract({ root, protectedRoot, supabaseEnvPath, godelEnvPath }) !== true) fail("POSTGRES_OPERATION_EVIDENCE_EC_GENERATION7_UNVERIFIED");
    return true;
  }

  async function backupEvidence(repository) {
    const manifest = await readBackupManifest({ backup, root });
    if (!validManifest(manifest, sourceGenerationId) || manifest.repository.commit !== repository.commit) fail("POSTGRES_OPERATION_EVIDENCE_BACKUP_BINDING_INVALID");
    const completedAt = Date.parse(manifest.completedAt);
    const age = Number(now()) - completedAt;
    if (!Number.isFinite(completedAt) || age < 0 || age > MAX_BACKUP_AGE_MS) fail("POSTGRES_OPERATION_EVIDENCE_BACKUP_STALE");
    if (await verifyBackup({ backup, root, manifest }) !== true) fail("POSTGRES_OPERATION_EVIDENCE_BACKUP_VERIFICATION_FAILED");
  }

  async function preflight() {
    const lock = await exactLock();
    const instance = await currentAndLive(sourceGenerationId);
    const repository = await readRepositoryEvidence({ root });
    if (!plainObject(repository) || repository.clean !== true || repository.branch !== EXPECTED_BRANCH || typeof repository.commit !== "string") fail("POSTGRES_OPERATION_EVIDENCE_REPOSITORY_INVALID");
    await backupEvidence(repository);
    await ecEvidence();
    await verifySupabase(instance, sourceGenerationId);
    await hygiene(instance, sourceGenerationId, { match: "sourceMatch", absent: "targetAbsent" });
    if (await instance.verifyNginxRunning() !== true || await verifyGodelHealthy({ runtime: instance }) !== true) fail("POSTGRES_OPERATION_EVIDENCE_GODEL_HEALTH_FAILED");
    if (await checkPublicHealth({ runtime: instance }) !== true) fail("POSTGRES_OPERATION_EVIDENCE_PUBLIC_HEALTH_FAILED");
    const ingressTopology = normalizedTopology(await inspectTopology({ runtime: instance }), { requirePublicIngress: true });
    return Object.freeze({ repositoryClean: true, currentGenerationId: sourceGenerationId, liveEnvironmentGenerationId: sourceGenerationId, lockAcquired: lock.exists, ecGeneration7Preserved: true, supabaseHealthy: true, godelHealthy: true, nginxRunning: true, ingressTopology: Object.freeze(ingressTopology) });
  }

  async function classifyTargetAcceptance() {
    try {
      const instance = await currentAndLive(targetGenerationId);
      await relationship();
      await verifySupabase(instance, targetGenerationId);
      await hygiene(instance, targetGenerationId, { match: "targetMatch", absent: "oldAbsent" });
      if (await instance.verifyNginxStopped() !== true) return POSTGRES_PASSWORD_TARGET_ACCEPTANCE.NOT_ACCEPTED;
      normalizedTopology(await inspectTopology({ runtime: instance }), { requirePublicIngress: false });
      return POSTGRES_PASSWORD_TARGET_ACCEPTANCE.ACCEPTED;
    } catch (error) {
      if (["POSTGRES_OPERATION_EVIDENCE_POINTER_MISMATCH", "POSTGRES_OPERATION_EVIDENCE_ENVIRONMENT_MISMATCH", "POSTGRES_OPERATION_EVIDENCE_DATABASE_AUTH_FAILED", "POSTGRES_OPERATION_EVIDENCE_SUPAVISOR_FAILED", "POSTGRES_OPERATION_EVIDENCE_HYGIENE_FAILED", "POSTGRES_OPERATION_EVIDENCE_TOPOLOGY_INVALID"].includes(error?.message)) return POSTGRES_PASSWORD_TARGET_ACCEPTANCE.NOT_ACCEPTED;
      return POSTGRES_PASSWORD_TARGET_ACCEPTANCE.UNVERIFIED;
    }
  }

  async function acceptTarget() { return (await classifyTargetAcceptance()) === POSTGRES_PASSWORD_TARGET_ACCEPTANCE.ACCEPTED; }

  async function preflightRollback() {
    const instance = await currentAndLive(targetGenerationId);
    const retainedLock = await exactLock();
    await ecEvidence();
    if (await instance.verifyNginxStopped() !== true) fail("POSTGRES_OPERATION_EVIDENCE_NGINX_NOT_STOPPED");
    const ingressTopology = normalizedTopology(await inspectTopology({ runtime: instance }), { requirePublicIngress: false });
    const classification = await classifyTargetAcceptance();
    if (classification === POSTGRES_PASSWORD_TARGET_ACCEPTANCE.UNVERIFIED) fail("POSTGRES_OPERATION_EVIDENCE_TARGET_UNVERIFIED");
    return Object.freeze({ currentGenerationId: targetGenerationId, liveEnvironmentGenerationId: targetGenerationId, targetAccepted: classification === POSTGRES_PASSWORD_TARGET_ACCEPTANCE.ACCEPTED, retainedLock: Object.freeze(retainedLock), maintenanceClosed: true, nginxStopped: true, ecGeneration7Preserved: true, ingressTopology: Object.freeze(ingressTopology) });
  }

  async function preflightRollbackResume() {
    const instance = await currentAndLive(sourceGenerationId);
    const retainedLock = await exactLock();
    await ecEvidence();
    if (await instance.verifyNginxStopped() !== true) fail("POSTGRES_OPERATION_EVIDENCE_NGINX_NOT_STOPPED");
    const ingressTopology = normalizedTopology(await inspectTopology({ runtime: instance }), { requirePublicIngress: false });
    return Object.freeze({ currentGenerationId: sourceGenerationId, liveEnvironmentGenerationId: sourceGenerationId, retainedLock: Object.freeze(retainedLock), maintenanceClosed: true, nginxStopped: true, ecGeneration7Preserved: true, ingressTopology: Object.freeze(ingressTopology) });
  }

  async function acceptRollbackSource() {
    try {
      const instance = await currentAndLive(sourceGenerationId);
      await relationship();
      await verifySupabase(instance, sourceGenerationId);
      await hygiene(instance, sourceGenerationId, { match: "sourceMatch", absent: "targetAbsent" });
      if (await instance.verifyNginxStopped() !== true) return false;
      normalizedTopology(await inspectTopology({ runtime: instance }), { requirePublicIngress: false });
      return true;
    } catch { return false; }
  }

  function protectedHook(hook) {
    return async (...args) => {
      try { return await hook(...args); }
      catch (error) { throw safeError(error, "POSTGRES_OPERATION_EVIDENCE_UNVERIFIED"); }
    };
  }

  return Object.freeze({
    preflight: protectedHook(preflight),
    acceptTarget: protectedHook(acceptTarget),
    preflightRollback: protectedHook(preflightRollback),
    preflightRollbackResume: protectedHook(preflightRollbackResume),
    acceptRollbackSource: protectedHook(acceptRollbackSource),
    classifyTargetAcceptance: protectedHook(classifyTargetAcceptance),
  });
}
