import assert from "node:assert/strict";
import test from "node:test";

import {
  POSTGRES_PASSWORD_TARGET_ACCEPTANCE,
  createPostgresPasswordOperationHooks,
  isGodelContainerHealthy,
} from "./postgres-password-operation-evidence.mjs";
import { buildPostgresPasswordRotationCandidate } from "./postgres-password-rotation.mjs";

const sourceGenerationId = "123e4567-e89b-42d3-a456-426614174000";
const targetGenerationId = "223e4567-e89b-42d3-a456-426614174000";
const sourcePassword = "a".repeat(32);
const targetPassword = "b".repeat(64);
const executionCommit = "c".repeat(40);
const preparedCommit = "d".repeat(40);
const completedAt = "2026-08-30T01:00:00.000Z";
function snapshots() {
  const source = Buffer.from(`POSTGRES_PASSWORD=${sourcePassword}\nSERVICE_ROLE_KEY=SYNTHETIC_SOURCE_SECRET\nPOOLER_TENANT_ID=tenant\nJWT_SECRET=retained\n`);
  const target = Buffer.from(`POSTGRES_PASSWORD=${targetPassword}\nSERVICE_ROLE_KEY=SYNTHETIC_SOURCE_SECRET\nPOOLER_TENANT_ID=tenant\nJWT_SECRET=retained\n`);
  return {
    source: { generationId: sourceGenerationId, supabaseSnapshot: source, godelSnapshot: Buffer.from("SUPABASE_SECRET_KEY=retained\n") },
    target: { generationId: targetGenerationId, metadata: { reason: "postgres-password-rotation", sourceGenerationId, repositoryCommit: preparedCommit, createdAt: "2026-08-30T00:00:00.000Z" }, supabaseSnapshot: target, godelSnapshot: Buffer.from("SUPABASE_SECRET_KEY=retained\n") },
  };
}

function manifest(overrides = {}) {
  return { format: "godel-selfhosted-backup", schemaVersion: 3, status: "COMPLETE", externalSecretGenerationId: sourceGenerationId, repository: { commit: executionCommit, branch: "preprod/selfhosted-supabase", dirty: false }, completedAt, ...overrides };
}

test("Godel health requires explicit running and healthy states", () => {
  assert.equal(isGodelContainerHealthy({ Running: true, Health: { Status: "healthy" } }), true);
  assert.equal(isGodelContainerHealthy({ Running: true }), false);
  assert.equal(isGodelContainerHealthy({ Running: true, Health: { Status: "starting" } }), false);
  assert.equal(isGodelContainerHealthy({ Running: false, Health: { Status: "healthy" } }), false);
});

