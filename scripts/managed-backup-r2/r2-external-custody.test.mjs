import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { assertExternalPublicationAdapter, createExternalReceipt, writeExternalReceiptAtomic } from "../managed-backup/external-receipt.mjs";
import { createIncompleteManifest } from "../managed-backup/manifest.mjs";
import {
  R2_PRODUCTION_LOCK_CONFIRMATION,
  buildR2CustodyEnvironment,
  createR2ExternalPublicationAdapter,
  deriveR2ObjectKeys,
  readR2CustodyConfiguration,
} from "../managed-backup/r2-external-custody.mjs";
import { runR2CustodyProof } from "../managed-backup/r2-custody-proof.mjs";

const BACKUP_ID = "GDBK-20260923T120000Z-AAAAAAAA";
const PROOF_RUN_ID = "GDR2-20260923T120000Z-AAAAAAAA";
const TOOLING_SHA = "3".repeat(40);
const RUNTIME_SHA = "4".repeat(40);

function environment(extra = {}) {
  return {
    PATH: process.env.PATH ?? "",
    GODEL_BACKUP_R2_ENDPOINT: "https://0123456789abcdef.eu.r2.cloudflarestorage.com",
    GODEL_BACKUP_R2_BUCKET: "godel-backups",
    GODEL_BACKUP_R2_ACCESS_KEY_ID: "r2-access-key-test-value",
    GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "r2-secret-key-test-value",
    ...extra,
  };
}

async function receiptFixture(status = "PENDING") {
  const root = await mkdtemp(join(tmpdir(), "godel-r2-test-"));
  const ciphertextPath = join(root, `${BACKUP_ID}.age`);
  await writeFile(ciphertextPath, "synthetic ciphertext");
  const receipt = await createExternalReceipt({
    backupId: BACKUP_ID,
    toolingGitSha: TOOLING_SHA,
    productionRuntimeSha: RUNTIME_SHA,
    ciphertextPath,
    externalPublicationStatus: status,
  });
  return { root, ciphertextPath, receipt };
}

function fakeRclone({ initial = [], downloadReceipt = null, onDownload } = {}) {
  const names = new Set(initial);
  const calls = [];
  const execute = async (plan) => {
    calls.push(plan);
    assert.equal(plan.executable, "rclone");
    if (plan.args[0] === "lsjson") {
      return { stdout: JSON.stringify([...names].map((name) => ({ Path: name, Name: name, IsDir: false, Size: 10 }))), stderr: "" };
    }
    assert.equal(plan.args[0], "copyto");
    if (plan.args[1].startsWith("godelr2:")) {
      const target = plan.args[2];
      const remoteName = plan.args[1].split("/").at(-1);
      await writeFile(target, remoteName.endsWith(".json") ? JSON.stringify(downloadReceipt) : "synthetic ciphertext");
      if (onDownload) await onDownload({ target, plan });
    } else {
      names.add(plan.args[2].split("/").at(-1));
    }
    return { stdout: "", stderr: "" };
  };
  return { calls, execute, names };
}

test("R2 endpoint admits clean global and jurisdictional HTTPS endpoints", () => {
  assert.equal(readR2CustodyConfiguration(environment()).endpoint, "https://0123456789abcdef.eu.r2.cloudflarestorage.com");
  assert.equal(readR2CustodyConfiguration(environment({ GODEL_BACKUP_R2_ENDPOINT: "https://0123456789abcdef.r2.cloudflarestorage.com/" })).endpoint, "https://0123456789abcdef.r2.cloudflarestorage.com");
});

for (const endpoint of [
  "http://account.r2.cloudflarestorage.com",
  "https://user:pass@account.r2.cloudflarestorage.com",
  "https://account.r2.cloudflarestorage.com?token=x",
  "https://account.r2.cloudflarestorage.com#fragment",
  "https://account.r2.cloudflarestorage.com/path",
  "https://r2.cloudflarestorage.com",
  "https://account.example.com",
]) {
  test(`invalid R2 endpoint is rejected: ${endpoint}`, () => {
    assert.throws(() => readR2CustodyConfiguration(environment({ GODEL_BACKUP_R2_ENDPOINT: endpoint })), (error) => error.code === "R2_ENDPOINT_INVALID");
  });
}

for (const bucket of ["ab", "-bucket", "bucket-", "Bucket", "bucket_name", "a".repeat(64)]) {
  test(`invalid R2 bucket is rejected: ${bucket.slice(0, 20)}`, () => {
    assert.throws(() => readR2CustodyConfiguration(environment({ GODEL_BACKUP_R2_BUCKET: bucket })), (error) => error.code === "R2_BUCKET_INVALID");
  });
}

