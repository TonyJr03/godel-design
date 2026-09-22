import assert from "node:assert/strict";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createManagedBackupBundle } from "./bundle.mjs";
import { cleanupPlaintextStaging } from "./safety.mjs";

const TOOLING_SHA = "2d8615f3e54d7e95e621d8f0267307d4d5734481";
const RUNTIME_SHA = "01552f8bee59b5f9982a2d722e39795461918f43";
const HASH = "a".repeat(64);
const BACKUP_ID = "GDBK-20260922T120000Z-AAAAAAAA";

function input(outputRoot, encryptionAdapter) {
  return {
    outputRoot,
    repoRoot: process.cwd(),
    backupId: BACKUP_ID,
    createdAt: new Date("2026-09-22T12:00:00Z"),
    toolingGitSha: TOOLING_SHA,
    toolingGitBranch: "ops/managed-free-production-pilot",
    productionRuntimeSha: RUNTIME_SHA,
    databaseCounts: { tables: [{ schema: "public", name: "archivos", rowCount: 1 }] },
    authInventory: {
      schemaVersion: 1,
      tables: { users: { present: true, count: 1 }, identities: { present: true, count: 1 } },
      assertions: { uuidContinuityAvailable: true, encryptedPasswordCoverageAvailable: true },
      ephemeralState: { sessions: "excluded", refreshTokens: "excluded", otpFlowState: "excluded" },
    },
    storageInventory: {
      schemaVersion: 1,
      bucket: "godel-files",
      items: [{ id: "item", status: "committed", archivoId: "file", objectPath: "orders/file.pdf", size: 4 }],
      archivos: [{ id: "file", bucket: "godel-files", filePath: "orders/file.pdf", size: 4 }],
      storageObjects: [{ bucket: "godel-files", name: "orders/file.pdf", size: 4, sha256: HASH }],
      capturedObjects: [{ path: "orders/file.pdf", size: 4, sha256: HASH }],
    },
    configurationSnapshot: {
      schemaVersion: 1,
      supabaseRegion: "us-east-1",
      authSiteUrl: { classification: "ENCRYPTED_INTERNAL_ONLY", value: "https://production.example.test" },
      redirectAllowlist: ["https://production.example.test/auth/callback"],
      signupEnabled: false,
      anonymousEnabled: false,
      bucket: { id: "godel-files", public: false, fileSizeLimit: 1048576, allowedMimeTypes: ["application/pdf"] },
      requiredExtensions: ["pgcrypto"],
      realtime: { required: false, publications: [] },
      vercelEnvironmentVariableNames: ["NEXT_PUBLIC_SUPABASE_URL"],
      productionRuntimeSha: RUNTIME_SHA,
      toolingGitSha: TOOLING_SHA,
    },
    toolVersions: [],
    syntheticArtifacts: [{ path: "database/managed-data.sql", content: "-- synthetic only\n" }],
    encryptionAdapter,
  };
}

test("bundle success publishes only verified ciphertext and returns COMPLETE", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-bundle-"));
  const phases = [];
  const adapter = {
    async encrypt({ outputPath, phase }) {
      phases.push(`encrypt:${phase}`);
      await writeFile(outputPath, `cipher-${phase}`);
    },
    async verifyCiphertext({ ciphertextPath, phase }) {
      phases.push(`verify:${phase}`);
      await access(ciphertextPath);
      return { verified: true };
    },
  };
  const result = await createManagedBackupBundle(input(outputRoot, adapter));
  assert.equal(result.manifest.status, "COMPLETE");
  assert.ok(Object.values(result.manifest.gates).every(Boolean));
  assert.equal(result.externalPublication, "NOT_IMPLEMENTED");
  assert.deepEqual(phases, ["encrypt:preflight", "verify:preflight", "encrypt:final", "verify:final"]);
  await access(result.finalPath);
  await assert.rejects(access(join(outputRoot, `.staging-${BACKUP_ID}`)));
  await assert.rejects(access(join(outputRoot, `${BACKUP_ID}.incomplete.json`)));
});

test("bundle encryption failure observes INCOMPLETE and never publishes a final", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-bundle-fail-"));
  let stagedStatus;
  const adapter = {
    async encrypt({ sourceDirectory }) {
      stagedStatus = JSON.parse(await readFile(join(sourceDirectory, "internal-manifest.json"), "utf8")).status;
      throw new Error("synthetic encryption failure");
    },
    async verifyCiphertext() { return { verified: false }; },
  };
  await assert.rejects(createManagedBackupBundle(input(outputRoot, adapter)), /synthetic encryption failure/);
  assert.equal(stagedStatus, "INCOMPLETE");
  await assert.rejects(access(join(outputRoot, `${BACKUP_ID}.age`)));
  await assert.rejects(access(join(outputRoot, `.staging-${BACKUP_ID}`)));
  const receipt = JSON.parse(await readFile(join(outputRoot, `${BACKUP_ID}.incomplete.json`), "utf8"));
  assert.equal(receipt.status, "INCOMPLETE");
  assert.equal(receipt.backupId, BACKUP_ID);
  assert.equal(receipt.toolingGitSha, TOOLING_SHA);
  assert.equal(receipt.productionRuntimeSha, RUNTIME_SHA);
  assert.equal(receipt.failurePhase, "PREFLIGHT_ENCRYPTION");
  assert.ok(!JSON.stringify(receipt).includes("orders/file.pdf"));
  assert.ok(!Object.hasOwn(receipt, "message"));
});

