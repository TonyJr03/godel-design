import assert from "node:assert/strict";
import { test } from "node:test";

import {
  addPlannedResource,
  blockRun,
  createOwnershipValue,
  createPlannedResource,
  createRunManifest,
  markResourceCleanupPending,
  markResourceCreated,
} from "./managed-mutating-qa/manifest.mjs";
import { createAuthenticatedTemplateAdapter } from "./managed-mutating-qa/template-adapter.mjs";
import {
  TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
  TEMPLATE_RESOURCE_ID,
  cleanupTemplateManifest,
  recoverManagedTemplates,
  runSingleManagedTemplate,
  templateFixtureDescription,
} from "./managed-mutating-qa/template-flow.mjs";
import {
  buildTemplateMutatingChildEnvironment,
  buildTemplateMutatingPlaywrightArguments,
  validateTemplateMutatingCommandArguments,
} from "./run-managed-production-mutating-template-e2e.mjs";

const runId = "M4QA-20260920T231501Z-K7D3Q5MW";
const templateName = createOwnershipValue("trabajo_plantilla", runId);

function plannedManifest(entityType = "trabajo_plantilla") {
  return addPlannedResource(
    createRunManifest({ runId }),
    createPlannedResource({
      resourceId: TEMPLATE_RESOURCE_ID,
      entityType,
      runId,
    }),
  );
}

function createdManifest() {
  return markResourceCreated(plannedManifest(), TEMPLATE_RESOURCE_ID, {
    remoteId: "template-uuid",
  });
}

function cleanupRequiredManifest() {
  return markResourceCleanupPending(createdManifest(), TEMPLATE_RESOURCE_ID);
}

function exactTemplate(overrides = {}) {
  return {
    id: "template-uuid",
    name: templateName,
    description: templateFixtureDescription(runId),
    is_active: false,
    ...overrides,
  };
}

function exactTask(title, overrides = {}) {
  return {
    id: `task-${title}`,
    template_id: "template-uuid",
    title,
    ...overrides,
  };
}

function fakeAdapter({
  createRow = exactTemplate(),
  createError = false,
  initialRows = [exactTemplate()],
  preDeleteRow,
  preDeleteTasks = [],
  postDeleteRow = null,
  postDeleteRows = [],
  postDeleteTasks = [],
  deleteError = false,
} = {}) {
  const calls = [];
  let ownershipQueries = 0;
  let idQueries = 0;
  let taskQueries = 0;
  return {
    calls,
    async createInactiveTemplate(input) {
      calls.push(["create", input]);
      if (createError) throw new Error("TEMPLATE_INSERT_FAILED");
      return createRow;
    },
    async findTemplateByOwnership(value) {
      calls.push(["find", value]);
      ownershipQueries += 1;
      return ownershipQueries === 1 ? initialRows : postDeleteRows;
    },
    async fetchTemplateById(id) {
      calls.push(["fetch", id]);
      idQueries += 1;
      return idQueries === 1
        ? (preDeleteRow === undefined ? initialRows[0] ?? null : preDeleteRow)
        : postDeleteRow;
    },
    async listTasksByTemplateId(id) {
      calls.push(["tasks", id]);
      taskQueries += 1;
      return taskQueries === 1 ? preDeleteTasks : postDeleteTasks;
    },
    async deleteTemplateExact(id, name, isActive) {
      calls.push(["delete", id, name, isActive]);
      if (deleteError) throw new Error("CLEANUP_DELETE_FAILED");
    },
  };
}

