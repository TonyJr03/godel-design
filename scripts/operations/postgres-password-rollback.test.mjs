import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  POSTGRES_PASSWORD_ROLLBACK_STAGES,
  orchestratePostgresPasswordRollback,
  resumePostgresPasswordRollback,
  validatePostgresPasswordRollbackRelationship,
} from "./postgres-password-rollback.mjs";
import { POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER } from "./postgres-password-runtime.mjs";

const sourceGenerationId = "postgres-source-generation";
const targetGenerationId = "postgres-target-generation";
const sourcePassword = "a".repeat(64);
const targetPassword = "b".repeat(64);
const sourceSecret = "SYNTHETIC_ROLLBACK_SOURCE_SECRET_DO_NOT_PRINT";
const targetSecret = "SYNTHETIC_ROLLBACK_TARGET_SECRET_DO_NOT_PRINT";

function generations({ targetMetadata = {}, targetSupabaseSnapshot, targetGodelSnapshot } = {}) {
  const sourceSupabaseSnapshot = Buffer.from(`POSTGRES_PASSWORD=${sourcePassword}\nSERVICE_ROLE_KEY=${sourceSecret}\nPOOLER_TENANT_ID=synthetic-tenant\nJWT_SECRET=retained\n`);
  const sourceGodelSnapshot = Buffer.from("SUPABASE_SECRET_KEY=unchanged\n");
  return {
    source: {
      generationId: sourceGenerationId,
      supabaseSnapshot: sourceSupabaseSnapshot,
      godelSnapshot: sourceGodelSnapshot,
    },
    target: {
      generationId: targetGenerationId,
      metadata: {
        reason: "postgres-password-rotation",
        sourceGenerationId,
        ...targetMetadata,
      },
      supabaseSnapshot: targetSupabaseSnapshot ?? Buffer.from(`POSTGRES_PASSWORD=${targetPassword}\nSERVICE_ROLE_KEY=${sourceSecret}\nPOOLER_TENANT_ID=synthetic-tenant\nJWT_SECRET=retained\n`),
      godelSnapshot: targetGodelSnapshot ?? Buffer.from(sourceGodelSnapshot),
      protectedReference: targetSecret,
    },
  };
}

