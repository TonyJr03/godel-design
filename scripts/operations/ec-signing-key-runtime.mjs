import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  createSupabaseConsumerRecreateInvocation,
  createSupabaseRuntimeComposeInvocation,
} from "./supabase-runtime-compose.mjs";
import {
  activateEcSigningKeyRotation,
  ecSigningKeyRotationStatus,
  rollbackEcSigningKeyRotation,
} from "./ec-signing-key-rotation-plan.mjs";

const execFileAsync = promisify(execFile);

export const EC_RUNTIME_STAGES = Object.freeze(["GEN4", "GEN5", "GEN6", "GEN7"]);
export const MANAGED_SUPABASE_SERVICES = Object.freeze([
  "studio", "api-gw", "auth", "rest", "realtime", "storage", "imgproxy", "meta",
  "functions", "db", "supavisor",
]);
export const GODEL_RUNTIME_SERVICES = Object.freeze([
  ["godel-app", "godel-runtime-app-1"],
  ["godel-nginx", "godel-runtime-nginx-1"],
]);

const MATRIX = Object.freeze({
  "GEN4:GEN5": ["rest", "realtime", "storage", "functions", "auth"],
  "GEN5:GEN4": ["rest", "realtime", "storage", "functions", "auth"],
  "GEN5:GEN6": ["api-gw", "auth"],
  "GEN6:GEN5": ["api-gw", "auth"],
  "GEN6:GEN7": ["rest", "realtime", "storage", "functions", "auth"],
  "GEN7:GEN6": ["rest", "realtime", "storage", "functions", "auth"],
});
const ENV = Object.freeze({
  auth: [["GOTRUE_JWT_KEYS", "JWT_KEYS"]],
  rest: [["PGRST_JWT_SECRET", "JWT_JWKS"]],
  realtime: [["API_JWT_JWKS", "JWT_JWKS"]],
  storage: [["JWT_JWKS", "JWT_JWKS"]],
  functions: [["SUPABASE_JWKS", "JWT_JWKS"]],
  "api-gw": [
    ["ANON_KEY_ASYMMETRIC", "ANON_KEY_ASYMMETRIC"],
    ["SERVICE_ROLE_KEY_ASYMMETRIC", "SERVICE_ROLE_KEY_ASYMMETRIC"],
  ],
});
const FAIL_CLOSED = /EC_SIGNING_ROTATION_COMMITTED_UNVERIFIED|EC_SIGNING_ROTATION_COMPENSATION_FAILED|GENERATION_MUTATION_IN_PROGRESS/;
const statusApi = {
  activate: activateEcSigningKeyRotation,
  rollback: rollbackEcSigningKeyRotation,
  status: ecSigningKeyRotationStatus,
};

function isFailClosed(error) {
  return FAIL_CLOSED.test(error?.message ?? "");
}

function operationFor(direction) {
  return direction === "ACTIVATE" ? "activate" : "rollback";
}

function assertStageValues(stageValues, stage) {
  const values = stageValues?.get(stage);
  if (!(values instanceof Map)) throw new Error("EC_RUNTIME_STAGE_VALUES_MISSING");
  return values;
}

export function ecRuntimeTransitionPlan(fromStage, toStage) {
  const sourceIndex = EC_RUNTIME_STAGES.indexOf(fromStage);
  const targetIndex = EC_RUNTIME_STAGES.indexOf(toStage);
  const delta = targetIndex - sourceIndex;
  if ((delta !== 1 && delta !== -1) || !MATRIX[`${fromStage}:${toStage}`]) {
    throw new Error("UNSAFE_EC_RUNTIME_TRANSITION");
  }

  return {
    fromStage,
    toStage,
    direction: delta === 1 ? "ACTIVATE" : "ROLLBACK",
    services: [...MATRIX[`${fromStage}:${toStage}`]],
  };
}

