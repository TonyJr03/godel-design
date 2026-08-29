import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseConsumerRecreateInvocation,
  createSupabasePostgresDbRecreateInvocation,
  createSupabasePostgresPasswordConsumerRecreateInvocation,
  createSupabasePostgresPasswordPsqlInvocation,
  createSupabaseRuntimeComposeInvocation,
  createSupabaseSupavisorCredentialApiInvocation,
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
