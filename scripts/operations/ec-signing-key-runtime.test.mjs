import assert from "node:assert/strict";
import test from "node:test";
import {
  EC_RUNTIME_STAGES,
  GODEL_RUNTIME_SERVICES,
  MANAGED_SUPABASE_SERVICES,
  convergeEcSigningKeyRuntime,
  createDockerRuntime,
  ecRuntimeTransitionPlan,
} from "./ec-signing-key-runtime.mjs";

const allIdentities = [...MANAGED_SUPABASE_SERVICES, ...GODEL_RUNTIME_SERVICES.map(([service]) => service)];

function values(stage) {
  return new Map([
    ["JWT_KEYS", `keys-${stage}`],
    ["JWT_JWKS", `jwks-${stage}`],
    ["ANON_KEY_ASYMMETRIC", `anon-${stage}`],
    ["SERVICE_ROLE_KEY_ASYMMETRIC", `service-${stage}`],
  ]);
}

const stageValues = new Map(EC_RUNTIME_STAGES.map((stage) => [stage, values(stage)]));

function fake({ start = "GEN5", fail, unexpectedIdentity, recoverySecretFailure = false } = {}) {
  let stage = start;
  const events = [];
  const ids = new Map(allIdentities.map((service) => [service, `${service}-initial`]));
  const api = {
    async status() {
      events.push(`status:${stage}`);
      return { stage };
    },
    async activate({ toStage }) {
      events.push(`activate:${toStage}`);
      if (recoverySecretFailure && stage !== start) throw new Error("EC_SIGNING_ROTATION_COMMITTED_UNVERIFIED");
      stage = toStage;
    },
    async rollback({ toStage }) {
      events.push(`rollback:${toStage}`);
      if (recoverySecretFailure && stage !== start) throw new Error("EC_SIGNING_ROTATION_COMMITTED_UNVERIFIED");
      stage = toStage;
    },
  };
  const runtime = {
    async captureIdentities() {
      events.push("baseline");
      return new Map(ids);
    },
    async recreate(service) {
      events.push(`recreate:${service}`);
      ids.set(service, `${service}-recreated-${events.length}`);
    },
    async waitHealthy(service) {
      events.push(`healthy:${service}`);
      if (fail === `healthy:${service}:${stage}`) throw new Error(`EC_RUNTIME_CONVERGENCE_TIMEOUT_${service}`);
    },
    async readEnv(service, variable) {
      events.push(`env:${service}:${variable}`);
      if (fail === `env:${service}`) return "incorrect";
      const snapshotVariable = variable === "GOTRUE_JWT_KEYS"
        ? "JWT_KEYS"
        : ["PGRST_JWT_SECRET", "API_JWT_JWKS", "SUPABASE_JWKS"].includes(variable)
          ? "JWT_JWKS"
          : variable;
      return values(stage).get(snapshotVariable);
    },
    async assertIdentities(before, expected) {
      events.push("identities");
      if (unexpectedIdentity) ids.set(unexpectedIdentity, `${unexpectedIdentity}-unexpected`);
      for (const [service, beforeId] of before) {
        const changed = ids.get(service) !== beforeId;
        if (changed !== expected.includes(service)) throw new Error("EC_RUNTIME_UNEXPECTED_IDENTITY_CHANGE");
      }
    },
  };
  return { api, runtime, events, stage: () => stage };
}

async function converge(f, options) {
  return convergeEcSigningKeyRuntime({
    planId: "plan",
    apply: true,
    value: {},
    stageValues,
    api: f.api,
    runtime: f.runtime,
    ...options,
  });
}

test("canonical sequence permits only adjacent transitions with correct direction", () => {
  assert.equal(ecRuntimeTransitionPlan("GEN5", "GEN6").direction, "ACTIVATE");
  assert.equal(ecRuntimeTransitionPlan("GEN6", "GEN5").direction, "ROLLBACK");
  assert.throws(() => ecRuntimeTransitionPlan("GEN4", "GEN6"), /UNSAFE_EC_RUNTIME_TRANSITION/);
  assert.throws(() => ecRuntimeTransitionPlan("GEN5", "GEN5"), /UNSAFE_EC_RUNTIME_TRANSITION/);
});

test("operation mismatch is rejected for dry-run and apply before mutation", async () => {
  const f = fake();
  for (const apply of [false, true]) {
    await assert.rejects(
      () => convergeEcSigningKeyRuntime({
        operation: "rollback", planId: "plan", toStage: "GEN6", apply, value: {}, stageValues, api: f.api, runtime: f.runtime,
      }),
      /EC_RUNTIME_OPERATION_DIRECTION_MISMATCH/,
    );
  }
  assert.deepEqual(f.events, ["status:GEN5", "status:GEN5"]);
});

test("a testing fromStage override must match authoritative status", async () => {
  const f = fake();
  await assert.rejects(
    () => convergeEcSigningKeyRuntime({
      operation: "activate", planId: "plan", toStage: "GEN6", apply: false,
      value: {}, stageValues, api: f.api, runtime: f.runtime, fromStage: "GEN4",
    }),
    /EC_RUNTIME_FROM_STAGE_MISMATCH/,
  );
  assert.deepEqual(f.events, ["status:GEN5"]);
});

