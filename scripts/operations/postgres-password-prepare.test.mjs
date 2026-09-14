import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  EXTERNAL_SECRET_GENERATION_FORMAT,
  EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION,
  EXTERNAL_SECRET_SNAPSHOT_FILES,
  acquireGenerationMutationLock,
  bootstrapSecretGeneration,
  generationMutationLockPath,
  getCurrentSecretGeneration,
  readGenerationMutationLock,
  readSecretGeneration,
  releaseGenerationMutationLock,
} from "./secret-generation.mjs";
import { validatePostgresPasswordRotationCandidate } from "./postgres-password-rotation.mjs";
import {
  parsePostgresPasswordPrepareCli,
  preparePostgresPasswordRotation,
  renderPostgresPasswordPrepareFailure,
  renderPostgresPasswordPrepareResult,
} from "./postgres-password-prepare.mjs";

const sourcePassword32 = "a".repeat(32);
const sourcePassword64 = "c".repeat(64);
const targetPassword = "b".repeat(64);
const serviceRoleKey = "SYNTHETIC_SERVICE_ROLE_DO_NOT_PRINT";
const tenantId = "SYNTHETIC_TENANT_DO_NOT_PRINT";

function environment(password) {
  return `POSTGRES_PASSWORD=${password}\nSERVICE_ROLE_KEY=${serviceRoleKey}\nPOOLER_TENANT_ID=${tenantId}\nOTHER=retained\n`;
}

async function fixture({ password = sourcePassword32 } = {}) {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-postgres-prepare-"));
  const root = join(tempRoot, "repo");
  const protectedRoot = join(tempRoot, "protected");
  const supabaseEnvPath = join(tempRoot, "supabase.env");
  const godelEnvPath = join(tempRoot, "godel.env");
  await mkdir(root);
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  await writeFile(join(root, ".keep"), "x\n");
  execFileSync("git", ["add", ".keep"], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root, stdio: "ignore" });
  await writeFile(supabaseEnvPath, environment(password), { mode: 0o600 });
  await writeFile(godelEnvPath, "GODEL=retained\n", { mode: 0o600 });
  const value = { tempRoot, root, protectedRoot, supabaseEnvPath, godelEnvPath };
  await bootstrapSecretGeneration({ ...value, apply: true });
  return value;
}

async function withFixture(options, run) {
  const value = await fixture(options);
  try { await run(value); } finally { await rm(value.tempRoot, { recursive: true, force: true }); }
}

async function assertLockAbsent(value) {
  await assert.rejects(() => readFile(generationMutationLockPath(value.protectedRoot)), /ENOENT/);
}

async function writeLock(value, { operation, generationId }) {
  await writeFile(generationMutationLockPath(value.protectedRoot), `${JSON.stringify({ schemaVersion: 1, operation, generationId, startedAt: new Date().toISOString() })}\n`);
}

test("dry run resolves a matched source without generating, publishing, or locking a target", async () => withFixture({}, async (value) => {
  const before = await getCurrentSecretGeneration(value);
  const result = await preparePostgresPasswordRotation({
    ...value,
    hooks: {
      generatePostgresPassword: () => { throw new Error("TARGET_GENERATION_MUST_NOT_RUN"); },
      publishSecretGeneration: () => { throw new Error("PUBLICATION_MUST_NOT_RUN"); },
    },
  });
  assert.deepEqual(result, { state: "DRY_RUN", sourceGenerationId: before.generationId, targetPolicy: "D5_64_ONLY" });
  assert.equal((await getCurrentSecretGeneration(value)).generationId, before.generationId);
  await assertLockAbsent(value);
}));

