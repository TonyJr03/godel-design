import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  MANIFEST_SCHEMA_VERSION,
  ManagedMutatingQaManifestError,
  addPlannedResource,
  blockRun,
  createManagedMutatingRunId,
  createOwnershipValue,
  createPlannedResource,
  createRunManifest,
  discoverManifests,
  evaluateResidueGate,
  markResourceClean,
  markResourceCleanupPending,
  markResourceCreated,
  readManifest,
  validateManifest,
  verifyResourceOwnership,
  writeManifestAtomic,
} from "./manifest.mjs";

const clock = new Date("2026-09-20T21:45:01.000Z");
const runId = "M4QA-20260920T214501Z-K7D3Q5MW";

async function createRoot() {
  return mkdtemp(join(tmpdir(), "godel-managed-mutating-qa-"));
}

function solicitudResource(resourceId = "solicitud-1") {
  return createPlannedResource({ resourceId, entityType: "solicitud", runId, now: clock });
}

function templateResource(resourceId = "template-1") {
  return createPlannedResource({ resourceId, entityType: "trabajo_plantilla", runId, now: clock });
}

function errorCode(code) {
  return (error) => error instanceof ManagedMutatingQaManifestError && error.code === code;
}

test("managed mutating run IDs are UTC, valid, and distinct", () => {
  const first = createManagedMutatingRunId({ now: clock });
  const second = createManagedMutatingRunId({ now: clock });
  assert.match(first, /^M4QA-20260920T214501Z-[A-Z2-7]{8}$/);
  assert.notEqual(first, second);
});

test("manifest writes atomically, creates its root, and round-trips", async () => {
  const root = await createRoot();
  const manifest = addPlannedResource(createRunManifest({ runId, now: clock }), solicitudResource());
  const file = await writeManifestAtomic(manifest, { root });
  const recovered = await readManifest(file);
  assert.deepEqual(recovered, manifest);
  assert.equal(file.endsWith(`${runId}.json`), true);
});

test("manifest rejects unsupported schema, corrupt JSON, duplicate resources, and entities", async () => {
  const root = await createRoot();
  const base = createRunManifest({ runId, now: clock });
  assert.throws(() => validateManifest({ ...base, schemaVersion: 2 }), errorCode("MANIFEST_INVALID"));
  assert.throws(
    () => addPlannedResource(addPlannedResource(base, solicitudResource()), solicitudResource()),
    errorCode("MANIFEST_INVALID"),
  );
  assert.throws(
    () => createPlannedResource({ resourceId: "bad", entityType: "pedido", runId, now: clock }),
    errorCode("UNSUPPORTED_MUTATING_ENTITY"),
  );
  const corrupt = join(root, `${runId}.json`);
  await writeFile(corrupt, "{not-json", "utf8");
  await assert.rejects(readManifest(corrupt), errorCode("MANIFEST_INVALID"));
});

test("planned resource preserves an exact ownership marker through the crash window", async () => {
  const root = await createRoot();
  const planned = solicitudResource();
  const manifest = addPlannedResource(createRunManifest({ runId, now: clock }), planned);
  await writeManifestAtomic(manifest, { root });
  const discovery = await discoverManifests({ root });
  assert.equal(discovery.pending.length, 1);
  assert.equal(discovery.pending[0].manifest.resources[0].remoteId, undefined);
  assert.equal(planned.ownershipValue, `M4QA solicitud ${runId}`);
  assert.deepEqual(evaluateResidueGate(discovery), {
    allowed: false,
    code: "NEW_MUTATING_RUN_BLOCKED",
    invalid: 0,
    pending: 1,
    clean: 0,
  });
});

test("ownership verification accepts only exact solicitud and template rows", () => {
  const solicitud = { ...solicitudResource(), remoteId: "sol-uuid", state: "created" };
  const template = { ...templateResource(), remoteId: "template-uuid", state: "created" };
  assert.deepEqual(
    verifyResourceOwnership(solicitud, { id: "sol-uuid", description: solicitud.ownershipValue }),
    { ok: true, code: "OWNERSHIP_VERIFIED" },
  );
  assert.deepEqual(
    verifyResourceOwnership(template, { id: "template-uuid", name: template.ownershipValue }),
    { ok: true, code: "OWNERSHIP_VERIFIED" },
  );
});

