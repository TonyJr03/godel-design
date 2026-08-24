import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  applyAllowlistedEnvironmentChanges,
  assertActiveSecretGenerationMatches,
  assertCurrentSecretGenerationMatches,
  assertReferencedSecretGenerationExists,
  assertReferencedSecretGenerationMatches,
  bootstrapSecretGeneration,
  acquireGenerationMutationLock,
  generationMutationLockPath,
  getCurrentSecretGeneration,
  isCanonicalGenerationId,
  validateManifestExternalSecretGeneration,
  releaseGenerationMutationLock,
} from "./secret-generation.mjs";

async function fixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-secret-generation-"));
  const supabaseEnvPath = join(tempRoot, "supabase.env");
  const godelEnvPath = join(tempRoot, "godel.env");
  await writeFile(supabaseEnvPath, "ONE=alpha\r\nTWO=beta\r\n", { mode: 0o600 });
  await writeFile(godelEnvPath, "THREE=gamma\n", { mode: 0o600 });
  return { root: process.cwd(), tempRoot, protectedRoot: join(tempRoot, "protected"), supabaseEnvPath, godelEnvPath };
}

async function withFixture(run) {
  const value = await fixture();
  try { await run(value); } finally { await rm(value.tempRoot, { recursive: true, force: true }); }
}

test("generation status succeeds when uninitialized", async () => withFixture(async (value) => {
  const status = await getCurrentSecretGeneration(value);
  assert.deepEqual(status, { state: "UNINITIALIZED", generationId: null, match: null });
}));

test("bootstrap dry run does not create a registry", async () => withFixture(async (value) => {
  assert.equal((await bootstrapSecretGeneration({ ...value, apply: false })).state, "DRY_RUN");
  assert.equal((await getCurrentSecretGeneration(value)).state, "UNINITIALIZED");
}));

test("bootstrap records an initialized generation", async () => withFixture(async (value) => {
  const result = await bootstrapSecretGeneration({ ...value, apply: true });
  assert.ok(isCanonicalGenerationId(result.generationId));
  const status = await getCurrentSecretGeneration(value);
  assert.equal(status.state, "INITIALIZED");
  assert.equal(status.generationId, result.generationId);
  assert.equal(status.match, true);
}));

test("bootstrap snapshots exact environment bytes", async () => withFixture(async (value) => {
  const result = await bootstrapSecretGeneration({ ...value, apply: true });
  const current = await getCurrentSecretGeneration(value);
  assert.deepEqual(await readFile(current.generation.paths.supabaseSnapshot), await readFile(value.supabaseEnvPath));
  assert.deepEqual(await readFile(current.generation.paths.godelSnapshot), await readFile(value.godelEnvPath));
  assert.equal(current.generationId, result.generationId);
}));

test("bootstrap rejects changed live bytes before pointer commit and releases its lock", async () => withFixture(async (value) => {
  await assert.rejects(() => bootstrapSecretGeneration({ ...value, apply: true, hooks: { afterCaptureBeforePointer: async () => writeFile(value.supabaseEnvPath, "ONE=changed\n", { mode: 0o600 }) } }), /EXTERNAL_SECRET_GENERATION_LIVE_ENV_CHANGED/);
  assert.equal((await getCurrentSecretGeneration(value)).state, "UNINITIALIZED");
  await assert.rejects(() => readFile(generationMutationLockPath(value.protectedRoot)), /ENOENT/);
}));

