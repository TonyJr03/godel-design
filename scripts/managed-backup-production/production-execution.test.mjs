import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { buildSupabaseDatabaseEnvironment } from "../managed-backup/command-plans.mjs";
import { createExternalReceipt } from "../managed-backup/external-receipt.mjs";
import {
  PRODUCTION_BUCKET_ALLOWED_MIME_TYPES,
  admitRepoLocalSupabaseCli,
  admitProductionTools,
  buildRepoLocalSupabaseDatabasePlans,
  createProductionConfigurationSnapshot,
  readProductionExecutionConfiguration,
  runProductionExecution,
  sanitizeProductionExecutionFailure,
} from "../managed-backup/production-execution.mjs";
import {
  executePreparedProductionBackup,
  prepareProductionBackup,
  verifyPublishedExternalReceipt,
} from "../managed-backup/production-backup.mjs";
import {
  PRODUCTION_BACKUP_CONFIRMATION,
  PRODUCTION_WRITER_FREEZE_CONFIRMATION,
} from "../managed-backup/production-contract.mjs";
import { R2_PRODUCTION_LOCK_CONFIRMATION } from "../managed-backup/r2-external-custody.mjs";

const TOOLING_SHA = "a".repeat(40);
const RUNTIME_SHA = "b".repeat(40);
const BACKUP_ID = "GDBK-20260924T120000Z-ABCDEFGH";

function environment(overrides = {}) {
  return {
    PATH: process.env.PATH ?? "",
    GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM: PRODUCTION_BACKUP_CONFIRMATION,
    GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM: PRODUCTION_WRITER_FREEZE_CONFIRMATION,
    GODEL_MANAGED_R2_PRODUCTION_LOCK_CONFIRM: R2_PRODUCTION_LOCK_CONFIRMATION,
    GODEL_MANAGED_SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
    GODEL_MANAGED_PRODUCTION_RUNTIME_SHA: RUNTIME_SHA,
    GODEL_MANAGED_BACKUP_AGE_RECIPIENT: `age1${"q".repeat(30)}`,
    GODEL_MANAGED_BACKUP_OUTPUT_ROOT: resolve(tmpdir(), "godel-production-execution"),
    SUPABASE_DB_PASSWORD: "synthetic-db-password",
    GODEL_MANAGED_STORAGE_S3_ENDPOINT: "https://storage.example.test/s3",
    GODEL_MANAGED_STORAGE_S3_REGION: "us-east-1",
    GODEL_MANAGED_STORAGE_S3_ACCESS_KEY_ID: "synthetic-storage-access",
    GODEL_MANAGED_STORAGE_S3_SECRET_ACCESS_KEY: "synthetic-storage-secret",
    GODEL_BACKUP_R2_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    GODEL_BACKUP_R2_BUCKET: "godel-backups",
    GODEL_BACKUP_R2_ACCESS_KEY_ID: "synthetic-r2-access",
    GODEL_BACKUP_R2_SECRET_ACCESS_KEY: "synthetic-r2-secret",
    GODEL_MANAGED_SUPABASE_REGION: "us-east-1",
    GODEL_MANAGED_AUTH_SITE_URL: "https://app.example.test/",
    GODEL_MANAGED_AUTH_REDIRECT_ALLOWLIST_JSON: "[]",
    ...overrides,
  };
}

function successfulDependencies(observed = {}) {
  return {
    admitSupabaseCli: async () => ({ cliPath: resolve("node_modules/supabase/dist/supabase.js"), version: "2.109.1" }),
    admitTools: async () => [
      { name: "age", present: true, version: "1.3.1" },
      { name: "node", present: true, version: process.version },
      { name: "rclone", present: true, version: "1.75.1" },
      { name: "supabase", present: true, version: "2.109.1" },
    ],
    resolveGitAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TOOLING_SHA, clean: true }),
    captureAdapterFactory: (options) => { observed.captureOptions = options; return { captureReadOnly: async () => ({}) }; },
    r2AdapterFactory: (options) => {
      observed.r2Options = options;
      return {
        publishCiphertext: async () => undefined,
        downloadCiphertext: async () => undefined,
        publishReceipt: async () => undefined,
        downloadReceipt: async () => undefined,
      };
    },
    runBackup: async (options) => {
      observed.runOptions = options;
      return { backupId: BACKUP_ID, externalPublication: "VERIFIED", warnings: [] };
    },
  };
}

