import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import {
  addPlannedResource,
  createOwnershipValue,
  createPlannedResource,
  createRunManifest,
  markResourceCreated,
} from "./managed-mutating-qa/manifest.mjs";
import {
  MUTATING_PRODUCTION_CONFIRMATION_VALUE,
  SOLICITUD_RESOURCE_ID,
  cleanupSolicitudManifest,
  recoverManagedSolicitudes,
  runSingleManagedSolicitud,
} from "./managed-mutating-qa/solicitud-flow.mjs";
import {
  buildMutatingChildEnvironment,
  buildMutatingPlaywrightArguments,
  runMutatingPlaywright,
  validateMutatingCommandArguments,
} from "./run-managed-production-mutating-e2e.mjs";

const runId = "M4QA-20260920T231501Z-K7D3Q5MW";
const ownershipValue = createOwnershipValue("solicitud", runId);

function plannedManifest(entityType = "solicitud") {
  return addPlannedResource(
    createRunManifest({ runId }),
    createPlannedResource({
      resourceId: SOLICITUD_RESOURCE_ID,
      entityType,
      runId,
    }),
  );
}

function createdManifest() {
  return markResourceCreated(plannedManifest(), SOLICITUD_RESOURCE_ID, {
    remoteId: "solicitud-uuid",
    publicReference: "GD-AB12-CD34",
  });
}

function exactRow(overrides = {}) {
  return {
    id: "solicitud-uuid",
    public_reference: "GD-AB12-CD34",
    description: ownershipValue,
    workflow_type: "encargo",
    cliente_id: null,
    converted_order_id: null,
    ...overrides,
  };
}

function fakeAdapter({
  initialRows = [],
  preDeleteRow,
  postDeleteRow = null,
  postDeleteRows = [],
  deleteError = false,
} = {}) {
  const calls = [];
  let ownershipQueries = 0;
  let idQueries = 0;

  return {
    calls,
    async findByOwnership(value) {
      calls.push(["find", value]);
      ownershipQueries += 1;
      return ownershipQueries === 1 ? initialRows : postDeleteRows;
    },
    async fetchById(id) {
      calls.push(["fetch", id]);
      idQueries += 1;
      return idQueries === 1
        ? (preDeleteRow === undefined ? initialRows[0] ?? null : preDeleteRow)
        : postDeleteRow;
    },
    async deleteExact(id, marker) {
      calls.push(["delete", id, marker]);
      if (deleteError) throw new Error("synthetic delete failure");
    },
  };
}

function memoryPersist() {
  const writes = [];
  return {
    persist: async (manifest) => {
      writes.push(JSON.parse(JSON.stringify(manifest)));
    },
    writes,
  };
}

function clearDiscovery() {
  return { clean: [], pending: [], invalid: [] };
}

function errorCode(code) {
  return (error) => error?.code === code || error?.message === code;
}

test("missing destructive confirmation performs zero execution", async () => {
  const calls = [];
  await assert.rejects(
    runSingleManagedSolicitud({
      confirmation: undefined,
      discover: async () => calls.push("discover"),
      bootstrap: async () => calls.push("bootstrap"),
      runPlaywright: async () => calls.push("playwright"),
      createAdapter: async () => calls.push("adapter"),
      persist: async () => calls.push("persist"),
    }),
    errorCode("MUTATING_PRODUCTION_CONFIRMATION_REQUIRED"),
  );
  assert.deepEqual(calls, []);
});

test("residue gate blocks before bootstrap or Playwright", async () => {
  const calls = [];
  await assert.rejects(
    runSingleManagedSolicitud({
      confirmation: MUTATING_PRODUCTION_CONFIRMATION_VALUE,
      discover: async () => ({
        clean: [],
        invalid: [],
        pending: [{ file: "pending.json", manifest: plannedManifest() }],
      }),
      bootstrap: async () => calls.push("bootstrap"),
      runPlaywright: async () => calls.push("playwright"),
      createAdapter: async () => calls.push("adapter"),
      persist: async () => calls.push("persist"),
    }),
    errorCode("NEW_MUTATING_RUN_BLOCKED"),
  );
  assert.deepEqual(calls, []);
});

test("bootstrap precedes planned manifest and planned persistence precedes spawn", async () => {
  const events = [];
  const persisted = [];
  const result = await runSingleManagedSolicitud({
    confirmation: MUTATING_PRODUCTION_CONFIRMATION_VALUE,
    discover: async () => clearDiscovery(),
    bootstrap: async () => {
      events.push("bootstrap");
      return { ready: true };
    },
    createRunId: () => runId,
    persist: async (manifest) => {
      events.push(`persist:${manifest.resources[0].state}`);
      persisted.push(JSON.parse(JSON.stringify(manifest)));
    },
    runPlaywright: async () => {
      events.push("playwright");
      assert.equal(persisted[0].resources[0].state, "planned");
      return 0;
    },
    createAdapter: async () => fakeAdapter(),
  });
  assert.deepEqual(events.slice(0, 3), [
    "bootstrap",
    "persist:planned",
    "playwright",
  ]);
  assert.equal(result.exitCode, 0);
  assert.equal(result.manifest.state, "clean");
});

