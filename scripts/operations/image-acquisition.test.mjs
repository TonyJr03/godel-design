import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acquirePullOnlyImages, assertVerifiedRegistryImage, createDockerImageAdapter, extractPullOnlyImageRequirements, formatValidationReport, normalizedImmutableImageInventory, readImageLock, readImageLockIdentity, renderImageAcquisitionResult, validateBuildBaseSourceIndex, validateImageLock, validateImageLockAgainstRepository, validateRawRegistryManifest, verifyLocalImageIdentity } from "./image-acquisition.mjs";

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
const rawRegistries = new WeakMap();

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function digest(index) { return "sha256:" + index.toString(16).padStart(64, "0"); }

async function fixture() {
  const root = await mkdtemp(join(os.tmpdir(), "godel-image-lock-"));
  await Promise.all([mkdir(join(root, "infra", "supabase"), { recursive: true }), mkdir(join(root, "scripts", "operations"), { recursive: true })]);
  const registry = new Map(), buildBases = new Map();
  for (const [sourceRef, configDigest] of [["node:24-bookworm-slim", digest(91)], ["nginxinc/nginx-unprivileged:stable-bookworm", digest(92)]]) {
    const child = Buffer.from(JSON.stringify({ schemaVersion: 2, config: { digest: configDigest } })), manifestDigest = "sha256:" + createHash("sha256").update(child).digest("hex");
    const index = Buffer.from(JSON.stringify({ mediaType: "application/vnd.oci.image.index.v1+json", manifests: [{ digest: manifestDigest, platform: PLATFORM }] })), sourceIndexDigest = "sha256:" + createHash("sha256").update(index).digest("hex");
    const repository = sourceRef.startsWith("node:") ? "docker.io/library/node" : "docker.io/nginxinc/nginx-unprivileged";
    buildBases.set(sourceRef, { configDigest, manifestDigest, sourceIndexDigest }); registry.set(repository + "@" + sourceIndexDigest, index); registry.set(repository + "@" + manifestDigest, child);
  }
  const app = buildBases.get("node:24-bookworm-slim"), nginx = buildBases.get("nginxinc/nginx-unprivileged:stable-bookworm");
  const appDockerfile = `FROM node:24-bookworm-slim@${app.sourceIndexDigest} AS base\nFROM base AS runner\n`, nginxDockerfile = `FROM nginxinc/nginx-unprivileged:stable-bookworm@${nginx.sourceIndexDigest}\n`;
  await Promise.all([
    writeFile(join(root, "infra", "supabase", "docker-compose.yml"), COMPOSE),
    writeFile(join(root, "scripts", "operations", "backup-selfhosted.mjs"), BACKUP),
    writeFile(join(root, "scripts", "operations", "restore-selfhosted.mjs"), RESTORE),
    writeFile(join(root, "infra", "SUPABASE_UPSTREAM.md"), "Pinned upstream " + UPSTREAM + "\n"),
    writeFile(join(root, "infra", "supabase-upstream.lock.json"), JSON.stringify({ base_ref: UPSTREAM })),
    writeFile(join(root, "Dockerfile"), appDockerfile),
    writeFile(join(root, "Dockerfile.nginx"), nginxDockerfile),
  ]);
  const requirements = await extractPullOnlyImageRequirements({ root });
  const sourceDigests = new Map();
  const images = requirements.map((entry) => {
    const sourceIdentity = entry.canonicalRepository + "\u0000" + entry.sourceRef + "\u0000" + PLATFORM.os + "\u0000" + PLATFORM.architecture;
    if (!sourceDigests.has(sourceIdentity)) sourceDigests.set(sourceIdentity, { manifestDigest: digest(sourceDigests.size + 1), configDigest: digest(sourceDigests.size + 33) });
    const image = { ...entry, ...sourceDigests.get(sourceIdentity), platform: PLATFORM };
    if (image.role === "build-base") {
      Object.assign(image, buildBases.get(image.sourceRef));
    }
    return image;
  });
  const lock = {
    schemaVersion: 3,
    format: "godel-sh-portability-image-lock",
    platform: PLATFORM,
    supabaseUpstreamCommit: UPSTREAM,
    images,
  };
  rawRegistries.set(lock, registry);
  return {
    root,
    lock,
  };
}

