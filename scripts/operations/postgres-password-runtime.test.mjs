import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  DB_RUNTIME_RECREATE_POLICY,
  POSTGRES_PASSWORD_NON_RECREATED_SERVICES,
  POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER,
  orchestratePostgresPasswordCutover,
} from "./postgres-password-runtime.mjs";

const sourceGenerationId = "postgres-source-generation";
const targetGenerationId = "postgres-target-generation";
const sourceSecret = "SYNTHETIC_POSTGRES_SOURCE_SECRET_DO_NOT_PRINT";
const targetSecret = "SYNTHETIC_POSTGRES_TARGET_SECRET_DO_NOT_PRINT";

function references() {
  return {
    source: Object.freeze({ generationId: sourceGenerationId, protectedSnapshotReference: sourceSecret }),
    target: Object.freeze({ generationId: targetGenerationId, protectedSnapshotReference: targetSecret }),
  };
}

function fakeRuntime({
  failAt = [],
  pointerAfterPointerFailure = sourceGenerationId,
  preflight = {},
  mutateNonRecreated = false,
  openMutatesThenThrows = false,
  releaseThrowsAfterAbsent = false,
  lockReadState = null,
} = {}) {
  const failures = new Set(failAt);
  const events = [];
  const identities = new Map([
    ...POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER,
    ...POSTGRES_PASSWORD_NON_RECREATED_SERVICES,
  ].map((service) => [service, `${service}-identity-0`]));
  let pointer = sourceGenerationId;
  let nginxRunning = true;
  let operationLockState = "PRESENT";
  let maintenanceCloseCount = 0;
  const attempt = async (name, update = null) => {
    events.push(name);
    if (failures.has(name)) throw new Error(`${sourceSecret}:${targetSecret}:${name}`);
    update?.();
    return true;
  };
  const runtime = {
    events,
    async preflight() {
      await attempt("preflight");
      return {
        repositoryClean: true,
        currentGenerationId: sourceGenerationId,
        liveEnvironmentGenerationId: sourceGenerationId,
        lockAcquired: true,
        ecGeneration7Preserved: true,
        supabaseHealthy: true,
        godelHealthy: true,
        nginxRunning: true,
        ingressTopology: {
          godelNginxPublicIngress: true,
          apiGatewayHostPorts: [],
          supavisorHostPorts: [],
        },
        ...preflight,
      };
    },
    async getServiceIdentity({ service }) {
      events.push(`identity:${service}`);
      return identities.get(service);
    },
    closeMaintenance: () => {
      const name = maintenanceCloseCount++ === 0 ? "closeMaintenance" : "closeMaintenance:recovery";
      return attempt(name, () => { nginxRunning = false; });
    },
    verifyNginxStopped: () => nginxRunning === false
      ? attempt(maintenanceCloseCount > 1 ? "verifyNginxStopped:recovery" : "verifyNginxStopped")
      : false,
    updateSupavisorManager: () => attempt("updateSupavisorManager"),
    rotateDatabaseRoles: () => attempt("rotateDatabaseRoles"),
    verifyDatabaseAuthentication: ({ generationId }) => attempt(`verifyDatabaseAuthentication:${generationId}`),
    writeEnvironment: () => attempt("writeEnvironment"),
    verifyLiveEnvironment: ({ generationId }) => attempt(`verifyLiveEnvironment:${generationId}`),
    async replacePointer() {
      events.push("replacePointer");
      if (failures.has("replacePointer")) {
        pointer = pointerAfterPointerFailure;
        throw new Error(`${sourceSecret}:${targetSecret}:replacePointer`);
      }
      pointer = targetGenerationId;
      return true;
    },
    async readCurrentPointer() {
      events.push("readCurrentPointer");
      if (failures.has("readCurrentPointer")) throw new Error(`${sourceSecret}:${targetSecret}:readCurrentPointer`);
      return pointer;
    },
    recreateDatabase: () => attempt("recreate:db", () => { identities.set("db", "db-identity-1"); }),
    waitDatabaseHealthy: () => attempt("waitDatabaseHealthy"),
    recreateConsumer: ({ service }) => attempt(`recreate:${service}`, () => { identities.set(service, `${service}-identity-1`); }),
    waitServiceHealthy: ({ service }) => attempt(`waitServiceHealthy:${service}`),
    verifyRuntimeSecretHygiene: ({ service }) => {
      events.push(`verifyRuntimeSecretHygiene:${service}`);
      if (failures.has(`verifyRuntimeSecretHygiene:${service}`)) throw new Error(`${sourceSecret}:${targetSecret}:${service}`);
      if (mutateNonRecreated && service === "studio") identities.set("api-gw", "api-gw-identity-mutated");
      return { targetMatch: true, oldAbsent: true };
    },
    acceptTarget: () => attempt("acceptTarget"),
    async openMaintenance() {
      events.push("openMaintenance");
      if (openMutatesThenThrows) {
        nginxRunning = true;
        throw new Error(`${sourceSecret}:${targetSecret}:openMaintenance`);
      }
      if (failures.has("openMaintenance")) throw new Error(`${sourceSecret}:${targetSecret}:openMaintenance`);
      nginxRunning = true;
      return true;
    },
    verifyNginxRunning: () => nginxRunning === true ? attempt("verifyNginxRunning") : false,
    async releaseLock() {
      events.push("releaseLock");
      if (releaseThrowsAfterAbsent) {
        operationLockState = "ABSENT";
        throw new Error(`${sourceSecret}:${targetSecret}:releaseLock`);
      }
      if (failures.has("releaseLock")) throw new Error(`${sourceSecret}:${targetSecret}:releaseLock`);
      operationLockState = "ABSENT";
      return true;
    },
    async readOperationLockState() {
      events.push("readOperationLockState");
      if (failures.has("readOperationLockState")) throw new Error(`${sourceSecret}:${targetSecret}:readOperationLockState`);
      return lockReadState ?? operationLockState;
    },
    restoreEnvironment: () => attempt("restoreEnvironment"),
    restoreDatabaseRoles: () => attempt("restoreDatabaseRoles"),
    restoreSupavisorManager: () => attempt("restoreSupavisorManager"),
    verifySupavisorManager: () => attempt("verifySupavisorManager"),
    verifySourceRuntimeHealth: () => attempt("verifySourceRuntimeHealth"),
  };
  return runtime;
}

