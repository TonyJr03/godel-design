import assert from "node:assert/strict";
import test from "node:test";

import {
  runCommand,
  validateSecretSafeArgs,
  validateSecretSafeDatabaseTransport,
} from "./command-runner.mjs";

test("runner passes only allowlisted environment and never inherits a secret", async () => {
  const previous = process.env.GODEL_UNLISTED_SECRET;
  process.env.GODEL_UNLISTED_SECRET = "must-not-leak";
  try {
    const result = await runCommand({
      operation: "inspect isolated child environment",
      executable: process.execPath,
      args: ["-e", "process.stdout.write(JSON.stringify({safe:process.env.SAFE_VALUE,secret:process.env.GODEL_UNLISTED_SECRET||null}))"],
      allowedEnvironment: { SAFE_VALUE: "allowed" },
      cwd: process.cwd(),
    });
    assert.deepEqual(JSON.parse(result.stdout), { safe: "allowed", secret: null });
  } finally {
    if (previous === undefined) delete process.env.GODEL_UNLISTED_SECRET;
    else process.env.GODEL_UNLISTED_SECRET = previous;
  }
});

test("secret-bearing argv and shell options are rejected", async () => {
  assert.throws(() => validateSecretSafeArgs(["--password", "actual-secret"]), /forbidden/);
  assert.throws(() => validateSecretSafeArgs(["--db-url=postgresql://user:actual-secret@db.invalid/postgres"]), /forbidden/);
  await assert.rejects(runCommand({
    operation: "unsafe shell",
    executable: process.execPath,
    args: [],
    allowedEnvironment: {},
    cwd: process.cwd(),
    shell: true,
  }), /Unexpected command option/);
});

test("database transport remains fail-closed until local proof", () => {
  assert.throws(() => validateSecretSafeDatabaseTransport({
    mechanism: "environment",
    argvContainsPassword: false,
    argvContainsFullDatabaseUrl: false,
    provenLocally: false,
  }), /pending local proof/);
  assert.throws(() => validateSecretSafeDatabaseTransport({
    mechanism: "environment",
    argvContainsPassword: true,
    argvContainsFullDatabaseUrl: false,
    provenLocally: true,
  }), /forbidden/);
});

test("runner redacts allowlisted secret values from child output and errors", async () => {
  const result = await runCommand({
    operation: "sanitize child output",
    executable: process.execPath,
    args: ["-e", "process.stdout.write(process.env.TEST_TOKEN)"],
    allowedEnvironment: { TEST_TOKEN: "sensitive-value" },
    cwd: process.cwd(),
  });
  assert.equal(result.stdout, "[REDACTED]");
});
