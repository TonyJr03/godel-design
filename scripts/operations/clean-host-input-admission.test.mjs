import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { admitTransportedReconstructionInputs, parseInputAdmissionArgs, renderInputAdmissionFailure, renderInputAdmissionResult } from "./clean-host-input-admission.mjs";

const OPERATION = "123e4567-e89b-42d3-a456-426614174000";
const GENERATION = "223e4567-e89b-42d3-a456-426614174000";
const MANIFEST_SHA = "a".repeat(64);

function manifest() { return { operationId: OPERATION, externalSecretGenerationId: GENERATION, godelBuilds: [{ logicalName: "godel-app", configurationBinding: GENERATION }, { logicalName: "godel-nginx", configurationBinding: null }] }; }
function bundle(value = {}) { return { bundle: { generationId: value.generationId ?? GENERATION, reconstruction: { operationId: value.operationId ?? OPERATION, manifestSha256: value.manifestSha256 ?? MANIFEST_SHA } } }; }
function adapters(options = {}) {
  const actions = [];
  return {
    actions,
    readManifest: options.readManifest ?? (async () => ({ manifest: options.manifest ?? manifest(), manifestSha256: MANIFEST_SHA })),
    validateManifest: options.validateManifest ?? (async (input) => { actions.push(["validate", input]); }),
    assertBundlePath: options.assertBundlePath ?? (async ({ path }) => { actions.push(["bundle-path", path]); return path; }),
    readBundle: options.readBundle ?? (async () => { actions.push(["bundle-read"]); return bundle(options.bundle); }),
  };
}
async function run(options = {}) {
  const value = adapters(options);
  const result = await admitTransportedReconstructionInputs({ manifestPath: "/private/manifests/reconstruction.json", backupPath: "/private/backups/backup-synthetic", inputProtectedRoot: "/private/protected/input", generationBundlePath: "/private/protected/input/bundles/exact", root: "/repo", ...value });
  return { ...value, result };
}

test("admission validates canonical transported inputs and returns only sanitized evidence", async () => {
  const value = await run();
  assert.equal(value.result.state, "PASS");
  assert.equal(value.result.generationAlignment, "EXACT");
  assert.equal(value.actions[0][0], "validate");
  assert.equal(value.actions.some(([action]) => /docker|create|import|current|restore|write|mkdir/.test(action)), false);
  assert.doesNotMatch(renderInputAdmissionResult(value.result), /private|synthetic DB secret|synthetic JWT|publishable|pgsodium/i);
});

