import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import {
  acquireGenerationMutationLock,
  getCurrentSecretGeneration,
  publishSecretGeneration,
  releaseGenerationMutationLock,
  replaceCurrentGenerationPointer,
} from "./secret-generation.mjs";
import {
  SECRET_GENERATION_BUNDLE_FILES,
  exportSecretGenerationBundle,
  importSecretGenerationBundle,
  readSecretGenerationBundle,
} from "./secret-generation-transport.mjs";
import { createReconstructionManifest } from "./portability-manifest.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SOURCE_COMMIT = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const GENERATION_ID = "223e4567-e89b-42d3-a456-426614174000";
const UPSTREAM = "e846d45ce64207b952a4df44ac8b480ea0abb27e";
const SUPABASE = Buffer.from("POSTGRES_PASSWORD=synthetic-postgres-secret\nJWT_SECRET=synthetic-jwt-secret\n");
const GODEL = Buffer.from("NEXT_PUBLIC_SUPABASE_URL=https://synthetic.invalid\nDASHBOARD_PASSWORD=synthetic-dashboard-secret\n");

function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function fakeGit() { return { clean: async () => true, head: async () => HEAD, hasCommit: async () => true, isAncestor: async () => true }; }
function generationMetadata(generationId, sourceGenerationId = "323e4567-e89b-42d3-a456-426614174000") {
  return { format: "godel-external-secret-generation", schemaVersion: 1, generationId, createdAt: "2026-01-01T00:00:00.000Z", repositoryCommit: HEAD, reason: "restore-alignment", sourceGenerationId, files: { supabaseEnv: "supabase.env", godelEnv: "godel.env" } };
}

async function fixture() {
  const temporary = await mkdtemp(join(tmpdir(), "godel-secret-transport-"));
  const sourceProtectedRoot = join(temporary, "source-protected");
  const targetProtectedRoot = join(temporary, "target-protected");
  const backup = join(temporary, "backup-synthetic");
  const outputDirectory = join(temporary, "manifests");
  const targetSupabaseEnvPath = join(temporary, "target", "infra", "supabase", ".env");
  const targetGodelEnvPath = join(temporary, "target", "compose.env.local");
  const artifact = Buffer.from("synthetic protected artifact");
  await Promise.all([
    mkdir(backup, { recursive: true }),
    mkdir(join(sourceProtectedRoot, basename(backup)), { recursive: true }),
    mkdir(outputDirectory, { recursive: true }),
    mkdir(join(sourceProtectedRoot, "exports"), { recursive: true }),
    mkdir(join(temporary, "target", "infra", "supabase"), { recursive: true }),
  ]);
  const backupManifest = { format: "godel-selfhosted-backup", schemaVersion: 3, status: "COMPLETE", backupId: "backup-synthetic", repository: { commit: SOURCE_COMMIT, dirty: false }, supabase: { upstreamCommit: UPSTREAM }, externalSecretGenerationId: GENERATION_ID, protectedRecoveryMaterial: { required: true, captured: true, artifact: { relativePath: "pgsodium-root-key.tar", type: "tar", size: artifact.length, sha256: digest(artifact) } } };
  await Promise.all([
    writeFile(join(backup, "manifest.json"), JSON.stringify(backupManifest, null, 2) + "\n"),
    writeFile(join(backup, "checksums.sha256"), "synthetic-checksums\n"),
    writeFile(join(sourceProtectedRoot, basename(backup), "pgsodium-root-key.tar"), artifact),
  ]);
  const created = await createReconstructionManifest({ root: ROOT, backup, protectedRoot: sourceProtectedRoot, output: join(outputDirectory, "reconstruction.json"), operationId: OPERATION_ID, git: fakeGit(), verifyBackup: async () => {} });
  await publishSecretGeneration({ protectedRoot: sourceProtectedRoot, generationId: GENERATION_ID, metadata: generationMetadata(GENERATION_ID), supabaseSnapshot: SUPABASE, godelSnapshot: GODEL });
  return {
    temporary, sourceProtectedRoot, targetProtectedRoot,
    manifestPath: created.outputPath, manifestSha256: created.manifestSha256,
    targetSupabaseEnvPath, targetGodelEnvPath,
    sourceBundlePath: join(sourceProtectedRoot, "exports", "selected-generation"),
    targetBundlePath: join(targetProtectedRoot, "incoming-generation"),
  };
}

