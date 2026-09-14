import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { acquireGenerationMutationLock, bootstrapSecretGeneration, generationMutationLockPath, getCurrentSecretGeneration, releaseGenerationMutationLock } from "./secret-generation.mjs";
import { rollbackDashboardPassword, rotateDashboardPassword } from "./rotate-dashboard-password.mjs";

async function fixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-dashboard-rotation-"));
  const root = join(tempRoot, "repo"); await mkdir(root);
  execFileSync("git", ["init"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  await writeFile(join(root, ".keep"), "x\n"); execFileSync("git", ["add", ".keep"], { cwd: root }); execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  const supabaseEnvPath = join(tempRoot, "supabase.env"), godelEnvPath = join(tempRoot, "godel.env"), protectedRoot = join(tempRoot, "protected");
  await writeFile(supabaseEnvPath, "DASHBOARD_USERNAME=admin\nDASHBOARD_PASSWORD=SYNTHETIC_SECRET_DO_NOT_PRINT_OLD\nOTHER=retained\n", { mode: 0o600 });
  await writeFile(godelEnvPath, "GODEL=retained\n", { mode: 0o600 });
  const value = { root, tempRoot, protectedRoot, supabaseEnvPath, godelEnvPath };
  await bootstrapSecretGeneration({ ...value, apply: true });
  return value;
}
async function withFixture(run) { const value = await fixture(); try { await run(value); } finally { await rm(value.tempRoot, { recursive: true, force: true }); } }

test("dashboard rotate dry run leaves synthetic files unchanged", async () => withFixture(async (value) => {
  const before = await readFile(value.supabaseEnvPath); const result = await rotateDashboardPassword(value);
  assert.equal(result.state, "DRY_RUN"); assert.deepEqual(await readFile(value.supabaseEnvPath), before);
}));
test("dashboard rotate apply rejects an uninitialized registry", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-dashboard-uninitialized-"));
  try { const value = { root: tempRoot, protectedRoot: join(tempRoot, "protected"), supabaseEnvPath: join(tempRoot, "supabase.env"), godelEnvPath: join(tempRoot, "godel.env"), apply: true }; await writeFile(value.supabaseEnvPath, "DASHBOARD_PASSWORD=synthetic\n"); await writeFile(value.godelEnvPath, "X=synthetic\n"); await assert.rejects(() => rotateDashboardPassword(value), /SECRET_GENERATION_REGISTRY_UNINITIALIZED/); } finally { await rm(tempRoot, { recursive: true, force: true }); }
});
test("dashboard rotate creates an active dashboard-only generation", async () => withFixture(async (value) => {
  const before = await getCurrentSecretGeneration(value); const result = await rotateDashboardPassword({ ...value, apply: true }); const after = await getCurrentSecretGeneration(value);
  assert.equal(after.generationId, result.generationId); assert.equal(after.match, true); assert.equal(after.generation.metadata.reason, "dashboard-rotation"); assert.equal(after.generation.metadata.sourceGenerationId, before.generationId);
  assert.deepEqual(after.generation.godelSnapshot, before.generation.godelSnapshot); assert.notDeepEqual(after.generation.supabaseSnapshot, before.generation.supabaseSnapshot);
}));
test("dashboard rollback restores the exact source generation", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value); await rotateDashboardPassword({ ...value, apply: true }); const result = await rollbackDashboardPassword({ ...value, generationId: source.generationId, apply: true });
  assert.equal(result.generationId, source.generationId); assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot); assert.equal((await getCurrentSecretGeneration(value)).match, true);
}));
test("rollback pre-commit failure restores the active generation and releases lock", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value); await rotateDashboardPassword({ ...value, apply: true }); const active = await getCurrentSecretGeneration(value);
  await assert.rejects(() => rollbackDashboardPassword({ ...value, generationId: source.generationId, apply: true, hooks: { beforePointerCommit: () => { throw new Error("INJECTED_ROLLBACK_PRE"); } } }), /INJECTED_ROLLBACK_PRE/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, active.generationId); assert.deepEqual(await readFile(value.supabaseEnvPath), active.generation.supabaseSnapshot); await assert.rejects(() => readFile(generationMutationLockPath(value.protectedRoot)), /ENOENT/);
}));
test("rollback post-commit failure preserves target state and lock", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value); await rotateDashboardPassword({ ...value, apply: true });
  await assert.rejects(() => rollbackDashboardPassword({ ...value, generationId: source.generationId, apply: true, hooks: { afterPointerCommit: () => { throw new Error("INJECTED_ROLLBACK_POST"); } } }), /DASHBOARD_ROLLBACK_COMMITTED_UNVERIFIED/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId); assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));
