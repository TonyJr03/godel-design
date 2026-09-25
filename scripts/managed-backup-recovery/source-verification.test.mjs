import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import test from "node:test";

import {
  admitExternalRecoveryCiphertext,
  admitExternalRecoveryReceipt,
  assertRecoveryOnlySourceAdapter,
  runManagedRecoverySourceVerification,
  withVerifiedManagedRecoverySource,
} from "./source-verification.mjs";
import { runCommand } from "../managed-backup/command-runner.mjs";
import { preflightManagedRecoveryTools } from "./tool-preflight.mjs";
import {
  TEST_BACKUP_ID,
  TEST_SESSION_ID,
  createValidBundleFixture,
  tarFromDirectoryFiles,
  validReceipt,
} from "./test-helpers.mjs";

const OTHER_BACKUP_ID = "GDBK-20260925T120001Z-BBBBBBBB";
const ciphertext = Buffer.from("synthetic ciphertext");

test("restore tool preflight reports sanitized versions and enforces governed age", async () => {
  const calls = [];
  const versions = { age: "age 1.3.1", tar: "tar (GNU tar) 1.35", rclone: "rclone v1.75.1", docker: "26.1.4/26.1.4" };
  const result = await preflightManagedRecoveryTools({
    repoRoot: process.cwd(),
    environment: { PATH: process.env.PATH ?? "" },
    admitSupabaseCli: async () => ({ version: "2.109.1", cliPath: "not-exposed" }),
    execute: async (plan) => {
      calls.push(plan);
      return { stdout: versions[plan.executable], stderr: "" };
    },
  });
  assert.deepEqual(result.map(({ name, present }) => [name, present]), [
    ["node", true], ["age", true], ["tar", true], ["rclone", true], ["docker", true], ["supabase", true],
  ]);
  assert.equal(result.find((entry) => entry.name === "age").version, "1.3.1");
  assert.deepEqual(calls.map((call) => call.executable), ["age", "tar", "rclone", "docker"]);
});

test("restore tool preflight fails closed for missing or wrong age before workspace work", async () => {
  await assert.rejects(
    preflightManagedRecoveryTools({
      repoRoot: process.cwd(),
      admitSupabaseCli: async () => ({ version: "2.109.1" }),
      execute: async (plan) => {
        if (plan.executable === "age") throw Object.assign(new Error("missing"), { code: "EXECUTABLE_UNAVAILABLE" });
        return { stdout: "1.2.3", stderr: "" };
      },
    }),
    (error) => error.code === "RECOVERY_TOOL_REQUIRED",
  );
  await assert.rejects(
    preflightManagedRecoveryTools({
      repoRoot: process.cwd(),
      admitSupabaseCli: async () => ({ version: "2.109.1" }),
      execute: async (plan) => ({ stdout: plan.executable === "age" ? "age 1.2.0" : "1.2.3", stderr: "" }),
    }),
    (error) => error.code === "RECOVERY_AGE_VERSION_MISMATCH",
  );
});

test("receipt and ciphertext admission requires COMPLETE, VERIFIED, exact identity, filename, size, and SHA", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-source-admission-"));
  const pathname = join(root, `${TEST_BACKUP_ID}.age`);
  await writeFile(pathname, ciphertext);
  const receipt = validReceipt({ ciphertext });
  assert.equal(admitExternalRecoveryReceipt(receipt, TEST_BACKUP_ID), receipt);
  assert.equal((await admitExternalRecoveryCiphertext({ receipt, selectedBackupId: TEST_BACKUP_ID, ciphertextPath: pathname })).status, "VERIFIED");

  assert.throws(() => admitExternalRecoveryReceipt(receipt, OTHER_BACKUP_ID), (error) => error.code === "RECOVERY_RECEIPT_IDENTITY_MISMATCH");
  assert.throws(
    () => admitExternalRecoveryReceipt(validReceipt({ ciphertext, externalPublicationStatus: "PENDING" }), TEST_BACKUP_ID),
    (error) => error.code === "RECOVERY_RECEIPT_STATUS_INVALID",
  );
  const wrongSize = { ...receipt, ciphertextSize: receipt.ciphertextSize + 1 };
  await assert.rejects(admitExternalRecoveryCiphertext({ receipt: wrongSize, selectedBackupId: TEST_BACKUP_ID, ciphertextPath: pathname }));
  const wrongSha = { ...receipt, ciphertextSha256: "f".repeat(64) };
  await assert.rejects(admitExternalRecoveryCiphertext({ receipt: wrongSha, selectedBackupId: TEST_BACKUP_ID, ciphertextPath: pathname }));
  const wrongName = join(root, "arbitrary.age");
  await writeFile(wrongName, ciphertext);
  await assert.rejects(admitExternalRecoveryCiphertext({ receipt, selectedBackupId: TEST_BACKUP_ID, ciphertextPath: wrongName }), (error) => error.code === "RECOVERY_CIPHERTEXT_FILENAME_MISMATCH");
});