async function withFixture(run) {
  const value = await fixture();
  try { await run(value); } finally { await rm(value.root, { recursive: true, force: true }); }
}

test("a valid synthetic lock passes repository validation", async () => {
  await withFixture(async ({ root, lock }) => {
    const result = await validateImageLockAgainstRepository({ root, lock });
    assert.equal(result.imageCount, 8);
    assert.equal(result.requirementCount, 8);
  });
});

test("schema, digest, platform and duplicate logical names fail closed", async () => {
  await withFixture(async ({ lock }) => {
    const cases = [
      [(value) => { value.extra = true; }, /IMAGE_LOCK_SCHEMA/],
      [(value) => { value.images[0].manifestDigest = "sha256:ABC"; }, /IMAGE_LOCK_MANIFEST_DIGEST/],
      [(value) => { value.images[0].platform.architecture = "arm64"; }, /IMAGE_LOCK_PLATFORM/],
      [(value) => { value.images[1].logicalName = value.images[0].logicalName; }, /IMAGE_LOCK_DUPLICATE_LOGICAL_NAME/],
      [(value) => { value.schemaVersion = 1; }, /IMAGE_LOCK_SCHEMA/],
      [(value) => { value.schemaVersion = 2; }, /IMAGE_LOCK_SCHEMA/],
      [(value) => { delete value.images[0].configDigest; }, /IMAGE_LOCK_IMAGE_SCHEMA/],
      [(value) => { value.images[0].configDigest = "sha256:ABC"; }, /IMAGE_LOCK_CONFIG_DIGEST/],
    ];
    for (const [mutate, expected] of cases) {
      const candidate = clone(lock);
      mutate(candidate);
      assert.throws(() => validateImageLock(candidate), expected);
    }
  });
});

test("repository authority contains sixteen logical images, two build bases, and exact Dockerfile index bindings", async () => {
  const lock = await readImageLock();
  const result = await validateImageLockAgainstRepository({ lock });
  const bases = lock.images.filter((image) => image.role === "build-base");
  assert.equal(result.imageCount, 16); assert.equal(result.requirementCount, 16); assert.equal(bases.length, 2);
  assert.deepEqual(bases.map((image) => [image.logicalName, image.sourceRef, image.sourceIndexDigest]), [["build-base-nginx", "nginxinc/nginx-unprivileged:stable-bookworm", "sha256:cd33960e98e93d4d63385790ff7f8f5bf2ca95184c581b7f42ae8aea1139fbfc"], ["build-base-node", "node:24-bookworm-slim", "sha256:cd84903a12dbd26b46f1f3b8144a2568c41c5d37ddd0c7a80a34c7a19786b35f"]]);
});

