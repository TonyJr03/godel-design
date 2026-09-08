import test from "node:test";
import assert from "node:assert/strict";
import { parseDataRestoreArgs, renderDataRestoreFailure, renderDataRestoreResult, restoreCleanHostData } from "./clean-host-data-restore.mjs";

test("CLI accepts only canonical paths and reports sanitized errors", () => {
  const value = parseDataRestoreArgs(["--manifest", "backups/manifest.json", "--backup", "backups/selfhosted/recovery", "--input-protected-root", "protected-recovery-material/input", "--bundle", "generation", "--apply", "--confirm-destructive-clean-host-rehearsal"]);
  assert.equal(value.apply, true); assert.equal(value.confirmed, true);
  assert.throws(() => parseDataRestoreArgs(["--force"]));
  assert.equal(renderDataRestoreResult({ state: "VALIDATED_NOT_APPLIED" }), "{\"state\":\"VALIDATED_NOT_APPLIED\"}\n");
  assert.equal(renderDataRestoreFailure(new Error("CLEAN_HOST_DATA_RESTORE_ABORTED")), "FAIL CLEAN_HOST_DATA_RESTORE_ABORTED\n");
});

function fixture({ preflight, fail, markerFails = false, signal = null, cleanupFails = false } = {}) {
  const events = [], markers = {}, state = { lock: false, restored: false };
  const manifest = { operationId: "22222222-2222-4222-8222-222222222222", backup: { backupId: "backup" }, externalSecretGenerationId: "11111111-1111-4111-8111-111111111111", protectedRecoveryMaterial: { relativePath: "pgsodium-root-key.tar" }, targetContract: { supabaseComposeProject: "target", godelComposeProject: "godel", operatorNetwork: "target-network" } };
  const handlers = new Map(), signalSource = { on: (name, handler) => handlers.set(name, handler), off: (name, handler) => { assert.equal(handlers.get(name), handler); handlers.delete(name); }, emit: (name) => handlers.get(name)?.() };
  const directory = (mode) => ({ isDirectory: () => true, isSymbolicLink: () => false, isFile: () => false, mode });
  const file = () => ({ isDirectory: () => false, isSymbolicLink: () => false, isFile: () => true, mode: 0o600, size: 1 });
  const filesystem = {
    entry: async (path) => path.endsWith("pgsodium-root-key.tar") ? file() : path.endsWith(".env") || path.endsWith("compose.env.local") ? preflight === "env" ? directory(0o700) : file() : directory(path.endsWith("storage") ? 0o755 : 0o700),
    entries: async (path) => path.endsWith("selfhosted") ? preflight === "residue" ? ["external-secrets", "other"] : state.lock ? [".clean-host-data-restore.lock", "external-secrets"] : ["external-secrets"] : path.endsWith("data") ? preflight === "pgdata" ? ["not-empty"] : state.restored ? ["restored"] : [] : path.endsWith("storage") ? preflight === "storage" ? ["not-empty"] : state.restored ? ["restored"] : [] : [],
    readFile: async () => preflight === "xattr" ? "{}" : "{\"schemaVersion\":1,\"format\":\"supabase-file-xattrs\",\"entries\":[]}",
    stat: async () => ({ size: 1 }), statfs: async () => ({ bavail: 1024 * 1024, bsize: 1024 * 1024 }),
    createDirectoryExclusive: async () => { state.lock = true; events.push("recovery-lock"); },
    writeFileExclusive: async (path, bytes) => { const name = path.endsWith("started.json") ? "started" : "failed"; if (name === "failed" && markerFails) throw new Error("marker"); markers[name] = JSON.parse(bytes); events.push(name + "-marker"); },
    removeDirectory: async () => { state.lock = false; events.push("recovery-lock-cleanup"); },
  };
  const docker = {
    inspectNetwork: async () => preflight === "network" ? ({ name: "wrong", driver: "bridge" }) : ({ name: "target-network", driver: "bridge" }),
    inspectVolume: async () => ({ name: "target_db-config", labels: { "com.docker.compose.project": "target", "com.docker.compose.volume": "db-config" } }),
    inventory: async () => preflight === "container" ? ({ containers: [{ labels: { "com.docker.compose.project": "target" } }], networks: [], volumes: [] }) : preflight === "volume" ? ({ containers: [], networks: [], volumes: [{ name: "extra", labels: { "com.docker.compose.project": "target" } }] }) : preflight === "network-extra" ? ({ containers: [], networks: [{ name: "extra", labels: { "com.docker.compose.project": "target" } }], volumes: [] }) : ({ containers: [], networks: [], volumes: [] }),
    verifyDbConfig: async () => { if (preflight === "db") throw new Error("db"); }, verifyDbConfigSix: async () => { events.push("final-foundation"); if (signal === "final-foundation") signalSource.emit("SIGINT"); },
  };
  const phase = async (name) => { events.push(name); state.restored = true; if (fail === name) throw new Error(name); if (signal === name) signalSource.emit("SIGINT"); };
  const primitives = { restoreArchive: async ({ archiveName }) => phase(archiveName === "pgdata.tar" ? "restore-pgdata" : "restore-storage"), assertRestoredPgdata: async () => phase("verify-pgdata"), assertRestoredStorage: async () => phase("verify-storage"), restoreProtectedKey: async () => phase("restore-pgsodium"), replayStorageXattrs: async () => phase("replay-xattrs"), verifyStorageXattrs: async () => phase("verify-xattrs") };
  let activeCalls = 0;
  const options = {
    root: "C:/synthetic", manifestPath: "manifest", backupPath: "C:/synthetic/backups/recovery", inputProtectedRoot: "C:/synthetic/protected-input", generationBundlePath: "bundle", readManifest: async () => ({ manifest }),
    admit: async () => preflight === "admission" ? ({ state: "FAIL" }) : ({ state: "PASS", operationId: manifest.operationId }),
    assertActive: async () => { activeCalls += 1; if (preflight === "active" || fail === "final-verification" && activeCalls === 3) throw new Error("active"); if (signal === "final-active" && activeCalls === 3) signalSource.emit("SIGTERM"); },
    helperReadiness: async () => { if (preflight === "helper") throw new Error("helper"); return { postgresImage: "postgres@sha256:helper", storageImage: "storage@sha256:helper" }; },
    diskCapacity: async () => { if (preflight === "disk") throw new Error("disk"); }, filesystem, docker, primitives, signalSource,
    acquireLock: async () => { events.push("generation-lock"); if (preflight === "generation-lock") throw new Error("lock"); return "generation-lock"; },
    releaseLock: async () => { events.push("generation-lock-cleanup"); if (cleanupFails) throw new Error("cleanup"); },
    hooks: { beforeMutation: () => { if (signal === "pre-mutation") signalSource.emit("SIGTERM"); } },
  };
  return { options, events, markers, state, handlers, manifest };
}

