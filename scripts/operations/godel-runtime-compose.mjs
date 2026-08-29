const RUNTIME_COMPOSE_SENTINEL = "runtime-compose-interpolation-only";
const RUNTIME_SUBCOMMANDS = new Set(["config", "ps", "start", "stop"]);

function maintenanceInvocation(action, environment) {
  return {
    args: ["compose", "--env-file", "compose.env.local", "-f", "compose.yaml", action, "nginx"],
    environment: { ...environment, GODEL_PUBLIC_BUILD_NONCE: RUNTIME_COMPOSE_SENTINEL },
    shell: false,
  };
}

export function createGodelRuntimeComposeInvocation({ args, environment = process.env }) {
  if (!Array.isArray(args) || !RUNTIME_SUBCOMMANDS.has(args[0])) throw new Error("GODEL_RUNTIME_COMPOSE_COMMAND_FORBIDDEN");
  return {
    args: ["compose", "--env-file", "compose.env.local", "-f", "compose.yaml", ...args],
    environment: { ...environment, GODEL_PUBLIC_BUILD_NONCE: RUNTIME_COMPOSE_SENTINEL },
  };
}

export function createGodelMaintenanceCloseInvocation({ environment = process.env } = {}) {
  return maintenanceInvocation("stop", environment);
}

export function createGodelMaintenanceOpenInvocation({ environment = process.env } = {}) {
  return maintenanceInvocation("start", environment);
}
