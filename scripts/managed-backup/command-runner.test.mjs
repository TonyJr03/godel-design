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
  for (const identity of ["AGE-SECRET-KEY-1SYNTHETIC", "AGE-SECRET-KEY-PQ-1SYNTHETIC"]) {
    assert.throws(() => validateSecretSafeArgs([identity]), /forbidden/);
  }
  await assert.rejects(runCommand({
    operation: "unsafe shell",
    executable: process.execPath,
    args: [],
    allowedEnvironment: {},
    cwd: process.cwd(),
    shell: true,
  }), /Unexpected command option/);
});

test("inline credential assignments are rejected anywhere in argv", () => {
  for (const value of [
    ":s3,access_key_id=ABC,secret_access_key=XYZ:bucket",
    "remote,secret_access_key=XYZ:bucket",
    "foo?token=XYZ",
    "password=XYZ",
    "--header=client_secret=XYZ",
  ]) {
    assert.throws(
      () => validateSecretSafeArgs([value]),
      (error) => error.code === "SECRET_IN_ARGV" && !error.message.includes(value),
    );
  }
  for (const flag of ["--access-key", "--access-key-id", "--secret-access-key", "--session-token", "--client-secret"]) {
    assert.throws(() => validateSecretSafeArgs([flag, "ABC"]), /forbidden/);
  }
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

test("runner redacts a PQ private identity even when its environment key is not secret-like", async () => {
  const result = await runCommand({
    operation: "sanitize PQ private identity",
    executable: process.execPath,
    args: ["-e", "process.stdout.write(process.env.SAFE_VALUE)"],
    allowedEnvironment: { SAFE_VALUE: "AGE-SECRET-KEY-PQ-1SYNTHETIC" },
    cwd: process.cwd(),
  });
  assert.equal(result.stdout, "[REDACTED]");
});
