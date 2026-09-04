import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquirePullOnlyImages, createDockerImageAdapter, extractPullOnlyImageRequirements, formatValidationReport, normalizedImmutableImageInventory, readImageLockIdentity, renderImageAcquisitionResult, validateImageLock, validateImageLockAgainstRepository } from "./image-acquisition.mjs";

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

function reconstructionManifest(lock, sha256 = "a".repeat(64)) {
  return { platform: PLATFORM, imageAuthority: { sha256, images: normalizedImmutableImageInventory(lock) } };
}
function immutableReference(image) { return `${image.canonicalRepository}@${image.manifestDigest}`; }
function fakeDocker(lock, { inspect = (image) => ({ os: "linux", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: `private-image-${image.manifestDigest}` }) } = {}) {
  const actions = [], aliases = new Map(), images = new Map(lock.images.map((image) => [immutableReference(image), image]));
  return {
    actions, aliases,
    docker: {
      async pullExactImage(reference) { actions.push(["pull", reference]); if (!images.has(reference)) throw new Error("unexpected pull"); },
      async inspectImage(reference) { actions.push(["inspect", reference]); return inspect(images.get(reference)); },
      async tagImage(reference, alias) { actions.push(["tag", reference, alias]); aliases.set(alias, reference); },
      async inspectAlias(alias) { actions.push(["inspect-alias", alias]); return inspect(images.get(aliases.get(alias))); },
    },
  };
}
async function acquire(lock, options = {}) {
  const fake = options.fake ?? fakeDocker(lock);
  const result = await acquirePullOnlyImages({ manifestPath: "external-manifest.json", root: options.root, docker: fake.docker, gate: options.gate ?? (async () => ({ state: "PASS" })), readManifest: async () => ({ manifest: options.manifest ?? reconstructionManifest(lock, options.manifestSha256 ?? "a".repeat(64)) }), readLockIdentity: async () => ({ lock, sha256: options.lockSha256 ?? "a".repeat(64) }), validateLock: options.validateLock ?? (async () => ({ state: "PASS" })) });
  return { result, actions: fake.actions };
}

test("raw lock identity hashes exact file bytes without JSON reserialization", async () => {
  await withFixture(async ({ root, lock }) => {
    const bytes = Buffer.from(`${JSON.stringify(lock)}\n`, "utf8");
    await writeFile(join(root, "infra", "sh-portability-image-lock.json"), bytes);
    const identity = await readImageLockIdentity({ root });
    assert.equal(identity.sha256, createHash("sha256").update(bytes).digest("hex"));
    assert.deepEqual(identity.lock, lock);
  });
});

test("authority and clean-host failures happen before any Docker action", async () => {
  await withFixture(async ({ lock }) => {
    for (const options of [
      { lockSha256: "b".repeat(64) },
      { manifest: { ...reconstructionManifest(lock), imageAuthority: { sha256: "a".repeat(64), images: [] } } },
      { validateLock: async () => { throw new Error("IMAGE_LOCK_REPOSITORY_COVERAGE"); } },
      { gate: async () => { throw new Error("CLEAN_HOST_TARGET_VOLUME_PRESENT"); } },
    ]) {
      const fake = fakeDocker(lock);
      await assert.rejects(() => acquire(lock, { ...options, fake }));
      assert.deepEqual(fake.actions, []);
    }
  });
});

test("acquisition pulls each immutable physical image once and creates verified source aliases", async () => {
  await withFixture(async ({ lock }) => {
    const { result, actions } = await acquire(lock);
    const physical = new Set(lock.images.map(immutableReference));
    const aliases = new Set(lock.images.map((image) => `${image.sourceRef}\0${image.manifestDigest}`));
    assert.deepEqual(result, { state: "PASS", logicalAuthorities: lock.images.length, uniqueImages: physical.size, verifiedImages: physical.size, executionAliases: aliases.size, platform: "linux/amd64", registryConnectivity: "PASS" });
    assert.deepEqual(new Set(actions.filter(([kind]) => kind === "pull").map(([, reference]) => reference)), physical);
    assert.equal(actions.filter(([kind]) => kind === "pull").some(([, reference]) => lock.images.some((image) => reference === image.sourceRef)), false);
    assert.equal(actions.filter(([kind]) => kind === "tag").length, aliases.size);
    assert.equal(actions.some(([kind]) => /run|create|build|compose|network|volume|rm|prune/.test(kind)), false);
  });
});

