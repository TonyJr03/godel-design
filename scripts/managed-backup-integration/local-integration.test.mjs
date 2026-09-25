import assert from "node:assert/strict";
import { access, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createAgeTarAdapter } from "../managed-backup/age-tar-adapter.mjs";
import {
  LOCAL_INTEGRATION_CONFIRMATION,
  runLocalIntegration,
} from "../managed-backup/local-integration.mjs";
import { runPipeline } from "../managed-backup/pipeline-runner.mjs";

test("local integration confirmation fails before any executable action", async () => {
  let calls = 0;
  await assert.rejects(
    runLocalIntegration({ environment: {}, execute: async () => { calls += 1; } }),
    (error) => error.code === "LOCAL_INTEGRATION_CONFIRMATION_REQUIRED",
  );
  assert.equal(calls, 0);
});

test("exact local integration confirmation delegates once", async () => {
  let calls = 0;
  const result = await runLocalIntegration({
    environment: { GODEL_MANAGED_BACKUP_LOCAL_INTEGRATION_CONFIRM: LOCAL_INTEGRATION_CONFIRMATION },
    execute: async () => { calls += 1; return { status: "synthetic" }; },
  });
  assert.equal(calls, 1);
  assert.deepEqual(result, { status: "synthetic" });
});

test("pipeline streams producer stdout into consumer stdin with an isolated environment", async () => {
  const result = await runPipeline({
    operation: "synthetic stream proof",
    left: { executable: process.execPath, args: ["-e", "process.stdout.write(process.env.SAFE_VALUE + ':' + (process.env.UNLISTED_SECRET || 'absent'))"] },
    right: { executable: process.execPath, args: ["-e", "process.stdin.on('data',c=>process.stdout.write(c.toString().toUpperCase()))"] },
    cwd: process.cwd(),
    allowedEnvironment: { SAFE_VALUE: "streamed" },
  });
  assert.equal(result.stdout, "STREAMED:ABSENT");
});

test("age-tar adapter uses streaming plans and never requests a plaintext archive", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-age-tar-contract-"));
  const source = join(root, "source");
  const identity = join(root, "identity.txt");
  const ciphertext = join(root, "bundle.age");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(source));
  await writeFile(join(source, "internal-manifest.json"), "{}\n");
  await writeFile(identity, "protected identity placeholder");
  const calls = [];
  const pipeline = async (plan) => {
    calls.push(plan);
    if (plan.operation.startsWith("stream managed")) await writeFile(ciphertext, "ciphertext");
    if (plan.operation.startsWith("decrypt managed") && plan.right.args.includes("-tf")) return { stdout: "./internal-manifest.json\n", stderr: "" };
    return { stdout: "", stderr: "" };
  };
  const adapter = createAgeTarAdapter({
    recipient: `age1${"q".repeat(30)}`,
    identityFile: identity,
    ageExecutable: "age",
    tarExecutable: "tar",
    cwd: root,
    pipeline,
  });
  await adapter.encrypt({ sourceDirectory: source, outputPath: ciphertext });
  assert.equal((await adapter.verifyCiphertext({ ciphertextPath: ciphertext })).verified, true);
  assert.deepEqual(calls[0].left.args.slice(0, 2), ["-cf", "-"]);
  assert.ok(!calls.flatMap((call) => [...call.left.args, ...call.right.args]).some((arg) => /\.tar$/i.test(arg)));
  assert.deepEqual((await readdir(root)).filter((name) => name.endsWith(".tar")), []);
  await access(ciphertext);
});

test("age-tar adapter constructs with a realistic synthetic PQ recipient", () => {
  assert.doesNotThrow(() => createAgeTarAdapter({
    recipient: `age1pq1${"q".repeat(1993)}`,
    identityFile: join(tmpdir(), "synthetic-age-identity.txt"),
    cwd: tmpdir(),
  }));
});