for (const [name, variable, code] of [
  ["primary", "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM", "PRODUCTION_BACKUP_CONFIRMATION_REQUIRED"],
  ["writer freeze", "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM", "WRITER_FREEZE_CONFIRMATION_REQUIRED"],
  ["R2 lock", "GODEL_MANAGED_R2_PRODUCTION_LOCK_CONFIRM", "R2_PRODUCTION_LOCK_CONFIRMATION_REQUIRED"],
]) {
  test(`missing ${name} confirmation stops before adapters and remote work`, async () => {
    const values = environment();
    delete values[variable];
    let calls = 0;
    await assert.rejects(runProductionExecution({
      environment: values,
      dependencies: { admitSupabaseCli: async () => { calls += 1; } },
    }), (error) => error.code === code);
    assert.equal(calls, 0);
  });
}

test("private age identity variables and values are rejected before adapters", async () => {
  for (const values of [
    environment({ GODEL_MANAGED_BACKUP_AGE_IDENTITY_FILE: "protected.agekey" }),
    environment({ SYNTHETIC_INPUT: "AGE-SECRET-KEY-1SYNTHETIC" }),
  ]) {
    let calls = 0;
    await assert.rejects(runProductionExecution({
      environment: values,
      dependencies: { admitSupabaseCli: async () => { calls += 1; } },
    }), (error) => error.code === "PRIVATE_AGE_IDENTITY_FORBIDDEN");
    assert.equal(calls, 0);
  }
});

test("repo-local Supabase plans use node directly and keep DB password out of argv", () => {
  const cliPath = resolve("node_modules/supabase/dist/supabase.js");
  const plans = buildRepoLocalSupabaseDatabasePlans({ cliPath });
  assert.ok(plans.every((plan) => plan.executable === process.execPath));
  assert.ok(plans.every((plan) => plan.args[0] === cliPath && plan.args.slice(1, 4).includes("--linked")));
  assert.ok(plans.every((plan) => plan.shell === undefined));
  const transport = buildSupabaseDatabaseEnvironment({ target: "linked", databasePassword: "env-only-password", sourceEnvironment: {} });
  assert.equal(transport.allowedEnvironment.SUPABASE_DB_PASSWORD, "env-only-password");
  assert.ok(plans.every((plan) => !plan.args.join(" ").includes("env-only-password") && !plan.args.includes("--password") && !plan.args.includes("--db-url")));
});

test("repo-local Supabase CLI admission rejects missing and linked files", async () => {
  for (const state of [null, { isFile: () => true, isSymbolicLink: () => true }]) {
    await assert.rejects(admitRepoLocalSupabaseCli({
      repoRoot: process.cwd(),
      inspect: async () => state ?? Promise.reject(Object.assign(new Error("missing"), { code: "ENOENT" })),
      read: async () => JSON.stringify({ version: "2.109.1" }),
    }), (error) => error.code === "SUPABASE_CLI_REQUIRED");
  }
});

test("tool admission pins age/rclone and stops on missing age, rclone, or tar", async () => {
  const output = { age: "age 1.3.1", rclone: "rclone v1.75.1", tar: "tar 1.35" };
  const execute = async ({ executable }) => ({ stdout: output[executable], stderr: "" });
  const admitted = await admitProductionTools({ environment: {}, repoRoot: process.cwd(), execute, supabaseVersion: "2.109.1" });
  assert.deepEqual(admitted.map((item) => item.name), ["age", "node", "rclone", "supabase"]);
  for (const missing of ["age", "rclone", "tar"]) {
    await assert.rejects(admitProductionTools({
      environment: {}, repoRoot: process.cwd(), supabaseVersion: "2.109.1",
      execute: async ({ executable }) => {
        if (executable === missing) throw new Error("missing");
        return { stdout: output[executable], stderr: "" };
      },
    }), (error) => error.code === "TOOL_REQUIRED");
  }
});

test("tool version mismatch fails before Production adapters", async () => {
  await assert.rejects(admitProductionTools({
    environment: {}, repoRoot: process.cwd(), supabaseVersion: "2.109.1",
    execute: async ({ executable }) => ({ stdout: executable === "age" ? "age 1.3.2" : executable === "rclone" ? "rclone v1.75.1" : "tar 1.35", stderr: "" }),
  }), (error) => error.code === "TOOL_VERSION_MISMATCH");
});