function fakeRuntime({
  initialPointer = targetGenerationId,
  failAt = [],
  pointerAfterFailure = targetGenerationId,
  openMutatesThenThrows = false,
  lockReadState = null,
  releaseThrowsAfterAbsent = false,
  mutateNonRecreated = false,
} = {}) {
  const failures = new Set(failAt);
  const events = [];
  const identities = new Map([
    ...POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER,
    "api-gw", "imgproxy", "godel-app", "godel-nginx",
  ].map((service) => [service, `${service}-0`]));
  let pointer = initialPointer;
  let nginxRunning = false;
  let lockState = "PRESENT";
  const attempt = async (name, effect = null) => {
    events.push(name);
    if (failures.has(name)) throw new Error(`${sourceSecret}:${targetSecret}:${name}`);
    effect?.();
    return true;
  };
  const targetPreflight = () => ({
    currentGenerationId: targetGenerationId,
    liveEnvironmentGenerationId: targetGenerationId,
    targetAccepted: false,
    retainedLock: { exists: true, operation: "postgres-password-rotation", targetGenerationId },
    maintenanceClosed: true,
    nginxStopped: true,
    ecGeneration7Preserved: true,
    ingressTopology: { apiGatewayHostPorts: [], supavisorHostPorts: [] },
  });
  const sourcePreflight = () => ({ ...targetPreflight(), currentGenerationId: sourceGenerationId, liveEnvironmentGenerationId: sourceGenerationId });
  return {
    events,
    preflightRollback: async () => { await attempt("preflight:target"); return targetPreflight(); },
    preflightRollbackResume: async () => { await attempt("preflight:source"); return sourcePreflight(); },
    getServiceIdentity: async ({ service }) => { events.push(`identity:${service}`); return identities.get(service); },
    updateSupavisorManager: ({ generationId }) => attempt(`supavisor:${generationId}`),
    rotateDatabaseRoles: ({ generationId }) => attempt(`database:${generationId}`),
    verifyDatabaseAuthentication: ({ generationId }) => attempt(`database-verify:${generationId}`),
    writeEnvironment: ({ generationId }) => attempt(`environment:${generationId}`),
    verifyLiveEnvironment: ({ generationId }) => attempt(`environment-verify:${generationId}`),
    restoreEnvironmentTarget: () => attempt("restore-environment:target"),
    restoreDatabaseRolesTarget: () => attempt("restore-database:target"),
    restoreSupavisorManagerTarget: () => attempt("restore-supavisor:target"),
    verifySupavisorManager: ({ generationId }) => attempt(`supavisor-verify:${generationId}`),
    async replacePointer() {
      events.push("pointer:source");
      if (failures.has("pointer:source")) {
        pointer = pointerAfterFailure;
        throw new Error(`${sourceSecret}:${targetSecret}:pointer`);
      }
      pointer = sourceGenerationId;
      return true;
    },
    async readCurrentPointer() {
      events.push("pointer:read");
      if (failures.has("pointer:read")) throw new Error(`${sourceSecret}:${targetSecret}:pointer-read`);
      return pointer;
    },
    recreateDatabase: () => attempt("recreate:db", () => identities.set("db", "db-1")),
    waitDatabaseHealthy: () => attempt("database-health"),
    recreateConsumer: ({ service }) => attempt(`recreate:${service}`, () => identities.set(service, `${service}-1`)),
    waitServiceHealthy: ({ service }) => attempt(`health:${service}`),
    verifyRuntimeSecretHygiene: ({ service }) => {
      events.push(`hygiene:${service}`);
      if (failures.has(`hygiene:${service}`)) throw new Error(`${sourceSecret}:${targetSecret}:${service}`);
      if (mutateNonRecreated && service === "studio") identities.set("api-gw", "api-gw-changed");
      return { sourceMatch: true, targetAbsent: true };
    },
    acceptRollbackSource: () => attempt("accept:source"),
    async openMaintenance() {
      events.push("maintenance:open");
      if (openMutatesThenThrows) {
        nginxRunning = true;
        throw new Error(`${sourceSecret}:${targetSecret}:maintenance-open`);
      }
      if (failures.has("maintenance:open")) throw new Error(`${sourceSecret}:${targetSecret}:maintenance-open`);
      nginxRunning = true;
      return true;
    },
    verifyNginxRunning: () => nginxRunning ? attempt("nginx:running") : false,
    closeMaintenance: () => attempt("maintenance:reclose", () => { nginxRunning = false; }),
    verifyNginxStopped: () => nginxRunning === false ? attempt("nginx:stopped:recovery") : false,
    async releaseLock() {
      events.push("lock:release");
      if (releaseThrowsAfterAbsent) {
        lockState = "ABSENT";
        throw new Error(`${sourceSecret}:${targetSecret}:lock-release`);
      }
      if (failures.has("lock:release")) throw new Error(`${sourceSecret}:${targetSecret}:lock-release`);
      lockState = "ABSENT";
      return true;
    },
    async readOperationLockState() {
      events.push("lock:read");
      if (failures.has("lock:read")) throw new Error(`${sourceSecret}:${targetSecret}:lock-read`);
      return lockReadState ?? lockState;
    },
  };
}

async function rollback(options) {
  const runtime = fakeRuntime(options);
  const { source, target } = generations();
  return { runtime, result: await orchestratePostgresPasswordRollback({ source, target, runtime }) };
}