test("build-base Dockerfile bindings reject missing, extra, and wrong index authorities", async () => {
  await withFixture(async ({ root, lock }) => {
    for (const mutate of [
      (value) => value.images.splice(value.images.findIndex((image) => image.logicalName === "build-base-node"), 1),
      (value) => value.images.push({ ...value.images.find((image) => image.logicalName === "build-base-node"), logicalName: "build-base-extra", authority: "Dockerfile extra FROM" }),
      (value) => { value.images.find((image) => image.logicalName === "build-base-node").sourceIndexDigest = digest(99); },
      (value) => { value.images.find((image) => image.logicalName === "build-base-node").sourceRef = "node:25-bookworm-slim"; },
    ]) {
      const candidate = clone(lock); mutate(candidate); candidate.images.sort((left, right) => left.logicalName.localeCompare(right.logicalName));
      await assert.rejects(validateImageLockAgainstRepository({ root, lock: candidate }), /IMAGE_LOCK_(REPOSITORY_COVERAGE|SOURCE_INDEX_DIGEST)/);
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
        canonicalRepository: "docker.io/library/" + sourceRef.slice(0, sourceRef.indexOf(":")),
        sourceRef,
        manifestDigest: digest(99),
        configDigest: digest(100),
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
    assert.equal(output, "PASS image-lock images=8 requirements=8 platform=linux/amd64 upstream=" + UPSTREAM);
    assert.doesNotMatch(output, /secret|env|password|token/i);
    assert.match(lock.images[0].manifestDigest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(lock.images[0].platform, PLATFORM);
  });
});

function reconstructionManifest(lock, sha256 = "a".repeat(64)) {
  return { platform: PLATFORM, repository: { gitCommit: "a".repeat(40) }, imageAuthority: { sha256, images: normalizedImmutableImageInventory(lock) } };
}
function immutableReference(image) { return `${image.canonicalRepository}@${image.manifestDigest}`; }
function fakeDocker(lock, { inspect = (image) => ({ os: "linux", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: image.configDigest }) } = {}) {
  const actions = [], aliases = new Map(), images = new Map(lock.images.map((image) => [immutableReference(image), image]));
  return {
    actions, aliases,
    docker: {
      async pullExactImage(reference) { actions.push(["pull", reference]); if (!images.has(reference)) throw new Error("unexpected pull"); },
      async rawManifest(reference) { actions.push(["raw", reference]); const bytes = rawRegistries.get(lock)?.get(reference); if (!bytes) throw new Error("unexpected raw manifest"); return bytes; },
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

test("commit-snapshot image-lock authority ignores a CRLF working-tree representation", async () => {
  await withFixture(async ({ root, lock }) => {
    const lockBytes = Buffer.from(`${JSON.stringify(lock)}\n`);
    const [appDockerfile, nginxDockerfile] = await Promise.all([readFile(join(root, "Dockerfile")), readFile(join(root, "Dockerfile.nginx"))]);
    const repository = new Map([
      ["infra/sh-portability-image-lock.json", lockBytes],
      ["infra/supabase/docker-compose.yml", Buffer.from(COMPOSE)],
      ["scripts/operations/backup-selfhosted.mjs", Buffer.from(BACKUP)],
      ["scripts/operations/restore-selfhosted.mjs", Buffer.from(RESTORE)],
      ["Dockerfile", appDockerfile],
      ["Dockerfile.nginx", nginxDockerfile],
      ["infra/SUPABASE_UPSTREAM.md", Buffer.from("Pinned upstream " + UPSTREAM + "\n")],
      ["infra/supabase-upstream.lock.json", Buffer.from(JSON.stringify({ base_ref: UPSTREAM }))],
    ]);
    await writeFile(join(root, "infra", "sh-portability-image-lock.json"), lockBytes.toString("utf8").replace(/\n/g, "\r\n"));
    const readRepositoryFile = async (repositoryPath) => repository.get(repositoryPath);
    const identity = await readImageLockIdentity({ root, readRepositoryFile });
    assert.equal(identity.sha256, createHash("sha256").update(lockBytes).digest("hex"));
    assert.notEqual(identity.sha256, createHash("sha256").update(await readFile(join(root, "infra", "sh-portability-image-lock.json"))).digest("hex"));
    await assert.doesNotReject(validateImageLockAgainstRepository({ root, lock: identity.lock, readRepositoryFile }));
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

test("local OCI identity accepts Docker 29 descriptors and legacy config IDs, but never falls back from a bad descriptor", async () => {
  await withFixture(async ({ lock }) => {
    const image = lock.images[0], descriptor = { digest: image.manifestDigest };
    assert.deepEqual(verifyLocalImageIdentity(image, { os: "linux", architecture: "amd64", imageId: image.manifestDigest, descriptor }), { identityMode: "DESCRIPTOR_MANIFEST", localDigest: image.manifestDigest });
    assert.deepEqual(verifyLocalImageIdentity(image, { os: "linux", architecture: "amd64", imageId: image.configDigest }), { identityMode: "LEGACY_CONFIG_ID", localDigest: image.configDigest });
    for (const inspected of [
      { os: "linux", architecture: "amd64", imageId: image.configDigest, descriptor: { digest: digest(99) } },
      { os: "linux", architecture: "amd64", imageId: image.configDigest, descriptor: { digest: "not-a-digest" } },
      { os: "linux", architecture: "amd64", imageId: image.configDigest, descriptor: "not-an-object" },
      { os: "linux", architecture: "amd64", imageId: digest(99) },
      { os: "linux", architecture: "arm64", imageId: image.configDigest },
    ]) assert.throws(() => verifyLocalImageIdentity(image, inspected), /IMAGE_ACQUISITION_(LOCAL_IMAGE_DESCRIPTOR|LOCAL_IMAGE_CONFIG_DIGEST|LOCAL_IMAGE_PLATFORM)/);
  });
});

test("build-base OCI index and linux/amd64 child bindings fail closed", async () => {
  await withFixture(async ({ lock }) => {
    const image = lock.images.find((entry) => entry.logicalName === "build-base-node"), registry = rawRegistries.get(lock), index = registry.get(immutableReference({ canonicalRepository: image.canonicalRepository, manifestDigest: image.sourceIndexDigest })), child = registry.get(immutableReference(image));
    assert.doesNotThrow(() => validateBuildBaseSourceIndex(image, index)); assert.doesNotThrow(() => validateRawRegistryManifest(image, child));
    const parse = (value) => JSON.parse(Buffer.from(value).toString("utf8"));
    assert.throws(() => validateBuildBaseSourceIndex(image, Buffer.from("{}")), /IMAGE_ACQUISITION_SOURCE_INDEX_HASH/);
    for (const raw of [Buffer.from(JSON.stringify({ ...parse(index), manifests: [] })), Buffer.from(JSON.stringify({ ...parse(index), manifests: [parse(index).manifests[0], parse(index).manifests[0]] })), Buffer.from(JSON.stringify({ ...parse(index), manifests: [{ ...parse(index).manifests[0], digest: digest(99) }] }))]) {
      const candidate = { ...image, sourceIndexDigest: "sha256:" + createHash("sha256").update(raw).digest("hex") };
      assert.throws(() => validateBuildBaseSourceIndex(candidate, raw), /IMAGE_ACQUISITION_SOURCE_INDEX_CHILD/);
    }
    const wrongConfig = Buffer.from(JSON.stringify({ schemaVersion: 2, config: { digest: digest(99) } })), wrongChild = { ...image, manifestDigest: "sha256:" + createHash("sha256").update(wrongConfig).digest("hex") };
    assert.throws(() => validateRawRegistryManifest(wrongChild, wrongConfig), /IMAGE_ACQUISITION_RAW_MANIFEST_BINDING/);
  });
});

test("registry verification preserves exact RepoDigest in both containerd and legacy identity modes", async () => {
  await withFixture(async ({ lock }) => {
    const image = lock.images[0], repoDigests = [immutableReference(image)];
    assert.equal(assertVerifiedRegistryImage(image, { os: "linux", architecture: "amd64", imageId: image.manifestDigest, descriptor: { digest: image.manifestDigest }, repoDigests }).identityMode, "DESCRIPTOR_MANIFEST");
    assert.equal(assertVerifiedRegistryImage(image, { os: "linux", architecture: "amd64", imageId: image.configDigest, repoDigests }).identityMode, "LEGACY_CONFIG_ID");
    for (const candidate of [[], [`${image.canonicalRepository}@${digest(99)}`]]) assert.throws(() => assertVerifiedRegistryImage(image, { os: "linux", architecture: "amd64", imageId: image.manifestDigest, descriptor: { digest: image.manifestDigest }, repoDigests: candidate }), /IMAGE_ACQUISITION_LOCAL_REPODIGEST/);
  });
});

test("Docker Hub RepoDigests canonicalize official images without weakening repository or digest binding", async () => {
  await withFixture(async ({ lock }) => {
    const node = lock.images.find((image) => image.logicalName === "build-base-node");
    const inspected = (repoDigest) => ({ os: "linux", architecture: "amd64", imageId: node.manifestDigest, descriptor: { digest: node.manifestDigest }, repoDigests: [repoDigest] });
    for (const repository of ["node", "library/node", "docker.io/library/node"]) {
      assert.equal(assertVerifiedRegistryImage(node, inspected(`${repository}@${node.manifestDigest}`)).identityMode, "DESCRIPTOR_MANIFEST");
    }
    const nginx = lock.images.find((image) => image.logicalName === "build-base-nginx");
    assert.doesNotThrow(() => assertVerifiedRegistryImage(nginx, { os: "linux", architecture: "amd64", imageId: nginx.manifestDigest, descriptor: { digest: nginx.manifestDigest }, repoDigests: [`nginxinc/nginx-unprivileged@${nginx.manifestDigest}`] }));
    for (const image of lock.images.filter((image) => image.canonicalRepository.startsWith("docker.io/supabase/"))) {
      assert.doesNotThrow(() => assertVerifiedRegistryImage(image, { os: "linux", architecture: "amd64", imageId: image.manifestDigest, descriptor: { digest: image.manifestDigest }, repoDigests: [`${image.sourceRef.slice(0, image.sourceRef.indexOf(":"))}@${image.manifestDigest}`] }));
    }
    for (const repoDigest of [`evil/node@${node.manifestDigest}`, `docker.io/other/node@${node.manifestDigest}`, `node@${digest(99)}`]) {
      assert.throws(() => assertVerifiedRegistryImage(node, inspected(repoDigest)), /IMAGE_ACQUISITION_LOCAL_REPODIGEST/);
    }
  });
});

test("registry acquisition accepts Docker 29 descriptor identity and reaches source alias publication", async () => {
  await withFixture(async ({ lock }) => {
    const { result, actions } = await acquire(lock, { fake: fakeDocker(lock, { inspect: (image) => ({ os: "linux", architecture: "amd64", imageId: image.manifestDigest, descriptor: { digest: image.manifestDigest }, repoDigests: [immutableReference(image)] }) }) });
    assert.equal(result.localImageAuthority, "LOCAL_OCI_IDENTITY_VERIFIED"); assert.equal(actions.some(([kind]) => kind === "tag"), true);
  });
});

test("acquisition pulls each immutable physical image once and creates verified source aliases", async () => {
  await withFixture(async ({ lock }) => {
    const { result, actions } = await acquire(lock);
    const physical = new Set(lock.images.map(immutableReference));
    const aliases = new Set(lock.images.map((image) => `${image.sourceRef}\0${image.manifestDigest}`));
    assert.deepEqual(result, { state: "PASS", mode: "VERIFIED_REGISTRY_PULL", logicalAuthorities: lock.images.length, uniqueImages: physical.size, verifiedImages: physical.size, executionAliases: aliases.size, platform: "linux/amd64", registryConnectivity: "PASS", localImageAuthority: "LOCAL_OCI_IDENTITY_VERIFIED" });
    assert.deepEqual(new Set(actions.filter(([kind]) => kind === "pull").map(([, reference]) => reference)), physical);
    assert.equal(actions.filter(([kind]) => kind === "pull").some(([, reference]) => lock.images.some((image) => reference === image.sourceRef)), false);
    assert.equal(actions.filter(([kind]) => kind === "tag").length, aliases.size);
    assert.equal(actions.some(([kind]) => /run|create|build|compose|network|volume|rm|prune/.test(kind)), false);
  });
});

test("inspection failures, pull failure and alias mismatch fail closed without deletion", async () => {
  await withFixture(async ({ lock }) => {
    for (const inspect of [
      (image) => ({ os: "windows", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: image.configDigest }),
      (image) => ({ os: "linux", architecture: "arm64", repoDigests: [immutableReference(image)], imageId: image.configDigest }),
      (image) => ({ os: "linux", architecture: "amd64", repoDigests: [], imageId: image.configDigest }),
      (image) => ({ os: "linux", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: digest(99) }),
    ]) await assert.rejects(() => acquire(lock, { fake: fakeDocker(lock, { inspect }) }), /IMAGE_ACQUISITION_(LOCAL_IMAGE_PLATFORM|LOCAL_REPODIGEST|LOCAL_IMAGE_CONFIG_DIGEST)/);
    const failing = fakeDocker(lock); failing.docker.pullExactImage = async (reference) => { failing.actions.push(["pull", reference]); if (failing.actions.filter(([kind]) => kind === "pull").length > 1) throw new Error("registry unavailable"); };
    await assert.rejects(() => acquire(lock, { fake: failing }), /IMAGE_ACQUISITION_PULL_FAILED/);
    assert.equal(failing.actions.filter(([kind]) => kind === "pull").length, 2);
    const aliasMismatch = fakeDocker(lock); aliasMismatch.docker.inspectAlias = async (alias) => { aliasMismatch.actions.push(["inspect-alias", alias]); const image = lock.images.find((item) => item.sourceRef === alias); return { os: "linux", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: "other-local-image" }; };
    await assert.rejects(() => acquire(lock, { fake: aliasMismatch }), /IMAGE_ACQUISITION_LOCAL_IMAGE_CONFIG_DIGEST/);
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
    const { result } = await acquire(lock, { fake: fakeDocker(lock, { inspect: (image) => ({ os: "linux", architecture: "amd64", repoDigests: [immutableReference(image)], imageId: image.configDigest }) }) });
    const output = renderImageAcquisitionResult(result);
    assert.doesNotMatch(output, /private-local-image-id|credentials|token|\/private/);
  });
});

test("default Docker adapter uses only image-cache acquisition command families", async () => {
  await withFixture(async ({ root, lock }) => {
    const actions = [], aliases = new Map(), physical = new Set(lock.images.map(immutableReference));
    const runner = async (_binary, args) => {
      actions.push(args);
      if (args[0] === "buildx") { const bytes = rawRegistries.get(lock)?.get(args.at(-1)); if (!bytes) throw new Error("unexpected raw manifest"); return { stdout: bytes }; }
      if (args[0] === "tag") aliases.set(args[2], args[1]);
      if (args[0] !== "image") return { stdout: "" };
      const reference = aliases.get(args[2]) ?? args[2];
      const image = lock.images.find((item) => immutableReference(item) === reference);
      return { stdout: JSON.stringify([{ Os: "linux", Architecture: "amd64", RepoDigests: [reference], Id: image.configDigest }]) };
    };
    const docker = createDockerImageAdapter({ root, runner });
    await acquirePullOnlyImages({ manifestPath: "external", root, docker, gate: async () => ({ state: "PASS" }), readManifest: async () => ({ manifest: reconstructionManifest(lock) }), readLockIdentity: async () => ({ lock, sha256: "a".repeat(64) }), validateLock: async () => ({ state: "PASS" }) });
    assert.equal(actions.every((args) => args[0] === "pull" || (args[0] === "image" && args[1] === "inspect") || args[0] === "tag" || (args[0] === "buildx" && args[1] === "imagetools" && args[2] === "inspect" && args[3] === "--raw")), true);
    assert.equal(actions.some((args) => args.some((value) => /^(run|create|build|compose|network|volume|rm|prune)$/.test(value))), false);
    assert.equal(actions.filter((args) => args[0] === "pull").every((args) => args[1] === "--platform" && args[2] === "linux/amd64" && physical.has(args[3])), true);
  });
});