test("tool admission failure in the composed harness stops before adapters", async () => {
  let adapterCalls = 0;
  const dependencies = successfulDependencies();
  dependencies.admitTools = async () => { throw Object.assign(new Error("unavailable"), { code: "TOOL_REQUIRED" }); };
  dependencies.captureAdapterFactory = () => { adapterCalls += 1; };
  dependencies.r2AdapterFactory = () => { adapterCalls += 1; };
  await assert.rejects(runProductionExecution({ environment: environment(), dependencies }), (error) => error.code === "TOOL_REQUIRED");
  assert.equal(adapterCalls, 0);
});

for (const [name, values] of [
  ["region", environment({ GODEL_MANAGED_SUPABASE_REGION: "INVALID REGION" })],
  ["Site URL", environment({ GODEL_MANAGED_AUTH_SITE_URL: "http://app.example.test" })],
  ["redirect JSON", environment({ GODEL_MANAGED_AUTH_REDIRECT_ALLOWLIST_JSON: "not-json" })],
  ["redirect URL", environment({ GODEL_MANAGED_AUTH_REDIRECT_ALLOWLIST_JSON: '["http://app.example.test/callback"]' })],
]) {
  test(`invalid ${name} fails before Production adapters`, async () => {
    let calls = 0;
    await assert.rejects(runProductionExecution({
      environment: values,
      dependencies: { admitSupabaseCli: async () => { calls += 1; } },
    }), (error) => error.code === "PRODUCTION_EXECUTION_CONFIG_INVALID");
    assert.equal(calls, 0);
  });
}

test("configuration snapshot matches the strict schema and migration 04 MIME baseline", async () => {
  const configuration = readProductionExecutionConfiguration(environment({
    GODEL_MANAGED_AUTH_REDIRECT_ALLOWLIST_JSON: '["https://app.example.test/callback"]',
  }));
  const snapshot = createProductionConfigurationSnapshot({ configuration, productionRuntimeSha: RUNTIME_SHA, toolingGitSha: TOOLING_SHA });
  assert.equal(snapshot.authSiteUrl.classification, "ENCRYPTED_INTERNAL_ONLY");
  assert.equal(snapshot.bucket.fileSizeLimit, 20_971_520);
  assert.deepEqual(snapshot.requiredExtensions, ["pgcrypto"]);
  assert.deepEqual(snapshot.realtime, { required: false, publications: [] });
  const migration = await readFile(resolve("supabase/migrations/20260811131827_04_storage.sql"), "utf8");
  const migrationMimeTypes = [...migration.matchAll(/'(application\/[a-z0-9.+-]+|image\/[a-z0-9.+-]+)'/g)]
    .map((match) => match[1])
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right, "en"));
  assert.deepEqual(PRODUCTION_BUCKET_ALLOWED_MIME_TYPES, migrationMimeTypes);
});

test("harness can construct only Production R2 and returns sanitized success", async () => {
  const observed = {};
  const result = await runProductionExecution({ environment: environment(), dependencies: successfulDependencies(observed) });
  assert.equal(observed.r2Options.mode, "production");
  assert.deepEqual(Object.keys(result), ["status", "backupId", "externalPublication", "toolingGitSha", "productionRuntimeSha", "warnings"]);
  assert.deepEqual(result, {
    status: "PASS", backupId: BACKUP_ID, externalPublication: "VERIFIED",
    toolingGitSha: TOOLING_SHA, productionRuntimeSha: RUNTIME_SHA, warnings: [],
  });
  assert.equal(JSON.stringify(result).includes("abcdefghijklmnopqrst"), false);
  assert.equal(Object.hasOwn(observed.runOptions.dependencies, "buildDatabasePlans"), true);
});

test("harness requires Productive VERIFIED receipt roundtrip", async () => {
  const dependencies = successfulDependencies();
  dependencies.r2AdapterFactory = () => ({
    publishCiphertext: async () => undefined,
    downloadCiphertext: async () => undefined,
    publishReceipt: async () => undefined,
  });
  let executions = 0;
  dependencies.runBackup = async () => { executions += 1; };
  await assert.rejects(runProductionExecution({ environment: environment(), dependencies }), (error) => error.code === "EXTERNAL_RECEIPT_ROUNDTRIP_REQUIRED");
  assert.equal(executions, 0);
});

