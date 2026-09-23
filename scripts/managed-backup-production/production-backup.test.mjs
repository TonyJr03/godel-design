import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  createExternalReceipt,
  validateExternalReceipt,
  verifyExternalCiphertext,
  writeExternalReceiptAtomic,
} from "../managed-backup/external-receipt.mjs";
import { runPipeline } from "../managed-backup/pipeline-runner.mjs";
import { createProductionAgeTarAdapter } from "../managed-backup/production-age-adapter.mjs";
import {
  prepareProductionBackup,
  runProductionBackup,
} from "../managed-backup/production-backup.mjs";
import { createDatabaseAndDurableInventories } from "../managed-backup/production-capture-adapter.mjs";
import {
  PRODUCTION_BACKUP_CONFIRMATION,
  buildProductionS3CommandPlan,
} from "../managed-backup/production-contract.mjs";

const PROJECT_REF = "abcdefghijklmnopqrst";
const TOOLING_SHA = "a".repeat(40);
const RUNTIME_SHA = "b".repeat(40);
const BACKUP_ID = "GDBK-20260922T120000Z-ABCDEFGH";

function environment(outputRoot) {
  return {
    PATH: process.env.PATH ?? "",
    GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM: PRODUCTION_BACKUP_CONFIRMATION,
    GODEL_MANAGED_SUPABASE_PROJECT_REF: PROJECT_REF,
    GODEL_MANAGED_PRODUCTION_RUNTIME_SHA: RUNTIME_SHA,
    GODEL_MANAGED_BACKUP_AGE_RECIPIENT: `age1${"q".repeat(30)}`,
    GODEL_MANAGED_BACKUP_OUTPUT_ROOT: outputRoot,
    SUPABASE_DB_PASSWORD: "synthetic-db-password",
    GODEL_MANAGED_STORAGE_S3_ENDPOINT: "https://storage.example.test/s3",
    GODEL_MANAGED_STORAGE_S3_REGION: "us-east-1",
    GODEL_MANAGED_STORAGE_S3_ACCESS_KEY_ID: "synthetic-access-id",
    GODEL_MANAGED_STORAGE_S3_SECRET_ACCESS_KEY: "synthetic-secret-key",
  };
}

function dependencies(overrides = {}) {
  return {
    resolveGitAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TOOLING_SHA, clean: true }),
    readLinkedProjectRef: async () => PROJECT_REF,
    ensureSafeOutputRoot: async (value) => value,
    ...overrides,
  };
}

test("absent exact confirmation stops before every local or Production adapter", async () => {
  let calls = 0;
  await assert.rejects(
    prepareProductionBackup({ environment: {}, dependencies: { resolveGitAuthority: async () => { calls += 1; } } }),
    (error) => error.code === "PRODUCTION_BACKUP_CONFIRMATION_REQUIRED",
  );
  assert.equal(calls, 0);
});

test("dirty worktree and wrong branch stop before linked project or capture", async () => {
  const outputRoot = resolve(tmpdir(), "godel-production-prep");
  for (const authority of [
    { branch: "ops/managed-free-production-pilot", head: TOOLING_SHA, clean: false, code: "DIRTY_TOOLING_WORKTREE" },
    { branch: "wrong", head: TOOLING_SHA, clean: true, code: "WRONG_TOOLING_BRANCH" },
  ]) {
    let downstream = 0;
    await assert.rejects(
      prepareProductionBackup({
        environment: environment(outputRoot),
        dependencies: dependencies({
          resolveGitAuthority: async () => authority,
          readLinkedProjectRef: async () => { downstream += 1; return PROJECT_REF; },
        }),
      }),
      (error) => error.code === authority.code,
    );
    assert.equal(downstream, 0);
  }
});

test("wrong linked project stops before output allocation and dump", async () => {
  let downstream = 0;
  await assert.rejects(
    prepareProductionBackup({
      environment: environment(resolve(tmpdir(), "godel-production-prep")),
      dependencies: dependencies({
        readLinkedProjectRef: async () => "zzzzzzzzzzzzzzzzzzzz",
        ensureSafeOutputRoot: async () => { downstream += 1; },
      }),
    }),
    (error) => error.code === "LINKED_PROJECT_MISMATCH",
  );
  assert.equal(downstream, 0);
});