async function cutover(options) {
  const { source, target } = references();
  const runtime = fakeRuntime(options);
  return { runtime, result: await orchestratePostgresPasswordCutover({ source, target, runtime }) };
}

test("runtime policy and recreation sets are frozen to the D.5 contract", () => {
  assert.equal(DB_RUNTIME_RECREATE_POLICY, "RECREATE_REQUIRED_POST_POINTER");
  assert.deepEqual(POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER, [
    "db", "supavisor", "meta", "auth", "rest", "realtime", "storage", "functions", "studio",
  ]);
  assert.deepEqual(POSTGRES_PASSWORD_NON_RECREATED_SERVICES, ["api-gw", "imgproxy", "godel-app", "godel-nginx"]);
  assert.equal(Object.isFrozen(POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER), true);
});

test("successful cutover commits before the exact target runtime order and reopens only after acceptance", async () => {
  const { runtime, result } = await cutover();
  assert.deepEqual(result, {
    state: "COMPLETE",
    sourceGenerationId,
    targetGenerationId,
    stage: "COMPLETE",
    services: POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER,
  });
  assert.deepEqual(runtime.events.filter((event) => event.startsWith("recreate:")), [
    "recreate:db", "recreate:supavisor", "recreate:meta", "recreate:auth", "recreate:rest",
    "recreate:realtime", "recreate:storage", "recreate:functions", "recreate:studio",
  ]);
  assert.equal(runtime.events.indexOf("replacePointer") < runtime.events.indexOf("recreate:db"), true);
  assert.equal(runtime.events.indexOf("acceptTarget") < runtime.events.indexOf("openMaintenance"), true);
  assert.equal(runtime.events.at(-1), "readOperationLockState");
});

test("preflight fails closed before maintenance when ingress topology is not independently verified", async () => {
  const { runtime, result } = await cutover({ preflight: { ingressTopology: { godelNginxPublicIngress: true, apiGatewayHostPorts: ["443"], supavisorHostPorts: [] } } });
  assert.equal(result.code, "POSTGRES_ROTATION_INGRESS_TOPOLOGY_UNVERIFIED");
  assert.equal(runtime.events.includes("closeMaintenance"), false);
  assert.equal(runtime.events.includes("updateSupavisorManager"), false);
});