test("prepare publishes a dormant D5 target from a legacy32 source through the central registry", async () => withFixture({}, async (value) => {
  const source = await getCurrentSecretGeneration(value);
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: value.root, encoding: "utf8" }).trim();
  const result = await preparePostgresPasswordRotation({
    ...value,
    apply: true,
    hooks: {
      generatePostgresPassword: () => targetPassword,
      afterLockAcquired: async ({ targetGenerationId }) => {
        assert.deepEqual(await readGenerationMutationLock({ protectedRoot: value.protectedRoot }), { state: "PRESENT", schemaVersion: 1, operation: "postgres-password-prepare", generationId: targetGenerationId, startedAt: (await readGenerationMutationLock({ protectedRoot: value.protectedRoot })).startedAt });
      },
    },
  });
  const target = await readSecretGeneration({ protectedRoot: value.protectedRoot, generationId: result.targetGenerationId });
  const active = await getCurrentSecretGeneration(value);
  assert.deepEqual(result, { state: "PREPARED", sourceGenerationId: source.generationId, targetGenerationId: result.targetGenerationId });
  assert.notEqual(result.targetGenerationId, source.generationId);
  assert.equal(target.metadata.reason, "postgres-password-rotation");
  assert.equal(target.metadata.sourceGenerationId, source.generationId);
  assert.equal(target.metadata.repositoryCommit, commit);
  assert.equal(target.metadata.generationId, result.targetGenerationId);
  assert.equal(target.metadata.format, EXTERNAL_SECRET_GENERATION_FORMAT);
  assert.equal(target.metadata.schemaVersion, EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION);
  assert.deepEqual(target.metadata.files, EXTERNAL_SECRET_SNAPSHOT_FILES);
  assert.deepEqual(Object.keys(target.metadata), ["format", "schemaVersion", "generationId", "createdAt", "repositoryCommit", "reason", "sourceGenerationId", "files"]);
  validatePostgresPasswordRotationCandidate({
    sourceSupabaseSnapshot: source.generation.supabaseSnapshot,
    candidateSupabaseSnapshot: target.supabaseSnapshot,
    sourceGodelSnapshot: source.generation.godelSnapshot,
    candidateGodelSnapshot: target.godelSnapshot,
  });
  assert.equal(active.generationId, source.generationId);
  assert.equal(active.match, true);
  assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot);
  assert.deepEqual(await readFile(value.godelEnvPath), source.generation.godelSnapshot);
  assert.deepEqual(target.godelSnapshot, source.generation.godelSnapshot);
  await assertLockAbsent(value);
}));

test("prepare supports future D5_64 to D5_64 rotations", async () => withFixture({ password: sourcePassword64 }, async (value) => {
  const source = await getCurrentSecretGeneration(value);
  const result = await preparePostgresPasswordRotation({ ...value, apply: true, hooks: { generatePostgresPassword: () => targetPassword } });
  const target = await readSecretGeneration({ protectedRoot: value.protectedRoot, generationId: result.targetGenerationId });
  validatePostgresPasswordRotationCandidate({ sourceSupabaseSnapshot: source.generation.supabaseSnapshot, candidateSupabaseSnapshot: target.supabaseSnapshot, sourceGodelSnapshot: source.generation.godelSnapshot, candidateGodelSnapshot: target.godelSnapshot });
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
}));

test("a target with legacy32 length is rejected before publication", async () => withFixture({}, async (value) => {
  await assert.rejects(
    () => preparePostgresPasswordRotation({ ...value, apply: true, hooks: { generatePostgresPassword: () => "b".repeat(32) } }),
    /POSTGRES_ROTATION_PASSWORD_INVALID/,
  );
  await assertLockAbsent(value);
}));

test("unrelated locks and dirty repositories fail before target generation or publication", async () => withFixture({}, async (value) => {
  let generated = false;
  const lock = await acquireGenerationMutationLock({ protectedRoot: value.protectedRoot, operation: "other-operation", generationId: "123e4567-e89b-12d3-a456-426614174000" });
  try {
    await assert.rejects(() => preparePostgresPasswordRotation({ ...value, apply: true, hooks: { generatePostgresPassword: () => { generated = true; return targetPassword; } } }), /GENERATION_MUTATION_IN_PROGRESS/);
    assert.equal(generated, false);
  } finally { await releaseGenerationMutationLock(lock); }
  await writeFile(join(value.root, "dirty.txt"), "dirty\n");
  await assert.rejects(() => preparePostgresPasswordRotation({ ...value, apply: true, hooks: { generatePostgresPassword: () => { generated = true; return targetPassword; } } }), /POSTGRES_PASSWORD_PREPARE_REPOSITORY_DIRTY/);
  assert.equal(generated, false);
}));

test("source mismatches before or after locking do not publish a target", async () => withFixture({}, async (value) => {
  await writeFile(value.supabaseEnvPath, environment("d".repeat(32)));
  await assert.rejects(() => preparePostgresPasswordRotation({ ...value, apply: true }), /POSTGRES_PASSWORD_PREPARE_SOURCE_UNVERIFIED/);

  await writeFile(value.supabaseEnvPath, environment(sourcePassword32));
  await assert.rejects(
    () => preparePostgresPasswordRotation({ ...value, apply: true, hooks: {
      afterLockAcquired: async () => { await writeFile(value.supabaseEnvPath, environment("d".repeat(32))); },
    } }),
    /POSTGRES_PASSWORD_PREPARE_SOURCE_UNVERIFIED/,
  );
  assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));

test("ambiguous publication and post-publication validation failures retain the prepare lock", async () => withFixture({}, async (value) => {
  const source = await getCurrentSecretGeneration(value);
  await assert.rejects(
    () => preparePostgresPasswordRotation({ ...value, apply: true, hooks: { generatePostgresPassword: () => targetPassword, beforePublicationAttempt: () => { throw new Error("synthetic ambiguous publication"); } } }),
    /POSTGRES_PASSWORD_PREPARE_STATE_UNVERIFIED/,
  );
  assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
  await releaseGenerationMutationLock(generationMutationLockPath(value.protectedRoot));

  await assert.rejects(
    () => preparePostgresPasswordRotation({ ...value, apply: true, hooks: {
      generatePostgresPassword: () => targetPassword,
      afterTargetPublished: async ({ targetGenerationId }) => {
        await writeFile(join(value.protectedRoot, "external-secrets", "generations", targetGenerationId, "godel.env"), "GODEL=mutated\n");
      },
    } }),
    /POSTGRES_PASSWORD_PREPARE_PUBLISHED_UNVERIFIED/,
  );
  assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot);
}));