test("linked database password stays in allowlisted env and never argv", async () => {
  const prepared = await prepareProductionBackup({
    environment: environment(resolve(tmpdir(), "godel-production-prep")),
    dependencies: dependencies(),
  });
  assert.ok(prepared.databasePlans.every((plan) => plan.args.includes("--linked")));
  assert.ok(prepared.databasePlans.every((plan) => !plan.args.includes("--password") && !plan.args.includes("--db-url")));
  assert.ok(prepared.databasePlans.every((plan) => !plan.args.join(" ").includes("synthetic-db-password")));
});

test("Production S3 contract rejects upload and every destructive operation", () => {
  for (const operation of ["upload-restore", "delete", "sync", "move", "purge"]) {
    assert.throws(
      () => buildProductionS3CommandPlan({ operation, remotePath: "godel-files", localPath: "D:/capture" }),
      (error) => error.code === "PRODUCTION_S3_OPERATION_FORBIDDEN",
    );
  }
  const verification = buildProductionS3CommandPlan({ operation: "verify-listing", remotePath: "godel-files" });
  assert.deepEqual(verification.args, ["size", "godelprod:godel-files", "--json"]);
});

test("missing S3 credentials or age recipient fails before Git and capture", async () => {
  for (const missing of ["GODEL_MANAGED_STORAGE_S3_ACCESS_KEY_ID", "GODEL_MANAGED_STORAGE_S3_SECRET_ACCESS_KEY", "GODEL_MANAGED_BACKUP_AGE_RECIPIENT"]) {
    const values = environment(resolve(tmpdir(), "godel-production-prep"));
    delete values[missing];
    let calls = 0;
    await assert.rejects(prepareProductionBackup({
      environment: values,
      dependencies: { resolveGitAuthority: async () => { calls += 1; } },
    }));
    assert.equal(calls, 0);
  }
});

test("output root inside repository is rejected", async () => {
  const repoRoot = process.cwd();
  await assert.rejects(
    prepareProductionBackup({ environment: environment(join(repoRoot, ".unsafe-backup")), repoRoot, dependencies: dependencies({ ensureSafeOutputRoot: undefined }) }),
    (error) => error.code === "UNSAFE_OUTPUT_ROOT",
  );
});

function captureSql() {
  const userId = "11111111-1111-4111-8111-111111111111";
  const itemId = "22222222-2222-4222-8222-222222222222";
  const archivoId = "33333333-3333-4333-8333-333333333333";
  const path = `cargas/v1/${userId}/${itemId}/hash-file.pdf`;
  return {
    path,
    sql: [
      "COPY auth.users (id, encrypted_password) FROM stdin;", `${userId}\t$2a$synthetic`, "\\.",
      "COPY auth.identities (user_id) FROM stdin;", userId, "\\.",
      "COPY storage.buckets (id) FROM stdin;", "godel-files", "\\.",
      "COPY storage.objects (bucket_id, name, metadata) FROM stdin;", `godel-files\t${path}\t{"size":3}`, "\\.",
      "COPY public.archivo_carga_items (id, status, archivo_id, object_path, expected_size) FROM stdin;", `${itemId}\tcommitted\t${archivoId}\t${path}\t3`, "\\.",
      "COPY public.archivos (id, bucket, file_path, file_size) FROM stdin;", `${archivoId}\tgodel-files\t${path}\t3`, "\\.",
      "COPY private.runtime_state (id) FROM stdin;", "\\.", "",
    ].join("\n"),
  };
}

test("real COPY adapter inventories every table and durable mismatch remains incomplete", () => {
  const { sql, path } = captureSql();
  const captured = [{ path, size: 3, sha256: "c".repeat(64) }];
  const valid = createDatabaseAndDurableInventories({ dumpText: sql, capturedObjects: captured });
  assert.ok(valid.databaseCounts.tables.some((table) => table.schema === "auth" && table.name === "users"));
  assert.ok(valid.databaseCounts.tables.some((table) => table.schema === "private" && table.name === "runtime_state"));
  assert.equal(valid.durable.objectCount, 1);
  assert.throws(
    () => createDatabaseAndDurableInventories({ dumpText: sql, capturedObjects: [{ ...captured[0], size: 4 }] }),
    (error) => error.code === "STORAGE_SIZE_MISMATCH",
  );
});

