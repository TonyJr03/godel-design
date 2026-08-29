import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseConsumerRecreateInvocation,
  createSupabasePostgresDbRecreateInvocation,
  createSupabasePostgresPasswordConsumerRecreateInvocation,
  createSupabasePostgresPasswordAuthenticationProbeInvocation,
  createSupabasePostgresPasswordPsqlInvocation,
  createSupabaseRuntimeComposeInvocation,
  createSupabaseSupavisorCredentialApiInvocation,
  createSupabaseSupavisorPasswordProbeInvocation,
} from "./supabase-runtime-compose.mjs";

const canonicalPrefix = [
  "compose",
  "--env-file",
  "infra/supabase/.env",
  "-f",
  "infra/supabase/docker-compose.yml",
  "-f",
  "infra/supabase-godel.override.yml",
];

test("Supabase runtime Compose uses the exact canonical Godel profile", () => {
  const invocation = createSupabaseRuntimeComposeInvocation({
    args: ["ps", "-q", "db"],
  });

  assert.deepEqual(invocation.args, [...canonicalPrefix, "ps", "-q", "db"]);
  assert.equal(
    invocation.args.indexOf("infra/supabase/docker-compose.yml") <
      invocation.args.indexOf("infra/supabase-godel.override.yml"),
    true,
  );
});

test("Supabase runtime Compose accepts only operational subcommands", () => {
  for (const command of ["config", "ps", "start", "stop"]) {
    const invocation = createSupabaseRuntimeComposeInvocation({ args: [command] });
    assert.deepEqual(invocation.args, [...canonicalPrefix, command]);
  }
});

test("Supabase runtime Compose rejects generic mutating and unknown commands", () => {
  for (const command of [
    undefined,
    "build",
    "up",
    "create",
    "run",
    "down",
    "restart",
    "pull",
    "unknown",
  ]) {
    assert.throws(
      () => createSupabaseRuntimeComposeInvocation({ args: [command] }),
      /SUPABASE_RUNTIME_COMPOSE_COMMAND_FORBIDDEN/,
    );
  }
});

test("consumer recreation is limited to the authorized services", () => {
  const services = [
    "rest",
    "auth",
    "realtime",
    "storage",
    "supavisor",
    "api-gw",
    "functions",
    "studio",
  ];

  for (const service of services) {
    assert.deepEqual(createSupabaseConsumerRecreateInvocation(service).args, [
      ...canonicalPrefix,
      "up",
      "-d",
      "--no-deps",
      "--force-recreate",
      service,
    ]);
  }
});

test("consumer recreation rejects protected, unknown, and non-singular services", () => {
  for (const service of [
    "db",
    "meta",
    "imgproxy",
    "unknown",
    "rest auth",
    ["rest", "auth"],
  ]) {
    assert.throws(
      () => createSupabaseConsumerRecreateInvocation(service),
      /SUPABASE_CONSUMER_RECREATE_FORBIDDEN/,
    );
  }
});

test("Postgres password transport is fixed to canonical Compose and stdin-only psql", () => {
  const invocation = createSupabasePostgresPasswordPsqlInvocation();
  assert.deepEqual(invocation.args, [
    ...canonicalPrefix,
    "exec",
    "-T",
    "db",
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
  ]);
  assert.equal(invocation.shell, false);
  assert.doesNotMatch(
    invocation.args.join("\n"),
    /POSTGRES_PASSWORD|SERVICE_ROLE_KEY|POOLER_TENANT_ID|SYNTHETIC_/,
  );
  assert.deepEqual(createSupabasePostgresPasswordPsqlInvocation("arbitrary", ["command"]).args, invocation.args);
});

