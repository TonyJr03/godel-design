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

export const MUTATING_PRODUCTION_CONFIRMATION_NAME =
  "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM";
export const MUTATING_PRODUCTION_CONFIRMATION_VALUE =
  "ALLOW_SINGLE_QA_SOLICITUD_MUTATION";
export const MANAGED_MUTATING_SOLICITUD_SPEC =
  "tests/e2e/managed-mutating-solicitud.spec.ts";
export const SOLICITUD_RESOURCE_ID = "solicitud-main";

export class ManagedMutatingSolicitudError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
    this.name = "ManagedMutatingSolicitudError";
  }
}

function fail(code) {
  throw new ManagedMutatingSolicitudError(code);
}

export function assertMutatingProductionConfirmation(value) {
  if (value !== MUTATING_PRODUCTION_CONFIRMATION_VALUE) {
    fail("MUTATING_PRODUCTION_CONFIRMATION_REQUIRED");
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getSolicitudResource(manifest) {
  validateManifest(manifest);
  if (manifest.resources.length !== 1) {
    fail("UNSUPPORTED_RECOVERY_MANIFEST");
  }

  const resource = manifest.resources[0];
  if (
    resource.resourceId !== SOLICITUD_RESOURCE_ID
    || resource.entityType !== "solicitud"
  ) {
    fail("UNSUPPORTED_RECOVERY_ENTITY");
  }

  return resource;
}

function validateDiscoveredRow(resource, row) {
  const ownership = verifyResourceOwnership(resource, row);
  if (!ownership.ok) {
    return ownership.code;
  }
  if (
    typeof row.id !== "string"
    || !/^GD-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(row.public_reference ?? "")
    || row.workflow_type !== "encargo"
    || row.cliente_id !== null
    || row.converted_order_id !== null
  ) {
    return "CONTRACT_MISMATCH";
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

export async function cleanupSolicitudManifest({
  manifest,
  adapter,
  persist = writeManifestAtomic,
}) {
  let current = clone(manifest);
  const resource = getSolicitudResource(current);

  if (current.state === "blocked") {
    return { ok: false, code: "RUN_BLOCKED", manifest: current };
  }

  let rows;
  try {
    rows = await adapter.findByOwnership(resource.ownershipValue);
  } catch {
    return persistBlocked(
      current,
      persist,
      "CLEANUP_DISCOVERY_FAILED",
      resource.resourceId,
    );
  }

  if (!Array.isArray(rows)) {
    return persistBlocked(
      current,
      persist,
      "CLEANUP_DISCOVERY_FAILED",
      resource.resourceId,
    );
  }
  if (rows.length > 1) {
    return persistBlocked(
      current,
      persist,
      "OWNERSHIP_AMBIGUOUS",
      resource.resourceId,
    );
  }

  if (rows.length === 0) {
    const currentResource = getSolicitudResource(current);
    if (["planned", "created"].includes(currentResource.state)) {
      current = markResourceCleanupPending(current, currentResource.resourceId);
      await persist(current);
    }
    if (getSolicitudResource(current).state !== "cleanup_pending") {
      return persistBlocked(
        current,
        persist,
        "INVALID_CLEANUP_STATE",
        currentResource.resourceId,
      );
    }
    current = markResourceClean(current, currentResource.resourceId);
    await persist(current);
    return { ok: true, code: "CLEANUP_VERIFIED", manifest: current };
  }

  const discoveredRow = rows[0];
  const discoveryMismatch = validateDiscoveredRow(resource, discoveredRow);
  if (discoveryMismatch) {
    return persistBlocked(
      current,
      persist,
      discoveryMismatch,
      resource.resourceId,
    );
  }

  if (resource.state === "planned") {
    current = markResourceCreated(current, resource.resourceId, {
      remoteId: discoveredRow.id,
      publicReference: discoveredRow.public_reference,
    });
    await persist(current);
  } else if (
    resource.remoteId !== discoveredRow.id
    || resource.publicReference !== discoveredRow.public_reference
  ) {
    return persistBlocked(
      current,
      persist,
      "OWNERSHIP_MISMATCH",
      resource.resourceId,
    );
  }

  if (getSolicitudResource(current).state === "created") {
    current = markResourceCleanupPending(current, resource.resourceId);
    await persist(current);
  }

  const cleanupResource = getSolicitudResource(current);
  if (cleanupResource.state !== "cleanup_pending") {
    return persistBlocked(
      current,
      persist,
      "INVALID_CLEANUP_STATE",
      cleanupResource.resourceId,
    );
  }

  let exactRow;
  try {
    exactRow = await adapter.fetchById(cleanupResource.remoteId);
  } catch {
    return persistBlocked(
      current,
      persist,
      "CLEANUP_DISCOVERY_FAILED",
      cleanupResource.resourceId,
    );
  }

  const preDeleteMismatch = validateDiscoveredRow(cleanupResource, exactRow);
  if (preDeleteMismatch) {
    return persistBlocked(
      current,
      persist,
      preDeleteMismatch,
      cleanupResource.resourceId,
    );
  }

  try {
    await adapter.deleteExact(
      cleanupResource.remoteId,
      cleanupResource.ownershipValue,
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
  try {
    rowAfterDelete = await adapter.fetchById(cleanupResource.remoteId);
    markerRowsAfterDelete = await adapter.findByOwnership(
      cleanupResource.ownershipValue,
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

export async function runSingleManagedSolicitud({
  confirmation,
  discover = () => discoverManifests(),
  bootstrap,
  runPlaywright,
  createAdapter,
  persist = writeManifestAtomic,
  createRunId = createManagedMutatingRunId,
}) {
  assertMutatingProductionConfirmation(confirmation);

  const gate = evaluateResidueGate(await discover());
  if (!gate.allowed) {
    fail(gate.code);
  }

  const bootstrapContext = await bootstrap();
  const runId = createRunId();
  const ownershipValue = createOwnershipValue("solicitud", runId);
  const plannedResource = createPlannedResource({
    resourceId: SOLICITUD_RESOURCE_ID,
    entityType: "solicitud",
    runId,
    ownershipValue,
  });
  let manifest = addPlannedResource(
    createRunManifest({ runId }),
    plannedResource,
  );
  await persist(manifest);

  let testExitCode = 1;
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

  let cleanupResult;
  try {
    const adapter = await createAdapter();
    cleanupResult = await cleanupSolicitudManifest({
      adapter,
      manifest,
      persist,
    });
  } catch {
    cleanupResult = await persistBlocked(
      manifest,
      persist,
      "CLEANUP_ADAPTER_FAILED",
      SOLICITUD_RESOURCE_ID,
    );
  }

  manifest = cleanupResult.manifest;
  return {
    cleanupCode: cleanupResult.code,
    cleanupPassed: cleanupResult.ok,
    exitCode: testExitCode === 0 && cleanupResult.ok ? 0 : 1,
    manifest,
    testExitCode,
  };
}

export async function recoverManagedSolicitudes({
  confirmation,
  discover = () => discoverManifests(),
  createAdapter,
  persist = writeManifestAtomic,
}) {
  assertMutatingProductionConfirmation(confirmation);
  const discovery = await discover();

  if (discovery.invalid.length > 0) {
    fail("RECOVERY_MANIFEST_INVALID");
  }

  for (const entry of discovery.pending) {
    getSolicitudResource(entry.manifest);
  }

  if (discovery.pending.length === 0) {
    return { exitCode: 0, recovered: 0, results: [] };
  }

  const adapter = await createAdapter();
  const results = [];
  for (const entry of discovery.pending) {
    results.push(await cleanupSolicitudManifest({
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