export function createDockerRuntime({
  cwd = process.cwd(),
  now = Date.now,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeoutMs = 90_000,
  pollIntervalMs = 1_000,
  run = execFileAsync,
} = {}) {
  async function docker(args, options = {}) {
    return run("docker", args, {
      cwd,
      windowsHide: true,
      shell: false,
      ...options,
    });
  }

  async function containerId(service) {
    const invocation = createSupabaseRuntimeComposeInvocation({ args: ["ps", "-q", service] });
    return (await docker(invocation.args)).stdout.trim();
  }

  async function namedContainerId(name) {
    return (await docker(["inspect", "--format", "{{.Id}}", name])).stdout.trim();
  }

  async function currentIdentity(service) {
    const godel = GODEL_RUNTIME_SERVICES.find(([tracked]) => tracked === service);
    return godel ? namedContainerId(godel[1]) : containerId(service);
  }

  return {
    async recreate(service) {
      const invocation = createSupabaseConsumerRecreateInvocation(service);
      await docker(invocation.args, { maxBuffer: 1024 * 1024 });
    },
    containerId,
    async waitHealthy(service) {
      const deadline = now() + timeoutMs;
      for (;;) {
        const id = await containerId(service);
        if (id) {
          const state = (await docker([
            "inspect",
            "--format",
            "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
            id,
          ])).stdout.trim();
          if (state === "running|healthy") return;
        }
        if (now() >= deadline) break;
        await sleep(pollIntervalMs);
      }
      throw new Error(`EC_RUNTIME_CONVERGENCE_TIMEOUT_${service}`);
    },
    async readEnv(service, variable) {
      const id = await containerId(service);
      if (!id) throw new Error(`EC_RUNTIME_CONTAINER_MISSING_${service}`);
      return (await docker(["exec", id, "printenv", variable])).stdout.trim();
    },
    async captureIdentities() {
      const values = new Map();
      for (const service of MANAGED_SUPABASE_SERVICES) {
        const id = await containerId(service);
        if (!id) throw new Error(`EC_RUNTIME_IDENTITY_BASELINE_MISSING_${service}`);
        values.set(service, id);
      }
      for (const [service] of GODEL_RUNTIME_SERVICES) {
        const id = await currentIdentity(service);
        if (!id) throw new Error(`EC_RUNTIME_IDENTITY_BASELINE_MISSING_${service}`);
        values.set(service, id);
      }
      return values;
    },
    async assertIdentities(before, recreatedServices) {
      for (const [service, previous] of before) {
        const current = await currentIdentity(service);
        const expectedToChange = recreatedServices.includes(service);
        if ((expectedToChange && current === previous) || (!expectedToChange && current !== previous)) {
          throw new Error("EC_RUNTIME_UNEXPECTED_IDENTITY_CHANGE");
        }
      }
    },
  };
}

async function verifyService(runtime, service, expectedValues) {
  for (const [containerVariable, snapshotVariable] of ENV[service]) {
    if ((await runtime.readEnv(service, containerVariable)) !== expectedValues.get(snapshotVariable)) {
      throw new Error(`EC_RUNTIME_ENV_MISMATCH_${service}`);
    }
  }
}

async function verifyStage(api, value, expectedStage) {
  const status = await api.status(value);
  if (status.stage !== expectedStage) throw new Error("EC_RUNTIME_TARGET_STAGE_MISMATCH");
}

async function convergeServices(runtime, services, values) {
  for (const service of services) {
    await runtime.recreate(service);
    await runtime.waitHealthy(service);
    await verifyService(runtime, service, values);
  }
}

async function transitionSecret(api, operation, value, planId, toStage) {
  await api[operation]({ ...value, planId, toStage, apply: true });
}

export async function convergeEcSigningKeyRuntime({
  operation,
  planId,
  toStage,
  apply = false,
  value,
  stageValues,
  api = statusApi,
  runtime = createDockerRuntime(),
  fromStage,
}) {
  const statusValue = { ...value, planId };
  const initial = await api.status(statusValue);
  if (fromStage != null && fromStage !== initial.stage) {
    throw new Error("EC_RUNTIME_FROM_STAGE_MISMATCH");
  }

  const plan = ecRuntimeTransitionPlan(initial.stage, toStage);
  if (operation !== operationFor(plan.direction)) {
    throw new Error("EC_RUNTIME_OPERATION_DIRECTION_MISMATCH");
  }
  if (!apply) return { state: "DRY_RUN", ...plan };

  const targetValues = assertStageValues(stageValues, plan.toStage);
  const sourceValues = assertStageValues(stageValues, plan.fromStage);
  const before = await runtime.captureIdentities();
  let generationTransitioned = false;

  try {
    await transitionSecret(api, operation, value, planId, plan.toStage);
    generationTransitioned = true;
    await verifyStage(api, statusValue, plan.toStage);
    await convergeServices(runtime, plan.services, targetValues);
    await runtime.assertIdentities(before, plan.services);
    await verifyStage(api, statusValue, plan.toStage);
    return { state: "COMPLETE", ...plan };
  } catch (error) {
    if (isFailClosed(error)) throw new Error("EC_RUNTIME_SECRET_STATE_UNVERIFIED", { cause: error });
    if (!generationTransitioned) throw error;

    const recovery = ecRuntimeTransitionPlan(plan.toStage, plan.fromStage);
    const inverseOperation = operationFor(recovery.direction);
    try {
      await transitionSecret(api, inverseOperation, value, planId, recovery.toStage);
      await verifyStage(api, statusValue, recovery.toStage);
      await convergeServices(runtime, recovery.services, sourceValues);
      await runtime.assertIdentities(before, recovery.services);
      await verifyStage(api, statusValue, recovery.toStage);
      return {
        state: "RUNTIME_CONVERGENCE_FAILED_ROLLBACK_SUCCEEDED",
        failedService: error?.message?.replace(/^EC_RUNTIME_(?:ENV_MISMATCH_|CONVERGENCE_TIMEOUT_)/, "") ?? "UNKNOWN",
        inverseOperation,
        ...recovery,
      };
    } catch (recoveryError) {
      if (isFailClosed(recoveryError)) {
        throw new Error("EC_RUNTIME_SECRET_STATE_UNVERIFIED", { cause: recoveryError });
      }
      throw new Error("EC_RUNTIME_CONVERGENCE_ROLLBACK_FAILED", { cause: recoveryError });
    }
  }
}