test("maintenance close requires independent nginx stopped verification and retains the lock on uncertainty", async () => {
  const { runtime, result } = await cutover({ failAt: ["closeMaintenance"] });
  assert.equal(result.code, "POSTGRES_ROTATION_MAINTENANCE_STATE_UNVERIFIED");
  assert.equal(runtime.events.includes("openMaintenance"), false);
  assert.equal(runtime.events.includes("releaseLock"), false);
  assert.equal(runtime.events.includes("updateSupavisorManager"), false);
});

test("pre-pointer failures compensate only attempted target components in deterministic source order", async () => {
  const cases = [
    ["updateSupavisorManager", ["restoreSupavisorManager", "verifySupavisorManager"]],
    ["rotateDatabaseRoles", ["restoreDatabaseRoles", `verifyDatabaseAuthentication:${sourceGenerationId}`, "restoreSupavisorManager"]],
    [`verifyDatabaseAuthentication:${targetGenerationId}`, ["restoreDatabaseRoles", `verifyDatabaseAuthentication:${sourceGenerationId}`, "restoreSupavisorManager"]],
    ["writeEnvironment", ["restoreEnvironment", "restoreDatabaseRoles", "restoreSupavisorManager"]],
    [`verifyLiveEnvironment:${targetGenerationId}`, ["restoreEnvironment", "restoreDatabaseRoles", "restoreSupavisorManager"]],
  ];
  for (const [failure, requiredEvents] of cases) {
    const { runtime, result } = await cutover({ failAt: [failure] });
    assert.equal(result.code, "POSTGRES_ROTATION_FAILED_SOURCE_RESTORED", failure);
    for (const event of requiredEvents) assert.equal(runtime.events.includes(event), true, `${failure}:${event}`);
    assert.equal(runtime.events.includes("openMaintenance"), true, failure);
    assert.equal(runtime.events.includes("releaseLock"), true, failure);
  }
});

test("pointer readback distinguishes confirmed source, confirmed target, and unknown state", async () => {
  const source = await cutover({ failAt: ["replacePointer"], pointerAfterPointerFailure: sourceGenerationId });
  assert.equal(source.result.code, "POSTGRES_ROTATION_FAILED_SOURCE_RESTORED");
  assert.equal(source.runtime.events.includes("restoreEnvironment"), true);

  const target = await cutover({ failAt: ["replacePointer"], pointerAfterPointerFailure: targetGenerationId });
  assert.equal(target.result.code, "POSTGRES_ROTATION_COMMITTED_REQUIRES_TRACKED_ROLLBACK");
  assert.equal(target.runtime.events.includes("restoreEnvironment"), false);
  assert.equal(target.runtime.events.includes("releaseLock"), false);

  const unknown = await cutover({ failAt: ["replacePointer"], pointerAfterPointerFailure: "unexpected-generation" });
  assert.equal(unknown.result.code, "POSTGRES_ROTATION_SECRET_STATE_UNVERIFIED");
  assert.equal(unknown.runtime.events.includes("openMaintenance"), false);
  assert.equal(unknown.runtime.events.includes("releaseLock"), false);
});

test("pre-commit compensation failure retains maintenance closure and the operation lock", async () => {
  const { runtime, result } = await cutover({ failAt: ["writeEnvironment", "restoreEnvironment"] });
  assert.equal(result.code, "POSTGRES_ROTATION_PRECOMMIT_COMPENSATION_FAILED");
  assert.equal(runtime.events.includes("openMaintenance"), false);
  assert.equal(runtime.events.includes("verifyNginxRunning"), false);
  assert.equal(runtime.events.includes("releaseLock"), false);
});

test("true source restoration failures remain pre-commit failures before the SOURCE_RESTORED boundary", async () => {
  for (const failure of [
    "restoreDatabaseRoles",
    `verifyDatabaseAuthentication:${sourceGenerationId}`,
    "restoreSupavisorManager",
  ]) {
    const { runtime, result } = await cutover({ failAt: ["writeEnvironment", failure] });
    assert.equal(result.code, "POSTGRES_ROTATION_PRECOMMIT_COMPENSATION_FAILED", failure);
    assert.equal(runtime.events.includes("openMaintenance"), false, failure);
    assert.equal(runtime.events.includes("releaseLock"), false, failure);
  }
});