test("rollback model has a dedicated immutable stage sequence", () => {
  assert.deepEqual(POSTGRES_PASSWORD_ROLLBACK_STAGES, [
    "ROLLBACK_PREFLIGHT_TARGET", "ROLLBACK_SUPAVISOR_SOURCE", "ROLLBACK_DATABASE_SOURCE",
    "ROLLBACK_DATABASE_SOURCE_VERIFIED", "ROLLBACK_ENV_SOURCE", "ROLLBACK_ENV_SOURCE_VERIFIED",
    "ROLLBACK_POINTER_SOURCE", "ROLLBACK_DB_RUNTIME_SOURCE", "ROLLBACK_RUNTIME_SOURCE",
    "ROLLBACK_ACCEPTANCE_SOURCE", "ROLLBACK_SOURCE_ACCEPTED", "ROLLBACK_MAINTENANCE_OPEN", "ROLLBACK_COMPLETE",
  ]);
  assert.equal(Object.isFrozen(POSTGRES_PASSWORD_ROLLBACK_STAGES), true);
});

test("generation and byte-exact snapshot relation rejects non-adjacent or non-Postgres changes", () => {
  const valid = generations();
  assert.deepEqual(validatePostgresPasswordRollbackRelationship(valid), { sourceGenerationId, targetGenerationId });
  const cases = [
    generations({ targetMetadata: { reason: "planned-rotation" } }),
    generations({ targetMetadata: { sourceGenerationId: "unrelated" } }),
    generations({ targetSupabaseSnapshot: Buffer.from(`POSTGRES_PASSWORD=${sourcePassword}\nSERVICE_ROLE_KEY=${sourceSecret}\nPOOLER_TENANT_ID=synthetic-tenant\nJWT_SECRET=retained\n`) }),
    generations({ targetSupabaseSnapshot: Buffer.from(`POSTGRES_PASSWORD=${targetPassword}\nSERVICE_ROLE_KEY=changed\nPOOLER_TENANT_ID=synthetic-tenant\nJWT_SECRET=retained\n`) }),
    generations({ targetGodelSnapshot: Buffer.from("SUPABASE_SECRET_KEY=changed\n") }),
  ];
  for (const value of cases) assert.throws(() => validatePostgresPasswordRollbackRelationship(value), /POSTGRES_ROLLBACK_GENERATION_RELATION_INVALID/);
});

test("rollback scope rejects a TARGET that preflight identifies as already accepted", async () => {
  const runtime = fakeRuntime();
  const original = runtime.preflightRollback;
  runtime.preflightRollback = async (...args) => ({ ...(await original(...args)), targetAccepted: true });
  const { source, target } = generations();
  const result = await orchestratePostgresPasswordRollback({ source, target, runtime });
  assert.equal(result.code, "POSTGRES_ROLLBACK_PREFLIGHT_FAILED");
  assert.equal(runtime.events.some((event) => event.startsWith("supavisor:")), false);
});

test("normal rollback follows SOURCE-first secret ordering then exact runtime convergence", async () => {
  const { runtime, result } = await rollback();
  assert.equal(result.state, "ROLLBACK_COMPLETE");
  assert.deepEqual(runtime.events.filter((event) => event.startsWith("recreate:")), POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER.map((service) => `recreate:${service}`));
  assert.equal(runtime.events.indexOf(`supavisor:${sourceGenerationId}`) < runtime.events.indexOf(`database:${sourceGenerationId}`), true);
  assert.equal(runtime.events.indexOf("pointer:source") < runtime.events.indexOf("recreate:db"), true);
  assert.equal(runtime.events.indexOf("accept:source") < runtime.events.indexOf("maintenance:open"), true);
  assert.equal(runtime.events.at(-1), "lock:read");
});

test("pre-pointer failures compensate attempted source mutations back to contained TARGET", async () => {
  const cases = [
    [`supavisor:${sourceGenerationId}`, ["restore-supavisor:target"]],
    [`database:${sourceGenerationId}`, ["restore-database:target", "restore-supavisor:target"]],
    [`database-verify:${sourceGenerationId}`, ["restore-database:target"]],
    [`environment:${sourceGenerationId}`, ["restore-environment:target", "restore-database:target"]],
    [`environment-verify:${sourceGenerationId}`, ["restore-environment:target"]],
  ];
  for (const [failure, expected] of cases) {
    const { runtime, result } = await rollback({ failAt: [failure] });
    assert.equal(result.code, "POSTGRES_ROLLBACK_FAILED_TARGET_RESTORED", failure);
    for (const event of expected) assert.equal(runtime.events.includes(event), true, `${failure}:${event}`);
    assert.equal(runtime.events.some((event) => event.startsWith("recreate:")), false);
    assert.equal(runtime.events.includes("maintenance:open"), false);
    assert.equal(runtime.events.includes("lock:release"), false);
  }
});