function fixture({ pointer = sourceGenerationId, live = pointer, lock = { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, repo = {}, backupManifest = manifest(), backupVerified = true, secretContract = true, topology = { godelNginxPublicIngress: true, apiGatewayHostPorts: [], supavisorHostPorts: [] }, nginxRunning = pointer === sourceGenerationId, nginxStopped = pointer === targetGenerationId, broken = null, godelHealthy = true, publicHealthy = true } = {}) {
  const mutations = ["rotateDatabaseRoles", "restoreDatabaseRoles", "restoreDatabaseRolesTarget", "updateSupavisorManager", "restoreSupavisorManager", "restoreSupavisorManagerTarget", "writeEnvironment", "restoreEnvironment", "restoreEnvironmentTarget", "replacePointer", "recreateDatabase", "recreateConsumer", "openMaintenance", "closeMaintenance", "releaseLock"];
  const runtime = {
    readCurrentPointer: async () => pointer,
    readOperationLockState: async () => "PRESENT",
    verifyLiveEnvironment: async ({ generationId }) => generationId === live,
    getServiceIdentity: async ({ service }) => `${service}-identity`,
    getManagedServiceIdentityState: async () => ({ state: "PRESENT" }),
    waitDatabaseHealthy: async () => true,
    waitServiceHealthy: async () => true,
    verifyDatabaseAuthentication: async () => true,
    verifySupavisorManager: async () => true,
    verifyRuntimeSecretHygiene: async ({ generationId }) => generationId === sourceGenerationId ? { sourceMatch: true, targetAbsent: true } : { targetMatch: true, oldAbsent: true },
    verifyNginxRunning: async () => nginxRunning,
    verifyNginxStopped: async () => nginxStopped,
  };
  for (const name of mutations) runtime[name] = async () => { throw new Error(`MUTATION_CALLED:${name}`); };
  if (broken) runtime[broken] = async () => { throw new Error("SYNTHETIC_SECRET_DO_NOT_PRINT"); };
  const generations = snapshots();
  const hooks = createPostgresPasswordOperationHooks({
    sourceGenerationId, targetGenerationId, backup: { path: "synthetic-backup" }, protectedRoot: "synthetic-protected", supabaseEnvPath: "synthetic-supabase", godelEnvPath: "synthetic-godel", root: "synthetic-root",
    getRuntime: () => runtime,
    secretGeneration: {
      readSecretGeneration: async ({ generationId }) => generationId === sourceGenerationId ? generations.source : generations.target,
      getCurrentSecretGeneration: async () => ({ generationId: pointer }),
      readGenerationMutationLock: async () => lock,
    },
    readRepositoryEvidence: async () => ({ clean: true, branch: "preprod/selfhosted-supabase", commit: executionCommit, ...repo }),
    readBackupManifest: async () => backupManifest,
    verifyBackup: async () => backupVerified,
    verifySecretContract: async () => secretContract,
    inspectTopology: async () => topology,
    verifyGodelHealthy: async () => godelHealthy,
    checkPublicHealth: async () => publicHealthy,
    now: () => Date.parse(completedAt) + 2 * 60 * 60 * 1000,
  });
  return { hooks, runtime, generations };
}

test("locked source preflight returns only the exact evidence and never invokes a mutation", async () => {
  const { hooks } = fixture();
  assert.deepEqual(await hooks.preflight(), {
    repositoryClean: true, currentGenerationId: sourceGenerationId, liveEnvironmentGenerationId: sourceGenerationId, lockAcquired: true,
    ecGeneration7Preserved: true, supabaseHealthy: true, godelHealthy: true, nginxRunning: true,
    ingressTopology: { godelNginxPublicIngress: true, apiGatewayHostPorts: [], supavisorHostPorts: [] },
  });
});

test("public recovery requires every public SOURCE safety signal", async () => {
  for (const changes of [
    { pointer: targetGenerationId, live: sourceGenerationId, nginxRunning: true },
    { pointer: sourceGenerationId, live: targetGenerationId, nginxRunning: true },
    { godelHealthy: false },
    { publicHealthy: false },
    { topology: { godelNginxPublicIngress: true, apiGatewayHostPorts: ["54321"], supavisorHostPorts: [] } },
    { topology: { godelNginxPublicIngress: true, apiGatewayHostPorts: [], supavisorHostPorts: ["6543"] } },
    { topology: { godelNginxPublicIngress: false, apiGatewayHostPorts: [], supavisorHostPorts: [] } },
  ]) await assert.rejects(() => fixture(changes).hooks.verifyPublicRecovery({ generationId: sourceGenerationId }), /POSTGRES_OPERATION_EVIDENCE_/);
  for (const method of ["verifyDatabaseAuthentication", "verifySupavisorManager", "waitDatabaseHealthy", "waitServiceHealthy"]) {
    const unit = fixture();
    unit.runtime[method] = async () => false;
    await assert.rejects(() => unit.hooks.verifyPublicRecovery({ generationId: sourceGenerationId }), /POSTGRES_OPERATION_EVIDENCE_/);
  }
  const hygiene = fixture();
  hygiene.runtime.verifyRuntimeSecretHygiene = async () => ({ sourceMatch: false, targetAbsent: false });
  await assert.rejects(() => hygiene.hooks.verifyPublicRecovery({ generationId: sourceGenerationId }), /POSTGRES_OPERATION_EVIDENCE_/);
});

test("operation hooks are lazy and old target prepare commit does not bind the new execution or backup commit", async () => {
  let runtime;
  const base = fixture();
  const hooks = createPostgresPasswordOperationHooks({
    sourceGenerationId, targetGenerationId, backup: { path: "synthetic" }, protectedRoot: "p", getRuntime: () => runtime,
    secretGeneration: { readSecretGeneration: async ({ generationId }) => base.generations[generationId === sourceGenerationId ? "source" : "target"], readGenerationMutationLock: async () => ({ state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }) },
    readRepositoryEvidence: async () => ({ clean: true, branch: "preprod/selfhosted-supabase", commit: executionCommit }), readBackupManifest: async () => manifest(), verifyBackup: async () => true, verifySecretContract: async () => true, inspectTopology: async () => ({ godelNginxPublicIngress: true, apiGatewayHostPorts: [], supavisorHostPorts: [] }), verifyGodelHealthy: async () => true, now: () => Date.parse(completedAt),
  });
  runtime = base.runtime;
  assert.equal((await hooks.preflight()).repositoryClean, true);
  assert.notEqual(base.generations.target.metadata.repositoryCommit, executionCommit);
});

test("operation evidence relies on the canonical model parser for export-compatible snapshots", async () => {
  const unit = fixture();
  const sourceSupabaseSnapshot = Buffer.from(`export POSTGRES_PASSWORD=${sourcePassword}\nSERVICE_ROLE_KEY=SYNTHETIC_SOURCE_SECRET\nPOOLER_TENANT_ID=tenant\nJWT_SECRET=retained\n`);
  const sourceGodelSnapshot = Buffer.from("SUPABASE_SECRET_KEY=retained\n");
  const candidate = buildPostgresPasswordRotationCandidate({ sourceSupabaseSnapshot, sourceGodelSnapshot, targetPassword });
  unit.generations.source = { ...unit.generations.source, supabaseSnapshot: sourceSupabaseSnapshot, godelSnapshot: sourceGodelSnapshot };
  unit.generations.target = { ...unit.generations.target, supabaseSnapshot: candidate.supabaseSnapshot, godelSnapshot: candidate.godelSnapshot };
  assert.equal((await unit.hooks.preflight()).ecGeneration7Preserved, true);
});

for (const lock of [null, { state: "ABSENT" }, { state: "PRESENT", operation: "foreign", generationId: targetGenerationId }, { state: "PRESENT", operation: "postgres-password-rotation", generationId: sourceGenerationId }, { state: "PRESENT" }]) {
  test(`preflight fails closed for lock ${JSON.stringify(lock)}`, async () => {
    await assert.rejects(() => fixture({ lock }).hooks.preflight(), /POSTGRES_OPERATION_EVIDENCE_LOCK_INVALID/);
  });
}

test("unreadable lock fails closed without leaking error data", async () => {
  const unit = fixture();
  const hooks = createPostgresPasswordOperationHooks({ sourceGenerationId, targetGenerationId, backup: { path: "x" }, protectedRoot: "p", getRuntime: () => unit.runtime, secretGeneration: { readSecretGeneration: async ({ generationId }) => unit.generations[generationId === sourceGenerationId ? "source" : "target"], readGenerationMutationLock: async () => { throw new Error("SYNTHETIC_SECRET_DO_NOT_PRINT"); } } });
  await assert.rejects(() => hooks.preflight(), (error) => !error.message.includes("SYNTHETIC_SECRET_DO_NOT_PRINT"));
});

test("runtime inspection failures are redacted from public hook errors", async () => {
  const { hooks } = fixture({ broken: "verifyDatabaseAuthentication" });
  await assert.rejects(() => hooks.preflight(), (error) => error.message === "POSTGRES_OPERATION_EVIDENCE_UNVERIFIED");
});

for (const [name, changes, expected] of [
  ["source mismatch", { backupManifest: manifest({ externalSecretGenerationId: targetGenerationId }) }, /BACKUP_BINDING/],
  ["commit mismatch", { backupManifest: manifest({ repository: { commit: "e".repeat(40), branch: "preprod/selfhosted-supabase", dirty: false } }) }, /BACKUP_BINDING/],
  ["dirty repository", { repo: { clean: false } }, /REPOSITORY_INVALID/],
  ["dirty backup", { backupManifest: manifest({ repository: { commit: executionCommit, branch: "preprod/selfhosted-supabase", dirty: true } }) }, /BACKUP_BINDING/],
  ["non-complete manifest", { backupManifest: manifest({ status: "RUNNING" }) }, /BACKUP_BINDING/],
  ["independent verifier failure", { backupVerified: false }, /BACKUP_VERIFICATION/],
  ["stale backup", { backupManifest: manifest({ completedAt: "2026-08-29T22:59:59.999Z" }) }, /BACKUP_STALE/],
]) test(`backup gate rejects ${name}`, async () => assert.rejects(() => fixture(changes).hooks.preflight(), expected));

test("accepted target is classified and enables tracked rollback", async () => {
  const { hooks } = fixture({ pointer: targetGenerationId, live: targetGenerationId, nginxRunning: false, nginxStopped: true, topology: { apiGatewayHostPorts: [], supavisorHostPorts: [] } });
  assert.equal(await hooks.classifyTargetAcceptance(), POSTGRES_PASSWORD_TARGET_ACCEPTANCE.ACCEPTED);
  assert.equal(await hooks.acceptTarget(), true);
  assert.equal((await hooks.preflightRollback()).targetAccepted, true);
});

test("core TARGET acceptance remains accepted while running Nginx fails the maintenance-closed predicate", async () => {
  const { hooks } = fixture({ pointer: targetGenerationId, live: targetGenerationId, nginxRunning: true, nginxStopped: false, topology: { apiGatewayHostPorts: [], supavisorHostPorts: [] } });
  assert.equal(await hooks.classifyTargetCoreAcceptance(), POSTGRES_PASSWORD_TARGET_ACCEPTANCE.ACCEPTED);
  assert.equal(await hooks.classifyTargetAcceptance(), POSTGRES_PASSWORD_TARGET_ACCEPTANCE.NOT_ACCEPTED);
  assert.equal(await hooks.acceptTarget(), false);
  await assert.rejects(() => hooks.preflightRollback(), /POSTGRES_OPERATION_EVIDENCE_/);
});

test("known incomplete target is not accepted but remains eligible for rollback", async () => {
  const unit = fixture({ pointer: targetGenerationId, live: targetGenerationId, nginxRunning: false, nginxStopped: true, topology: { apiGatewayHostPorts: [], supavisorHostPorts: [] } });
  unit.runtime.verifyRuntimeSecretHygiene = async () => ({ targetMatch: false, oldAbsent: false });
  assert.equal(await unit.hooks.classifyTargetAcceptance(), POSTGRES_PASSWORD_TARGET_ACCEPTANCE.NOT_ACCEPTED);
  assert.equal(await unit.hooks.acceptTarget(), false);
  assert.equal((await unit.hooks.preflightRollback()).targetAccepted, false);
});

test("real live hygiene inspection errors are unverified and keep rollback fail-closed", async () => {
  const unit = fixture({ pointer: targetGenerationId, live: targetGenerationId, nginxRunning: false, nginxStopped: true, topology: { apiGatewayHostPorts: [], supavisorHostPorts: [] } });
  unit.runtime.verifyRuntimeSecretHygiene = async () => { throw new Error("POSTGRES_LIVE_RUNTIME_HYGIENE_INVALID"); };
  assert.equal(await unit.hooks.classifyTargetAcceptance(), POSTGRES_PASSWORD_TARGET_ACCEPTANCE.UNVERIFIED);
  await assert.rejects(() => unit.hooks.preflightRollback(), /TARGET_UNVERIFIED/);
});

test("inspection failure is unverified and rollback preflight fails closed", async () => {
  const { hooks } = fixture({ pointer: targetGenerationId, live: targetGenerationId, nginxRunning: false, nginxStopped: true, topology: { apiGatewayHostPorts: [], supavisorHostPorts: [] }, broken: "verifyDatabaseAuthentication" });
  assert.equal(await hooks.classifyTargetAcceptance(), POSTGRES_PASSWORD_TARGET_ACCEPTANCE.UNVERIFIED);
  await assert.rejects(() => hooks.preflightRollback(), /TARGET_UNVERIFIED/);
});

test("restored source is accepted for rollback and resume keeps the retained target lock", async () => {
  const { hooks } = fixture({ pointer: sourceGenerationId, live: sourceGenerationId, nginxRunning: false, nginxStopped: true, topology: { apiGatewayHostPorts: [], supavisorHostPorts: [] } });
  assert.equal(await hooks.acceptRollbackSource(), true);
  assert.deepEqual(await hooks.preflightRollbackResume(), {
    currentGenerationId: sourceGenerationId, liveEnvironmentGenerationId: sourceGenerationId,
    retainedLock: { exists: true, operation: "postgres-password-rotation", targetGenerationId }, maintenanceClosed: true, nginxStopped: true, ecGeneration7Preserved: true,
    ingressTopology: { apiGatewayHostPorts: [], supavisorHostPorts: [] },
  });
});
