import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createAgeDecryptAdapter } from "./age-decrypt.mjs";
import { admitRecoveryIdentity } from "./recovery-contract.mjs";

test("recovery-only age adapter exposes one method, keeps identity content opaque, and admits exact tar output", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-age-decrypt-test-"));
  try {
    const plaintext = join(root, "session", "plaintext");
    const download = join(root, "session", "download");
    const target = join(root, "session", "target");
    const repoRoot = join(root, "repo");
    const backupOutputRoot = join(root, "backup");
    await Promise.all([plaintext, download, target, repoRoot, backupOutputRoot].map((path) => mkdir(path, { recursive: true })));
    const identityPath = join(root, "external-identity.txt");
    const ciphertextPath = join(download, "synthetic.age");
    const archivePath = join(plaintext, "managed-recovery.tar");
    const secret = "AGE-SECRET-KEY-SYNTHETIC-NEVER-READ";
    await writeFile(identityPath, secret);
    await writeFile(ciphertextPath, "ciphertext");
    const session = { parent: join(root, "session-parent"), root: join(root, "session"), plaintext, download, target };
    const identity = await admitRecoveryIdentity({ environment: { GODEL_MANAGED_RECOVERY_IDENTITY_FILE: identityPath }, repoRoot, backupOutputRoot, session });
    let plan;
    const adapter = createAgeDecryptAdapter({ session, environment: { PATH: "tools", DOCKER_HOST: "remote", AGE_SECRET: secret }, execute: async (value) => { plan = value; await writeFile(archivePath, "tar bytes"); return { stdout: "" }; } });
    assert.deepEqual(Object.keys(adapter), ["decryptToTar"]);
    assert.deepEqual(await adapter.decryptToTar({ ciphertextPath, archivePath, identity }), { status: "PASS" });
    assert.deepEqual(plan.args.slice(0, 4), ["--decrypt", "--identity", identityPath, "--output"]);
    assert.ok(plan.redactionValues.includes(identityPath));
    assert.ok(!JSON.stringify(plan).includes(secret));
    assert.deepEqual(plan.allowedEnvironment, { PATH: "tools" });
    await assert.rejects(adapter.decryptToTar({ ciphertextPath, archivePath, identity }), { code: "RECOVERY_DECRYPT_OUTPUT_EXISTS" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