test("Postgres password authentication probes allow exactly the approved roles over in-container TCP", () => {
  const roles = ["postgres", "supabase_admin", "authenticator", "pgbouncer", "supabase_auth_admin", "supabase_functions_admin", "supabase_storage_admin"];
  for (const role of roles) {
    const invocation = createSupabasePostgresPasswordAuthenticationProbeInvocation(role);
    assert.deepEqual(invocation.args.slice(0, canonicalPrefix.length), canonicalPrefix);
    assert.equal(invocation.args.includes("exec"), true);
    assert.equal(invocation.args.includes("db"), true);
    assert.equal(invocation.args.at(-1), role);
    assert.match(invocation.args.join(" "), /-h 127\.0\.0\.1/);
    assert.match(invocation.args.join(" "), /SELECT current_user/);
    assert.doesNotMatch(invocation.args.join("\n"), /SYNTHETIC_PASSWORD|PGPASSWORD=/);
    assert.equal(invocation.shell, false);
  }
  for (const role of ["unknown", "postgres;drop", "", null]) {
    assert.throws(() => createSupabasePostgresPasswordAuthenticationProbeInvocation(role), /POSTGRES_PASSWORD_AUTH_PROBE_ROLE_FORBIDDEN/);
  }
});

test("Supavisor password probes allow exactly the session and transaction ports with stdin-only credentials", () => {
  for (const port of [5432, 6543]) {
    const invocation = createSupabaseSupavisorPasswordProbeInvocation(port);
    assert.deepEqual(invocation.args.slice(0, canonicalPrefix.length), canonicalPrefix);
    assert.equal(invocation.args.at(-1), String(port));
    assert.match(invocation.args.join(" "), /-h supavisor/);
    assert.match(invocation.args.join(" "), /SELECT 1/);
    assert.doesNotMatch(invocation.args.join("\n"), /SYNTHETIC_PASSWORD|SYNTHETIC_TENANT|PGPASSWORD=/);
    assert.equal(invocation.shell, false);
  }
  for (const port of [5433, "5432", null]) {
    assert.throws(() => createSupabaseSupavisorPasswordProbeInvocation(port), /SUPAVISOR_PASSWORD_PROBE_PORT_FORBIDDEN/);
  }
});

test("Postgres DB recreation is dedicated, fixed, and separate from generic consumers", () => {
  const invocation = createSupabasePostgresDbRecreateInvocation();
  assert.deepEqual(invocation.args, [...canonicalPrefix, "up", "-d", "--no-deps", "--force-recreate", "db"]);
  assert.equal(invocation.shell, false);
  assert.deepEqual(createSupabasePostgresDbRecreateInvocation("rest", ["down"]).args, invocation.args);
  assert.throws(() => createSupabaseConsumerRecreateInvocation("db"), /SUPABASE_CONSUMER_RECREATE_FORBIDDEN/);
});

test("Postgres password consumer recreation permits exactly the D.5 runtime consumers", () => {
  const services = ["supavisor", "meta", "auth", "rest", "realtime", "storage", "functions", "studio"];
  for (const service of services) {
    const invocation = createSupabasePostgresPasswordConsumerRecreateInvocation(service);
    assert.deepEqual(invocation.args, [...canonicalPrefix, "up", "-d", "--no-deps", "--force-recreate", service]);
    assert.equal(invocation.shell, false);
  }
  for (const service of ["db", "api-gw", "imgproxy", "unknown", "rest auth", ["rest", "auth"]]) {
    assert.throws(() => createSupabasePostgresPasswordConsumerRecreateInvocation(service), /POSTGRES_PASSWORD_CONSUMER_RECREATE_FORBIDDEN/);
  }
});

test("Supavisor credential transport is fixed to canonical Compose and curl config stdin", () => {
  const invocation = createSupabaseSupavisorCredentialApiInvocation();
  assert.deepEqual(invocation.args, [
    ...canonicalPrefix,
    "exec",
    "-T",
    "supavisor",
    "curl",
    "--silent",
    "--show-error",
    "--fail",
    "--config",
    "-",
  ]);
  assert.equal(invocation.shell, false);
  assert.doesNotMatch(invocation.args.join(" "), /password|secret|tenant|update_auth_credentials/i);
  assert.deepEqual(createSupabaseSupavisorCredentialApiInvocation({ service: "db", command: "sh" }).args, invocation.args);
});