function memoryPersist(events) {
  const writes = [];
  return {
    persist: async (manifest) => {
      writes.push(JSON.parse(JSON.stringify(manifest)));
      events?.push(`persist:${manifest.resources[0].state}`);
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

test("missing template confirmation performs zero execution", async () => {
  const calls = [];
  await assert.rejects(
    runSingleManagedTemplate({
      confirmation: undefined,
      discover: async () => calls.push("discover"),
      bootstrap: async () => calls.push("bootstrap"),
      createAdapter: async () => calls.push("adapter"),
      runPlaywright: async () => calls.push("playwright"),
      persist: async () => calls.push("persist"),
    }),
    errorCode("MUTATING_TEMPLATE_PRODUCTION_CONFIRMATION_REQUIRED"),
  );
  assert.deepEqual(calls, []);
});

test("residue gate blocks before bootstrap, authentication, or requests", async () => {
  const calls = [];
  await assert.rejects(
    runSingleManagedTemplate({
      confirmation: TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
      discover: async () => ({
        clean: [],
        invalid: [],
        pending: [{ file: "pending.json", manifest: plannedManifest() }],
      }),
      bootstrap: async () => calls.push("bootstrap"),
      createAdapter: async () => calls.push("adapter"),
      runPlaywright: async () => calls.push("playwright"),
      persist: async () => calls.push("persist"),
    }),
    errorCode("NEW_MUTATING_RUN_BLOCKED"),
  );
  assert.deepEqual(calls, []);
});

test("setup order persists planned before inserting an inactive template", async () => {
  const events = [];
  const adapter = fakeAdapter({ initialRows: [exactTemplate()] });
  const originalCreate = adapter.createInactiveTemplate;
  adapter.createInactiveTemplate = async (input) => {
    events.push("insert");
    assert.equal(input.isActive, false);
    return originalCreate(input);
  };
  const { persist, writes } = memoryPersist(events);
  const result = await runSingleManagedTemplate({
    confirmation: TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
    discover: async () => clearDiscovery(),
    bootstrap: async () => {
      events.push("bootstrap");
      return { ready: true };
    },
    createAdapter: async () => {
      events.push("authenticate");
      return adapter;
    },
    createRunId: () => runId,
    persist,
    runPlaywright: async () => {
      events.push("playwright");
      return 0;
    },
  });
  assert.deepEqual(events.slice(0, 6), [
    "bootstrap",
    "authenticate",
    "persist:planned",
    "insert",
    "persist:created",
    "playwright",
  ]);
  assert.equal(writes[0].resources[0].state, "planned");
  assert.equal(result.exitCode, 0);
});

test("active fixture response blocks cleanup and never deletes", async () => {
  const adapter = fakeAdapter({
    createRow: exactTemplate({ is_active: true }),
    initialRows: [exactTemplate({ is_active: true })],
  });
  const result = await runSingleManagedTemplate({
    confirmation: TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
    discover: async () => clearDiscovery(),
    bootstrap: async () => ({}),
    createAdapter: async () => adapter,
    createRunId: () => runId,
    persist: memoryPersist().persist,
    runPlaywright: async () => 0,
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.cleanupCode, "CONTRACT_MISMATCH");
  assert.equal(adapter.calls.some(([operation]) => operation === "delete"), false);
});

test("zero discovery rows clean a planned intent without delete", async () => {
  const adapter = fakeAdapter({ initialRows: [] });
  const { persist, writes } = memoryPersist();
  const result = await cleanupTemplateManifest({
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

test("one exact template is discovered, checked, deleted, and verified", async () => {
  const adapter = fakeAdapter();
  const { persist, writes } = memoryPersist();
  const result = await cleanupTemplateManifest({
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
});

test("ambiguous exact-name discovery blocks without delete", async () => {
  const adapter = fakeAdapter({
    initialRows: [exactTemplate(), exactTemplate({ id: "second-template" })],
  });
  const result = await cleanupTemplateManifest({
    manifest: plannedManifest(),
    adapter,
    persist: memoryPersist().persist,
  });
  assert.equal(result.code, "OWNERSHIP_AMBIGUOUS");
  assert.equal(result.manifest.state, "blocked");
  assert.equal(adapter.calls.some(([operation]) => operation === "delete"), false);
});

for (const [label, row, expectedCode] of [
  ["wrong ID", exactTemplate({ id: "wrong-template" }), "OWNERSHIP_MISMATCH"],
  ["wrong name", exactTemplate({ name: "not-owned" }), "OWNERSHIP_MISMATCH"],
  ["active template", exactTemplate({ is_active: true }), "CONTRACT_MISMATCH"],
]) {
  test(`${label} blocks the pre-delete gate`, async () => {
    const adapter = fakeAdapter({
      initialRows: [exactTemplate()],
      preDeleteRow: row,
    });
    const result = await cleanupTemplateManifest({
      manifest: createdManifest(),
      adapter,
      persist: memoryPersist().persist,
    });
    assert.equal(result.code, expectedCode);
    assert.equal(adapter.calls.some(([operation]) => operation === "delete"), false);
  });
}

for (const [label, tasks] of [
  ["no child tasks", []],
  ["an expected crash subset", [exactTask(`M4QA Task A ${runId}`)]],
  [
    "the final two child tasks",
    [
      exactTask(`M4QA Task A Edited ${runId}`),
      exactTask(`M4QA Task B ${runId}`),
    ],
  ],
]) {
  test(`cleanup accepts ${label}`, async () => {
    const result = await cleanupTemplateManifest({
      manifest: createdManifest(),
      adapter: fakeAdapter({ preDeleteTasks: tasks }),
      persist: memoryPersist().persist,
    });
    assert.equal(result.ok, true);
  });
}

for (const [label, task] of [
  ["unknown child title", exactTask("real production work")],
  [
    "wrong child template_id",
    exactTask(`M4QA Task B ${runId}`, { template_id: "other-template" }),
  ],
]) {
  test(`${label} blocks without parent delete`, async () => {
    const adapter = fakeAdapter({ preDeleteTasks: [task] });
    const result = await cleanupTemplateManifest({
      manifest: createdManifest(),
      adapter,
      persist: memoryPersist().persist,
    });
    assert.equal(result.code, "CHILD_OWNERSHIP_MISMATCH");
    assert.equal(adapter.calls.some(([operation]) => operation === "delete"), false);
  });
}

test("bounded delete receives exact ID, ownership name, and inactive state", async () => {
  const adapter = fakeAdapter();
  const result = await cleanupTemplateManifest({
    manifest: createdManifest(),
    adapter,
    persist: memoryPersist().persist,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    adapter.calls.find(([operation]) => operation === "delete"),
    ["delete", "template-uuid", templateName, false],
  );
});

test("delete error blocks cleanup", async () => {
  const result = await cleanupTemplateManifest({
    manifest: createdManifest(),
    adapter: fakeAdapter({ deleteError: true }),
    persist: memoryPersist().persist,
  });
  assert.equal(result.code, "CLEANUP_DELETE_FAILED");
  assert.equal(result.manifest.state, "blocked");
});

for (const [label, options] of [
  ["template ID residue", { postDeleteRow: exactTemplate() }],
  ["template name residue", { postDeleteRows: [exactTemplate()] }],
  [
    "task cascade residue",
    { postDeleteTasks: [exactTask(`M4QA Task B ${runId}`)] },
  ],
]) {
  test(`${label} fails post-delete verification`, async () => {
    const result = await cleanupTemplateManifest({
      manifest: createdManifest(),
      adapter: fakeAdapter(options),
      persist: memoryPersist().persist,
    });
    assert.equal(result.code, "CLEANUP_VERIFICATION_FAILED");
    assert.equal(result.manifest.state, "blocked");
  });
}

async function runForPrecedence({
  adapter = fakeAdapter(),
  browserExit = 0,
} = {}) {
  return runSingleManagedTemplate({
    confirmation: TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
    discover: async () => clearDiscovery(),
    bootstrap: async () => ({}),
    createAdapter: async () => adapter,
    createRunId: () => runId,
    persist: memoryPersist().persist,
    runPlaywright: async () => browserExit,
  });
}

test("fixture setup failure remains failure when absence cleanup passes", async () => {
  const result = await runForPrecedence({
    adapter: fakeAdapter({ createError: true, initialRows: [] }),
  });
  assert.equal(result.setupPassed, false);
  assert.equal(result.cleanupPassed, true);
  assert.equal(result.exitCode, 1);
});

test("browser failure remains failure when cleanup passes", async () => {
  const result = await runForPrecedence({ browserExit: 1 });
  assert.equal(result.cleanupPassed, true);
  assert.equal(result.exitCode, 1);
});

test("cleanup failure remains failure when browser passes", async () => {
  const result = await runForPrecedence({
    adapter: fakeAdapter({ deleteError: true }),
  });
  assert.equal(result.cleanupPassed, false);
  assert.equal(result.exitCode, 1);
});

test("setup, browser, and cleanup success produce overall success", async () => {
  const result = await runForPrecedence();
  assert.equal(result.setupPassed, true);
  assert.equal(result.cleanupPassed, true);
  assert.equal(result.testExitCode, 0);
  assert.equal(result.exitCode, 0);
});

for (const [label, manifest, adapter] of [
  ["planned", plannedManifest(), fakeAdapter({ initialRows: [] })],
  ["created", createdManifest(), fakeAdapter()],
  ["cleanup_required", cleanupRequiredManifest(), fakeAdapter()],
]) {
  test(`recovery cleans a ${label} template manifest`, async () => {
    const recovery = await recoverManagedTemplates({
      confirmation: TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
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

test("blocked recovery remains terminal without creating an adapter", async () => {
  const manifest = blockRun(createdManifest(), {
    resourceId: TEMPLATE_RESOURCE_ID,
  });
  let adapterCreations = 0;
  const recovery = await recoverManagedTemplates({
    confirmation: TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
    discover: async () => ({
      clean: [],
      invalid: [],
      pending: [{ file: `${runId}.json`, manifest }],
    }),
    createAdapter: async () => {
      adapterCreations += 1;
      return fakeAdapter();
    },
    persist: memoryPersist().persist,
  });
  assert.equal(recovery.exitCode, 1);
  assert.equal(recovery.results[0].code, "RUN_BLOCKED");
  assert.equal(adapterCreations, 0);
});

test("recovery rejects unsupported entities before adapter authentication", async () => {
  let adapterCreations = 0;
  await assert.rejects(
    recoverManagedTemplates({
      confirmation: TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
      discover: async () => ({
        clean: [],
        invalid: [],
        pending: [{ file: `${runId}.json`, manifest: plannedManifest("solicitud") }],
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

test("template child environment includes only admin QA credentials", () => {
  const child = buildTemplateMutatingChildEnvironment({
    parentEnvironment: {
      PATH: "synthetic-path",
      SUPABASE_SECRET_KEY: "must-not-pass",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-pass",
      VERCEL_AUTOMATION_BYPASS_SECRET: "must-not-pass",
      GODEL_TEST_SUPERVISOR_EMAIL: "must-not-pass",
      GODEL_TEST_WORKER_PASSWORD: "must-not-pass",
      GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM:
        TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE,
    },
    publicEnvironment: {
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.invalid",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test-value",
    },
    adminEnvironment: {
      GODEL_TEST_ADMIN_EMAIL: "admin@example.invalid",
      GODEL_TEST_ADMIN_PASSWORD: "synthetic-password",
    },
    productionOrigin: "https://production.example.com",
    storageStatePath: "synthetic-storage-state.json",
    runId,
    templateName,
  });
  assert.equal(child.GODEL_MANAGED_MUTATING_TEMPLATE_QA, "1");
  assert.equal(child.GODEL_MANAGED_MUTATING_TEMPLATE_NAME, templateName);
  assert.equal(child.GODEL_TEST_ADMIN_EMAIL, "admin@example.invalid");
  assert.equal(child.GODEL_TEST_ADMIN_PASSWORD, "synthetic-password");
  for (const name of [
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VERCEL_AUTOMATION_BYPASS_SECRET",
    "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM",
    "GODEL_TEST_SUPERVISOR_EMAIL",
    "GODEL_TEST_SUPERVISOR_PASSWORD",
    "GODEL_TEST_WORKER_EMAIL",
    "GODEL_TEST_WORKER_PASSWORD",
  ]) {
    assert.equal(child[name], undefined, `${name} must be scrubbed`);
  }
});

test("template Playwright arguments and command modes are hardcoded", () => {
  assert.deepEqual(buildTemplateMutatingPlaywrightArguments().slice(0, 5), [
    "test",
    "tests/e2e/managed-mutating-template.spec.ts",
    "--project=chromium",
    "--workers=1",
    "--retries=0",
  ]);
  assert.equal(validateTemplateMutatingCommandArguments([]), "run");
  assert.equal(
    validateTemplateMutatingCommandArguments(["--recover"]),
    "recover",
  );
  assert.throws(
    () => validateTemplateMutatingCommandArguments(["--grep", "anything"]),
    /UNSUPPORTED_MUTATING_TEMPLATE_ARGUMENTS/,
  );
});

test("authenticated adapter inserts inactive and bounds the parent delete", async () => {
  const records = [];
  const makeQuery = (table) => {
    const query = {
      table,
      mode: "select",
      filters: [],
      orders: [],
      payload: undefined,
      delete() {
        this.mode = "delete";
        records.push(["delete", table]);
        return this;
      },
      insert(payload) {
        this.mode = "insert";
        this.payload = payload;
        records.push(["insert", table, payload]);
        return this;
      },
      select(fields) {
        records.push(["select", table, fields]);
        return this;
      },
      eq(field, value) {
        this.filters.push([field, value]);
        records.push(["eq", table, field, value]);
        return this;
      },
      limit(value) {
        records.push(["limit", table, value]);
        return this;
      },
      order(field, options) {
        this.orders.push([field, options]);
        return this;
      },
      async single() {
        return { data: exactTemplate(), error: null };
      },
      async maybeSingle() {
        return { data: null, error: null };
      },
      then(resolve) {
        resolve({ data: [], error: null });
      },
    };
    return query;
  };
  const client = {
    auth: {
      async signInWithPassword(credentials) {
        records.push(["auth", credentials.email]);
        return { data: { user: { id: "admin-uuid" } }, error: null };
      },
    },
    from(table) {
      return makeQuery(table);
    },
  };
  const adapter = await createAuthenticatedTemplateAdapter({
    supabaseUrl: "https://synthetic.invalid",
    publishableKey: "publishable-test-value",
    email: "admin@example.invalid",
    password: "synthetic-password",
    createClientFn: () => client,
  });
  await adapter.createInactiveTemplate({
    name: templateName,
    description: templateFixtureDescription(runId),
    isActive: false,
  });
  await adapter.deleteTemplateExact("template-uuid", templateName, false);
  const insert = records.find(([operation]) => operation === "insert");
  assert.deepEqual(insert[2], {
    name: templateName,
    description: templateFixtureDescription(runId),
    is_active: false,
    created_by: "admin-uuid",
    updated_by: "admin-uuid",
  });
  assert.deepEqual(
    records.filter(([operation]) => operation === "eq").slice(-3),
    [
      ["eq", "trabajo_plantillas", "id", "template-uuid"],
      ["eq", "trabajo_plantillas", "name", templateName],
      ["eq", "trabajo_plantillas", "is_active", false],
    ],
  );
});