test("rollback pointer readback distinguishes TARGET containment, SOURCE commit, and unknown", async () => {
  const target = await rollback({ failAt: ["pointer:source"], pointerAfterFailure: targetGenerationId });
  assert.equal(target.result.code, "POSTGRES_ROLLBACK_FAILED_TARGET_RESTORED");
  assert.equal(target.runtime.events.includes("maintenance:open"), false);
  const source = await rollback({ failAt: ["pointer:source"], pointerAfterFailure: sourceGenerationId });
  assert.equal(source.result.state, "ROLLBACK_COMPLETE");
  const unknown = await rollback({ failAt: ["pointer:source"], pointerAfterFailure: "unknown" });
  assert.equal(unknown.result.code, "POSTGRES_ROLLBACK_SECRET_STATE_UNVERIFIED");
  assert.equal(unknown.runtime.events.includes("restore-environment:target"), false);
});

test("compensation failures retain containment without ingress or lock finalization", async () => {
  for (const failure of ["restore-environment:target", "restore-database:target", "restore-supavisor:target"]) {
    const { runtime, result } = await rollback({ failAt: [`environment:${sourceGenerationId}`, failure] });
    assert.equal(result.code, "POSTGRES_ROLLBACK_PRECOMMIT_COMPENSATION_FAILED", failure);
    assert.equal(runtime.events.includes("maintenance:open"), false);
    assert.equal(runtime.events.includes("lock:release"), false);
  }
});

test("committed SOURCE runtime and acceptance failures are resumable without reverse mutation", async () => {
  const failures = ["recreate:db", "database-health", "hygiene:supavisor", "accept:source"];
  for (const failure of failures) {
    const { runtime, result } = await rollback({ failAt: [failure] });
    assert.equal(result.code, "POSTGRES_ROLLBACK_COMMITTED_RECOVERY_INCOMPLETE", failure);
    assert.equal(runtime.events.includes("restore-environment:target"), false);
    assert.equal(runtime.events.includes("maintenance:open"), false);
    assert.equal(runtime.events.includes("lock:release"), false);
  }
});

test("each consumer and non-recreated identity failure remains committed recovery incomplete", async () => {
  for (const service of POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER.slice(1)) {
    const { result } = await rollback({ failAt: [`recreate:${service}`] });
    assert.equal(result.code, "POSTGRES_ROLLBACK_COMMITTED_RECOVERY_INCOMPLETE", service);
  }
  const identityChanged = await rollback({ mutateNonRecreated: true });
  assert.equal(identityChanged.result.code, "POSTGRES_ROLLBACK_COMMITTED_RECOVERY_INCOMPLETE");
});

test("resume verifies SOURCE first, reconverges all nine services, and never rewrites the pointer", async () => {
  const runtime = fakeRuntime({ initialPointer: sourceGenerationId });
  const { source, target } = generations();
  const result = await resumePostgresPasswordRollback({ source, target, runtime });
  assert.equal(result.state, "ROLLBACK_COMPLETE");
  assert.deepEqual(runtime.events.filter((event) => event.startsWith("recreate:")), POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER.map((service) => `recreate:${service}`));
  assert.equal(runtime.events.includes("pointer:source"), false);
  assert.equal(runtime.events.indexOf(`database-verify:${sourceGenerationId}`) < runtime.events.indexOf("recreate:db"), true);
});