test("manifest, repository, backup and protected-artifact failures are fail-closed before bundle admission", async () => {
  const cases = [
    { readManifest: async () => { throw new Error("manifest read failure"); }, expected: /INPUT_ADMISSION_MANIFEST_INVALID/ },
    { readManifest: async () => { throw new Error("manifest sidecar failure"); }, expected: /INPUT_ADMISSION_MANIFEST_INVALID/ },
    { validateManifest: async () => { throw new Error("PORTABILITY_MANIFEST_REPOSITORY_HEAD_MISMATCH"); }, expected: /INPUT_ADMISSION_REPOSITORY_BINDING/ },
    { validateManifest: async () => { throw new Error("PORTABILITY_MANIFEST_BACKUP_VERIFY_FAILED"); }, expected: /INPUT_ADMISSION_BACKUP_INVALID/ },
    { validateManifest: async () => { throw new Error("PORTABILITY_MANIFEST_PROTECTED_ARTIFACT_HASH"); }, expected: /INPUT_ADMISSION_PROTECTED_MATERIAL_INVALID/ },
  ];
  for (const options of cases) {
    const value = adapters(options);
    await assert.rejects(() => admitTransportedReconstructionInputs({ manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/protected", generationBundlePath: "/protected/bundle", ...value }), options.expected);
    assert.equal(value.actions.some(([action]) => action === "bundle-path" || action === "bundle-read"), false);
  }
});

test("bundle path, canonical bundle and exact bindings fail without mutation", async () => {
  const cases = [
    { assertBundlePath: async () => { throw new Error("outside input root"); }, expected: /INPUT_ADMISSION_PATH/ },
    { assertBundlePath: async () => { throw new Error("external-secrets registry"); }, expected: /INPUT_ADMISSION_PATH/ },
    { readBundle: async () => { throw new Error("bundle schema invalid"); }, expected: /INPUT_ADMISSION_BUNDLE_INVALID/ },
    { readBundle: async () => { throw new Error("bundle integrity mismatch"); }, expected: /INPUT_ADMISSION_BUNDLE_INVALID/ },
    { bundle: { generationId: "323e4567-e89b-42d3-a456-426614174000" }, expected: /INPUT_ADMISSION_GENERATION_MISMATCH/ },
    { bundle: { operationId: "323e4567-e89b-42d3-a456-426614174000" }, expected: /INPUT_ADMISSION_OPERATION_MISMATCH/ },
    { bundle: { manifestSha256: "b".repeat(64) }, expected: /INPUT_ADMISSION_MANIFEST_BINDING_MISMATCH/ },
    { manifest: { ...manifest(), godelBuilds: [{ logicalName: "godel-app", configurationBinding: "323e4567-e89b-42d3-a456-426614174000" }] }, expected: /INPUT_ADMISSION_APP_CONFIGURATION_BINDING_MISMATCH/ },
  ];
  for (const options of cases) {
    const value = adapters(options);
    await assert.rejects(() => admitTransportedReconstructionInputs({ manifestPath: "/manifest", backupPath: "/backup", inputProtectedRoot: "/protected", generationBundlePath: "/protected/bundle", ...value }), options.expected);
    assert.equal(value.actions.some(([action]) => /docker|create|import|current|restore|write|mkdir/.test(action)), false);
  }
});

test("CLI accepts only safely contained repository input paths", () => {
  const root = resolve("/repo");
  assert.deepEqual(parseInputAdmissionArgs(["--manifest", "manifests/reconstruction.json", "--backup", "backups/sh05-input/backup-123", "--input-protected-root", "protected-recovery-material/sh05-input", "--bundle", "bundles/exact-generation"], root), { manifestPath: resolve(root, "manifests/reconstruction.json"), backupPath: resolve(root, "backups/sh05-input/backup-123"), inputProtectedRoot: resolve(root, "protected-recovery-material/sh05-input"), generationBundlePath: resolve(root, "protected-recovery-material/sh05-input/bundles/exact-generation") });
  const invalid = [
    ["--manifest", "../manifest", "--backup", "backups/sh05/backup", "--input-protected-root", "protected-recovery-material/sh05", "--bundle", "bundles/exact"],
    ["--manifest", "/manifest", "--backup", "backups/sh05/backup", "--input-protected-root", "protected-recovery-material/sh05", "--bundle", "bundles/exact"],
    ["--manifest", "manifests/reconstruction.json", "--backup", "backups", "--input-protected-root", "protected-recovery-material/sh05", "--bundle", "bundles/exact"],
    ["--manifest", "manifests/reconstruction.json", "--backup", "backups-evil/backup", "--input-protected-root", "protected-recovery-material/sh05", "--bundle", "bundles/exact"],
    ["--manifest", "manifests/reconstruction.json", "--backup", "backups/sh05/backup", "--input-protected-root", "protected-recovery-material", "--bundle", "bundles/exact"],
    ["--manifest", "manifests/reconstruction.json", "--backup", "backups/sh05/backup", "--input-protected-root", "protected-recovery-material-evil/sh05", "--bundle", "bundles/exact"],
    ["--manifest", "manifests/reconstruction.json", "--backup", "backups/sh05/backup", "--input-protected-root", "protected-recovery-material/sh05", "--bundle", "C:\\bundle"],
  ];
  for (const args of invalid) assert.throws(() => parseInputAdmissionArgs(args, root), /INPUT_ADMISSION_PATH/);
});

test("failure rendering never exposes nested secret values or private paths", () => {
  assert.equal(renderInputAdmissionFailure(new Error("synthetic DB secret /private/protected synthetic JWT")), "FAIL INPUT_ADMISSION_FAILED\n");
});