test("dashboard rollback rejects an unrelated generation difference", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value); await rotateDashboardPassword({ ...value, apply: true });
  await writeFile(source.generation.paths.godelSnapshot, "GODEL=changed\n", { mode: 0o600 });
  await assert.rejects(() => rollbackDashboardPassword({ ...value, generationId: source.generationId }), /DASHBOARD_ROLLBACK_GODEL_DIFFERENCE/);
}));
test("failure before pointer commit restores source live state", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value); await assert.rejects(() => rotateDashboardPassword({ ...value, apply: true, hooks: { beforePointerCommit: () => { throw new Error("INJECTED_FAILURE"); } } }), /INJECTED_FAILURE/);
  assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot); assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
}));
test("failure after pointer commit preserves committed state and operation lock", async () => withFixture(async (value) => {
  await assert.rejects(() => rotateDashboardPassword({ ...value, apply: true, hooks: { afterPointerCommit: () => { throw new Error("INJECTED_POST_COMMIT_FAILURE"); } } }), /DASHBOARD_ROTATION_COMMITTED_UNVERIFIED/);
  const current = await getCurrentSecretGeneration(value); assert.equal(current.match, true); await assert.rejects(() => rotateDashboardPassword({ ...value, apply: true }), /GENERATION_MUTATION_IN_PROGRESS/); assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));
test("failed rotation compensation preserves the common operation lock", async () => withFixture(async (value) => {
  await assert.rejects(() => rotateDashboardPassword({ ...value, apply: true, hooks: {
    beforePointerCommit: () => { throw new Error("INJECTED_PRE_COMMIT_FAILURE"); },
    beforeCompensation: () => { throw new Error("INJECTED_COMPENSATION_FAILURE"); },
  } }), /DASHBOARD_ROTATION_COMPENSATION_FAILED/);
  assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));
test("concurrent generation mutation lock rejects dashboard rotation", async () => withFixture(async (value) => {
  const lock = await acquireGenerationMutationLock({ protectedRoot: value.protectedRoot, operation: "test" }); try { await assert.rejects(() => rotateDashboardPassword({ ...value, apply: true }), /GENERATION_MUTATION_IN_PROGRESS/); } finally { await releaseGenerationMutationLock(lock); }
}));
test("CLI rotate output does not disclose synthetic dashboard password", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-dashboard-cli-")); const sentinel = "SYNTHETIC_SECRET_DO_NOT_PRINT_CLI"; const script = resolve(import.meta.dirname, "rotate-dashboard-password.mjs");
  try { await mkdir(join(tempRoot, "infra", "supabase"), { recursive: true }); await writeFile(join(tempRoot, "infra", "supabase", ".env"), `DASHBOARD_PASSWORD=${sentinel}\n`); await writeFile(join(tempRoot, "compose.env.local"), `X=${sentinel}\n`); const result = spawnSync(process.execPath, [script, "rotate"], { cwd: tempRoot, encoding: "utf8" }); assert.equal(result.status, 0); assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(sentinel)); } finally { await rm(tempRoot, { recursive: true, force: true }); }
});
test("CLI rotate and rollback apply stay synthetic and never disclose dashboard credentials", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-dashboard-cli-apply-")); const sentinel = "SYNTHETIC_SECRET_DO_NOT_PRINT_CLI_APPLY";
  const script = resolve(import.meta.dirname, "rotate-dashboard-password.mjs"); const bootstrapScript = resolve(import.meta.dirname, "manage-secret-generations.mjs");
  try {
    await mkdir(join(tempRoot, "infra", "supabase"), { recursive: true });
    await writeFile(join(tempRoot, ".gitignore"), "protected-recovery-material/\ninfra/supabase/.env\ncompose.env.local\n"); await writeFile(join(tempRoot, ".keep"), "x\n");
    execFileSync("git", ["init"], { cwd: tempRoot }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: tempRoot }); execFileSync("git", ["config", "user.name", "Test"], { cwd: tempRoot }); execFileSync("git", ["add", "."], { cwd: tempRoot }); execFileSync("git", ["commit", "-m", "fixture"], { cwd: tempRoot });
    await writeFile(join(tempRoot, "infra", "supabase", ".env"), `DASHBOARD_PASSWORD=${sentinel}\n`); await writeFile(join(tempRoot, "compose.env.local"), `X=${sentinel}\n`);
    assert.equal(spawnSync(process.execPath, [bootstrapScript, "bootstrap", "--apply"], { cwd: tempRoot, encoding: "utf8" }).status, 0);
    const source = await getCurrentSecretGeneration({ protectedRoot: join(tempRoot, "protected-recovery-material", "selfhosted"), supabaseEnvPath: join(tempRoot, "infra", "supabase", ".env"), godelEnvPath: join(tempRoot, "compose.env.local") });
    for (const args of [["rotate"], ["rotate", "--apply"], ["rollback", "--to", source.generationId], ["rollback", "--to", source.generationId, "--apply"]]) {
      const result = spawnSync(process.execPath, [script, ...args], { cwd: tempRoot, encoding: "utf8" }); assert.equal(result.status, 0); assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(sentinel));
    }
    const final = await getCurrentSecretGeneration({ protectedRoot: join(tempRoot, "protected-recovery-material", "selfhosted"), supabaseEnvPath: join(tempRoot, "infra", "supabase", ".env"), godelEnvPath: join(tempRoot, "compose.env.local") }); assert.equal(final.generationId, source.generationId); assert.equal(final.match, true);
  } finally { await rm(tempRoot, { recursive: true, force: true }); }
});