test("R2 credentials exist only in the isolated environment and redaction set", () => {
  const config = readR2CustodyConfiguration(environment({ SUPABASE_DB_PASSWORD: "must-not-leak", VERCEL_TOKEN: "must-not-leak-either" }));
  const transport = buildR2CustodyEnvironment(config, environment({ SUPABASE_DB_PASSWORD: "must-not-leak", VERCEL_TOKEN: "must-not-leak-either" }));
  assert.equal(transport.allowedEnvironment.AWS_ACCESS_KEY_ID, config.accessKeyId);
  assert.equal(transport.allowedEnvironment.AWS_SECRET_ACCESS_KEY, config.secretAccessKey);
  assert.deepEqual(transport.secretValues, [config.accessKeyId, config.secretAccessKey, config.endpoint]);
  assert.equal(transport.allowedEnvironment.SUPABASE_DB_PASSWORD, undefined);
  assert.equal(transport.allowedEnvironment.VERCEL_TOKEN, undefined);
});

test("R2 environment credentials are redacted from command output", async () => {
  const config = readR2CustodyConfiguration(environment());
  const transport = buildR2CustodyEnvironment(config, environment());
  const result = await runCommand({
    operation: "R2 redaction test",
    executable: process.execPath,
    args: ["-e", "process.stdout.write(process.env.AWS_ACCESS_KEY_ID + ':' + process.env.AWS_SECRET_ACCESS_KEY)"],
    cwd: process.cwd(),
    ...transport,
  });
  assert.equal(result.stdout, "[REDACTED]:[REDACTED]");
});

test("integration and production keys are deterministic and mode is closed", () => {
  assert.deepEqual(deriveR2ObjectKeys({ mode: "integration", proofRunId: PROOF_RUN_ID, backupId: BACKUP_ID }), {
    prefix: `integration/${PROOF_RUN_ID}`,
    ciphertextName: "synthetic.age",
    receiptName: "synthetic.external-receipt.json",
    ciphertextKey: `integration/${PROOF_RUN_ID}/synthetic.age`,
    receiptKey: `integration/${PROOF_RUN_ID}/synthetic.external-receipt.json`,
  });
  assert.deepEqual(deriveR2ObjectKeys({ mode: "production", backupId: BACKUP_ID }), {
    prefix: `production/${BACKUP_ID}`,
    ciphertextName: `${BACKUP_ID}.age`,
    receiptName: `${BACKUP_ID}.external-receipt.json`,
    ciphertextKey: `production/${BACKUP_ID}/${BACKUP_ID}.age`,
    receiptKey: `production/${BACKUP_ID}/${BACKUP_ID}.external-receipt.json`,
  });
  assert.throws(() => deriveR2ObjectKeys({ mode: "arbitrary", backupId: BACKUP_ID }), (error) => error.code === "R2_MODE_INVALID");
});

for (const runId of ["../escape", "C:/absolute", "bad\\path", "integration:bad", "", "GDR2-20260923T120000Z-AAAAAAA/"]) {
  test(`unsafe proof run ID is rejected: ${JSON.stringify(runId)}`, () => {
    assert.throws(() => deriveR2ObjectKeys({ mode: "integration", proofRunId: runId, backupId: BACKUP_ID }), (error) => error.code === "R2_PROOF_RUN_ID_INVALID");
  });
}

test("adapter satisfies the external publication contract without Production lock in integration", () => {
  const adapter = createR2ExternalPublicationAdapter({ mode: "integration", proofRunId: PROOF_RUN_ID, environment: environment(), execute: async () => ({ stdout: "[]", stderr: "" }) });
  assert.equal(assertExternalPublicationAdapter(adapter), adapter);
  assert.equal("delete" in adapter, false);
  assert.equal("move" in adapter, false);
  assert.equal("sync" in adapter, false);
  assert.equal("purge" in adapter, false);
});

test("Production lock confirmation fails before any runner call", () => {
  let calls = 0;
  assert.throws(
    () => createR2ExternalPublicationAdapter({ mode: "production", environment: environment(), execute: async () => { calls += 1; } }),
    (error) => error.code === "R2_PRODUCTION_LOCK_CONFIRMATION_REQUIRED",
  );
  assert.equal(calls, 0);
});

