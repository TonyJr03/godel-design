import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createAgeAdapter } from "./age-adapter.mjs";
import {
  authorizeDatabaseCommandPlan,
  buildAgeDecryptVerificationPlan,
  buildAgeEncryptPlan,
  buildS3CommandPlan,
  buildSupabaseDatabaseCommandPlans,
} from "./command-plans.mjs";

test("Supabase plans are pure, explicit, secret-free, and pending transport proof", () => {
  const plans = buildSupabaseDatabaseCommandPlans({ outputDirectory: "database" });
  assert.equal(plans.length, 5);
  assert.ok(plans.every((plan) => plan.executionReady === false && plan.credentialTransport === "PENDING_LOCAL_PROOF"));
  assert.ok(plans.some((plan) => plan.args.includes("--role-only")));
  assert.ok(plans.some((plan) => plan.args.includes("--data-only") && plan.args.includes("--use-copy")));
  assert.ok(plans.some((plan) => plan.args.includes("storage.buckets_vectors")));
  assert.throws(() => authorizeDatabaseCommandPlan(plans[0], {
    mechanism: "environment", argvContainsPassword: false, argvContainsFullDatabaseUrl: false, provenLocally: false,
  }), /pending local proof/);
});

test("S3 plans reject destructive operations and credential material", () => {
  assert.equal(buildS3CommandPlan({ operation: "list-source", source: "remote:godel-files" }).destructive, false);
  for (const operation of ["delete", "sync", "purge"]) {
    assert.throws(() => buildS3CommandPlan({ operation, source: "remote:godel-files" }), /forbidden/);
  }
  assert.throws(() => buildS3CommandPlan({ operation: "list-source", source: "s3://key:secret@bucket" }), /credential/);
  assert.throws(() => buildS3CommandPlan({ operation: "list-source", source: "remote:godel-files", args: ["--secret-key", "value"] }), /unexpected/);
});

test("age plans accept public recipients and reject private key material", () => {
  const plan = buildAgeEncryptPlan({ recipient: `age1${"q".repeat(30)}`, inputPath: "plain.tar", outputPath: "bundle.age" });
  assert.ok(plan.args.includes(`age1${"q".repeat(30)}`));
  assert.throws(() => buildAgeEncryptPlan({ recipient: "AGE-SECRET-KEY-1ABC", inputPath: "plain", outputPath: "cipher" }), /public age recipient/);
  assert.throws(() => buildAgeDecryptVerificationPlan({ ciphertextPath: "cipher", outputPath: "plain", identityFile: "AGE-SECRET-KEY-1ABC" }), /protected file path/);
});

test("age adapter fails on nonzero execution and on missing ciphertext", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-age-"));
  const plaintextPath = join(root, "plain.tar");
  const ciphertextPath = join(root, "bundle.age");
  await writeFile(plaintextPath, "plain");
  const failing = createAgeAdapter({ runner: async () => { throw new Error("nonzero"); } });
  await assert.rejects(failing.encryptFile({ recipient: `age1${"q".repeat(30)}`, plaintextPath, ciphertextPath, cwd: root }), /nonzero/);
  const missing = createAgeAdapter({ runner: async () => ({ exitCode: 0 }) });
  await assert.rejects(missing.encryptFile({ recipient: `age1${"q".repeat(30)}`, plaintextPath, ciphertextPath, cwd: root }), /was not produced/);
});

test("age adapter fails closed when decrypt verification fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-age-verify-"));
  const ciphertextPath = join(root, "bundle.age");
  await writeFile(ciphertextPath, "cipher");
  const adapter = createAgeAdapter({ runner: async () => { throw new Error("verification failed"); } });
  await assert.rejects(adapter.verifyByDecryption({
    ciphertextPath,
    verificationOutputPath: join(root, "verify.tar"),
    identityFile: join(root, "identity.txt"),
    cwd: root,
  }), /verification failed/);
});