test("confirmation matrix and successful order preserve exact start identity", async () => {
  for (const [apply, confirmed, code] of [[false, false, null], [true, false, "CONFIRMATION"], [false, true, "CONFIRMATION"]]) {
    const value = fixture();
    if (!code) assert.equal((await restoreCleanHostData({ ...value.options, apply, confirmed })).state, "VALIDATED_NOT_APPLIED");
    else await assert.rejects(restoreCleanHostData({ ...value.options, apply, confirmed }), new RegExp(code));
    assert.deepEqual(value.events, []);
  }
  const value = fixture(), result = await restoreCleanHostData({ ...value.options, apply: true, confirmed: true });
  assert.equal(result.state, "PASS");
  assert.deepEqual(value.events, ["recovery-lock", "started-marker", "generation-lock", "restore-pgdata", "verify-pgdata", "restore-storage", "verify-storage", "restore-pgsodium", "replay-xattrs", "verify-xattrs", "final-foundation", "generation-lock-cleanup", "recovery-lock-cleanup"]);
  assert.deepEqual(Object.keys(value.markers.started), ["schemaVersion", "status", "operationId", "backupId", "generationId", "startedAt"]);
  assert.equal(value.markers.started.backupId, value.manifest.backup.backupId);
});

test("missing canonical backup identity fails before mutation", async () => {
  const value = fixture(); value.options.readManifest = async () => ({ manifest: { ...value.manifest, backup: {} } });
  await assert.rejects(restoreCleanHostData({ ...value.options, apply: true, confirmed: true }), /RECONSTRUCTION_BACKUP_ID/);
  assert.deepEqual(value.events, []);
});

test("representative preflight failures never create locks or recover data", async () => {
  for (const kind of ["admission", "active", "env", "residue", "pgdata", "storage", "db", "container", "volume", "network", "network-extra", "helper", "disk", "xattr"]) {
    const value = fixture({ preflight: kind });
    await assert.rejects(restoreCleanHostData({ ...value.options, apply: true, confirmed: true }));
    assert.equal(value.events.includes("recovery-lock"), false, kind);
    assert.equal(value.events.some((event) => event.startsWith("restore-") || event.startsWith("verify-")), false, kind);
  }
});