test("restored sources recapture a known closed maintenance state after ambiguous reopening", async () => {
  for (const options of [
    { openMutatesThenThrows: true },
    { failAt: ["verifyNginxRunning"] },
  ]) {
    const { runtime, result } = await cutover({ ...options, failAt: ["writeEnvironment", ...(options.failAt ?? [])] });
    assert.equal(result.code, "POSTGRES_ROTATION_SOURCE_RESTORED_MAINTENANCE_CLOSED");
    assert.equal(result.stage, "SOURCE_RESTORED");
    assert.equal(runtime.events.includes("closeMaintenance:recovery"), true);
    assert.equal(runtime.events.includes("verifyNginxStopped:recovery"), true);
    assert.equal(runtime.events.includes("releaseLock"), false);
    const restoredAt = runtime.events.indexOf("verifySourceRuntimeHealth");
    assert.equal(runtime.events.slice(restoredAt + 1).some((event) => /^(restoreEnvironment|restoreDatabaseRoles|restoreSupavisorManager)$/.test(event)), false);
  }
});

test("restored sources report ingress state unverified when safe recapture fails", async () => {
  const { runtime, result } = await cutover({
    failAt: ["writeEnvironment", "verifyNginxRunning", "closeMaintenance:recovery"],
  });
  assert.equal(result.code, "POSTGRES_ROTATION_MAINTENANCE_STATE_UNVERIFIED");
  assert.equal(result.stage, "SOURCE_RESTORED");
  assert.equal(runtime.events.includes("releaseLock"), false);
  assert.equal(runtime.events.includes("restoreDatabaseRoles"), true);
  assert.equal(runtime.events.includes("restoreSupavisorManager"), true);
});

test("accepted targets recapture a known closed maintenance state after ambiguous opening", async () => {
  for (const options of [
    { openMutatesThenThrows: true },
    { failAt: ["verifyNginxRunning"] },
  ]) {
    const { runtime, result } = await cutover(options);
    assert.equal(result.code, "POSTGRES_ROTATION_TARGET_ACCEPTED_MAINTENANCE_CLOSED");
    assert.equal(result.stage, "TARGET_ACCEPTED");
    assert.equal(runtime.events.includes("closeMaintenance:recovery"), true);
    assert.equal(runtime.events.includes("verifyNginxStopped:recovery"), true);
    assert.equal(runtime.events.includes("restoreEnvironment"), false);
    assert.equal(runtime.events.includes("restoreDatabaseRoles"), false);
    assert.equal(runtime.events.includes("restoreSupavisorManager"), false);
    assert.equal(runtime.events.includes("releaseLock"), false);
  }
});

test("accepted targets fail closed without secret rollback when maintenance cannot be recaptured", async () => {
  const { runtime, result } = await cutover({
    failAt: ["verifyNginxRunning", "closeMaintenance:recovery"],
  });
  assert.equal(result.code, "POSTGRES_ROTATION_MAINTENANCE_STATE_UNVERIFIED");
  assert.equal(runtime.events.includes("restoreEnvironment"), false);
  assert.equal(runtime.events.includes("restoreDatabaseRoles"), false);
  assert.equal(runtime.events.includes("restoreSupavisorManager"), false);
  assert.equal(runtime.events.includes("releaseLock"), false);
});

test("target finalization relies on lock readback rather than release return status", async () => {
  const releasedAfterThrow = await cutover({ releaseThrowsAfterAbsent: true });
  assert.equal(releasedAfterThrow.result.state, "COMPLETE");
  assert.equal(releasedAfterThrow.runtime.events.includes("readOperationLockState"), true);

  const retained = await cutover({ failAt: ["releaseLock"] });
  assert.equal(retained.result.code, "POSTGRES_ROTATION_TARGET_ACCEPTED_LOCK_RETAINED");
  assert.equal(retained.runtime.events.includes("closeMaintenance:recovery"), false);
  assert.equal(retained.runtime.events.includes("restoreEnvironment"), false);

  const unknown = await cutover({ lockReadState: "UNKNOWN" });
  assert.equal(unknown.result.code, "POSTGRES_ROTATION_LOCK_STATE_UNVERIFIED");
  assert.equal(unknown.result.state, "TARGET_ACCEPTED_LOCK_STATE_UNVERIFIED");
  assert.equal(unknown.runtime.events.includes("restoreDatabaseRoles"), false);
});

