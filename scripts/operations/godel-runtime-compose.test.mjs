import assert from "node:assert/strict";
import test from "node:test";
import { createGodelRuntimeComposeInvocation } from "./godel-runtime-compose.mjs";

test("runtime Compose interpolation uses a process-local sentinel and preserves the parent environment", () => {
  const environment = { PATH: "synthetic-path", RETAINED: "synthetic-value", GODEL_PUBLIC_BUILD_NONCE: "stale-parent-value" };
  const invocation = createGodelRuntimeComposeInvocation({ args: ["ps", "-q", "app"], environment });
  assert.deepEqual(invocation.args, ["compose", "--env-file", "compose.env.local", "-f", "compose.yaml", "ps", "-q", "app"]);
  assert.equal(invocation.environment.PATH, "synthetic-path");
  assert.equal(invocation.environment.RETAINED, "synthetic-value");
  assert.equal(invocation.environment.GODEL_PUBLIC_BUILD_NONCE, "runtime-compose-interpolation-only");
  assert.equal(environment.GODEL_PUBLIC_BUILD_NONCE, "stale-parent-value");
});

test("runtime Compose allowlist accepts only operational subcommands", () => {
  for (const command of ["config", "ps", "start", "stop"]) {
    const invocation = createGodelRuntimeComposeInvocation({ args: [command] });
    assert.equal(invocation.args.at(-1), command);
  }
});

test("runtime Compose rejects build-capable and unknown subcommands", () => {
  for (const command of ["build", "up", "create", "run", "restart", "unknown"]) {
    assert.throws(() => createGodelRuntimeComposeInvocation({ args: [command] }), /GODEL_RUNTIME_COMPOSE_COMMAND_FORBIDDEN/);
  }
});
