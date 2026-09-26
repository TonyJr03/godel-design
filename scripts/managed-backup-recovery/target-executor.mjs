import { runCommand } from "../managed-backup/command-runner.mjs";
import { buildTargetPsqlPlan } from "./target-commands.mjs";

const executors = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryTargetExecutorError";
  error.code = code;
  throw error;
}

export function createGovernedTargetExecutor({ prepared, execute = runCommand } = {}) {
  if (prepared?.status !== "PREPARED" || typeof execute !== "function" || !prepared.commandPlans) fail("LOCAL_RECOVERY_EXECUTOR_INVALID", "Prepared recovery target executor authority is required");
  const governedPlans = [
    prepared.commandPlans.start,
    prepared.commandPlans.status,
    prepared.commandPlans.discoverDb,
    prepared.commandPlans.stop,
    prepared.commandPlans.verifyCleanupContainers,
    prepared.commandPlans.verifyCleanupVolumes,
    prepared.commandPlans.verifyCleanupNetworks,
  ];
  if (governedPlans.some((commandPlan) => !commandPlan)) fail("LOCAL_RECOVERY_EXECUTOR_INVALID", "Complete governed recovery target plans are required");
  const handle = Object.freeze({ status: "READY", allowedOperations: governedPlans.length });
  executors.set(handle, { prepared, execute, allowed: new Set(governedPlans) });
  return handle;
}

export async function executeGovernedTargetPlan(executor, commandPlan) {
  const state = executors.get(executor);
  if (!state || !state.allowed.has(commandPlan)) fail("LOCAL_RECOVERY_COMMAND_NOT_GOVERNED", "Recovery target command plan is not governed by this drill");
  return state.execute(commandPlan);
}

export function buildGovernedTargetPsqlPlan({ executor, ...options } = {}) {
  const state = executors.get(executor);
  if (!state) fail("LOCAL_RECOVERY_EXECUTOR_INVALID", "Governed recovery target executor is required");
  const commandPlan = buildTargetPsqlPlan({ ...options, cwd: state.prepared.target.workdir });
  state.allowed.add(commandPlan);
  return commandPlan;
}

export function createGovernedTargetCleanupAdapter(executor) {
  const state = executors.get(executor);
  if (!state) fail("LOCAL_RECOVERY_EXECUTOR_INVALID", "Governed recovery target executor is required");
  return Object.freeze({
    async stop({ projectId, workdir } = {}) {
      if (projectId !== state.prepared.target.projectId || workdir !== state.prepared.target.workdir) fail("RECOVERY_TARGET_CLEANUP_INVALID", "Exact recovery target cleanup authority is required");
      await executeGovernedTargetPlan(executor, state.prepared.commandPlans.stop);
    },
    async listOwnedResources({ projectId } = {}) {
      if (projectId !== state.prepared.target.projectId) fail("RECOVERY_TARGET_CLEANUP_INVALID", "Exact recovery target cleanup authority is required");
      const checks = [
        [state.prepared.commandPlans.verifyCleanupContainers, "OWNED_CONTAINER"],
        [state.prepared.commandPlans.verifyCleanupVolumes, "OWNED_VOLUME"],
        [state.prepared.commandPlans.verifyCleanupNetworks, "OWNED_NETWORK"],
      ];
      const owned = [];
      for (const [commandPlan, marker] of checks) {
        const output = (await executeGovernedTargetPlan(executor, commandPlan)).stdout;
        owned.push(...String(output ?? "").split(/\r?\n/).filter(Boolean).map(() => marker));
      }
      return owned;
    },
  });
}

export const createGovernedLocalTargetExecutor = createGovernedTargetExecutor;
export const executeGovernedLocalTargetPlan = executeGovernedTargetPlan;