test("GEN5 to GEN6 success captures baseline before mutation and revalidates target", async () => {
  const f = fake();
  const result = await converge(f, { operation: "activate", toStage: "GEN6" });
  assert.equal(result.state, "COMPLETE");
  assert.deepEqual(f.events, [
    "status:GEN5", "baseline", "activate:GEN6", "status:GEN6",
    "recreate:api-gw", "healthy:api-gw", "env:api-gw:ANON_KEY_ASYMMETRIC", "env:api-gw:SERVICE_ROLE_KEY_ASYMMETRIC",
    "recreate:auth", "healthy:auth", "env:auth:GOTRUE_JWT_KEYS", "identities", "status:GEN6",
  ]);
});

test("api-gw failure recovers GEN5 without GEN6 auth recreation", async () => {
  const f = fake({ fail: "healthy:api-gw:GEN6" });
  const result = await converge(f, { operation: "activate", toStage: "GEN6" });
  assert.equal(result.state, "RUNTIME_CONVERGENCE_FAILED_ROLLBACK_SUCCEEDED");
  assert.deepEqual(f.events.filter((event) => event.startsWith("recreate:")), ["recreate:api-gw", "recreate:api-gw", "recreate:auth"]);
  assert.equal(f.stage(), "GEN5");
});

test("auth failure recovers both GEN5 consumers", async () => {
  const f = fake({ fail: "healthy:auth:GEN6" });
  const result = await converge(f, { operation: "activate", toStage: "GEN6" });
  assert.equal(result.state, "RUNTIME_CONVERGENCE_FAILED_ROLLBACK_SUCCEEDED");
  assert.deepEqual(f.events.filter((event) => event.startsWith("recreate:")), ["recreate:api-gw", "recreate:auth", "recreate:api-gw", "recreate:auth"]);
});

test("explicit GEN6 to GEN5 rollback converges GEN5", async () => {
  const f = fake({ start: "GEN6" });
  const result = await converge(f, { operation: "rollback", toStage: "GEN5" });
  assert.equal(result.state, "COMPLETE");
  assert.ok(f.events.includes("rollback:GEN5"));
  assert.equal(f.stage(), "GEN5");
});

test("failed rollback restores GEN6 with activate, not rollback", async () => {
  const f = fake({ start: "GEN6", fail: "healthy:api-gw:GEN5" });
  const result = await converge(f, { operation: "rollback", toStage: "GEN5" });
  assert.equal(result.state, "RUNTIME_CONVERGENCE_FAILED_ROLLBACK_SUCCEEDED");
  assert.equal(result.inverseOperation, "activate");
  assert.ok(f.events.includes("activate:GEN6"));
  assert.equal(f.events.filter((event) => event === "rollback:GEN5").length, 1);
  assert.equal(f.stage(), "GEN6");
});

test("GEN6 to GEN7 recovery restores GEN6 source values", async () => {
  const f = fake({ start: "GEN6", fail: "healthy:rest:GEN7" });
  const result = await converge(f, { operation: "activate", toStage: "GEN7" });
  assert.equal(result.state, "RUNTIME_CONVERGENCE_FAILED_ROLLBACK_SUCCEEDED");
  assert.ok(f.events.includes("rollback:GEN6"));
  assert.equal(f.stage(), "GEN6");
});

test("fail-closed recovery stops without Docker reconvergence", async () => {
  const f = fake({ fail: "healthy:api-gw:GEN6", recoverySecretFailure: true });
  await assert.rejects(() => converge(f, { operation: "activate", toStage: "GEN6" }), /EC_RUNTIME_SECRET_STATE_UNVERIFIED/);
  const recoveryAt = f.events.indexOf("rollback:GEN5");
  assert.equal(f.events.slice(recoveryAt + 1).some((event) => event.startsWith("recreate:")), false);
});

test("identity tracking is complete and catches db, meta, and imgproxy changes", async () => {
  assert.deepEqual(MANAGED_SUPABASE_SERVICES, ["studio", "api-gw", "auth", "rest", "realtime", "storage", "imgproxy", "meta", "functions", "db", "supavisor"]);
  for (const service of ["db", "meta", "imgproxy"]) {
    const f = fake({ unexpectedIdentity: service });
    await assert.rejects(() => converge(f, { operation: "activate", toStage: "GEN6" }), /EC_RUNTIME_CONVERGENCE_ROLLBACK_FAILED/);
  }
});

test("real polling accepts only running healthy and is bounded without sleeping", async () => {
  let time = 0;
  const states = ["starting|none", "running|unhealthy", "running|healthy"];
  const run = async (_file, args) => {
    if (args.includes("ps")) return { stdout: "consumer-id\n" };
    if (args[0] === "inspect") return { stdout: `${states.shift() ?? "running|healthy"}\n` };
    throw new Error(`unexpected docker invocation: ${args.join(" ")}`);
  };
  const runtime = createDockerRuntime({ now: () => time, sleep: async () => { time += 10; }, timeoutMs: 100, pollIntervalMs: 10, run });
  await runtime.waitHealthy("api-gw");
  assert.equal(time, 20);

  const neverHealthy = createDockerRuntime({
    now: () => time,
    sleep: async () => { time += 10; },
    timeoutMs: 20,
    pollIntervalMs: 10,
    run: async (_file, args) => args.includes("ps") ? { stdout: "consumer-id\n" } : { stdout: "running|none\n" },
  });
  await assert.rejects(() => neverHealthy.waitHealthy("api-gw"), /EC_RUNTIME_CONVERGENCE_TIMEOUT_api-gw/);
});

test("docker runtime retains direct shell-free docker execution", () => {
  const source = createDockerRuntime.toString();
  assert.match(source, /run\("docker"/);
  assert.match(source, /shell: false/);
  assert.doesNotMatch(source, /npm|npx|shell:\s*true/);
});