test("immutable ciphertext publication uses only lsjson and copyto with no credentials in argv", async () => {
  const fixture = await receiptFixture();
  const remote = fakeRclone();
  const adapter = createR2ExternalPublicationAdapter({ mode: "integration", proofRunId: PROOF_RUN_ID, environment: environment(), execute: remote.execute });
  await adapter.publishCiphertext({ ciphertextPath: fixture.ciphertextPath, receipt: fixture.receipt });
  assert.deepEqual(remote.calls.map((call) => call.args[0]), ["lsjson", "copyto", "lsjson"]);
  assert.ok(remote.calls[1].args.includes("--immutable"));
  assert.match(remote.calls[1].args[2], /integration\/GDR2-.*\/synthetic\.age$/);
  for (const call of remote.calls) {
    const argv = call.args.join(" ");
    assert.ok(!argv.includes(environment().GODEL_BACKUP_R2_ACCESS_KEY_ID));
    assert.ok(!argv.includes(environment().GODEL_BACKUP_R2_SECRET_ACCESS_KEY));
    assert.ok(["lsjson", "copyto"].includes(call.args[0]));
  }
});

for (const label of ["existing object", "same-hash existing object"]) {
  test(`${label} remains a collision`, async () => {
    const fixture = await receiptFixture();
    const remote = fakeRclone({ initial: ["synthetic.age"] });
    const adapter = createR2ExternalPublicationAdapter({ mode: "integration", proofRunId: PROOF_RUN_ID, environment: environment(), execute: remote.execute });
    await assert.rejects(adapter.publishCiphertext({ ciphertextPath: fixture.ciphertextPath, receipt: fixture.receipt }), (error) => error.code === "R2_OBJECT_ALREADY_EXISTS");
    assert.equal(remote.calls.length, 1);
  });
}

test("unexpected, nested, directory, and duplicate remote entries fail closed", async (t) => {
  const cases = [
    [{ Path: "unknown.age", Name: "unknown.age", IsDir: false }],
    [{ Path: "nested/synthetic.age", Name: "synthetic.age", IsDir: false }],
    [{ Path: "synthetic.age", Name: "synthetic.age", IsDir: true }],
    [{ Path: "synthetic.age", Name: "synthetic.age", IsDir: false }, { Path: "synthetic.age", Name: "synthetic.age", IsDir: false }],
  ];
  for (const entries of cases) {
    await t.test(JSON.stringify(entries), async () => {
      const adapter = createR2ExternalPublicationAdapter({ mode: "integration", proofRunId: PROOF_RUN_ID, environment: environment(), execute: async () => ({ stdout: JSON.stringify(entries), stderr: "" }) });
      await assert.rejects(adapter.inspectObjects({ backupId: BACKUP_ID }), (error) => error.code === "R2_LISTING_INVALID");
    });
  }
});

test("download refuses an existing local target before invoking rclone", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-r2-download-"));
  const finalPath = join(outputRoot, `${BACKUP_ID}.r2-download.age`);
  await writeFile(finalPath, "keep me");
  let calls = 0;
  const adapter = createR2ExternalPublicationAdapter({ mode: "integration", proofRunId: PROOF_RUN_ID, environment: environment(), execute: async () => { calls += 1; } });
  await assert.rejects(adapter.downloadCiphertext({ backupId: BACKUP_ID, outputRoot }), (error) => error.code === "R2_LOCAL_TARGET_EXISTS");
  assert.equal(calls, 0);
  assert.equal(await readFile(finalPath, "utf8"), "keep me");
});

test("download publishes its temporary file with race-safe no-replace semantics", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-r2-race-"));
  const finalPath = join(outputRoot, `${BACKUP_ID}.r2-download.age`);
  const remote = fakeRclone({
    initial: ["synthetic.age"],
    onDownload: async ({ target }) => writeFile(join(dirname(target), `${BACKUP_ID}.r2-download.age`), "racing writer", { flag: "wx" }),
  });
  const adapter = createR2ExternalPublicationAdapter({ mode: "integration", proofRunId: PROOF_RUN_ID, environment: environment(), execute: remote.execute });
  await assert.rejects(adapter.downloadCiphertext({ backupId: BACKUP_ID, outputRoot }), (error) => error.code === "R2_LOCAL_TARGET_EXISTS");
  assert.equal(await readFile(finalPath, "utf8"), "racing writer");
});

test("VERIFIED receipt uses its deterministic key and exact two-object postcondition", async () => {
  const fixture = await receiptFixture("VERIFIED");
  const receiptPath = await writeExternalReceiptAtomic(fixture.receipt, { outputRoot: fixture.root });
  const remote = fakeRclone({ initial: ["synthetic.age"] });
  const adapter = createR2ExternalPublicationAdapter({ mode: "integration", proofRunId: PROOF_RUN_ID, environment: environment(), execute: remote.execute });
  await adapter.publishReceipt({ receiptPath, receipt: fixture.receipt });
  assert.deepEqual([...remote.names].sort(), ["synthetic.age", "synthetic.external-receipt.json"]);
  assert.match(remote.calls[1].args[2], /integration\/GDR2-.*\/synthetic\.external-receipt\.json$/);
  assert.ok(remote.calls[1].args.includes("--immutable"));
});

