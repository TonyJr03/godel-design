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
const POSTGRES_PASSWORD_CONSUMER_SERVICES = new Set([
  "supavisor",
  "meta",
  "auth",
  "rest",
  "realtime",
  "storage",
  "functions",
  "studio",
]);
const POSTGRES_PASSWORD_ROLES = new Set([
  "postgres",
  "supabase_admin",
  "authenticator",
  "pgbouncer",
  "supabase_auth_admin",
  "supabase_functions_admin",
  "supabase_storage_admin",
]);
const SUPAVISOR_PROBE_PORTS = new Set([5432, 6543]);
const POSTGRES_PASSWORD_AUTH_PROBE_SCRIPT = "set -eu; IFS= read -r PGPASSWORD; if IFS= read -r extra; then exit 64; fi; export PGPASSWORD; exec psql -X -h 127.0.0.1 -U \"$1\" -d postgres -tAc 'SELECT current_user'";
const SUPAVISOR_PASSWORD_PROBE_SCRIPT = "set -eu; IFS= read -r PGPASSWORD; IFS= read -r PGUSER; if IFS= read -r extra; then exit 64; fi; export PGPASSWORD PGUSER; exec psql -X -h supavisor -p \"$1\" -d postgres -tAc 'SELECT 1'";

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

export function createSupabasePostgresPasswordPsqlInvocation() {
  return {
    ...composeInvocation(["exec", "-T", "db", "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "supabase_admin", "-d", "postgres"]),
    shell: false,
  };
}

export function createSupabasePostgresPasswordAuthenticationProbeInvocation(role) {
  if (typeof role !== "string" || !POSTGRES_PASSWORD_ROLES.has(role)) {
    throw new Error("POSTGRES_PASSWORD_AUTH_PROBE_ROLE_FORBIDDEN");
  }
  return {
    ...composeInvocation(["exec", "-T", "db", "sh", "-ceu", POSTGRES_PASSWORD_AUTH_PROBE_SCRIPT, "postgres-password-auth-probe", role]),
    shell: false,
  };
}

export function createSupabaseSupavisorPasswordProbeInvocation(port) {
  if (!SUPAVISOR_PROBE_PORTS.has(port)) throw new Error("SUPAVISOR_PASSWORD_PROBE_PORT_FORBIDDEN");
  return {
    ...composeInvocation(["exec", "-T", "db", "sh", "-ceu", SUPAVISOR_PASSWORD_PROBE_SCRIPT, "supavisor-password-probe", String(port)]),
    shell: false,
  };
}

export function createSupabasePostgresDbRecreateInvocation() {
  return {
    ...composeInvocation(["up", "-d", "--no-deps", "--force-recreate", "db"]),
    shell: false,
  };
}

export function createSupabasePostgresPasswordConsumerRecreateInvocation(service) {
  if (typeof service !== "string" || !POSTGRES_PASSWORD_CONSUMER_SERVICES.has(service)) {
    throw new Error("POSTGRES_PASSWORD_CONSUMER_RECREATE_FORBIDDEN");
  }
  return {
    ...composeInvocation(["up", "-d", "--no-deps", "--force-recreate", service]),
    shell: false,
  };
}

export function createSupabaseSupavisorCredentialApiInvocation() {
  return {
    ...composeInvocation(["exec", "-T", "supavisor", "curl", "--silent", "--show-error", "--fail", "--config", "-"]),
    shell: false,
  };
}