test("readback rejects corrupt target metadata and candidate snapshots while retaining the lock", async () => {
  const corruptions = [
    async ({ directory }) => {
      const metadataPath = join(directory, "metadata.json");
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      metadata.reason = "wrong-reason";
      await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
    },
    async ({ directory }) => {
      const metadataPath = join(directory, "metadata.json");
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      metadata.sourceGenerationId = "123e4567-e89b-12d3-a456-426614174000";
      await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
    },
    async ({ directory }) => {
      const metadataPath = join(directory, "metadata.json");
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      metadata.repositoryCommit = "d".repeat(40);
      await writeFile(metadataPath, `${JSON.stringify(metadata)}\n`);
    },
    async ({ directory }) => {
      const path = join(directory, "supabase.env");
      await writeFile(path, (await readFile(path, "utf8")).replace("OTHER=retained", "OTHER=changed"));
    },
    async ({ directory }) => {
      const path = join(directory, "supabase.env");
      await writeFile(path, (await readFile(path, "utf8")).replace(targetPassword, "b".repeat(32)));
    },
  ];
  for (const corrupt of corruptions) {
    await withFixture({}, async (value) => {
      const source = await getCurrentSecretGeneration(value);
      await assert.rejects(
        () => preparePostgresPasswordRotation({ ...value, apply: true, hooks: {
          generatePostgresPassword: () => targetPassword,
          afterTargetPublished: ({ targetGenerationId }) => corrupt({ directory: join(value.protectedRoot, "external-secrets", "generations", targetGenerationId) }),
        } }),
        /POSTGRES_PASSWORD_PREPARE_PUBLISHED_UNVERIFIED/,
      );
      assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
      assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
      assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot);
    });
  }
});

test("TARGET_PREPARED accepts an absent authoritative lock readback even when release throws", async () => withFixture({}, async (value) => {
  let targetGenerationId = null;
  const result = await preparePostgresPasswordRotation({
    ...value,
    apply: true,
    hooks: {
      generatePostgresPassword: () => targetPassword,
      afterTargetPublished: ({ targetGenerationId: id }) => { targetGenerationId = id; },
      releaseGenerationMutationLock: async (lock) => {
        await releaseGenerationMutationLock(lock);
        throw new Error("synthetic release after removal");
      },
    },
  });
  assert.equal(result.state, "PREPARED");
  assert.equal(result.targetGenerationId, targetGenerationId);
  assert.ok(await readSecretGeneration({ protectedRoot: value.protectedRoot, generationId: targetGenerationId }));
  assert.equal((await getCurrentSecretGeneration(value)).match, true);
  await assertLockAbsent(value);
}));

test("TARGET_PREPARED reports retained matching locks without reclassifying the candidate", async () => withFixture({}, async (value) => {
  const source = await getCurrentSecretGeneration(value);
  let targetGenerationId = null;
  await assert.rejects(
    () => preparePostgresPasswordRotation({
      ...value,
      apply: true,
      hooks: {
        generatePostgresPassword: () => targetPassword,
        afterTargetPublished: ({ targetGenerationId: id }) => { targetGenerationId = id; },
        releaseGenerationMutationLock: async () => { throw new Error("synthetic retained lock"); },
      },
    }),
    /POSTGRES_PASSWORD_PREPARE_LOCK_RETAINED/,
  );
  assert.ok(await readSecretGeneration({ protectedRoot: value.protectedRoot, generationId: targetGenerationId }));
  assert.deepEqual(await readGenerationMutationLock({ protectedRoot: value.protectedRoot }), {
    state: "PRESENT", schemaVersion: 1, operation: "postgres-password-prepare", generationId: targetGenerationId,
    startedAt: (await readGenerationMutationLock({ protectedRoot: value.protectedRoot })).startedAt,
  });
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot);
}));