test("bundle verification failure never publishes COMPLETE ciphertext", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-bundle-verify-fail-"));
  const adapter = {
    async encrypt({ outputPath }) { await writeFile(outputPath, "cipher"); },
    async verifyCiphertext() { return { verified: false }; },
  };
  await assert.rejects(createManagedBackupBundle(input(outputRoot, adapter)), /verification failed/);
  await assert.rejects(access(join(outputRoot, `${BACKUP_ID}.age`)));
  await access(join(outputRoot, `${BACKUP_ID}.incomplete.json`));
});

test("verified candidate is published only after plaintext cleanup succeeds", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-bundle-cleanup-order-"));
  const finalPath = join(outputRoot, `${BACKUP_ID}.age`);
  const candidatePath = join(outputRoot, `.${BACKUP_ID}.candidate.age`);
  const adapter = {
    async encrypt({ outputPath }) { await writeFile(outputPath, "cipher"); },
    async verifyCiphertext() { return { verified: true }; },
  };
  const cleanupPlaintext = async (options) => {
    await access(candidatePath);
    await assert.rejects(access(finalPath));
    return cleanupPlaintextStaging(options);
  };
  const result = await createManagedBackupBundle(input(outputRoot, adapter), { cleanupPlaintext });
  await access(result.finalPath);
});

test("plaintext cleanup failure keeps an INCOMPLETE receipt and never promotes candidate", async () => {
  const outputRoot = await mkdtemp(join(tmpdir(), "godel-bundle-cleanup-fail-"));
  const candidatePath = join(outputRoot, `.${BACKUP_ID}.candidate.age`);
  const finalPath = join(outputRoot, `${BACKUP_ID}.age`);
  const receiptPath = join(outputRoot, `${BACKUP_ID}.incomplete.json`);
  const adapter = {
    async encrypt({ outputPath }) { await writeFile(outputPath, "cipher"); },
    async verifyCiphertext() { return { verified: true }; },
  };
  let cleanupAttempts = 0;
  const cleanupPlaintext = async (options) => {
    cleanupAttempts += 1;
    if (cleanupAttempts === 1) {
      const error = new Error("sensitive cleanup implementation detail");
      error.code = "SYNTHETIC_CLEANUP_FAILURE";
      throw error;
    }
    return cleanupPlaintextStaging(options);
  };
  await assert.rejects(
    createManagedBackupBundle(input(outputRoot, adapter), { cleanupPlaintext }),
    (error) => error.code === "PLAINTEXT_CLEANUP_FAILED"
      && error.primaryCode === "SYNTHETIC_CLEANUP_FAILURE"
      && error.cleanupCode === "RECOVERED_ON_RETRY"
      && !error.message.includes("sensitive cleanup implementation detail"),
  );
  await assert.rejects(access(finalPath));
  await assert.rejects(access(candidatePath));
  await assert.rejects(access(join(outputRoot, `.staging-${BACKUP_ID}`)));
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  assert.equal(receipt.status, "INCOMPLETE");
  assert.equal(receipt.failurePhase, "PLAINTEXT_CLEANUP");
  assert.equal(receipt.failureCode, "SYNTHETIC_CLEANUP_FAILURE");
  assert.ok(!JSON.stringify(receipt).includes("sensitive cleanup implementation detail"));
});

test("bundle validation phases fail before encryption and never publish", async (context) => {
  const cases = [
    ["Auth inventory", (value) => { value.authInventory.tables.users.present = false; }],
    ["Storage inventory", (value) => { value.storageInventory.capturedObjects = []; }],
    ["configuration authority", (value) => { value.configurationSnapshot.toolingGitSha = "c".repeat(40); }],
    ["artifact admission", (value) => { value.syntheticArtifacts.push({ path: "database/managed-data.sql", content: "duplicate" }); }],
  ];
  for (const [label, mutate] of cases) {
    await context.test(label, async () => {
      const outputRoot = await mkdtemp(join(tmpdir(), "godel-bundle-phase-fail-"));
      let encryptionCalls = 0;
      const adapter = {
        async encrypt() { encryptionCalls += 1; },
        async verifyCiphertext() { return { verified: true }; },
      };
      const options = input(outputRoot, adapter);
      mutate(options);
      await assert.rejects(createManagedBackupBundle(options));
      assert.equal(encryptionCalls, 0);
      await assert.rejects(access(join(outputRoot, `${BACKUP_ID}.age`)));
    });
  }
});
