import {
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
  validateManifest,
  verifyResourceOwnership,
  writeManifestAtomic,
} from "./manifest.mjs";

export const TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_NAME =
  "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM";
export const TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE =
  "ALLOW_SINGLE_QA_TEMPLATE_MUTATION";
export const MANAGED_MUTATING_TEMPLATE_SPEC =
  "tests/e2e/managed-mutating-template.spec.ts";
export const TEMPLATE_RESOURCE_ID = "template-main";

export class ManagedMutatingTemplateError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
    this.name = "ManagedMutatingTemplateError";
  }
}

function fail(code) {
  throw new ManagedMutatingTemplateError(code);
}

export function assertTemplateMutatingProductionConfirmation(value) {
  if (value !== TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_VALUE) {
    fail("MUTATING_TEMPLATE_PRODUCTION_CONFIRMATION_REQUIRED");
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function templateFixtureDescription(runId) {
  return `M4QA managed template fixture ${runId}`;
}

export function templateEditedDescription(runId) {
  return `M4QA managed template edited ${runId}`;
}

export function expectedTemplateTaskTitles(runId) {
  return new Set([
    `M4QA Task A ${runId}`,
    `M4QA Task A Edited ${runId}`,
    `M4QA Task B ${runId}`,
  ]);
}

function getTemplateResource(manifest) {
  validateManifest(manifest);
  if (manifest.resources.length !== 1) {
    fail("UNSUPPORTED_RECOVERY_MANIFEST");
  }

  const resource = manifest.resources[0];
  if (
    resource.resourceId !== TEMPLATE_RESOURCE_ID
    || resource.entityType !== "trabajo_plantilla"
  ) {
    fail("UNSUPPORTED_RECOVERY_ENTITY");
  }
  return resource;
}

function validateTemplateRow(resource, row) {
  const ownership = verifyResourceOwnership(resource, row);
  if (!ownership.ok) return ownership.code;
  if (typeof row.id !== "string" || row.is_active !== false) {
    return "CONTRACT_MISMATCH";
  }
  return null;
}

function validateChildTasks(tasks, remoteId, runId) {
  if (!Array.isArray(tasks)) return "CLEANUP_DISCOVERY_FAILED";
  const allowedTitles = expectedTemplateTaskTitles(runId);
  for (const task of tasks) {
    if (
      !task
      || typeof task !== "object"
      || task.template_id !== remoteId
      || typeof task.title !== "string"
      || !allowedTitles.has(task.title)
    ) {
      return "CHILD_OWNERSHIP_MISMATCH";
    }
  }
  return null;
}

async function persistBlocked(manifest, persist, code, resourceId) {
  if (manifest.state === "blocked") {
    return { ok: false, code, manifest };
  }
  const resource = manifest.resources.find(
    (entry) => entry.resourceId === resourceId,
  );
  const canBlockResource = resource
    && ["created", "cleanup_pending"].includes(resource.state);
  const blocked = blockRun(manifest, {
    ...(canBlockResource ? { resourceId } : {}),
  });
  await persist(blocked);
  return { ok: false, code, manifest: blocked };
}

async function discoverExactTemplate(adapter, ownershipValue) {
  try {
    const rows = await adapter.findTemplateByOwnership(ownershipValue);
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

export async function cleanupTemplateManifest({
  manifest,
  adapter,
  persist = writeManifestAtomic,
}) {
  let current = clone(manifest);
  const initialResource = getTemplateResource(current);

  if (current.state === "blocked") {
    return { ok: false, code: "RUN_BLOCKED", manifest: current };
  }

  const rows = await discoverExactTemplate(
    adapter,
    initialResource.ownershipValue,
  );
  if (!rows) {
    return persistBlocked(
      current,
      persist,
      "CLEANUP_DISCOVERY_FAILED",
      initialResource.resourceId,
    );
  }
  if (rows.length > 1) {
    return persistBlocked(
      current,
      persist,
      "OWNERSHIP_AMBIGUOUS",
      initialResource.resourceId,
    );
  }

  if (rows.length === 0) {
    const resource = getTemplateResource(current);
    if (resource.remoteId) {
      let rowById;
      let tasks;
      try {
        rowById = await adapter.fetchTemplateById(resource.remoteId);
        tasks = await adapter.listTasksByTemplateId(resource.remoteId);
      } catch {
        return persistBlocked(
          current,
          persist,
          "CLEANUP_VERIFICATION_FAILED",
          resource.resourceId,
        );
      }
      if (rowById !== null || !Array.isArray(tasks) || tasks.length !== 0) {
        return persistBlocked(
          current,
          persist,
          "CLEANUP_VERIFICATION_FAILED",
          resource.resourceId,
        );
      }
    }
    if (["planned", "created"].includes(resource.state)) {
      current = markResourceCleanupPending(current, resource.resourceId);
      await persist(current);
    }
    if (getTemplateResource(current).state !== "cleanup_pending") {
      return persistBlocked(
        current,
        persist,
        "INVALID_CLEANUP_STATE",
        resource.resourceId,
      );
    }
    current = markResourceClean(current, resource.resourceId);
    await persist(current);
    return { ok: true, code: "CLEANUP_VERIFIED", manifest: current };
  }

  const discoveredRow = rows[0];
  const discoveryMismatch = validateTemplateRow(
    initialResource,
    discoveredRow,
  );
  if (discoveryMismatch) {
    return persistBlocked(
      current,
      persist,
      discoveryMismatch,
      initialResource.resourceId,
    );
  }

  if (initialResource.state === "planned") {
    current = markResourceCreated(current, initialResource.resourceId, {
      remoteId: discoveredRow.id,
    });
    await persist(current);
  }

  const createdResource = getTemplateResource(current);
  if (
    createdResource.remoteId !== discoveredRow.id
    || createdResource.ownershipValue !== discoveredRow.name
  ) {
    return persistBlocked(
      current,
      persist,
      "OWNERSHIP_MISMATCH",
      createdResource.resourceId,
    );
  }

  let exactRow;
  let childTasks;
  try {
    exactRow = await adapter.fetchTemplateById(createdResource.remoteId);
    childTasks = await adapter.listTasksByTemplateId(createdResource.remoteId);
  } catch {
    return persistBlocked(
      current,
      persist,
      "CLEANUP_DISCOVERY_FAILED",
      createdResource.resourceId,
    );
  }

  const preDeleteMismatch = validateTemplateRow(createdResource, exactRow);
  if (preDeleteMismatch) {
    return persistBlocked(
      current,
      persist,
      preDeleteMismatch,
      createdResource.resourceId,
    );
  }
  const childMismatch = validateChildTasks(
    childTasks,
    createdResource.remoteId,
    current.runId,
  );
  if (childMismatch) {
    return persistBlocked(
      current,
      persist,
      childMismatch,
      createdResource.resourceId,
    );
  }

  if (createdResource.state === "created") {
    current = markResourceCleanupPending(current, createdResource.resourceId);
    await persist(current);
  }
  const cleanupResource = getTemplateResource(current);
  if (cleanupResource.state !== "cleanup_pending") {
    return persistBlocked(
      current,
      persist,
      "INVALID_CLEANUP_STATE",
      cleanupResource.resourceId,
    );
  }

  try {
    await adapter.deleteTemplateExact(
      cleanupResource.remoteId,
      cleanupResource.ownershipValue,
      false,
    );
  } catch {
    return persistBlocked(
      current,
      persist,
      "CLEANUP_DELETE_FAILED",
      cleanupResource.resourceId,
    );
  }

  let rowAfterDelete;
  let markerRowsAfterDelete;
  let tasksAfterDelete;
  try {
    rowAfterDelete = await adapter.fetchTemplateById(cleanupResource.remoteId);
    markerRowsAfterDelete = await adapter.findTemplateByOwnership(
      cleanupResource.ownershipValue,
    );
    tasksAfterDelete = await adapter.listTasksByTemplateId(
      cleanupResource.remoteId,
    );
  } catch {
    return persistBlocked(
      current,
      persist,
      "CLEANUP_VERIFICATION_FAILED",
      cleanupResource.resourceId,
    );
  }
  if (
    rowAfterDelete !== null
    || !Array.isArray(markerRowsAfterDelete)
    || markerRowsAfterDelete.length !== 0
    || !Array.isArray(tasksAfterDelete)
    || tasksAfterDelete.length !== 0
  ) {
    return persistBlocked(
      current,
      persist,
      "CLEANUP_VERIFICATION_FAILED",
      cleanupResource.resourceId,
    );
  }

  current = markResourceClean(current, cleanupResource.resourceId);
  await persist(current);
  return { ok: true, code: "CLEANUP_VERIFIED", manifest: current };
}

export async function runSingleManagedTemplate({
  confirmation,
  discover = () => discoverManifests(),
  bootstrap,
  runPlaywright,
  createAdapter,
  persist = writeManifestAtomic,
  createRunId = createManagedMutatingRunId,
}) {
  assertTemplateMutatingProductionConfirmation(confirmation);
  const gate = evaluateResidueGate(await discover());
  if (!gate.allowed) fail(gate.code);

  const bootstrapContext = await bootstrap();
  const adapter = await createAdapter();
  const runId = createRunId();
  const ownershipValue = createOwnershipValue("trabajo_plantilla", runId);
  let manifest = addPlannedResource(
    createRunManifest({ runId }),
    createPlannedResource({
      resourceId: TEMPLATE_RESOURCE_ID,
      entityType: "trabajo_plantilla",
      runId,
      ownershipValue,
    }),
  );
  await persist(manifest);

  let setupPassed = false;
  let setupCode = "FIXTURE_SETUP_FAILED";
  let testExitCode = 1;
  try {
    const row = await adapter.createInactiveTemplate({
      name: ownershipValue,
      description: templateFixtureDescription(runId),
      isActive: false,
    });
    const mismatch = validateTemplateRow(getTemplateResource(manifest), row);
    if (mismatch) fail(mismatch);
    manifest = markResourceCreated(manifest, TEMPLATE_RESOURCE_ID, {
      remoteId: row.id,
    });
    await persist(manifest);
    setupPassed = true;
    setupCode = "FIXTURE_CREATED";
    try {
      const result = await runPlaywright({
        bootstrapContext,
        ownershipValue,
        runId,
      });
      testExitCode = Number.isInteger(result) && result >= 0 ? result : 1;
    } catch {
      testExitCode = 1;
    }
  } catch (error) {
    setupCode = error?.code ?? error?.message ?? "FIXTURE_SETUP_FAILED";
  }

  let cleanupResult;
  try {
    cleanupResult = await cleanupTemplateManifest({
      adapter,
      manifest,
      persist,
    });
  } catch {
    cleanupResult = await persistBlocked(
      manifest,
      persist,
      "CLEANUP_ADAPTER_FAILED",
      TEMPLATE_RESOURCE_ID,
    );
  }

  return {
    cleanupCode: cleanupResult.code,
    cleanupPassed: cleanupResult.ok,
    exitCode:
      setupPassed && testExitCode === 0 && cleanupResult.ok ? 0 : 1,
    manifest: cleanupResult.manifest,
    setupCode,
    setupPassed,
    testExitCode,
  };
}

export async function recoverManagedTemplates({
  confirmation,
  discover = () => discoverManifests(),
  createAdapter,
  persist = writeManifestAtomic,
}) {
  assertTemplateMutatingProductionConfirmation(confirmation);
  const discovery = await discover();
  if (discovery.invalid.length > 0) fail("RECOVERY_MANIFEST_INVALID");

  for (const entry of discovery.pending) getTemplateResource(entry.manifest);
  if (discovery.pending.length === 0) {
    return { exitCode: 0, recovered: 0, results: [] };
  }

  let adapter;
  const results = [];
  for (const entry of discovery.pending) {
    if (entry.manifest.state === "blocked") {
      results.push({
        ok: false,
        code: "RUN_BLOCKED",
        manifest: entry.manifest,
      });
      continue;
    }
    adapter ??= await createAdapter();
    results.push(await cleanupTemplateManifest({
      adapter,
      manifest: entry.manifest,
      persist,
    }));
  }
  return {
    exitCode: results.every((result) => result.ok) ? 0 : 1,
    recovered: results.filter((result) => result.ok).length,
    results,
  };
}