test("a failed resume is independently retryable with full source reconvergence", async () => {
  const { source, target } = generations();
  const firstRuntime = fakeRuntime({ initialPointer: sourceGenerationId, failAt: ["recreate:storage"] });
  const first = await resumePostgresPasswordRollback({ source, target, runtime: firstRuntime });
  assert.equal(first.code, "POSTGRES_ROLLBACK_COMMITTED_RECOVERY_INCOMPLETE");
  assert.equal(firstRuntime.events.includes("maintenance:open"), false);
  const secondRuntime = fakeRuntime({ initialPointer: sourceGenerationId });
  const second = await resumePostgresPasswordRollback({ source, target, runtime: secondRuntime });
  assert.equal(second.state, "ROLLBACK_COMPLETE");
  assert.equal(secondRuntime.events.filter((event) => event.startsWith("recreate:")).length, 9);
});

test("accepted rollback source finalization handles maintenance and lock ambiguity without secret reversal", async () => {
  const openAmbiguous = await rollback({ openMutatesThenThrows: true });
  assert.equal(openAmbiguous.result.code, "POSTGRES_ROLLBACK_SOURCE_ACCEPTED_MAINTENANCE_CLOSED");
  assert.equal(openAmbiguous.runtime.events.includes("maintenance:reclose"), true);
  assert.equal(openAmbiguous.runtime.events.includes("lock:release"), false);
  const verifyFailure = await rollback({ failAt: ["nginx:running"] });
  assert.equal(verifyFailure.result.code, "POSTGRES_ROLLBACK_SOURCE_ACCEPTED_MAINTENANCE_CLOSED");
  const recloseFailure = await rollback({ openMutatesThenThrows: true, failAt: ["maintenance:reclose"] });
  assert.equal(recloseFailure.result.code, "POSTGRES_ROLLBACK_MAINTENANCE_STATE_UNVERIFIED");
  assert.equal(recloseFailure.runtime.events.includes("lock:release"), false);
  const retained = await rollback({ failAt: ["lock:release"] });
  assert.equal(retained.result.code, "POSTGRES_ROLLBACK_SOURCE_ACCEPTED_LOCK_RETAINED");
  const unknown = await rollback({ lockReadState: "UNKNOWN" });
  assert.equal(unknown.result.code, "POSTGRES_ROLLBACK_LOCK_STATE_UNVERIFIED");
  const releasedAfterThrow = await rollback({ releaseThrowsAfterAbsent: true });
  assert.equal(releasedAfterThrow.result.state, "ROLLBACK_COMPLETE");
});

test("rollback results never disclose synthetic source or target secrets", async () => {
  const { source, target } = generations();
  const outcomes = [
    await orchestratePostgresPasswordRollback({ source, target, runtime: fakeRuntime({ failAt: [`environment:${sourceGenerationId}`, "restore-environment:target"] }) }),
    await orchestratePostgresPasswordRollback({ source, target, runtime: fakeRuntime({ failAt: ["pointer:source"], pointerAfterFailure: "unknown" }) }),
    await orchestratePostgresPasswordRollback({ source, target, runtime: fakeRuntime({ failAt: ["recreate:db"] }) }),
    await resumePostgresPasswordRollback({ source, target, runtime: fakeRuntime({ initialPointer: sourceGenerationId, failAt: ["recreate:db"] }) }),
    await orchestratePostgresPasswordRollback({ source, target, runtime: fakeRuntime({ openMutatesThenThrows: true }) }),
  ];
  for (const result of outcomes) {
    const rendered = `${JSON.stringify(result)}${result}`;
    assert.equal(rendered.includes(sourceSecret), false);
    assert.equal(rendered.includes(targetSecret), false);
  }
});

test("rollback core has no direct process, Docker, SQL, or curl execution", async () => {
  const source = await readFile(resolve(import.meta.dirname, "postgres-password-rollback.mjs"), "utf8");
  assert.doesNotMatch(source, /node:child_process|\bdocker\b|\bpsql\b|\bcurl\b|\bspawn\b/i);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
});
