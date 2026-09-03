import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { link, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import {
  createReconstructionManifest,
  readReconstructionManifest,
  validateReconstructionManifest,
  validateReconstructionManifestAgainstRepository,
} from "./portability-manifest.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SOURCE_COMMIT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const GENERATION_ID = "223e4567-e89b-42d3-a456-426614174000";
const UPSTREAM = "e846d45ce64207b952a4df44ac8b480ea0abb27e";

function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function fakeGit({ clean = true, head = HEAD, known = true, ancestor = true } = {}) {
  return { clean: async () => clean, head: async () => head, hasCommit: async () => known, isAncestor: async () => ancestor };
}

async function fixture() {
  const temporary = await mkdtemp(join(os.tmpdir(), "godel-portability-manifest-"));
  const backup = join(temporary, "backup-synthetic");
  const protectedRoot = join(temporary, "protected");
  const outputDirectory = join(temporary, "output");
  const artifact = Buffer.from("synthetic protected artifact");
  await Promise.all([mkdir(backup, { recursive: true }), mkdir(join(protectedRoot, basename(backup)), { recursive: true }), mkdir(outputDirectory, { recursive: true })]);
  const backupManifest = {
    format: "godel-selfhosted-backup",
    schemaVersion: 3,
    status: "COMPLETE",
    backupId: "backup-synthetic",
    repository: { commit: SOURCE_COMMIT, dirty: false },
    supabase: { upstreamCommit: UPSTREAM },
    externalSecretGenerationId: GENERATION_ID,
    protectedRecoveryMaterial: { required: true, captured: true, artifact: { relativePath: "pgsodium-root-key.tar", type: "tar", size: artifact.length, sha256: digest(artifact) } },
  };
  await Promise.all([
    writeFile(join(backup, "manifest.json"), JSON.stringify(backupManifest, null, 2) + "\n"),
    writeFile(join(backup, "checksums.sha256"), "synthetic-checksums\n"),
    writeFile(join(protectedRoot, basename(backup), "pgsodium-root-key.tar"), artifact),
  ]);
  const verifierCalls = [];
  return {
    temporary,
    backup,
    protectedRoot,
    outputDirectory,
    backupManifest,
    verifierCalls,
    verifyBackup: async (input) => { verifierCalls.push(input); },
    create: (options = {}) => createReconstructionManifest({ root: ROOT, backup, protectedRoot, output: join(outputDirectory, options.file ?? "manifest.json"), operationId: options.operationId ?? OPERATION_ID, git: options.git ?? fakeGit(), verifyBackup: options.verifyBackup ?? (async (input) => { verifierCalls.push(input); }), publication: options.publication }),
  };
}

async function withFixture(run) {
  const value = await fixture();
  try { await run(value); } finally { await rm(value.temporary, { recursive: true, force: true }); }
}

async function validManifest(value) {
  const result = await value.create();
  return { ...result, manifestPath: join(value.outputDirectory, "manifest.json") };
}

test("a valid synthetic manifest is deterministic and binds every non-secret input", async () => {
  await withFixture(async (value) => {
    const first = await validManifest(value);
    await value.create({ file: "second.json" });
    const [firstBytes, secondBytes] = await Promise.all([readFile(first.manifestPath), readFile(join(value.outputDirectory, "second.json"))]);
    assert.deepEqual(firstBytes, secondBytes);
    const read = await readReconstructionManifest({ manifestPath: first.manifestPath });
    const validated = await validateReconstructionManifestAgainstRepository({ root: ROOT, manifest: read.manifest, backup: value.backup, protectedRoot: value.protectedRoot, git: fakeGit(), verifyBackup: value.verifyBackup });
    assert.equal(validated.operationId, OPERATION_ID);
    assert.equal(first.manifest.externalSecretGenerationId, GENERATION_ID);
    assert.equal(first.manifest.godelBuilds.length, 2);
    assert.equal(first.manifest.imageAuthority.images.length, 14);
    assert.ok(value.verifierCalls.length >= 2);
    const serialized = firstBytes.toString("utf8");
    assert.doesNotMatch(serialized, /synthetic protected artifact|GODEL_PUBLIC_BUILD_NONCE|godel-design-app:|godel-design-nginx:/);
    assert.doesNotMatch(serialized, new RegExp(value.temporary.replace(/[\\/]/g, "[\\\\/]")));
    assert.deepEqual((await readdir(value.outputDirectory)).filter((entry) => entry.includes(".tmp-")), []);
  });
});

test("strict schema, UUID and platform validation fail closed", async () => {
  await withFixture(async (value) => {
    const { manifest } = await validManifest(value);
    const cases = [
      [(candidate) => { candidate.extra = true; }, /PORTABILITY_MANIFEST_SCHEMA/],
      [(candidate) => { candidate.schemaVersion = 2; }, /PORTABILITY_MANIFEST_SCHEMA/],
      [(candidate) => { candidate.operationId = "not-a-uuid"; }, /PORTABILITY_MANIFEST_SCHEMA/],
      [(candidate) => { candidate.platform.architecture = "arm64"; }, /PORTABILITY_MANIFEST_PLATFORM/],
    ];
    for (const [mutate, expected] of cases) { const candidate = clone(manifest); mutate(candidate); assert.throws(() => validateReconstructionManifest(candidate), expected); }
  });
});

test("dirty repositories and invalid backup eligibility fail creation", async () => {
  await withFixture(async (value) => {
    await assert.rejects(value.create({ file: "dirty.json", git: fakeGit({ clean: false }) }), /PORTABILITY_MANIFEST_REPOSITORY_DIRTY/);
    await assert.rejects(value.create({ file: "diverged.json", git: fakeGit({ ancestor: false }) }), /PORTABILITY_MANIFEST_BACKUP_SOURCE_NOT_ANCESTOR/);
    value.backupManifest.status = "INCOMPLETE";
    await writeFile(join(value.backup, "manifest.json"), JSON.stringify(value.backupManifest));
    await assert.rejects(value.create({ file: "incomplete.json" }), /PORTABILITY_MANIFEST_BACKUP_STATE/);
  });
});

test("backup schema and external generation remain mandatory", async () => {
  await withFixture(async (value) => {
    value.backupManifest.schemaVersion = 2;
    await writeFile(join(value.backup, "manifest.json"), JSON.stringify(value.backupManifest));
    await assert.rejects(value.create({ file: "schema.json" }), /PORTABILITY_MANIFEST_BACKUP_STATE/);
    value.backupManifest.schemaVersion = 3;
    delete value.backupManifest.externalSecretGenerationId;
    await writeFile(join(value.backup, "manifest.json"), JSON.stringify(value.backupManifest));
    await assert.rejects(value.create({ file: "missing-generation.json" }), /PORTABILITY_MANIFEST_BACKUP_GENERATION/);
    value.backupManifest.externalSecretGenerationId = "invalid";
    await writeFile(join(value.backup, "manifest.json"), JSON.stringify(value.backupManifest));
    await assert.rejects(value.create({ file: "invalid-generation.json" }), /PORTABILITY_MANIFEST_BACKUP_GENERATION/);
  });
});

test("repository, backup hashes, generation and protected artifact drift fail validation", async () => {
  await withFixture(async (value) => {
    const { manifest } = await validManifest(value);
    const verify = value.verifyBackup;
    const validate = (candidate, git = fakeGit()) => validateReconstructionManifestAgainstRepository({ root: ROOT, manifest: candidate, backup: value.backup, protectedRoot: value.protectedRoot, git, verifyBackup: verify });
    const headMismatch = clone(manifest);
    headMismatch.repository.gitCommit = "cccccccccccccccccccccccccccccccccccccccc";
    headMismatch.godelBuilds.forEach((recipe) => { recipe.gitCommit = headMismatch.repository.gitCommit; });
    await assert.rejects(validate(headMismatch), /PORTABILITY_MANIFEST_REPOSITORY_HEAD_MISMATCH/);
    const generationMismatch = clone(manifest);
    generationMismatch.externalSecretGenerationId = "323e4567-e89b-42d3-a456-426614174000";
    generationMismatch.godelBuilds.find((recipe) => recipe.logicalName === "godel-app").configurationBinding = generationMismatch.externalSecretGenerationId;
    await assert.rejects(validate(generationMismatch), /PORTABILITY_MANIFEST_BACKUP_GENERATION_MISMATCH/);
    const manifestHash = clone(manifest); manifestHash.backup.manifestSha256 = "1".repeat(64);
    await assert.rejects(validate(manifestHash), /PORTABILITY_MANIFEST_BACKUP_MANIFEST_HASH_MISMATCH/);
    const checksumsHash = clone(manifest); checksumsHash.backup.checksumsSha256 = "2".repeat(64);
    await assert.rejects(validate(checksumsHash), /PORTABILITY_MANIFEST_BACKUP_CHECKSUMS_HASH_MISMATCH/);
    const artifactSize = clone(manifest); artifactSize.protectedRecoveryMaterial.size += 1;
    await assert.rejects(validate(artifactSize), /PORTABILITY_MANIFEST_PROTECTED_ARTIFACT_SIZE/);
    const artifactHash = clone(manifest); artifactHash.protectedRecoveryMaterial.sha256 = "3".repeat(64);
    await assert.rejects(validate(artifactHash), /PORTABILITY_MANIFEST_PROTECTED_ARTIFACT_HASH/);
  });
});

test("upstream, image authority, inventory and build recipes are repository-bound", async () => {
  await withFixture(async (value) => {
    const { manifest } = await validManifest(value);
    const validate = (candidate) => validateReconstructionManifestAgainstRepository({ root: ROOT, manifest: candidate, backup: value.backup, protectedRoot: value.protectedRoot, git: fakeGit(), verifyBackup: value.verifyBackup });
    const upstream = clone(manifest); upstream.supabase.upstreamCommit = "dddddddddddddddddddddddddddddddddddddddd";
    await assert.rejects(validate(upstream), /PORTABILITY_MANIFEST_UPSTREAM_MISMATCH/);
    const upstreamHash = clone(manifest); upstreamHash.supabase.upstreamLockSha256 = "4".repeat(64);
    await assert.rejects(validate(upstreamHash), /PORTABILITY_MANIFEST_UPSTREAM_LOCK_HASH_MISMATCH/);
    const imageHash = clone(manifest); imageHash.imageAuthority.sha256 = "5".repeat(64);
    await assert.rejects(validate(imageHash), /PORTABILITY_MANIFEST_IMAGE_AUTHORITY_MISMATCH/);
    const inventory = clone(manifest); inventory.imageAuthority.images.pop(); inventory.imageAuthority.imageCount -= 1;
    await assert.rejects(validate(inventory), /PORTABILITY_MANIFEST_IMAGE_AUTHORITY_MISMATCH/);
    const recipe = clone(manifest); recipe.godelBuilds[0].dockerfileSha256 = "6".repeat(64);
    await assert.rejects(validate(recipe), /PORTABILITY_MANIFEST_BUILD_RECIPE_MISMATCH/);
  });
});

test("creation never overwrites output and verifier failure leaves no partial output", async () => {
  await withFixture(async (value) => {
    await validManifest(value);
    await assert.rejects(value.create(), /PORTABILITY_MANIFEST_OUTPUT_EXISTS/);
    const output = join(value.outputDirectory, "verifier-failed.json");
    await assert.rejects(createReconstructionManifest({ root: ROOT, backup: value.backup, protectedRoot: value.protectedRoot, output, operationId: OPERATION_ID, git: fakeGit(), verifyBackup: async () => { throw new Error("raw verifier failure"); } }), /PORTABILITY_MANIFEST_BACKUP_VERIFY_FAILED/);
    await assert.rejects(readFile(output), { code: "ENOENT" });
    await assert.rejects(readFile(output + ".sha256"), { code: "ENOENT" });
  });
});

test("concurrent manifest publication preserves the foreign destination and the published orphan sidecar", async () => {
  await withFixture(async (value) => {
    const output = join(value.outputDirectory, "race.json");
    const foreign = Buffer.from("foreign reconstruction manifest");
    const expected = await value.create({ file: "expected.json" });
    const destinations = [];
    const publication = {
      link: async (source, destination) => {
        destinations.push(destination);
        if (destination === output) await writeFile(destination, foreign, { flag: "wx" });
        await link(source, destination);
      },
    };
    await assert.rejects(value.create({ file: "race.json", publication }), /PORTABILITY_MANIFEST_OUTPUT_EXISTS/);
    assert.deepEqual(await readFile(output), foreign);
    assert.deepEqual(destinations, [output + ".sha256", output]);
    assert.equal((await readFile(output + ".sha256", "utf8")), expected.manifestSha256 + "  race.json\n");
    assert.deepEqual((await readdir(value.outputDirectory)).filter((entry) => entry.includes(".tmp-")), []);
  });
});

test("concurrent sidecar publication fails closed and preserves the foreign sidecar", async () => {
  await withFixture(async (value) => {
    const output = join(value.outputDirectory, "sidecar-race.json");
    const sidecar = output + ".sha256";
    const foreign = Buffer.from("foreign checksum sidecar\n");
    const publication = {
      link: async (source, destination) => {
        if (destination === sidecar) await writeFile(destination, foreign, { flag: "wx" });
        await link(source, destination);
      },
    };
    await assert.rejects(value.create({ file: "sidecar-race.json", publication }), /PORTABILITY_MANIFEST_OUTPUT_EXISTS/);
    assert.deepEqual(await readFile(sidecar), foreign);
    await assert.rejects(readFile(output), { code: "ENOENT" });
    assert.deepEqual((await readdir(value.outputDirectory)).filter((entry) => entry.includes(".tmp-")), []);
  });
});

test("validation uses injected Git and backup verification only; no Docker, registry or network adapter exists", async () => {
  await withFixture(async (value) => {
    const { manifest } = await validManifest(value);
    const calls = [];
    const git = { clean: async () => { calls.push("clean"); return true; }, head: async () => { calls.push("head"); return HEAD; }, hasCommit: async () => { calls.push("hasCommit"); return true; }, isAncestor: async () => { calls.push("isAncestor"); return true; } };
    await validateReconstructionManifestAgainstRepository({ root: ROOT, manifest, backup: value.backup, protectedRoot: value.protectedRoot, git, verifyBackup: async () => { calls.push("verifyBackup"); } });
    assert.deepEqual(new Set(calls), new Set(["clean", "head", "hasCommit", "isAncestor", "verifyBackup"]));
  });
});
