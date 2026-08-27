const RUNTIME_SUBCOMMANDS = new Set(["config", "ps", "start", "stop"]);
const CONSUMER_SERVICES = new Set([
  "rest",
  "auth",
  "realtime",
  "storage",
  "supavisor",
  "api-gw",
  "functions",
  "studio",
]);

const CANONICAL_PREFIX = [
  "compose",
  "--env-file",
  "infra/supabase/.env",
  "-f",
  "infra/supabase/docker-compose.yml",
  "-f",
  "infra/supabase-godel.override.yml",
];

function composeInvocation(args) {
  return { args: [...CANONICAL_PREFIX, ...args] };
}

export function createSupabaseRuntimeComposeInvocation({ args }) {
  if (!Array.isArray(args) || !RUNTIME_SUBCOMMANDS.has(args[0])) {
    throw new Error("SUPABASE_RUNTIME_COMPOSE_COMMAND_FORBIDDEN");
  }

  return composeInvocation(args);
}

export function createSupabaseConsumerRecreateInvocation(service) {
  if (typeof service !== "string" || !CONSUMER_SERVICES.has(service)) {
    throw new Error("SUPABASE_CONSUMER_RECREATE_FORBIDDEN");
  }

  return composeInvocation(["up", "-d", "--no-deps", "--force-recreate", service]);
}