test("TARGET_PREPARED classifies unreadable and foreign lock states without deleting a foreign lock", async () => {
  await withFixture({}, async (value) => {
    let reads = 0;
    await assert.rejects(
      () => preparePostgresPasswordRotation({
        ...value,
        apply: true,
        hooks: {
          generatePostgresPassword: () => targetPassword,
          readGenerationMutationLock: async (input) => {
            reads += 1;
            if (reads === 1) return readGenerationMutationLock(input);
            throw new Error("synthetic lock read failure");
          },
        },
      }),
      /POSTGRES_PASSWORD_PREPARE_LOCK_STATE_UNVERIFIED/,
    );
    assert.equal(reads, 2);
  });

  await withFixture({}, async (value) => {
    let released = false;
    const foreignGenerationId = "123e4567-e89b-12d3-a456-426614174000";
    await assert.rejects(
      () => preparePostgresPasswordRotation({
        ...value,
        apply: true,
        hooks: {
          generatePostgresPassword: () => targetPassword,
          afterTargetPublished: () => writeLock(value, { operation: "foreign-operation", generationId: foreignGenerationId }),
          releaseGenerationMutationLock: async () => { released = true; },
        },
      }),
      /POSTGRES_PASSWORD_PREPARE_LOCK_STATE_UNVERIFIED/,
    );
    assert.equal(released, false);
    const foreign = await readGenerationMutationLock({ protectedRoot: value.protectedRoot });
    assert.equal(foreign.operation, "foreign-operation");
    assert.equal(foreign.generationId, foreignGenerationId);
  });
});

test("TARGET_PREPARED never retries release when post-attempt readback finds a foreign lock", async () => withFixture({}, async (value) => {
  const foreignGenerationId = "123e4567-e89b-12d3-a456-426614174000";
  let releaseCalls = 0;
  await assert.rejects(
    () => preparePostgresPasswordRotation({
      ...value,
      apply: true,
      hooks: {
        generatePostgresPassword: () => targetPassword,
        releaseGenerationMutationLock: async (lock) => {
          releaseCalls += 1;
          await releaseGenerationMutationLock(lock);
          await writeLock(value, { operation: "foreign-operation", generationId: foreignGenerationId });
        },
      },
    }),
    /POSTGRES_PASSWORD_PREPARE_LOCK_STATE_UNVERIFIED/,
  );
  assert.equal(releaseCalls, 1);
  const foreign = await readGenerationMutationLock({ protectedRoot: value.protectedRoot });
  assert.equal(foreign.operation, "foreign-operation");
  assert.equal(foreign.generationId, foreignGenerationId);
}));

test("CLI parser and public renderers are restricted and secret-free", () => {
  assert.deepEqual(parsePostgresPasswordPrepareCli(["prepare"]), { command: "prepare", value: { protectedRoot: resolve(process.cwd(), "protected-recovery-material/selfhosted"), supabaseEnvPath: resolve(process.cwd(), "infra/supabase/.env"), godelEnvPath: resolve(process.cwd(), "compose.env.local"), apply: false } });
  assert.equal(parsePostgresPasswordPrepareCli(["prepare", "--apply"]).value.apply, true);
  for (const args of [["--help"], ["prepare", "--password", "x"], ["activate"], ["prepare", "--to", "x"]]) {
    assert.throws(() => parsePostgresPasswordPrepareCli([...args]), /POSTGRES_PASSWORD_PREPARE_(COMMAND|ARGUMENT)_INVALID/);
  }
  const prepared = renderPostgresPasswordPrepareResult({ state: "PREPARED", sourceGenerationId: "123e4567-e89b-12d3-a456-426614174000", targetGenerationId: "223e4567-e89b-12d3-a456-426614174000" });
  const failed = renderPostgresPasswordPrepareFailure(new Error(`${targetPassword}:${serviceRoleKey}:${tenantId}`));
  assert.doesNotMatch(prepared, new RegExp(targetPassword));
  assert.doesNotMatch(failed, /bbbb|SYNTHETIC_/);
  assert.match(failed, /^FAIL POSTGRES_PASSWORD_PREPARE_FAILED$/m);
});

test("prepare module is registry-only and cannot activate, write environments, or import runtime adapters", async () => {
  const source = await readFile(new URL("./postgres-password-prepare.mjs", import.meta.url), "utf8");
  assert.match(source, /publishSecretGeneration/);
  assert.match(source, /execFileAsync\("git", \["status", "--porcelain"\]/);
  assert.doesNotMatch(source, /replaceCurrentGenerationPointer|writeAllowlistedEnvironmentFile/);
  assert.doesNotMatch(source, /postgres-password-(?:live-)?runtime|postgres-password-rollback/);
  assert.doesNotMatch(source, /docker|psql|curl|fetch|maintenance/i);
});