test("bootstrap post-commit failure preserves the generation pointer and lock", async () => withFixture(async (value) => {
  await assert.rejects(() => bootstrapSecretGeneration({ ...value, apply: true, hooks: { afterPointerCommit: () => { throw new Error("INJECTED_POST_COMMIT_FAILURE"); } } }), /SECRET_GENERATION_BOOTSTRAP_COMMITTED_UNVERIFIED/);
  assert.equal((await getCurrentSecretGeneration(value)).state, "INITIALIZED");
  assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));

test("bootstrap apply rejects an existing exclusive operation lock", async () => withFixture(async (value) => {
  const lock = await acquireGenerationMutationLock({ protectedRoot: value.protectedRoot, operation: "test" });
  try { await assert.rejects(() => bootstrapSecretGeneration({ ...value, apply: true }), /GENERATION_MUTATION_IN_PROGRESS/); } finally { await releaseGenerationMutationLock(lock); }
}));

test("status detects a live environment mismatch without disclosing content", async () => withFixture(async (value) => {
  await bootstrapSecretGeneration({ ...value, apply: true });
  await writeFile(value.godelEnvPath, "THREE=changed\n", { mode: 0o600 });
  assert.equal((await getCurrentSecretGeneration(value)).match, false);
}));

test("a second bootstrap is rejected", async () => withFixture(async (value) => {
  await bootstrapSecretGeneration({ ...value, apply: true });
  await assert.rejects(() => bootstrapSecretGeneration({ ...value, apply: true }), /REGISTRY_ALREADY_INITIALIZED/);
}));

test("current generation binding accepts matching live files", async () => withFixture(async (value) => {
  const result = await bootstrapSecretGeneration({ ...value, apply: true });
  assert.equal(await assertCurrentSecretGenerationMatches(value), result.generationId);
}));

test("current generation binding rejects mismatching live files", async () => withFixture(async (value) => {
  await bootstrapSecretGeneration({ ...value, apply: true });
  await writeFile(value.supabaseEnvPath, "ONE=other\n", { mode: 0o600 });
  await assert.rejects(() => assertCurrentSecretGenerationMatches(value), /EXTERNAL_SECRET_GENERATION_MISMATCH/);
}));

test("active generation binding rejects a non-current generation even when bytes match", async () => withFixture(async (value) => {
  const first = await bootstrapSecretGeneration({ ...value, apply: true });
  const current = await getCurrentSecretGeneration(value);
  const replacementId = "00000000-0000-4000-8000-000000000000";
  const replacementDirectory = join(current.generation.paths.generations, replacementId);
  await mkdir(replacementDirectory, { mode: 0o700 });
  const metadata = JSON.parse(await readFile(current.generation.paths.metadata, "utf8"));
  metadata.generationId = replacementId;
  metadata.sourceGenerationId = first.generationId;
  await writeFile(join(replacementDirectory, "metadata.json"), `${JSON.stringify(metadata)}\n`, { mode: 0o600 });
  await writeFile(join(replacementDirectory, "supabase.env"), await readFile(current.generation.paths.supabaseSnapshot), { mode: 0o600 });
  await writeFile(join(replacementDirectory, "godel.env"), await readFile(current.generation.paths.godelSnapshot), { mode: 0o600 });
  await writeFile(current.generation.paths.current, `${JSON.stringify({ schemaVersion: 1, generationId: replacementId })}\n`, { mode: 0o600 });
  assert.equal((await getCurrentSecretGeneration(value)).match, true);
  await assert.rejects(() => assertActiveSecretGenerationMatches({ ...value, generationId: first.generationId }), /EXTERNAL_SECRET_GENERATION_NOT_ACTIVE/);
}));

test("referenced generation existence accepts a stored generation", async () => withFixture(async (value) => {
  const result = await bootstrapSecretGeneration({ ...value, apply: true });
  assert.equal(await assertReferencedSecretGenerationExists({ protectedRoot: value.protectedRoot, generationId: result.generationId }), result.generationId);
}));

test("restore binding rejects a missing but canonical referenced generation", async () => withFixture(async (value) => {
  await bootstrapSecretGeneration({ ...value, apply: true });
  await assert.rejects(() => assertReferencedSecretGenerationExists({ protectedRoot: value.protectedRoot, generationId: "00000000-0000-4000-8000-000000000000" }), /GENERATION_DIRECTORY_MISSING/);
}));

test("referenced generation binding rejects a wrong active environment", async () => withFixture(async (value) => {
  const result = await bootstrapSecretGeneration({ ...value, apply: true });
  await writeFile(value.godelEnvPath, "THREE=other\n", { mode: 0o600 });
  await assert.rejects(() => assertReferencedSecretGenerationMatches({ ...value, generationId: result.generationId }), /EXTERNAL_SECRET_GENERATION_MISMATCH/);
}));

test("backup manifest contract remains backward compatible when id is absent", () => {
  assert.equal(validateManifestExternalSecretGeneration({ schemaVersion: 3 }), null);
});

test("backup manifest contract rejects malformed generation identifiers", () => {
  assert.throws(() => validateManifestExternalSecretGeneration({ externalSecretGenerationId: "not-a-uuid" }), /INVALID_EXTERNAL_SECRET_GENERATION_ID/);
});

test("backup manifest contract accepts a canonical generation identifier", async () => withFixture(async (value) => {
  const result = await bootstrapSecretGeneration({ ...value, apply: true });
  assert.equal(validateManifestExternalSecretGeneration({ externalSecretGenerationId: result.generationId }), result.generationId);
}));

test("allowlisted environment updates preserve unrelated content", () => {
  const next = applyAllowlistedEnvironmentChanges("# retained\nONE=old\nTWO=keep\n", { ONE: "new" }, ["ONE"]);
  assert.equal(next, "# retained\nONE=new\nTWO=keep\n");
});

test("allowlisted environment updates reject duplicate assignments", () => {
  assert.throws(() => applyAllowlistedEnvironmentChanges("ONE=a\nONE=b\n", { ONE: "new" }, ["ONE"]), /DUPLICATE_ENVIRONMENT_VARIABLE/);
});

test("symlinked source environment is rejected", async (t) => withFixture(async (value) => {
  await bootstrapSecretGeneration({ ...value, apply: true });
  const target = join(value.tempRoot, "linked-source.env");
  await writeFile(target, "ONE=alpha\r\nTWO=beta\r\n", { mode: 0o600 });
  await rm(value.supabaseEnvPath);
  try {
    await symlink(target, value.supabaseEnvPath, "file");
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES" || error?.code === "ENOTSUP") {
      t.skip("symlink creation is unavailable on this platform");
      return;
    }
    throw error;
  }
  await assert.rejects(() => getCurrentSecretGeneration(value), /SUPABASE_ENV_SYMLINK/);
}));