test("ownership verification is fail-closed for ID or marker mismatches", () => {
  const resource = { ...solicitudResource(), remoteId: "expected-id", state: "created" };
  for (const row of [
    null,
    { id: "wrong-id", description: resource.ownershipValue },
    { id: "expected-id", description: "wrong marker" },
    { id: "expected-id", description: createOwnershipValue("solicitud", "M4QA-20260920T214502Z-K7D3Q6MW") },
  ]) {
    const result = verifyResourceOwnership(resource, row);
    assert.equal(result.ok, false);
    assert.equal(result.code, "OWNERSHIP_MISMATCH");
  }
});

test("ownership descriptors and secret-like manifest fields are rejected fail-closed", () => {
  const resource = solicitudResource();
  assert.throws(
    () => validateManifest({ ...createRunManifest({ runId, now: clock }), resources: [{ ...resource, ownershipField: "name" }] }),
    errorCode("MANIFEST_INVALID"),
  );
  assert.throws(
    () => validateManifest({ ...createRunManifest({ runId, now: clock }), password: "nope" }),
    errorCode("MANIFEST_INVALID"),
  );
  assert.equal(JSON.stringify(createRunManifest({ runId, now: clock })).match(/password|token|cookie|secret|key/i), null);
});

test("resource and run transitions are constrained and clean cannot reactivate", () => {
  let manifest = addPlannedResource(createRunManifest({ runId, now: clock }), solicitudResource());
  manifest = markResourceCreated(manifest, "solicitud-1", { remoteId: "remote-1", now: clock });
  manifest = markResourceCleanupPending(manifest, "solicitud-1", { now: clock });
  manifest = markResourceClean(manifest, "solicitud-1", { now: clock });
  assert.equal(manifest.state, "clean");
  assert.throws(() => addPlannedResource(manifest, solicitudResource("again")), errorCode("INVALID_STATE_TRANSITION"));
  assert.throws(() => markResourceCleanupPending(manifest, "solicitud-1"), errorCode("INVALID_STATE_TRANSITION"));
});

test("allowed planned-to-cleanup and blocked transitions remain explicit", () => {
  let manifest = addPlannedResource(createRunManifest({ runId, now: clock }), solicitudResource());
  const blockedResource = { ...manifest.resources[0], state: "blocked" };
  for (const state of ["active", "cleanup_required", "clean"]) {
    assert.throws(
      () => validateManifest({ ...manifest, state, resources: [blockedResource] }),
      errorCode("MANIFEST_INVALID"),
    );
  }
  manifest = markResourceCleanupPending(manifest, "solicitud-1", { now: clock });
  assert.equal(manifest.state, "cleanup_required");
  assert.equal(manifest.resources[0].state, "cleanup_pending");
  manifest = blockRun(manifest, { resourceId: "solicitud-1", now: clock });
  assert.equal(manifest.state, "blocked");
  assert.equal(manifest.resources[0].state, "blocked");
  assert.throws(() => addPlannedResource(manifest, solicitudResource("again")), errorCode("INVALID_STATE_TRANSITION"));
});

test("residue gate accepts only clean manifests and blocks active, cleanup-required, blocked, and invalid", async () => {
  const root = await createRoot();
  let clean = addPlannedResource(createRunManifest({ runId, now: clock }), solicitudResource());
  clean = markResourceCreated(clean, "solicitud-1", { remoteId: "remote", now: clock });
  clean = markResourceCleanupPending(clean, "solicitud-1", { now: clock });
  clean = markResourceClean(clean, "solicitud-1", { now: clock });
  await writeManifestAtomic(clean, { root });
  assert.equal(evaluateResidueGate(await discoverManifests({ root })).allowed, true);

  const activeId = "M4QA-20260920T214502Z-K7D3Q6MW";
  await writeManifestAtomic(createRunManifest({ runId: activeId, now: clock }), { root });
  let gate = evaluateResidueGate(await discoverManifests({ root }));
  assert.equal(gate.allowed, false);
  assert.equal(gate.pending, 1);

  const cleanupRoot = await createRoot();
  const cleanupId = "M4QA-20260920T214503Z-K7D3Q6MW";
  let cleanupRequired = addPlannedResource(
    createRunManifest({ runId: cleanupId, now: clock }),
    createPlannedResource({ resourceId: "cleanup", entityType: "solicitud", runId: cleanupId, now: clock }),
  );
  cleanupRequired = markResourceCleanupPending(cleanupRequired, "cleanup", { now: clock });
  await writeManifestAtomic(cleanupRequired, { root: cleanupRoot });
  assert.equal(evaluateResidueGate(await discoverManifests({ root: cleanupRoot })).allowed, false);

  const blockedRoot = await createRoot();
  const blockedId = "M4QA-20260920T214504Z-K7D3Q6MW";
  const blocked = blockRun(createRunManifest({ runId: blockedId, now: clock }), { now: clock });
  await writeManifestAtomic(blocked, { root: blockedRoot });
  assert.equal(evaluateResidueGate(await discoverManifests({ root: blockedRoot })).allowed, false);

  const invalidPath = join(root, "M4QA-20260920T214505Z-K7D3Q6MW.json");
  await writeFile(invalidPath, "{}", "utf8");
  gate = evaluateResidueGate(await discoverManifests({ root }));
  assert.equal(gate.allowed, false);
  assert.equal(gate.invalid, 1);
});