test("Playwright arguments and command modes are fixed allowlists", () => {
  assert.deepEqual(buildMutatingPlaywrightArguments().slice(0, 5), [
    "test",
    "tests/e2e/managed-mutating-solicitud.spec.ts",
    "--project=chromium",
    "--workers=1",
    "--retries=0",
  ]);
  assert.equal(validateMutatingCommandArguments([]), "run");
  assert.equal(validateMutatingCommandArguments(["--recover"]), "recover");
  assert.throws(
    () => validateMutatingCommandArguments(["--grep", "anything"]),
    /UNSUPPORTED_MUTATING_ARGUMENTS/,
  );
});

test("mutating child environment contains metadata and excludes credentials", () => {
  const child = buildMutatingChildEnvironment({
    parentEnvironment: {
      PATH: "synthetic-path",
      GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM:
        MUTATING_PRODUCTION_CONFIRMATION_VALUE,
      GODEL_TEST_ADMIN_PASSWORD: "must-not-pass",
      SUPABASE_SECRET_KEY: "must-not-pass",
      VERCEL_AUTOMATION_BYPASS_SECRET: "must-not-pass",
    },
    publicEnvironment: {
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.invalid",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-value",
    },
    productionOrigin: "https://production.example.com",
    storageStatePath: "synthetic-storage-state.json",
    runId,
    ownershipValue,
  });
  assert.equal(child.GODEL_MANAGED_MUTATING_QA, "1");
  assert.equal(child.GODEL_MANAGED_MUTATING_RUN_ID, runId);
  assert.equal(child.GODEL_MANAGED_MUTATING_OWNERSHIP_VALUE, ownershipValue);
  assert.equal(child.GODEL_TEST_ADMIN_PASSWORD, undefined);
  assert.equal(child.SUPABASE_SECRET_KEY, undefined);
  assert.equal(child.VERCEL_AUTOMATION_BYPASS_SECRET, undefined);
  assert.equal(child.GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM, undefined);
});