test("source adapter contract rejects any extra or mutating surface", () => {
  const readOnly = { inspectCandidate() {}, downloadReceipt() {}, downloadCiphertext() {} };
  assert.equal(assertRecoveryOnlySourceAdapter(readOnly), readOnly);
  for (const method of ["upload", "publish", "delete", "move", "purge", "sync"]) {
    assert.throws(() => assertRecoveryOnlySourceAdapter({ ...readOnly, [method]() {} }), (error) => error.code === "RECOVERY_SOURCE_ADAPTER_INVALID");
  }
});

test("runner redacts recovery paths without treating ordinary local paths as secrets", async () => {
  const sensitivePath = join(tmpdir(), "private-recovery-session");
  const result = await runCommand({
    operation: "recovery path redaction test",
    executable: process.execPath,
    args: ["-e", "process.stdout.write(process.argv[1])", sensitivePath],
    cwd: process.cwd(),
    allowedEnvironment: {},
    redactionValues: [sensitivePath],
  });
  assert.equal(result.stdout, "[REDACTED]");
});

test("orchestrator tool failure stops before creating plaintext or target layout", async () => {
  let sessionCalls = 0;
  await assert.rejects(runManagedRecoverySourceVerification({
    selectedBackupId: TEST_BACKUP_ID,
    recoveryParent: join(tmpdir(), "unused-recovery-parent"),
    backupOutputRoot: join(tmpdir(), "unused-backup-output"),
    repoRoot: process.cwd(),
    sourceAdapter: { async inspectCandidate() {}, async downloadReceipt() {}, async downloadCiphertext() {} },
    decryptAdapter: { async decryptToTar() {} },
    dependencies: {
      preflight: async () => { throw Object.assign(new Error("missing tool"), { code: "RECOVERY_TOOL_REQUIRED" }); },
      createSession: async () => { sessionCalls += 1; },
    },
  }), (error) => error.code === "RECOVERY_TOOL_REQUIRED");
  assert.equal(sessionCalls, 0);
});

async function readTree(root, directory = root, output = new Map()) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const pathname = join(directory, entry.name);
    if (entry.isDirectory()) await readTree(root, pathname, output);
    else output.set(relative(root, pathname).split(sep).join("/"), await readFile(pathname));
  }
  return output;
}

async function orchestrationFixture() {
  const base = await mkdtemp(join(tmpdir(), "godel-source-orchestrator-"));
  const repoRoot = join(base, "repo");
  const backupOutputRoot = join(base, "backup-output");
  const recoveryParent = join(base, "recovery");
  const custody = join(base, "custody");
  await Promise.all([mkdir(repoRoot), mkdir(backupOutputRoot), mkdir(custody)]);
  const identityPath = join(custody, "identity.txt");
  await writeFile(identityPath, "synthetic identity");
  const bundle = await createValidBundleFixture();
  const archive = await tarFromDirectoryFiles(await readTree(bundle.root));
  return { base, repoRoot, backupOutputRoot, recoveryParent, identityPath, archive, receipt: validReceipt({ ciphertext }) };
}

function syntheticSourceFactory(fixture, { candidate = { status: "VERIFIED", objectCount: 2 } } = {}) {
  return ({ downloadDirectory }) => ({
    async inspectCandidate() { return candidate; },
    async downloadReceipt() {
      const path = join(downloadDirectory, `${TEST_BACKUP_ID}.external-receipt.json`);
      await writeFile(path, JSON.stringify(fixture.receipt), { flag: "wx" });
      return { path, receipt: fixture.receipt };
    },
    async downloadCiphertext() {
      const path = join(downloadDirectory, `${TEST_BACKUP_ID}.age`);
      await writeFile(path, ciphertext, { flag: "wx" });
      return path;
    },
  });
}

test("synthetic source orchestrator verifies and cleans without target mutation or SQL execution", async () => {
  const fixture = await orchestrationFixture();
  const result = await runManagedRecoverySourceVerification({
    selectedBackupId: TEST_BACKUP_ID,
    recoveryParent: fixture.recoveryParent,
    backupOutputRoot: fixture.backupOutputRoot,
    repoRoot: fixture.repoRoot,
    environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: fixture.identityPath },
    sourceAdapterFactory: syntheticSourceFactory(fixture),
    decryptAdapter: { async decryptToTar({ archivePath }) { await writeFile(archivePath, fixture.archive, { flag: "wx" }); } },
    dependencies: {
      sessionId: TEST_SESSION_ID,
      preflight: async () => Object.freeze([{ name: "age", present: true, version: "1.3.1" }]),
    },
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.source.ciphertext, "VERIFIED");
  assert.equal(result.bundle.storageObjectCount, 0);
  assert.equal(result.targetMutations, 0);
  assert.equal(result.sqlExecutions, 0);
  assert.ok(!JSON.stringify(result).includes(TEST_BACKUP_ID));
  assert.ok(!JSON.stringify(result).includes(fixture.identityPath));
  await assert.rejects(access(join(fixture.recoveryParent, `recovery-session-${TEST_SESSION_ID}`)));
});