test("inspection failures, pull failure and alias mismatch fail closed without deletion", async () => {
  await withFixture(async ({ lock }) => {
    for (const inspect of [
      (image) => ({ os: "windows", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: "id" }),
      (image) => ({ os: "linux", architecture: "arm64", repoDigests: [immutableReference(image)], imageId: "id" }),
      () => ({ os: "linux", architecture: "amd64", repoDigests: [], imageId: "id" }),
    ]) await assert.rejects(() => acquire(lock, { fake: fakeDocker(lock, { inspect }) }), /IMAGE_ACQUISITION_(LOCAL_IMAGE_PLATFORM|LOCAL_REPODIGEST)/);
    const failing = fakeDocker(lock); failing.docker.pullExactImage = async (reference) => { failing.actions.push(["pull", reference]); if (failing.actions.filter(([kind]) => kind === "pull").length > 1) throw new Error("registry unavailable"); };
    await assert.rejects(() => acquire(lock, { fake: failing }), /IMAGE_ACQUISITION_PULL_FAILED/);
    assert.equal(failing.actions.filter(([kind]) => kind === "pull").length, 2);
    const aliasMismatch = fakeDocker(lock); aliasMismatch.docker.inspectAlias = async (alias) => { aliasMismatch.actions.push(["inspect-alias", alias]); const image = lock.images.find((item) => item.sourceRef === alias); return { os: "linux", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: "other-local-image" }; };
    await assert.rejects(() => acquire(lock, { fake: aliasMismatch }), /IMAGE_ACQUISITION_SOURCE_REF_ALIAS_MISMATCH/);
    assert.equal([...failing.actions, ...aliasMismatch.actions].some(([kind]) => kind === "image-rm" || kind === "prune"), false);
  });
});

test("a wrong preexisting sourceRef is safely rebound after immutable verification", async () => {
  await withFixture(async ({ lock }) => {
    const fake = fakeDocker(lock), image = lock.images[0];
    fake.aliases.set(image.sourceRef, "docker.io/foreign/cache@sha256:" + "f".repeat(64));
    await acquire(lock, { fake });
    assert.equal(fake.actions.some(([kind, reference, alias]) => kind === "tag" && reference === immutableReference(image) && alias === image.sourceRef), true);
    assert.equal(fake.actions.some(([kind]) => kind === "image-rm" || kind === "prune"), false);
  });
});

test("public acquisition evidence omits synthetic image IDs and private adapter details", async () => {
  await withFixture(async ({ lock }) => {
    const { result } = await acquire(lock, { fake: fakeDocker(lock, { inspect: (image) => ({ os: "linux", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: "sha256:private-local-image-id" }) }) });
    const output = renderImageAcquisitionResult(result);
    assert.doesNotMatch(output, /private-local-image-id|credentials|token|\/private/);
  });
});

test("default Docker adapter uses only image-cache acquisition command families", async () => {
  await withFixture(async ({ root, lock }) => {
    const actions = [], aliases = new Map(), physical = new Set(lock.images.map(immutableReference));
    const runner = async (_binary, args) => {
      actions.push(args);
      if (args[0] === "tag") aliases.set(args[2], args[1]);
      if (args[0] !== "image") return { stdout: "" };
      const reference = aliases.get(args[2]) ?? args[2];
      return { stdout: JSON.stringify([{ Os: "linux", Architecture: "amd64", RepoDigests: [reference], Id: `private-id-${[...physical].indexOf(reference)}` }]) };
    };
    const docker = createDockerImageAdapter({ root, runner });
    await acquirePullOnlyImages({ manifestPath: "external", root, docker, gate: async () => ({ state: "PASS" }), readManifest: async () => ({ manifest: reconstructionManifest(lock) }), readLockIdentity: async () => ({ lock, sha256: "a".repeat(64) }), validateLock: async () => ({ state: "PASS" }) });
    assert.equal(actions.every((args) => args[0] === "pull" || (args[0] === "image" && args[1] === "inspect") || args[0] === "tag"), true);
    assert.equal(actions.some((args) => args.some((value) => /^(run|create|build|compose|network|volume|rm|prune)$/.test(value))), false);
    assert.equal(actions.filter((args) => args[0] === "pull").every((args) => args[1] === "--platform" && args[2] === "linux/amd64" && physical.has(args[3])), true);
  });
});