test("zero remote rows transitions planned intent to clean without delete", async () => {
  const adapter = fakeAdapter();
  const { persist, writes } = memoryPersist();
  const result = await cleanupSolicitudManifest({
    manifest: plannedManifest(),
    adapter,
    persist,
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifest.state, "clean");
  assert.deepEqual(writes.map((entry) => entry.resources[0].state), [
    "cleanup_pending",
    "clean",
  ]);
  assert.equal(adapter.calls.some(([operation]) => operation === "delete"), false);
});

test("one exact row is captured, ownership-checked, deleted, and verified", async () => {
  const row = exactRow();
  const adapter = fakeAdapter({ initialRows: [row] });
  const { persist, writes } = memoryPersist();
  const result = await cleanupSolicitudManifest({
    manifest: plannedManifest(),
    adapter,
    persist,
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifest.state, "clean");
  assert.deepEqual(writes.map((entry) => entry.resources[0].state), [
    "created",
    "cleanup_pending",
    "clean",
  ]);
  assert.deepEqual(
    adapter.calls.find(([operation]) => operation === "delete"),
    ["delete", row.id, ownershipValue],
  );
});

test("ambiguous ownership blocks the run and never deletes", async () => {
  const adapter = fakeAdapter({
    initialRows: [exactRow(), exactRow({ id: "second-uuid" })],
  });
  const result = await cleanupSolicitudManifest({
    manifest: plannedManifest(),
    adapter,
    persist: memoryPersist().persist,
  });
  assert.equal(result.code, "OWNERSHIP_AMBIGUOUS");
  assert.equal(result.manifest.state, "blocked");
  assert.equal(adapter.calls.some(([operation]) => operation === "delete"), false);
});

for (const [label, preDeleteRow] of [
  ["wrong marker", exactRow({ description: "not-the-marker" })],
  ["wrong ID", exactRow({ id: "wrong-uuid" })],
]) {
  test(`${label} at the pre-delete gate blocks without delete`, async () => {
    const adapter = fakeAdapter({
      initialRows: [exactRow()],
      preDeleteRow,
    });
    const result = await cleanupSolicitudManifest({
      manifest: plannedManifest(),
      adapter,
      persist: memoryPersist().persist,
    });
    assert.equal(result.code, "OWNERSHIP_MISMATCH");
    assert.equal(result.manifest.state, "blocked");
    assert.equal(adapter.calls.some(([operation]) => operation === "delete"), false);
  });
}

for (const [label, mismatch] of [
  ["cliente_id", { cliente_id: "cliente-uuid" }],
  ["converted_order_id", { converted_order_id: "pedido-uuid" }],
  ["workflow_type", { workflow_type: "impresion" }],
]) {
  test(`${label} contract mismatch blocks without delete`, async () => {
    const adapter = fakeAdapter({ initialRows: [exactRow(mismatch)] });
    const result = await cleanupSolicitudManifest({
      manifest: plannedManifest(),
      adapter,
      persist: memoryPersist().persist,
    });
    assert.equal(result.code, "CONTRACT_MISMATCH");
    assert.equal(result.manifest.state, "blocked");
    assert.equal(adapter.calls.some(([operation]) => operation === "delete"), false);
  });
}

test("delete errors block the cleanup", async () => {
  const adapter = fakeAdapter({ initialRows: [exactRow()], deleteError: true });
  const result = await cleanupSolicitudManifest({
    manifest: plannedManifest(),
    adapter,
    persist: memoryPersist().persist,
  });
  assert.equal(result.code, "CLEANUP_DELETE_FAILED");
  assert.equal(result.manifest.state, "blocked");
});

test("post-delete row residue blocks the cleanup", async () => {
  const adapter = fakeAdapter({
    initialRows: [exactRow()],
    postDeleteRow: exactRow(),
  });
  const result = await cleanupSolicitudManifest({
    manifest: plannedManifest(),
    adapter,
    persist: memoryPersist().persist,
  });
  assert.equal(result.code, "CLEANUP_VERIFICATION_FAILED");
  assert.equal(result.manifest.state, "blocked");
});

test("post-delete marker residue blocks the cleanup", async () => {
  const adapter = fakeAdapter({
    initialRows: [exactRow()],
    postDeleteRows: [exactRow({ id: "residual-uuid" })],
  });
  const result = await cleanupSolicitudManifest({
    manifest: plannedManifest(),
    adapter,
    persist: memoryPersist().persist,
  });
  assert.equal(result.code, "CLEANUP_VERIFICATION_FAILED");
  assert.equal(result.manifest.state, "blocked");
});

async function runForPrecedence(testExitCode, adapter) {
  return runSingleManagedSolicitud({
    confirmation: MUTATING_PRODUCTION_CONFIRMATION_VALUE,
    discover: async () => clearDiscovery(),
    bootstrap: async () => ({ ready: true }),
    createRunId: () => runId,
    runPlaywright: async () => testExitCode,
    createAdapter: async () => adapter,
    persist: memoryPersist().persist,
  });
}

test("test failure remains overall failure when cleanup passes", async () => {
  const result = await runForPrecedence(1, fakeAdapter());
  assert.equal(result.cleanupPassed, true);
  assert.equal(result.exitCode, 1);
});

test("cleanup failure remains overall failure when test passes", async () => {
  const result = await runForPrecedence(
    0,
    fakeAdapter({ initialRows: [exactRow(), exactRow({ id: "second" })] }),
  );
  assert.equal(result.cleanupPassed, false);
  assert.equal(result.exitCode, 1);
});

test("test and cleanup success produce overall success", async () => {
  const result = await runForPrecedence(0, fakeAdapter());
  assert.equal(result.cleanupPassed, true);
  assert.equal(result.exitCode, 0);
});

for (const [label, manifest] of [
  ["planned", plannedManifest()],
  ["created", createdManifest()],
]) {
  test(`recovery cleans a pending ${label} solicitud resource`, async () => {
    const adapter = label === "planned"
      ? fakeAdapter()
      : fakeAdapter({ initialRows: [exactRow()] });
    const recovery = await recoverManagedSolicitudes({
      confirmation: MUTATING_PRODUCTION_CONFIRMATION_VALUE,
      discover: async () => ({
        clean: [],
        invalid: [],
        pending: [{ file: `${runId}.json`, manifest }],
      }),
      createAdapter: async () => adapter,
      persist: memoryPersist().persist,
    });
    assert.equal(recovery.exitCode, 0);
    assert.equal(recovery.recovered, 1);
    assert.equal(recovery.results[0].manifest.state, "clean");
  });
}

test("recovery rejects unsupported entities before creating an adapter", async () => {
  let adapterCreations = 0;
  await assert.rejects(
    recoverManagedSolicitudes({
      confirmation: MUTATING_PRODUCTION_CONFIRMATION_VALUE,
      discover: async () => ({
        clean: [],
        invalid: [],
        pending: [{ file: `${runId}.json`, manifest: plannedManifest("trabajo_plantilla") }],
      }),
      createAdapter: async () => {
        adapterCreations += 1;
        return fakeAdapter();
      },
      persist: memoryPersist().persist,
    }),
    errorCode("UNSUPPORTED_RECOVERY_ENTITY"),
  );
  assert.equal(adapterCreations, 0);
});

test("SIGTERM is forwarded to the child and resolves only after child exit", async () => {
  const signalTarget = new EventEmitter();
  const child = new EventEmitter();
  child.killed = false;
  child.kill = (signal) => {
    child.killed = true;
    child.forwardedSignal = signal;
  };
  const execution = runMutatingPlaywright(
    {
      GODEL_MANAGED_MUTATING_QA: "1",
      GODEL_MANAGED_MUTATING_RUN_ID: runId,
      GODEL_MANAGED_MUTATING_OWNERSHIP_VALUE: ownershipValue,
    },
    {
      signalTarget,
      spawnProcess: () => child,
    },
  );
  signalTarget.emit("SIGTERM");
  assert.equal(child.forwardedSignal, "SIGTERM");
  child.emit("close", null);
  await assert.rejects(execution, /MUTATING_PLAYWRIGHT_INTERRUPTED/);
});