test("R2 configuration cannot enter receipt or managed manifest schemas", async () => {
  const fixture = await receiptFixture();
  const manifest = createIncompleteManifest({
    backupId: BACKUP_ID,
    createdAt: new Date("2026-09-23T12:00:00.000Z"),
    toolingGitSha: TOOLING_SHA,
    toolingGitBranch: "ops/managed-free-production-pilot",
    productionRuntimeSha: RUNTIME_SHA,
  });
  const serialized = JSON.stringify({ receipt: fixture.receipt, manifest });
  for (const value of [environment().GODEL_BACKUP_R2_ENDPOINT, environment().GODEL_BACKUP_R2_BUCKET, environment().GODEL_BACKUP_R2_ACCESS_KEY_ID, environment().GODEL_BACKUP_R2_SECRET_ACCESS_KEY]) {
    assert.ok(!serialized.includes(value));
  }
});

test("missing proof confirmation causes zero Git, age, or R2 calls", async () => {
  let calls = 0;
  await assert.rejects(
    runR2CustodyProof({
      environment: environment(),
      dependencies: {
        execute: async () => { calls += 1; },
        resolveGitAuthority: async () => { calls += 1; },
        adapterFactory: () => { calls += 1; },
      },
    }),
    (error) => error.code === "R2_CUSTODY_PROOF_CONFIRMATION_REQUIRED",
  );
  assert.equal(calls, 0);
});

test("confirmed synthetic proof stays in integration mode and completes through injected local adapters", async () => {
  let sourceCiphertext;
  let verifiedReceipt;
  const modes = [];
  const result = await runR2CustodyProof({
    environment: environment({
      GODEL_MANAGED_R2_CUSTODY_PROOF_CONFIRM: "ALLOW_SYNTHETIC_R2_CUSTODY_PROOF",
      GODEL_MANAGED_PRODUCTION_RUNTIME_SHA: RUNTIME_SHA,
    }),
    dependencies: {
      createProofRunId: () => PROOF_RUN_ID,
      createBackupId: () => BACKUP_ID,
      resolveGitAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TOOLING_SHA, clean: true }),
      execute: async ({ executable, args }) => {
        if (executable === "age-keygen" && args[0] === "-o") {
          await writeFile(args[1], "AGE-SECRET-KEY-SYNTHETIC");
          return { stdout: "", stderr: "" };
        }
        if (executable === "age-keygen" && args[0] === "-y") return { stdout: `age1${"q".repeat(30)}`, stderr: "" };
        if (executable === "age") {
          const outputPath = args[args.indexOf("--output") + 1];
          await writeFile(outputPath, "synthetic ciphertext");
          sourceCiphertext = outputPath;
          return { stdout: "", stderr: "" };
        }
        throw new Error(`unexpected executable ${executable}`);
      },
      adapterFactory: ({ mode, proofRunId }) => {
        modes.push({ mode, proofRunId });
        return {
          inspectObjects: async () => ({ objectCount: 0, ciphertextPresent: false, receiptPresent: false }),
          publishCiphertext: async ({ receipt }) => assert.equal(receipt.externalPublicationStatus, "PENDING"),
          downloadCiphertext: async ({ outputRoot }) => {
            await mkdir(outputRoot, { recursive: true });
            const path = join(outputRoot, "download.age");
            await copyFile(sourceCiphertext, path);
            return path;
          },
          publishReceipt: async ({ receipt }) => { verifiedReceipt = receipt; },
          downloadReceipt: async ({ outputRoot }) => {
            const path = join(outputRoot, "downloaded-receipt.json");
            await writeFile(path, JSON.stringify(verifiedReceipt));
            return { path, receipt: verifiedReceipt };
          },
        };
      },
    },
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.remoteResidue, "EXPECTED_UNTIL_MANUAL_OPERATOR_CLEANUP");
  assert.deepEqual(modes, [{ mode: "integration", proofRunId: PROOF_RUN_ID }]);
});

test("Production adapter uses only the production namespace after exact lock confirmation", async () => {
  const remote = fakeRclone();
  const adapter = createR2ExternalPublicationAdapter({
    mode: "production",
    environment: environment({ GODEL_MANAGED_R2_PRODUCTION_LOCK_CONFIRM: R2_PRODUCTION_LOCK_CONFIRMATION }),
    execute: remote.execute,
  });
  await adapter.inspectObjects({ backupId: BACKUP_ID });
  assert.match(remote.calls[0].args[1], new RegExp(`^godelr2:godel-backups/production/${BACKUP_ID}$`));
});