async function withFixture(run) {
  const value = await fixture();
  try { await run(value); } finally { await rm(value.temporary, { recursive: true, force: true }); }
}

async function exported(value) {
  await exportSecretGenerationBundle({ manifestPath: value.manifestPath, output: value.sourceBundlePath, protectedRoot: value.sourceProtectedRoot });
  return readSecretGenerationBundle({ bundlePath: value.sourceBundlePath });
}

async function transferred(value) {
  await exported(value);
  await mkdir(value.targetProtectedRoot, { recursive: true });
  await cp(value.sourceBundlePath, value.targetBundlePath, { recursive: true, errorOnExist: true });
  return value.targetBundlePath;
}

test("exports exactly the manifest-selected historical generation as a committed protected bundle", async () => withFixture(async (value) => {
  const bundle = await exported(value);
  assert.equal(bundle.bundle.generationId, GENERATION_ID);
  assert.equal(bundle.bundle.reconstruction.operationId, OPERATION_ID);
  assert.equal(bundle.bundle.reconstruction.manifestSha256, value.manifestSha256);
  assert.deepEqual(bundle.supabaseSnapshot, SUPABASE);
  assert.deepEqual(bundle.godelSnapshot, GODEL);
  assert.equal(bundle.metadata.sourceGenerationId, "323e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual((await readdir(value.sourceBundlePath)).sort(), Object.values(SECRET_GENERATION_BUNDLE_FILES).sort());
  assert.equal(bundle.bundle.files.supabaseEnv.sha256, digest(SUPABASE));
  assert.equal(bundle.bundle.files.godelEnv.sha256, digest(GODEL));
  await assert.rejects(exportSecretGenerationBundle({ manifestPath: value.manifestPath, output: value.sourceBundlePath, protectedRoot: value.sourceProtectedRoot }), /SECRET_GENERATION_TRANSPORT_OUTPUT_EXISTS/);
}));

test("export rejects a source mutation lock and a missing selected generation", async () => withFixture(async (value) => {
  const lock = await acquireGenerationMutationLock({ protectedRoot: value.sourceProtectedRoot, operation: "test" });
  try { await assert.rejects(exportSecretGenerationBundle({ manifestPath: value.manifestPath, output: value.sourceBundlePath, protectedRoot: value.sourceProtectedRoot }), /GENERATION_MUTATION_IN_PROGRESS/); } finally { await releaseGenerationMutationLock(lock); }
  await rm(join(value.sourceProtectedRoot, "external-secrets", "generations", GENERATION_ID), { recursive: true, force: true });
  await assert.rejects(exportSecretGenerationBundle({ manifestPath: value.manifestPath, output: value.sourceBundlePath, protectedRoot: value.sourceProtectedRoot }), /GENERATION_DIRECTORY_MISSING/);
}));

test("core transport paths are protected-root-only and never share the secret registry", async () => withFixture(async (value) => {
  const outside = join(value.temporary, "trackable-output");
  await assert.rejects(exportSecretGenerationBundle({ manifestPath: value.manifestPath, output: outside, protectedRoot: value.sourceProtectedRoot }), /SECRET_GENERATION_TRANSPORT_OUTPUT_PATH/);
  await assert.rejects(exportSecretGenerationBundle({ manifestPath: value.manifestPath, output: value.sourceProtectedRoot, protectedRoot: value.sourceProtectedRoot }), /SECRET_GENERATION_TRANSPORT_OUTPUT_PATH/);
  await assert.rejects(exportSecretGenerationBundle({ manifestPath: value.manifestPath, output: join(value.sourceProtectedRoot, "external-secrets", "bundle"), protectedRoot: value.sourceProtectedRoot }), /SECRET_GENERATION_TRANSPORT_OUTPUT_PATH_REGISTRY/);
  await assert.rejects(readdir(outside), { code: "ENOENT" });
  await exported(value);
  const events = [];
  await assert.rejects(importSecretGenerationBundle({ manifestPath: value.manifestPath, bundlePath: value.sourceBundlePath, protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath, apply: true, hooks: { onEvent: (event) => events.push(event) } }), /SECRET_GENERATION_TRANSPORT_BUNDLE_PATH/);
  assert.deepEqual(events, ["validate-manifest", "validate-bundle"]);
  await mkdir(join(value.targetProtectedRoot, "external-secrets"), { recursive: true });
  const registryBundle = join(value.targetProtectedRoot, "external-secrets", "incoming");
  await cp(value.sourceBundlePath, registryBundle, { recursive: true });
  await assert.rejects(importSecretGenerationBundle({ manifestPath: value.manifestPath, bundlePath: registryBundle, protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath, apply: true }), /SECRET_GENERATION_TRANSPORT_BUNDLE_PATH_REGISTRY/);
  assert.equal((await getCurrentSecretGeneration({ protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath })).state, "UNINITIALIZED");
}));

test("bundle validation rejects structural, integrity, metadata and reconstruction binding drift before import mutation", async () => withFixture(async (value) => {
  await transferred(value);
  const commit = join(value.targetBundlePath, SECRET_GENERATION_BUNDLE_FILES.commit);
  const initial = JSON.parse(await readFile(commit, "utf8"));
  initial.reconstruction.operationId = "323e4567-e89b-42d3-a456-426614174000";
  await writeFile(commit, JSON.stringify(initial));
  const events = [];
  await assert.rejects(importSecretGenerationBundle({ manifestPath: value.manifestPath, bundlePath: value.targetBundlePath, protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath, apply: true, hooks: { onEvent: (event) => events.push(event) } }), /SECRET_GENERATION_TRANSPORT_RECONSTRUCTION_OPERATION_BINDING/);
  assert.deepEqual(events, ["validate-manifest", "validate-bundle"]);
  assert.equal((await getCurrentSecretGeneration({ protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath })).state, "UNINITIALIZED");
  await writeFile(commit, JSON.stringify({ ...initial, reconstruction: { operationId: OPERATION_ID, manifestSha256: value.manifestSha256 } }));
  await writeFile(join(value.targetBundlePath, "unexpected.txt"), "x");
  await assert.rejects(readSecretGenerationBundle({ bundlePath: value.targetBundlePath }), /SECRET_GENERATION_TRANSPORT_BUNDLE_ENTRIES/);
}));

test("dry import validates without creating registry, env files or pointer", async () => withFixture(async (value) => {
  await transferred(value);
  const result = await importSecretGenerationBundle({ manifestPath: value.manifestPath, bundlePath: value.targetBundlePath, protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath });
  assert.equal(result.state, "VALIDATED_NOT_APPLIED");
  await assert.rejects(readFile(value.targetSupabaseEnvPath), { code: "ENOENT" });
  await assert.rejects(readFile(value.targetGodelEnvPath), { code: "ENOENT" });
  assert.equal((await getCurrentSecretGeneration({ protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath })).state, "UNINITIALIZED");
}));

test("apply imports exact bytes, activates current last and is idempotent", async () => withFixture(async (value) => {
  await transferred(value);
  await writeFile(value.targetSupabaseEnvPath, SUPABASE);
  const events = [];
  const options = { manifestPath: value.manifestPath, bundlePath: value.targetBundlePath, protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath, apply: true, hooks: { onEvent: (event) => events.push(event) } };
  const first = await importSecretGenerationBundle(options);
  assert.equal(first.state, "IMPORTED");
  assert.deepEqual(await readFile(value.targetSupabaseEnvPath), SUPABASE);
  assert.deepEqual(await readFile(value.targetGodelEnvPath), GODEL);
  const current = await getCurrentSecretGeneration({ protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath });
  assert.equal(current.generationId, GENERATION_ID);
  assert.equal(current.match, true);
  assert.ok(events.indexOf("assert-referenced-match") < events.indexOf("activate-or-confirm-current"));
  assert.ok(events.indexOf("activate-or-confirm-current") < events.indexOf("assert-active-match"));
  assert.deepEqual(events, ["validate-manifest", "validate-bundle", "acquire-lock", "publish-or-confirm-generation", "materialize-or-confirm-supabase-env", "materialize-or-confirm-godel-env", "assert-referenced-match", "activate-or-confirm-current", "assert-active-match", "release-lock"]);
  assert.equal((await importSecretGenerationBundle(options)).state, "IMPORTED");
}));

test("generation, env and current conflicts fail closed without overwrite", async () => withFixture(async (value) => {
  await transferred(value);
  await publishSecretGeneration({ protectedRoot: value.targetProtectedRoot, generationId: GENERATION_ID, metadata: generationMetadata(GENERATION_ID), supabaseSnapshot: Buffer.from("different\n"), godelSnapshot: GODEL });
  await assert.rejects(importSecretGenerationBundle({ manifestPath: value.manifestPath, bundlePath: value.targetBundlePath, protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath, apply: true }), /SECRET_GENERATION_TRANSPORT_GENERATION_IMPORT_CONFLICT/);
  assert.deepEqual(await readFile(join(value.targetProtectedRoot, "external-secrets", "generations", GENERATION_ID, "supabase.env")), Buffer.from("different\n"));
}));

test("existing live env mismatch and a different current generation are never replaced", async () => withFixture(async (value) => {
  await transferred(value);
  await writeFile(value.targetSupabaseEnvPath, "different\n");
  await assert.rejects(importSecretGenerationBundle({ manifestPath: value.manifestPath, bundlePath: value.targetBundlePath, protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath, apply: true }), /SECRET_GENERATION_TRANSPORT_SUPABASE_ENV_CONFLICT/);
  assert.equal((await readFile(value.targetSupabaseEnvPath, "utf8")), "different\n");
}));

test("a different current generation blocks activation after exact env confirmation", async () => withFixture(async (value) => {
  await transferred(value);
  const otherGenerationId = "423e4567-e89b-42d3-a456-426614174000";
  await publishSecretGeneration({ protectedRoot: value.targetProtectedRoot, generationId: GENERATION_ID, metadata: generationMetadata(GENERATION_ID), supabaseSnapshot: SUPABASE, godelSnapshot: GODEL });
  await publishSecretGeneration({ protectedRoot: value.targetProtectedRoot, generationId: otherGenerationId, metadata: generationMetadata(otherGenerationId), supabaseSnapshot: Buffer.from("OTHER=one\n"), godelSnapshot: Buffer.from("OTHER=two\n") });
  await Promise.all([writeFile(value.targetSupabaseEnvPath, SUPABASE), writeFile(value.targetGodelEnvPath, GODEL)]);
  await replaceCurrentGenerationPointer({ protectedRoot: value.targetProtectedRoot, generationId: otherGenerationId, expectedGenerationId: null });
  await assert.rejects(importSecretGenerationBundle({ manifestPath: value.manifestPath, bundlePath: value.targetBundlePath, protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath, apply: true }), /SECRET_GENERATION_TRANSPORT_CURRENT_GENERATION_CONFLICT/);
  assert.equal((await getCurrentSecretGeneration({ protectedRoot: value.targetProtectedRoot, supabaseEnvPath: value.targetSupabaseEnvPath, godelEnvPath: value.targetGodelEnvPath, compareLive: false })).generationId, otherGenerationId);
}));

test("bundle symlinks are rejected", async (t) => withFixture(async (value) => {
  if (process.platform === "win32") { t.skip("symlink creation is unavailable on this platform"); return; }
  await exported(value);
  const snapshot = join(value.temporary, "snapshot");
  await writeFile(snapshot, SUPABASE);
  await rm(join(value.sourceBundlePath, "supabase.env"));
  await symlink(snapshot, join(value.sourceBundlePath, "supabase.env"));
  await assert.rejects(readSecretGenerationBundle({ bundlePath: value.sourceBundlePath }), /SECRET_GENERATION_TRANSPORT_BUNDLE_FILE_SYMLINK/);
}));

test("CLI transport output never discloses synthetic secret values or hashes", async () => withFixture(async (value) => {
  const script = resolve(import.meta.dirname, "manage-secret-generations.mjs");
  for (const name of ["test-source", "rehearsal-a"]) {
    const protectedRoot = join(value.temporary, "protected-recovery-material", name);
    await cp(value.sourceProtectedRoot, protectedRoot, { recursive: true });
    const result = spawnSync(process.execPath, [script, "export", "--protected-root", `protected-recovery-material/${name}`, "--manifest", "manifests/reconstruction.json", "--output", "exports/cli-bundle"], { cwd: value.temporary, encoding: "utf8" });
    assert.equal(result.status, 0);
    const output = `${result.stdout}${result.stderr}`;
    assert.doesNotMatch(output, /synthetic-postgres-secret|synthetic-jwt-secret|synthetic-dashboard-secret/);
    assert.doesNotMatch(output, new RegExp(digest(SUPABASE)));
  }
}));

test("CLI transport roots reject trackable locations, the protected base and prefix confusion", async () => withFixture(async (value) => {
  const script = resolve(import.meta.dirname, "manage-secret-generations.mjs");
  for (const protectedRoot of ["src/recovery", "recovery-material", "protected-recovery-material", "protected-recovery-material-evil/foo"]) {
    const result = spawnSync(process.execPath, [script, "export", "--protected-root", protectedRoot, "--manifest", "manifests/reconstruction.json", "--output", "exports/blocked"], { cwd: value.temporary, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAIL INVALID_TRANSPORT_PROTECTED_ROOT/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /godel-secret-transport-|synthetic-postgres-secret|synthetic-jwt-secret|synthetic-dashboard-secret/);
  }
  await assert.rejects(readdir(join(value.temporary, "src")), { code: "ENOENT" });
}));

test("CLI rejects absolute and traversal transport paths before creating a trackable bundle", async () => withFixture(async (value) => {
  const script = resolve(import.meta.dirname, "manage-secret-generations.mjs");
  const attempts = [
    ["export", "--protected-root", "protected-recovery-material/test-source", "--manifest", "../manifest.json", "--output", "exports/ignored"],
    ["export", "--protected-root", "protected-recovery-material/test-source", "--manifest", "manifests/reconstruction.json", "--output", "../outside"],
    ["import", "--protected-root", "protected-recovery-material/test-source", "--manifest", "manifests/reconstruction.json", "--bundle", "../outside"],
    ["export", "--protected-root", "protected-recovery-material/test-source", "--manifest", "/tmp/manifest.json", "--output", "exports/ignored"],
    ["export", "--protected-root", "protected-recovery-material/test-source", "--manifest", "C:\\manifest.json", "--output", "exports/ignored"],
    ["export", "--protected-root", "protected-recovery-material/test-source", "--manifest", "manifests/reconstruction.json", "--output", "../../trackable-secret-bundle"],
  ];
  for (const args of attempts) {
    const result = spawnSync(process.execPath, [script, ...args], { cwd: value.temporary, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /synthetic-postgres-secret|synthetic-jwt-secret|synthetic-dashboard-secret|godel-secret-transport-/);
  }
  await assert.rejects(readdir(join(value.temporary, "trackable-secret-bundle")), { code: "ENOENT" });
}));

test("transport bundle files use restrictive POSIX modes when supported", async (t) => withFixture(async (value) => {
  if (process.platform === "win32") { t.skip("Windows ACLs are not POSIX mode bits"); return; }
  await exported(value);
  assert.equal((await stat(value.sourceBundlePath)).mode & 0o777, 0o700);
  for (const name of Object.values(SECRET_GENERATION_BUNDLE_FILES)) assert.equal((await stat(join(value.sourceBundlePath, name))).mode & 0o777, 0o600);
}));