test("Production age adapter streams tar with a public recipient and no identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-production-age-"));
  const source = join(root, "source");
  const ciphertext = join(root, "bundle.age");
  await mkdir(source);
  await writeFile(join(source, "artifact.txt"), "plain");
  const calls = [];
  const adapter = createProductionAgeTarAdapter({
    recipient: `age1${"q".repeat(30)}`,
    cwd: root,
    pipeline: async (plan) => {
      calls.push(plan);
      await writeFile(ciphertext, "age-encryption.org/v1\nsynthetic-ciphertext");
      return { stdout: "", stderr: "" };
    },
  });
  await adapter.encrypt({ sourceDirectory: source, outputPath: ciphertext });
  assert.equal((await adapter.verifyCiphertext({ ciphertextPath: ciphertext })).verified, true);
  assert.deepEqual(calls[0].left.args.slice(0, 2), ["-cf", "-"]);
  assert.ok(calls[0].right.args.includes("--recipient"));
  assert.ok(!calls[0].right.args.includes("--identity"));
});

test("external receipt is strict, no-replace, and verifies downloaded ciphertext", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-external-receipt-"));
  const ciphertextPath = join(root, `${BACKUP_ID}.age`);
  await writeFile(ciphertextPath, "ciphertext");
  const receipt = await createExternalReceipt({ backupId: BACKUP_ID, toolingGitSha: TOOLING_SHA, productionRuntimeSha: RUNTIME_SHA, ciphertextPath });
  assert.equal(validateExternalReceipt(receipt), receipt);
  assert.throws(() => validateExternalReceipt({ ...receipt, projectRef: PROJECT_REF }), /unexpected fields/);
  const receiptPath = await writeExternalReceiptAtomic(receipt, { outputRoot: root });
  await assert.rejects(writeExternalReceiptAtomic(receipt, { outputRoot: root }), (error) => error.code === "EXTERNAL_RECEIPT_ALREADY_EXISTS");
  assert.equal(JSON.parse(await readFile(receiptPath, "utf8")).externalPublicationStatus, "PENDING");
  assert.equal((await verifyExternalCiphertext(receipt, ciphertextPath)).verified, true);
  await writeFile(ciphertextPath, "tampered");
  await assert.rejects(verifyExternalCiphertext(receipt, ciphertextPath), (error) => error.code === "EXTERNAL_CIPHERTEXT_MISMATCH");
});

test("pipeline redacts explicit and allowlisted environment secrets from output", async () => {
  const explicit = "pipeline-explicit-secret";
  const environmentSecret = "pipeline-environment-secret";
  const result = await runPipeline({
    operation: "redaction contract",
    left: { executable: process.execPath, args: ["-e", "process.stdout.write(process.env.API_TOKEN + ':' + process.env.SAFE_VALUE)"] },
    right: { executable: process.execPath, args: ["-e", "process.stdin.pipe(process.stdout)"] },
    cwd: process.cwd(),
    allowedEnvironment: { API_TOKEN: environmentSecret, SAFE_VALUE: explicit },
    secretValues: [explicit],
  });
  assert.equal(result.stdout, "[REDACTED]:[REDACTED]");
});

test("pipeline redacts explicit and allowlisted environment secrets from errors", async () => {
  const explicit = "pipeline-explicit-error-secret";
  const environmentSecret = "pipeline-environment-error-secret";
  await assert.rejects(
    runPipeline({
      operation: "redaction error contract",
      left: { executable: process.execPath, args: ["-e", "process.stderr.write(process.env.API_TOKEN + ':' + process.env.SAFE_VALUE);process.exit(2)"] },
      right: { executable: process.execPath, args: ["-e", "process.stdin.resume()"] },
      cwd: process.cwd(),
      allowedEnvironment: { API_TOKEN: environmentSecret, SAFE_VALUE: explicit },
      secretValues: [explicit],
    }),
    (error) => error.stderrSummary === "[REDACTED]:[REDACTED]" && !error.message.includes(explicit) && !error.message.includes(environmentSecret),
  );
});

test("missing external destination prepares tooling but blocks capture execution", async () => {
  let captures = 0;
  const prepared = await runProductionBackup({
    environment: environment(resolve(tmpdir(), "godel-production-prep")),
    dependencies: dependencies(),
    captureAdapter: { captureReadOnly: async () => { captures += 1; } },
  });
  assert.equal(prepared.status, "PREPARED");
  assert.equal(prepared.executionAuthorized, false);
  assert.equal(prepared.executionBlocker, "EXTERNAL_CUSTODY_DESTINATION_PENDING");
  assert.equal(captures, 0);
  assert.equal((await readdir(tmpdir())).includes("definitely-not-created-by-this-test"), false);
});