test("source compensation uses the same lock readback outcomes after restoration", async () => {
  const sourceFailure = { failAt: ["writeEnvironment"] };
  const releasedAfterThrow = await cutover({ ...sourceFailure, releaseThrowsAfterAbsent: true });
  assert.equal(releasedAfterThrow.result.code, "POSTGRES_ROTATION_FAILED_SOURCE_RESTORED");

  const retained = await cutover({ ...sourceFailure, failAt: ["writeEnvironment", "releaseLock"] });
  assert.equal(retained.result.code, "POSTGRES_ROTATION_SOURCE_RESTORED_LOCK_RETAINED");

  const unknown = await cutover({ ...sourceFailure, lockReadState: "UNKNOWN" });
  assert.equal(unknown.result.code, "POSTGRES_ROTATION_LOCK_STATE_UNVERIFIED");
  assert.equal(unknown.result.state, "LOCK_STATE_UNVERIFIED");
});

test("post-pointer failures require tracked rollback and never invoke pre-pointer compensation", async () => {
  const failures = [
    "recreate:db",
    "waitDatabaseHealthy",
    "verifyRuntimeSecretHygiene:supavisor",
    "acceptTarget",
  ];
  for (const failure of failures) {
    const { runtime, result } = await cutover({ failAt: [failure] });
    assert.equal(result.code, "POSTGRES_ROTATION_COMMITTED_REQUIRES_TRACKED_ROLLBACK", failure);
    assert.equal(runtime.events.includes("restoreEnvironment"), false, failure);
    assert.equal(runtime.events.includes("restoreDatabaseRoles"), false, failure);
    assert.equal(runtime.events.includes("restoreSupavisorManager"), false, failure);
    assert.equal(runtime.events.includes("releaseLock"), false, failure);
  }
});

test("each D.5 consumer recreation failure is isolated after DB and before later consumers", async () => {
  for (const service of POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER.slice(1)) {
    const { runtime, result } = await cutover({ failAt: [`recreate:${service}`] });
    assert.equal(result.code, "POSTGRES_ROTATION_COMMITTED_REQUIRES_TRACKED_ROLLBACK", service);
    const recreations = runtime.events.filter((event) => event.startsWith("recreate:"));
    assert.deepEqual(recreations, POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER
      .slice(0, POSTGRES_PASSWORD_RUNTIME_RECREATE_ORDER.indexOf(service) + 1)
      .map((name) => `recreate:${name}`));
  }
});

test("non-recreated identity changes fail after target convergence", async () => {
  const { runtime, result } = await cutover({ mutateNonRecreated: true });
  assert.equal(result.code, "POSTGRES_ROTATION_COMMITTED_REQUIRES_TRACKED_ROLLBACK");
  assert.equal(runtime.events.includes("recreate:api-gw"), false);
  assert.equal(runtime.events.includes("recreate:imgproxy"), false);
  assert.equal(runtime.events.includes("recreate:godel-app"), false);
  assert.equal(runtime.events.includes("recreate:godel-nginx"), false);
});

test("results and caught adapter failures never disclose synthetic secret references", async () => {
  const outcomes = [
    await cutover({ failAt: ["writeEnvironment"] }),
    await cutover({ failAt: ["recreate:db"] }),
    await cutover({ failAt: ["replacePointer"], pointerAfterPointerFailure: "unexpected-generation" }),
    await cutover({ openMutatesThenThrows: true }),
    await cutover({ failAt: ["releaseLock"] }),
    await cutover({ failAt: ["writeEnvironment", "releaseLock"] }),
    await cutover({ failAt: ["writeEnvironment"], openMutatesThenThrows: true }),
    await cutover({ failAt: ["writeEnvironment", "verifyNginxRunning", "closeMaintenance:recovery"] }),
  ];
  for (const { result } of outcomes) {
    const rendered = `${JSON.stringify(result)}${result}`;
    assert.equal(rendered.includes(sourceSecret), false);
    assert.equal(rendered.includes(targetSecret), false);
  }
});

test("runtime orchestrator has no direct process or Docker execution path", async () => {
  const source = await readFile(resolve(import.meta.dirname, "postgres-password-runtime.mjs"), "utf8");
  assert.doesNotMatch(source, /node:child_process|\bspawn\b|\bdocker\b/i);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
});
