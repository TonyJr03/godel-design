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
  buildSupabaseDatabaseEnvironment,
} from "./command-plans.mjs";

test("Supabase local plans are explicit, execution-ready, and use the proven official data recipe", () => {
  const plans = buildSupabaseDatabaseCommandPlans({ outputDirectory: "database", target: "local" });
  assert.equal(plans.length, 5);
  assert.ok(plans.every((plan) => plan.executionReady === true && plan.credentialTransport === "LOCAL_EXPLICIT_NO_SECRET"));
  assert.ok(plans.every((plan) => plan.args.includes("--local") && !plan.args.includes("--linked")));
  assert.ok(plans.some((plan) => plan.args.includes("--role-only")));
  const dataPlan = plans.find((plan) => plan.operation === "dump managed data");
  assert.ok(dataPlan.args.includes("--data-only") && dataPlan.args.includes("--use-copy"));
  assert.ok(dataPlan.args.includes("storage.buckets_vectors") && dataPlan.args.includes("storage.vector_indexes"));
  assert.ok(!dataPlan.args.includes("--schema"));
  assert.throws(() => authorizeDatabaseCommandPlan({ executionReady: false, credentialTransport: "PENDING_LOCAL_PROOF", args: [] }, {
    mechanism: "environment", argvContainsPassword: false, argvContainsFullDatabaseUrl: false, provenLocally: false,
  }), /pending local proof/);
});

test("Supabase linked transport keeps the database password only in the allowlisted environment", () => {
  const databasePassword = "synthetic-local-contract-value";
  const environment = buildSupabaseDatabaseEnvironment({ target: "linked", databasePassword, sourceEnvironment: { PATH: "safe-path" } });
  const plans = buildSupabaseDatabaseCommandPlans({ target: "linked" });
  assert.equal(environment.selector, "--linked");
  assert.equal(environment.allowedEnvironment.SUPABASE_DB_PASSWORD, databasePassword);
  assert.deepEqual(Object.keys(environment.allowedEnvironment).sort(), ["PATH", "SUPABASE_DB_PASSWORD", "SUPABASE_TELEMETRY_DISABLED"]);
  assert.ok(plans.every((plan) => plan.args.includes("--linked") && !plan.args.join(" ").includes(databasePassword)));
  assert.ok(plans.every((plan) => !plan.args.includes("--password") && !plan.args.includes("--db-url")));
  assert.throws(() => buildSupabaseDatabaseEnvironment({ target: "local", databasePassword }), /does not accept/);
});

test("Supabase plans support a repo-local JavaScript CLI prefix without changing the command contract", () => {
  const cliPath = join(process.cwd(), "node_modules", "supabase", "dist", "supabase.js");
  const plans = buildSupabaseDatabaseCommandPlans({ target: "linked", executable: process.execPath, prefixArgs: [cliPath] });
  assert.ok(plans.every((plan) => plan.executable === process.execPath && plan.args[0] === cliPath));
  assert.ok(plans.every((plan) => plan.args[1] === "db" && plan.args.includes("--linked")));
  assert.throws(() => buildSupabaseDatabaseCommandPlans({ prefixArgs: [""] }), /prefix args/);
});

test("S3 plans accept only named remotes and construct direction internally", () => {
  const listing = buildS3CommandPlan({ operation: "list-source", remoteName: "backup-prod", remotePath: "godel-files" });
  assert.equal(listing.destructive, false);
  assert.deepEqual(listing.args.slice(0, 2), ["lsjson", "backup-prod:godel-files"]);
  const download = buildS3CommandPlan({ operation: "download-copy", remoteName: "backup-prod", remotePath: "godel-files", localPath: "D:/safe/staging" });
  assert.deepEqual(download.args.slice(0, 3), ["copy", "backup-prod:godel-files", "D:/safe/staging"]);
  const upload = buildS3CommandPlan({ operation: "upload-restore", remoteName: "backup-prod", remotePath: "godel-files", localPath: "D:/safe/staging" });
  assert.deepEqual(upload.args.slice(0, 3), ["copy", "D:/safe/staging", "backup-prod:godel-files"]);
  assert.ok(upload.args.includes("--no-check-dest"));
  assert.ok(!upload.args.includes("--immutable"));
});

test("S3 plans reject inline rclone configuration and credentials", () => {
  const rejected = [
    { remoteName: ":s3,provider=S3", remotePath: "bucket" },
    { remoteName: ":s3,access_key_id=ABC,secret_access_key=XYZ", remotePath: "bucket" },
    { remoteName: "remote,provider=S3", remotePath: "bucket" },
    { remoteName: "remote,secret_access_key=XYZ", remotePath: "bucket" },
  ];
  for (const values of rejected) {
    assert.throws(
      () => buildS3CommandPlan({ operation: "list-source", ...values }),
      (error) => error.code === "INLINE_REMOTE_CONFIG_FORBIDDEN",
    );
  }
  assert.throws(
    () => buildS3CommandPlan({ operation: "upload-restore", remoteName: "backup-prod", remotePath: "godel-files", localPath: "other-remote:bucket" }),
    /localPath is invalid/,
  );
});

test("S3 plans reject every destructive operation and argv overrides", () => {
  for (const operation of ["sync", "delete", "purge", "move", "rmdir"]) {
    assert.throws(
      () => buildS3CommandPlan({ operation, remoteName: "backup-prod", remotePath: "godel-files" }),
      /forbidden/,
    );
  }
  assert.throws(
    () => buildS3CommandPlan({ operation: "list-source", remoteName: "backup-prod", remotePath: "godel-files", args: ["--secret-key", "value"] }),
    /unexpected/,
  );
});

test("age plans accept public recipients and reject private key material", () => {
  const plan = buildAgeEncryptPlan({ recipient: `age1${"q".repeat(30)}`, inputPath: "plain.tar", outputPath: "bundle.age" });
  assert.ok(plan.args.includes(`age1${"q".repeat(30)}`));
  assert.throws(() => buildAgeEncryptPlan({ recipient: "AGE-SECRET-KEY-1ABC", inputPath: "plain", outputPath: "cipher" }), /public age recipient/);
  assert.throws(() => buildAgeDecryptVerificationPlan({ ciphertextPath: "cipher", outputPath: "plain", identityFile: "AGE-SECRET-KEY-1ABC" }), /protected file path/);
});

test("age encryption plans accept a synthetic PQ recipient without an identity", () => {
  const recipient = `age1pq1${"q".repeat(1993)}`;
  const plan = buildAgeEncryptPlan({ recipient, inputPath: "plain.tar", outputPath: "bundle.age" });
  const recipientFlag = plan.args.indexOf("--recipient");
  assert.notEqual(recipientFlag, -1);
  assert.equal(plan.args[recipientFlag + 1], recipient);
  assert.equal(plan.args.includes("--identity"), false);
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