test("official source callback returns only its sanitized contract after lifecycle cleanup", async () => {
  const fixture = await orchestrationFixture();
  const options = {
    selectedBackupId: TEST_BACKUP_ID,
    recoveryParent: fixture.recoveryParent,
    backupOutputRoot: fixture.backupOutputRoot,
    repoRoot: fixture.repoRoot,
    environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: fixture.identityPath },
    sourceAdapterFactory: syntheticSourceFactory(fixture),
    decryptAdapter: { async decryptToTar({ archivePath }) { await writeFile(archivePath, fixture.archive, { flag: "wx" }); } },
    dependencies: { sessionId: TEST_SESSION_ID, preflight: async () => [] },
  };
  const result = await withVerifiedManagedRecoverySource(options, async (context) => {
    assert.equal(context.sql.managedData.status, "ADMITTED");
    return { status: "READY", phase: "TARGET_PLAN", remoteActivity: 0, realTargetStarts: 0, targetMutations: 0, sqlExecutions: 0, realR2Reads: 0, realAgeDecrypts: 0 };
  });
  assert.deepEqual(result, { status: "READY", phase: "TARGET_PLAN", remoteActivity: 0, realTargetStarts: 0, targetMutations: 0, sqlExecutions: 0, realR2Reads: 0, realAgeDecrypts: 0 });
  const publicText = JSON.stringify(result);
  for (const confidential of [fixture.identityPath, TEST_BACKUP_ID, "identity-placeholder", "hash-placeholder", "database/managed-data.sql", "bundle"]) assert.ok(!publicText.includes(confidential));
  await assert.rejects(access(join(fixture.recoveryParent, `recovery-session-${TEST_SESSION_ID}`)));

  await assert.rejects(withVerifiedManagedRecoverySource(options, async (context) => ({ status: "READY", bundleRoot: context.bundleRoot })), { code: "RECOVERY_SOURCE_CONSUMER_RESULT_INVALID" });
  await assert.rejects(access(join(fixture.recoveryParent, `recovery-session-${TEST_SESSION_ID}`)));
});

test("source orchestrator cleans its session after verifier failure", async () => {
  const fixture = await orchestrationFixture();
  await assert.rejects(runManagedRecoverySourceVerification({
    selectedBackupId: TEST_BACKUP_ID,
    recoveryParent: fixture.recoveryParent,
    backupOutputRoot: fixture.backupOutputRoot,
    repoRoot: fixture.repoRoot,
    environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: fixture.identityPath },
    sourceAdapterFactory: syntheticSourceFactory(fixture, { candidate: { status: "FAIL", objectCount: 1 } }),
    decryptAdapter: { async decryptToTar() {} },
    dependencies: { sessionId: TEST_SESSION_ID, preflight: async () => [] },
  }));
  await assert.rejects(access(join(fixture.recoveryParent, `recovery-session-${TEST_SESSION_ID}`)));
});

test("source orchestrator makes an injected cleanup failure override PASS visibly", async () => {
  const fixture = await orchestrationFixture();
  await assert.rejects(
    runManagedRecoverySourceVerification({
      selectedBackupId: TEST_BACKUP_ID,
      recoveryParent: fixture.recoveryParent,
      backupOutputRoot: fixture.backupOutputRoot,
      repoRoot: fixture.repoRoot,
      environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: fixture.identityPath },
      sourceAdapterFactory: syntheticSourceFactory(fixture),
      decryptAdapter: { async decryptToTar({ archivePath }) { await writeFile(archivePath, fixture.archive, { flag: "wx" }); } },
      dependencies: {
        sessionId: TEST_SESSION_ID,
        preflight: async () => [],
        cleanup: async () => { throw Object.assign(new Error("synthetic cleanup failure"), { code: "SYNTHETIC_CLEANUP_FAILURE" }); },
      },
    }),
    (error) => error.code === "RECOVERY_CLEANUP_INCOMPLETE" && error.cleanupCode === "SYNTHETIC_CLEANUP_FAILURE",
  );
  await rm(join(fixture.recoveryParent, `recovery-session-${TEST_SESSION_ID}`), { recursive: true, force: true });
});
