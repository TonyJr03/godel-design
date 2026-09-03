import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { extractPullOnlyImageRequirements, formatValidationReport, validateImageLock, validateImageLockAgainstRepository } from "./image-acquisition.mjs";

const UPSTREAM = "e846d45ce64207b952a4df44ac8b480ea0abb27e";
const PLATFORM = { os: "linux", architecture: "amd64" };
const COMPOSE = `services:
  auth:
    image: supabase/gotrue:v2.189.0
  db:
    image: supabase/postgres:17.6.1.136
  storage:
    image: supabase/storage-api:v1.60.4
volumes:
  data:
`;
const BACKUP = 'const STORAGE_XATTR_IMAGE = "supabase/storage-api:v1.60.4";\nasync function runFilesystemHelper() {}\n';
const RESTORE = 'const STORAGE_XATTR_IMAGE = "supabase/storage-api:v1.60.4";\nasync function runRestoreFilesystem() {}\nasync function rebuildDbConfig() {}\n';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function digest(index) { return "sha256:" + index.toString(16).padStart(64, "0"); }

async function fixture() {
  const root = await mkdtemp(join(os.tmpdir(), "godel-image-lock-"));
  await Promise.all([mkdir(join(root, "infra", "supabase"), { recursive: true }), mkdir(join(root, "scripts", "operations"), { recursive: true })]);
  await Promise.all([
    writeFile(join(root, "infra", "supabase", "docker-compose.yml"), COMPOSE),
    writeFile(join(root, "scripts", "operations", "backup-selfhosted.mjs"), BACKUP),
    writeFile(join(root, "scripts", "operations", "restore-selfhosted.mjs"), RESTORE),
    writeFile(join(root, "infra", "SUPABASE_UPSTREAM.md"), "Pinned upstream " + UPSTREAM + "\n"),
    writeFile(join(root, "infra", "supabase-upstream.lock.json"), JSON.stringify({ base_ref: UPSTREAM })),
  ]);
  const requirements = await extractPullOnlyImageRequirements({ root });
  const sourceDigests = new Map();
  return {
    root,
    lock: {
      schemaVersion: 1,
      format: "godel-sh-portability-image-lock",
      platform: PLATFORM,
      supabaseUpstreamCommit: UPSTREAM,
      images: requirements.map((entry) => {
        const sourceIdentity = entry.canonicalRepository + "\u0000" + entry.sourceRef + "\u0000" + PLATFORM.os + "\u0000" + PLATFORM.architecture;
        if (!sourceDigests.has(sourceIdentity)) sourceDigests.set(sourceIdentity, digest(sourceDigests.size + 1));
        return { ...entry, manifestDigest: sourceDigests.get(sourceIdentity), platform: PLATFORM };
      }),
    },
  };
}

async function withFixture(run) {
  const value = await fixture();
  try { await run(value); } finally { await rm(value.root, { recursive: true, force: true }); }
}

test("a valid synthetic lock passes repository validation", async () => {
  await withFixture(async ({ root, lock }) => {
    const result = await validateImageLockAgainstRepository({ root, lock });
    assert.equal(result.imageCount, 6);
    assert.equal(result.requirementCount, 6);
  });
});

test("schema, digest, platform and duplicate logical names fail closed", async () => {
  await withFixture(async ({ lock }) => {
    const cases = [
      [(value) => { value.extra = true; }, /IMAGE_LOCK_SCHEMA/],
      [(value) => { value.images[0].manifestDigest = "sha256:ABC"; }, /IMAGE_LOCK_MANIFEST_DIGEST/],
      [(value) => { value.images[0].platform.architecture = "arm64"; }, /IMAGE_LOCK_PLATFORM/],
      [(value) => { value.images[1].logicalName = value.images[0].logicalName; }, /IMAGE_LOCK_DUPLICATE_LOGICAL_NAME/],
      [(value) => { value.schemaVersion = 2; }, /IMAGE_LOCK_SCHEMA/],
    ];
    for (const [mutate, expected] of cases) {
      const candidate = clone(lock);
      mutate(candidate);
      assert.throws(() => validateImageLock(candidate), expected);
    }
  });
});