test("external ciphertext and VERIFIED receipt roundtrip are exact", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-production-roundtrip-"));
  const finalCiphertextPath = join(root, `${BACKUP_ID}.age`);
  const ciphertextPath = join(root, `${BACKUP_ID}.r2-download.age`);
  await writeFile(finalCiphertextPath, "verified-ciphertext");
  await writeFile(ciphertextPath, "verified-ciphertext");
  const pending = await createExternalReceipt({ backupId: BACKUP_ID, toolingGitSha: TOOLING_SHA, productionRuntimeSha: RUNTIME_SHA, ciphertextPath: finalCiphertextPath });
  const receipt = Object.freeze({ ...pending, externalPublicationStatus: "VERIFIED" });
  const downloadedReceiptPath = join(root, `${BACKUP_ID}.r2-external-receipt.json`);
  await writeFile(downloadedReceiptPath, JSON.stringify(receipt));
  const custody = { downloadReceipt: async () => ({ path: downloadedReceiptPath, receipt }) };
  const roundtrip = await verifyPublishedExternalReceipt({
    custody, backupId: BACKUP_ID, outputRoot: root, receipt, downloadedCiphertextPath: ciphertextPath,
    cleanupVerificationCopies: async () => { throw new Error("synthetic cleanup failure"); },
  });
  assert.equal(roundtrip.cleanupWarning, "EXTERNAL_VERIFICATION_CLEANUP_PENDING");
  await writeFile(ciphertextPath, "tampered");
  await assert.rejects(verifyPublishedExternalReceipt({
    custody, backupId: BACKUP_ID, outputRoot: root, receipt, downloadedCiphertextPath: ciphertextPath,
    cleanupVerificationCopies: async () => undefined,
  }), (error) => error.code === "EXTERNAL_CIPHERTEXT_MISMATCH");
});

test("post-verification cleanup failure preserves COMPLETE backup with a warning", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-production-cleanup-warning-"));
  let publishedReceipt;
  const custody = {
    publishCiphertext: async () => undefined,
    downloadCiphertext: async ({ backupId }) => {
      const path = join(root, `${backupId}.r2-download.age`);
      await writeFile(path, "verified-ciphertext");
      return path;
    },
    publishReceipt: async ({ receipt }) => { publishedReceipt = receipt; },
    downloadReceipt: async ({ backupId }) => {
      const path = join(root, `${backupId}.unexpected-receipt-copy.json`);
      await writeFile(path, JSON.stringify(publishedReceipt));
      return { path, receipt: publishedReceipt };
    },
  };
  const values = environment({ GODEL_MANAGED_BACKUP_OUTPUT_ROOT: root });
  const prepared = await prepareProductionBackup({
    environment: values,
    repoRoot: process.cwd(),
    externalPublicationAdapter: custody,
    dependencies: {
      resolveGitAuthority: async () => ({ branch: "ops/managed-free-production-pilot", head: TOOLING_SHA, clean: true }),
      readLinkedProjectRef: async () => values.GODEL_MANAGED_SUPABASE_PROJECT_REF,
      ensureSafeOutputRoot: async () => root,
    },
  });
  const timestamp = "2026-09-24T12:00:00.000Z";
  const result = await executePreparedProductionBackup(prepared, {
    now: () => new Date(timestamp),
    captureAdapter: {
      captureReadOnly: async () => ({
        artifacts: [], databaseCounts: {}, authInventory: {}, storageInventory: {}, configurationSnapshot: {}, toolVersions: [],
        freeze: { dbStartedAt: timestamp, dbEndedAt: timestamp, storageStartedAt: timestamp, storageEndedAt: timestamp },
      }),
    },
    bundle: async ({ backupId }) => {
      const finalPath = join(root, `${backupId}.age`);
      await writeFile(finalPath, "verified-ciphertext");
      return { backupId, finalPath, manifest: { status: "COMPLETE" }, warnings: [] };
    },
  });
  assert.equal(result.manifest.status, "COMPLETE");
  assert.equal(result.externalPublication, "VERIFIED");
  assert.deepEqual(result.warnings, ["EXTERNAL_VERIFICATION_CLEANUP_PENDING"]);
});

test("private recovery identity is neither configured nor required", async () => {
  const values = environment();
  assert.equal(Object.keys(values).some((key) => /AGE.*IDENTITY/.test(key)), false);
  await runProductionExecution({ environment: values, dependencies: successfulDependencies() });
});

test("failure output is sanitized", () => {
  const failure = sanitizeProductionExecutionFailure(Object.assign(new Error("secret endpoint https://private.example"), { code: "TOOL_REQUIRED" }));
  assert.deepEqual(failure, { status: "FAIL", code: "TOOL_REQUIRED", message: "Production backup execution failed safely" });
  assert.equal(JSON.stringify(failure).includes("private.example"), false);
});
