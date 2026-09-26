import assert from "node:assert/strict";
import test from "node:test";

import { preflightManagedRecoveryTools } from "./tool-preflight.mjs";

test("recovery tool preflight preserves required Windows platform keys and excludes Docker overrides and credentials", async () => {
  const calls = [];
  const environment = {
    PATH: "A", Path: "B", PATHEXT: ".EXE", SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", TEMP: "T", TMP: "T2",
    LOCALAPPDATA: "L", APPDATA: "A2", USERPROFILE: "U", DOCKER_HOST: "tcp://remote", DOCKER_CONTEXT: "prod", DOCKER_CONFIG: "secret-path",
    R2_SECRET_ACCESS_KEY: "secret", AWS_SECRET_ACCESS_KEY: "secret-two",
  };
  const execute = async (plan) => {
    calls.push(plan);
    if (plan.executable === "age") return { stdout: "age 1.3.1" };
    if (plan.executable === "tar") return { stdout: "tar 1.35" };
    if (plan.executable === "rclone") return { stdout: "rclone v1.75.1" };
    if (plan.executable === "docker") return { stdout: "27.1.1/27.1.1" };
    throw new Error("unexpected");
  };
  await preflightManagedRecoveryTools({ environment, repoRoot: process.cwd(), execute, admitSupabaseCli: async () => ({ version: "2.109.1" }) });
  const expected = Object.fromEntries(["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE"].map((key) => [key, environment[key]]));
  assert.ok(calls.length > 0);
  assert.ok(calls.every((call) => assert.deepEqual(call.allowedEnvironment, expected) === undefined));
  assert.ok(calls.every((call) => !Object.keys(call.allowedEnvironment).some((key) => key.startsWith("DOCKER_") || /R2|AWS/.test(key))));
});