test("bootstrap applies restrictive POSIX modes when supported", async (t) => withFixture(async (value) => {
  if (process.platform === "win32") {
    t.skip("Windows ACLs are not POSIX mode bits");
    return;
  }
  await bootstrapSecretGeneration({ ...value, apply: true });
  const current = await getCurrentSecretGeneration(value);
  assert.equal((await stat(current.generation.paths.directory)).mode & 0o777, 0o700);
  assert.equal((await stat(current.generation.paths.supabaseSnapshot)).mode & 0o777, 0o600);
  assert.equal((await stat(current.generation.paths.godelSnapshot)).mode & 0o777, 0o600);
}));

test("CLI status and bootstrap dry run never disclose synthetic secret text", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-secret-cli-"));
  const sentinel = "SYNTHETIC_SECRET_DO_NOT_PRINT_12345";
  const script = resolve(import.meta.dirname, "manage-secret-generations.mjs");
  try {
    await mkdir(join(tempRoot, "infra", "supabase"), { recursive: true });
    await writeFile(join(tempRoot, "infra", "supabase", ".env"), `ONE=${sentinel}\n`, { mode: 0o600 });
    await writeFile(join(tempRoot, "compose.env.local"), `TWO=${sentinel}\n`, { mode: 0o600 });
    for (const args of [["status"], ["bootstrap"]]) {
      const result = spawnSync(process.execPath, [script, ...args], { cwd: tempRoot, encoding: "utf8" });
      assert.equal(result.status, 0);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(sentinel));
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("CLI status reports BUSY while the common generation mutation lock is held", async () => withFixture(async (value) => {
  const script = resolve(import.meta.dirname, "manage-secret-generations.mjs");
  const lock = await acquireGenerationMutationLock({ protectedRoot: value.protectedRoot, operation: "test-status" });
  try {
    const result = spawnSync(process.execPath, [script, "status", "--protected-root", "protected"], { cwd: value.tempRoot, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "BUSY OPERATION_IN_PROGRESS\n");
  } finally {
    await releaseGenerationMutationLock(lock);
  }
}));
