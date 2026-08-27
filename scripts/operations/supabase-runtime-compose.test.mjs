import assert from "node:assert/strict";
import test from "node:test";

import {
  createSupabaseConsumerRecreateInvocation,
  createSupabaseRuntimeComposeInvocation,
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