test("same source identity requires one manifest digest across PostgreSQL authorities", async () => {
  await withFixture(async ({ lock }) => {
    const postgres = lock.images.filter((image) => image.canonicalRepository === "docker.io/supabase/postgres" && image.sourceRef === "supabase/postgres:17.6.1.136");
    assert.equal(postgres.length, 3);
    assert.equal(new Set(postgres.map((image) => image.manifestDigest)).size, 1);
    assert.doesNotThrow(() => validateImageLock(lock));
    const candidate = clone(lock);
    const conflictingPostgres = candidate.images.filter((image) => image.canonicalRepository === "docker.io/supabase/postgres" && image.sourceRef === "supabase/postgres:17.6.1.136");
    conflictingPostgres[1].manifestDigest = digest(99);
    assert.throws(() => validateImageLock(candidate), /IMAGE_LOCK_SOURCE_DIGEST_CONFLICT/);
  });
});

test("missing required image and stale Compose sourceRef are rejected", async () => {
  await withFixture(async ({ root, lock }) => {
    const missing = clone(lock);
    missing.images.pop();
    await assert.rejects(validateImageLockAgainstRepository({ root, lock: missing }), /IMAGE_LOCK_REPOSITORY_COVERAGE/);
    await writeFile(join(root, "infra", "supabase", "docker-compose.yml"), COMPOSE.replace("v2.189.0", "v2.190.0"));
    await assert.rejects(validateImageLockAgainstRepository({ root, lock }), /IMAGE_LOCK_REPOSITORY_COVERAGE/);
  });
});

test("a stale helper image source and an upstream mismatch are rejected", async () => {
  await withFixture(async ({ root, lock }) => {
    await writeFile(join(root, "scripts", "operations", "backup-selfhosted.mjs"), BACKUP.replace("v1.60.4", "v1.60.5"));
    await writeFile(join(root, "scripts", "operations", "restore-selfhosted.mjs"), RESTORE.replace("v1.60.4", "v1.60.5"));
    await assert.rejects(validateImageLockAgainstRepository({ root, lock }), /IMAGE_LOCK_REPOSITORY_COVERAGE/);
    await writeFile(join(root, "infra", "SUPABASE_UPSTREAM.md"), "Pinned upstream 1111111111111111111111111111111111111111\n");
    await assert.rejects(validateImageLockAgainstRepository({ root, lock }), /IMAGE_LOCK_UPSTREAM_BINDING/);
  });
});

test("Godel final images and tag-only authority are rejected", async () => {
  await withFixture(async ({ lock }) => {
    for (const sourceRef of ["godel-design-app:local", "godel-design-nginx:local"]) {
      const candidate = clone(lock);
      candidate.images.push({
        logicalName: sourceRef.startsWith("godel-design-app") ? "runtime-godel-app" : "runtime-godel-nginx",
        role: "runtime",
        canonicalRepository: "docker.io/" + sourceRef.slice(0, sourceRef.indexOf(":")),
        sourceRef,
        manifestDigest: digest(99),
        platform: PLATFORM,
        authority: "compose service final-image",
      });
      candidate.images.sort((left, right) => left.logicalName.localeCompare(right.logicalName));
      assert.throws(() => validateImageLock(candidate), /IMAGE_LOCK_GODEL_FINAL_IMAGE/);
    }
    const tagOnly = clone(lock);
    tagOnly.images[0].manifestDigest = tagOnly.images[0].sourceRef;
    assert.throws(() => validateImageLock(tagOnly), /IMAGE_LOCK_MANIFEST_DIGEST/);
  });
});

test("validation output is deterministic, sanitized and declares platform-manifest identity", async () => {
  await withFixture(async ({ root, lock }) => {
    const result = await validateImageLockAgainstRepository({ root, lock });
    const output = formatValidationReport(result);
    assert.equal(output, "PASS image-lock images=6 requirements=6 platform=linux/amd64 upstream=" + UPSTREAM);
    assert.doesNotMatch(output, /secret|env|password|token/i);
    assert.match(lock.images[0].manifestDigest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(lock.images[0].platform, PLATFORM);
  });
});