test("every post-mutation phase persists the exact failure marker and retains locks", async () => {
  for (const phase of ["restore-pgdata", "verify-pgdata", "restore-storage", "verify-storage", "restore-pgsodium", "replay-xattrs", "verify-xattrs", "final-verification"]) {
    const value = fixture({ fail: phase });
    await assert.rejects(restoreCleanHostData({ ...value.options, apply: true, confirmed: true }), /BLOCKED_PARTIAL_RECOVERY_STATE$/);
    assert.equal(value.state.lock, true, phase); assert.equal(value.events.includes("generation-lock-cleanup"), false, phase); assert.equal(value.events.includes("recovery-lock-cleanup"), false, phase);
    assert.deepEqual(Object.keys(value.markers.failed), ["schemaVersion", "status", "operationId", "backupId", "generationId", "phase", "failedAt"]);
    assert.equal(value.markers.failed.status, "FAILED_AFTER_DATA_MUTATION"); assert.equal(value.markers.failed.phase, phase); assert.equal(value.markers.failed.backupId, value.manifest.backup.backupId);
  }
});

test("marker and generation-lock failures are explicit pre/post mutation boundaries", async () => {
  const marker = fixture({ fail: "restore-pgdata", markerFails: true });
  await assert.rejects(restoreCleanHostData({ ...marker.options, apply: true, confirmed: true }), /MARKER_FAILED/);
  assert.equal(marker.state.lock, true); assert.equal(marker.events.includes("generation-lock-cleanup"), false); assert.equal(marker.markers.failed, undefined);
  const lock = fixture({ preflight: "generation-lock" });
  await assert.rejects(restoreCleanHostData({ ...lock.options, apply: true, confirmed: true }), /PRE_MUTATION/);
  assert.equal(lock.state.lock, false); assert.equal(lock.markers.failed, undefined); assert.equal(lock.events.includes("restore-pgdata"), false);
});

test("SIGTERM before mutation cleans locks; SIGINT after PGDATA marks and retains them", async () => {
  const before = fixture({ signal: "pre-mutation" });
  await assert.rejects(restoreCleanHostData({ ...before.options, apply: true, confirmed: true }), /ABORTED/);
  assert.equal(before.state.lock, false); assert.equal(before.events.includes("restore-pgdata"), false); assert.equal(before.handlers.size, 0);
  const after = fixture({ signal: "verify-pgdata" });
  await assert.rejects(restoreCleanHostData({ ...after.options, apply: true, confirmed: true }), /BLOCKED_PARTIAL_RECOVERY_STATE$/);
  assert.equal(after.events.includes("restore-storage"), false); assert.equal(after.state.lock, true); assert.equal(after.markers.failed.phase, "verify-pgdata"); assert.equal(after.handlers.size, 0);
});

test("signals during both asynchronous final-verification windows block with preserved locks", async () => {
  const active = fixture({ signal: "final-active" });
  await assert.rejects(restoreCleanHostData({ ...active.options, apply: true, confirmed: true }), /BLOCKED_PARTIAL_RECOVERY_STATE$/);
  assert.equal(active.events.includes("final-foundation"), false); assert.equal(active.state.lock, true); assert.equal(active.markers.failed.phase, "final-verification"); assert.equal(active.events.includes("generation-lock-cleanup"), false); assert.equal(active.events.includes("recovery-lock-cleanup"), false); assert.equal(active.handlers.size, 0);
  const foundation = fixture({ signal: "final-foundation" });
  await assert.rejects(restoreCleanHostData({ ...foundation.options, apply: true, confirmed: true }), /BLOCKED_PARTIAL_RECOVERY_STATE$/);
  assert.equal(foundation.events.includes("final-foundation"), true); assert.equal(foundation.state.lock, true); assert.equal(foundation.markers.failed.phase, "final-verification"); assert.equal(foundation.events.includes("generation-lock-cleanup"), false); assert.equal(foundation.events.includes("recovery-lock-cleanup"), false); assert.equal(foundation.handlers.size, 0);
});

test("cleanup failure is explicit and does not roll back restored data", async () => {
  const value = fixture({ cleanupFails: true });
  await assert.rejects(restoreCleanHostData({ ...value.options, apply: true, confirmed: true }), /POST_RECOVERY_LOCK_CLEANUP_FAILED/);
  assert.equal(value.state.restored, true); assert.equal(value.state.lock, true); assert.equal(value.handlers.size, 0);
});