test("atomic serialization emits only allowlisted non-sensitive fields", async () => {
  const root = await createRoot();
  const manifest = addPlannedResource(createRunManifest({ runId, now: clock }), templateResource());
  const file = await writeManifestAtomic(manifest, { root });
  const serialized = await readFile(file, "utf8");
  assert.equal(/password|token|cookie|secret|signed.?url|api.?key/i.test(serialized), false);
  assert.equal(JSON.parse(serialized).schemaVersion, MANIFEST_SCHEMA_VERSION);
});

test("multi-resource cleanup remains valid until every created resource is clean", async () => {
  const root = await createRoot();
  let manifest = addPlannedResource(createRunManifest({ runId, now: clock }), solicitudResource("resource-a"));
  manifest = addPlannedResource(manifest, templateResource("resource-b"), { now: clock });
  manifest = markResourceCreated(manifest, "resource-a", { remoteId: "remote-a", now: clock });
  manifest = markResourceCreated(manifest, "resource-b", { remoteId: "remote-b", now: clock });

  manifest = markResourceCleanupPending(manifest, "resource-a", { now: clock });
  assert.equal(manifest.state, "cleanup_required");
  assert.deepEqual(manifest.resources.map((resource) => resource.state), ["cleanup_pending", "created"]);
  validateManifest(manifest);
  const file = await writeManifestAtomic(manifest, { root });
  assert.deepEqual(await readManifest(file), manifest);

  manifest = markResourceClean(manifest, "resource-a", { now: clock });
  assert.equal(manifest.state, "cleanup_required");
  assert.deepEqual(manifest.resources.map((resource) => resource.state), ["clean", "created"]);
  validateManifest(manifest);

  manifest = markResourceCleanupPending(manifest, "resource-b", { now: clock });
  assert.equal(manifest.state, "cleanup_required");
  manifest = markResourceClean(manifest, "resource-b", { now: clock });
  assert.equal(manifest.state, "clean");
  await writeManifestAtomic(manifest, { root });
  assert.deepEqual(await readManifest(file), manifest);
});

test("multi-resource crash window permits a planned sibling and blocks the residue gate", async () => {
  const root = await createRoot();
  let manifest = addPlannedResource(createRunManifest({ runId, now: clock }), solicitudResource("resource-a"));
  manifest = addPlannedResource(manifest, templateResource("resource-b"), { now: clock });
  manifest = markResourceCreated(manifest, "resource-a", { remoteId: "remote-a", now: clock });
  manifest = markResourceCleanupPending(manifest, "resource-a", { now: clock });

  assert.equal(manifest.state, "cleanup_required");
  assert.equal(manifest.resources[0].state, "cleanup_pending");
  assert.equal(manifest.resources[1].state, "planned");
  assert.equal(manifest.resources[1].remoteId, undefined);
  validateManifest(manifest);
  await writeManifestAtomic(manifest, { root });
  assert.deepEqual(evaluateResidueGate(await discoverManifests({ root })), {
    allowed: false,
    code: "NEW_MUTATING_RUN_BLOCKED",
    invalid: 0,
    pending: 1,
    clean: 0,
  });
});

test("repeated atomic writes replace one manifest without temporary residue", async () => {
  const root = await createRoot();
  let manifest = addPlannedResource(createRunManifest({ runId, now: clock }), solicitudResource());
  const paths = [];

  for (const nextManifest of [
    manifest,
    (manifest = markResourceCreated(manifest, "solicitud-1", { remoteId: "remote-1", now: clock })),
    (manifest = markResourceCleanupPending(manifest, "solicitud-1", { now: clock })),
    (manifest = markResourceClean(manifest, "solicitud-1", { now: clock })),
  ]) {
    const file = await writeManifestAtomic(nextManifest, { root });
    paths.push(file);
    assert.deepEqual(await readManifest(file), nextManifest);
  }

  assert.equal(new Set(paths).size, 1);
  assert.deepEqual(await readdir(root), [`${runId}.json`]);
});
