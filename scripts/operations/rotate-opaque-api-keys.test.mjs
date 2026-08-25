import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { acquireGenerationMutationLock, bootstrapSecretGeneration, generationMutationLockPath, getCurrentSecretGeneration, releaseGenerationMutationLock } from "./secret-generation.mjs";
import { activateOpaqueApiKeys, isOpaqueApiKey, prepareOpaqueApiKeys, renderOpaqueApiKeyCliFailure, renderOpaqueApiKeyCliResult, rollbackOpaqueApiKeys } from "./rotate-opaque-api-keys.mjs";

const SYNTHETIC_RANDOM_PART = "x".repeat(22);
function syntheticOpaqueKey(kind) {
  const intermediate = ["sb", kind, SYNTHETIC_RANDOM_PART].join("_");
  const checksum = createHash("sha256").update(`supabase-self-hosted|${intermediate}`).digest("base64url").slice(0, 8);
  return [intermediate, checksum].join("_");
}
const publishable = syntheticOpaqueKey("publishable");
const secret = syntheticOpaqueKey("secret");
function invalidChecksum(value) { return `${value.slice(0, -1)}${value.endsWith("x") ? "y" : "x"}`; }
async function fixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-opaque-")); const root = join(tempRoot, "repo"); await mkdir(root);
  execFileSync("git", ["init"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "Test"], { cwd: root }); await writeFile(join(root, ".keep"), "x\n"); execFileSync("git", ["add", ".keep"], { cwd: root }); execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  const supabaseEnvPath = join(tempRoot, "supabase.env"), godelEnvPath = join(tempRoot, "godel.env"), protectedRoot = join(tempRoot, "protected");
  await writeFile(supabaseEnvPath, `SUPABASE_PUBLISHABLE_KEY=${publishable}\nSUPABASE_SECRET_KEY=${secret}\nOTHER=keep\n`); await writeFile(godelEnvPath, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}\nSUPABASE_SECRET_KEY=${secret}\nGODEL=keep\n`);
  const value = { root, tempRoot, protectedRoot, supabaseEnvPath, godelEnvPath }; await bootstrapSecretGeneration({ ...value, apply: true }); return value;
}
async function withFixture(run) { const value = await fixture(); try { await run(value); } finally { await rm(value.tempRoot, { recursive: true, force: true }); } }
test("runtime synthetic fixtures match the opaque key contract", () => {
  assert.match(publishable, /^sb_publishable_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/);
  assert.match(secret, /^sb_secret_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/);
  assert.ok(isOpaqueApiKey(publishable)); assert.ok(isOpaqueApiKey(secret));
});
test("prepare is isolated and activation/rollback are exact", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value), dry = await prepareOpaqueApiKeys(value); assert.equal(dry.state, "DRY_RUN");
  const prepared = await prepareOpaqueApiKeys({ ...value, apply: true }); const candidate = await getCurrentSecretGeneration({ ...value, compareLive: false });
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId); assert.equal(candidate.generationId, source.generationId);
  const base = join(value.protectedRoot, "external-secrets", "generations", prepared.generationId); const snapshot = await readFile(join(base, "supabase.env"), "utf8"); assert.match(snapshot, /SUPABASE_PUBLISHABLE_KEY=sb_publishable_/); assert.ok(isOpaqueApiKey(snapshot.match(/^SUPABASE_PUBLISHABLE_KEY=(.*)$/m)[1]));
  const activated = await activateOpaqueApiKeys({ ...value, generationId: prepared.generationId, apply: true }); assert.equal(activated.state, "ACTIVATED"); assert.equal((await getCurrentSecretGeneration(value)).generationId, prepared.generationId);
  await rollbackOpaqueApiKeys({ ...value, generationId: source.generationId, apply: true }); assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  await activateOpaqueApiKeys({ ...value, generationId: prepared.generationId, apply: true }); assert.equal((await getCurrentSecretGeneration(value)).generationId, prepared.generationId);
}));
test("pre-pointer failure compensates both envs and post-pointer failure preserves lock", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value), prepared = await prepareOpaqueApiKeys({ ...value, apply: true });
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { afterSupabaseUpdate: () => { throw new Error("INJECTED"); } } }), /INJECTED/); assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { afterPointerCommit: () => { throw new Error("INJECTED"); } } }), /OPAQUE_API_ROTATION_COMMITTED_UNVERIFIED/); assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));
test("after-Godel and before-pointer failures compensate both files", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value), prepared = await prepareOpaqueApiKeys({ ...value, apply: true });
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { afterGodelUpdate: () => { throw new Error("AFTER_GODEL"); } } }), /AFTER_GODEL/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { beforePointerCommit: () => { throw new Error("BEFORE_POINTER"); } } }), /BEFORE_POINTER/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
}));
test("failed compensation preserves the mutation lock", async () => withFixture(async (value) => {
  const prepared = await prepareOpaqueApiKeys({ ...value, apply: true });
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { afterSupabaseUpdate: () => { throw new Error("UPDATE_FAILED"); }, beforeCompensation: () => { throw new Error("COMPENSATION_FAILED"); } } }), /OPAQUE_API_ROTATION_COMPENSATION_FAILED/);
  assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));
test("rejects cross-file and unrelated candidate changes", async () => withFixture(async (value) => {
  const prepared = await prepareOpaqueApiKeys({ ...value, apply: true }), base = join(value.protectedRoot, "external-secrets", "generations", prepared.generationId);
  const godel = await readFile(join(base, "godel.env"), "utf8"); await writeFile(join(base, "godel.env"), godel.replace("SUPABASE_SECRET_KEY=", "SUPABASE_SECRET_KEY=broken"));
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId }), /OPAQUE_API_KEY_CROSS_FILE_MISMATCH/);
  await writeFile(join(base, "godel.env"), godel);
  const supabase = await readFile(join(base, "supabase.env"), "utf8"); await writeFile(join(base, "supabase.env"), supabase.replace("OTHER=keep", "OTHER=changed"));
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId }), /OPAQUE_API_KEY_UNRELATED_DIFFERENCE/);
}));
test("CLI renderers never disclose opaque key values", () => {
  assert.equal(renderOpaqueApiKeyCliResult({ state: "PREPARED", generationId: "00000000-0000-4000-8000-000000000000" }), "PREPARED 00000000-0000-4000-8000-000000000000\n");
  const output = `${renderOpaqueApiKeyCliResult({ state: "ACTIVATED", generationId: "00000000-0000-4000-8000-000000000000" })}${renderOpaqueApiKeyCliFailure(new Error("OPAQUE_API_KEY_CROSS_FILE_MISMATCH"))}`;
  assert.doesNotMatch(output, new RegExp(publishable)); assert.doesNotMatch(output, new RegExp(secret));
});
test("role swaps and valid-shaped invalid checksums are rejected", async () => withFixture(async (value) => {
  const prepared = await prepareOpaqueApiKeys({ ...value, apply: true }), base = join(value.protectedRoot, "external-secrets", "generations", prepared.generationId);
  const supabase = await readFile(join(base, "supabase.env"), "utf8"), godel = await readFile(join(base, "godel.env"), "utf8");
  await writeFile(join(base, "supabase.env"), supabase.replace(/^SUPABASE_PUBLISHABLE_KEY=.*$/m, `SUPABASE_PUBLISHABLE_KEY=${secret}`));
  await writeFile(join(base, "godel.env"), godel.replace(/^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=.*$/m, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${secret}`));
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId }), /INVALID_OPAQUE_API_KEY_ROLE/);
  await writeFile(join(base, "supabase.env"), supabase.replace(/^SUPABASE_SECRET_KEY=.*$/m, `SUPABASE_SECRET_KEY=${publishable}`));
  await writeFile(join(base, "godel.env"), godel.replace(/^SUPABASE_SECRET_KEY=.*$/m, `SUPABASE_SECRET_KEY=${publishable}`));
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId }), /INVALID_OPAQUE_API_KEY_ROLE/);
  const candidatePublishable = supabase.match(/^SUPABASE_PUBLISHABLE_KEY=(.*)$/m)[1], badChecksum = invalidChecksum(candidatePublishable);
  await writeFile(join(base, "supabase.env"), supabase.replace(candidatePublishable, badChecksum)); await writeFile(join(base, "godel.env"), godel.replace(candidatePublishable, badChecksum));
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId }), /INVALID_OPAQUE_API_KEY_CHECKSUM/);
}));
test("rejects invalid, missing, unrelated generations and active locks", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value), prepared = await prepareOpaqueApiKeys({ ...value, apply: true }), base = join(value.protectedRoot, "external-secrets", "generations", prepared.generationId);
  const metadataPath = join(base, "metadata.json"), metadata = JSON.parse(await readFile(metadataPath, "utf8")); metadata.reason = "dashboard-rotation"; await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId }), /INVALID_OPAQUE_API_KEY_GENERATION_REASON/);
  metadata.reason = "opaque-api-key-rotation"; metadata.sourceGenerationId = "00000000-0000-4000-8000-000000000000"; await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId }), /OPAQUE_API_KEY_GENERATION_NOT_DIRECTLY_RELATED/);
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: "00000000-0000-4000-8000-000000000000" }), /GENERATION_DIRECTORY_MISSING/);
  await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: "not-a-generation" }), /INVALID_EXTERNAL_SECRET_GENERATION_ID/);
  metadata.sourceGenerationId = source.generationId; await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
  const lock = await acquireGenerationMutationLock({ protectedRoot: value.protectedRoot, operation: "test" });
  try {
    await assert.rejects(() => prepareOpaqueApiKeys({ ...value, apply: true }), /GENERATION_MUTATION_IN_PROGRESS/);
    await assert.rejects(() => activateOpaqueApiKeys({ ...value, generationId: prepared.generationId, apply: true }), /GENERATION_MUTATION_IN_PROGRESS/);
  } finally { await releaseGenerationMutationLock(lock); }
}));
test("prepare cleans an owned candidate when final validation fails", async () => withFixture(async (value) => {
  await assert.rejects(() => prepareOpaqueApiKeys({ ...value, apply: true, hooks: { afterPublish: () => { throw new Error("FINAL_VALIDATION_FAILED"); } } }), /FINAL_VALIDATION_FAILED/);
  const generations = await readdir(join(value.protectedRoot, "external-secrets", "generations")); assert.equal(generations.length, 1);
}));
test("actual synthetic CLI never discloses source or candidate opaque keys", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-opaque-cli-")), protectedRoot = join(root, "protected-recovery-material", "selfhosted"), supabaseEnvPath = join(root, "infra", "supabase", ".env"), godelEnvPath = join(root, "compose.env.local"), script = resolve(import.meta.dirname, "rotate-opaque-api-keys.mjs");
  try {
    await mkdir(join(root, "infra", "supabase"), { recursive: true }); await writeFile(join(root, ".gitignore"), "protected-recovery-material/\ninfra/supabase/.env\ncompose.env.local\n"); await writeFile(join(root, ".keep"), "x\n");
    execFileSync("git", ["init"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "Test"], { cwd: root }); execFileSync("git", ["add", "."], { cwd: root }); execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
    await writeFile(supabaseEnvPath, `SUPABASE_PUBLISHABLE_KEY=${publishable}\nSUPABASE_SECRET_KEY=${secret}\n`); await writeFile(godelEnvPath, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}\nSUPABASE_SECRET_KEY=${secret}\n`);
    const value = { root, protectedRoot, supabaseEnvPath, godelEnvPath }; await bootstrapSecretGeneration({ ...value, apply: true }); const source = await getCurrentSecretGeneration(value), output = [];
    const run = (...args) => { const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8" }); assert.equal(result.status, 0); output.push(`${result.stdout}${result.stderr}`); return result.stdout; };
    run("prepare"); const preparedOutput = run("prepare", "--apply"), candidateId = preparedOutput.match(/[0-9a-f-]{36}/)?.[0]; assert.ok(candidateId);
    const candidateSnapshot = await readFile(join(protectedRoot, "external-secrets", "generations", candidateId, "supabase.env"), "utf8"), candidatePublishable = candidateSnapshot.match(/^SUPABASE_PUBLISHABLE_KEY=(.*)$/m)[1], candidateSecret = candidateSnapshot.match(/^SUPABASE_SECRET_KEY=(.*)$/m)[1];
    run("activate", "--to", candidateId); run("activate", "--to", candidateId, "--apply"); run("rollback", "--to", source.generationId); run("rollback", "--to", source.generationId, "--apply");
    const transcript = output.join(""); for (const valueToProtect of [publishable, secret, candidatePublishable, candidateSecret]) assert.doesNotMatch(transcript, new RegExp(valueToProtect));
  } finally { await rm(root, { recursive: true, force: true }); }
});
