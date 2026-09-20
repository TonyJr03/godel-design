import { randomBytes, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";

export const MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_ROOT = join(
  "test-results",
  "managed-mutating-qa",
  "manifests",
);

export const RUN_STATES = Object.freeze([
  "active",
  "cleanup_required",
  "clean",
  "blocked",
]);
export const RESOURCE_STATES = Object.freeze([
  "planned",
  "created",
  "cleanup_pending",
  "clean",
  "blocked",
]);

const ENTITY_DESCRIPTORS = Object.freeze({
  solicitud: Object.freeze({
    ownershipField: "description",
    ownershipPrefix: "M4QA solicitud ",
  }),
  trabajo_plantilla: Object.freeze({
    ownershipField: "name",
    ownershipPrefix: "M4QA Template ",
  }),
});

const RUN_ID_PATTERN = /^M4QA-\d{8}T\d{6}Z-[A-Z2-7]{8}$/;
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9_-]{1,96}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SECRET_LIKE_FIELD_PATTERN = /(?:password|token|cookie|secret|signed.?url|api.?key|access.?key|refresh.?key)/i;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const RUN_TRANSITIONS = Object.freeze({
  active: new Set(["cleanup_required", "clean", "blocked"]),
  cleanup_required: new Set(["clean", "blocked"]),
  clean: new Set(),
  blocked: new Set(),
});
const RESOURCE_TRANSITIONS = Object.freeze({
  planned: new Set(["created", "cleanup_pending"]),
  created: new Set(["cleanup_pending", "blocked"]),
  cleanup_pending: new Set(["clean", "blocked"]),
  clean: new Set(),
  blocked: new Set(),
});

export class ManagedMutatingQaManifestError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
    this.name = "ManagedMutatingQaManifestError";
  }
}

function fail(code, message) {
  throw new ManagedMutatingQaManifestError(code, message);
}

function assertObject(value, code = "MANIFEST_INVALID") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(code, "Expected an object");
  }
}

function assertExactKeys(value, allowedKeys, code = "MANIFEST_INVALID") {
  assertObject(value, code);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key) || SECRET_LIKE_FIELD_PATTERN.test(key)) {
      fail(code, `Unexpected manifest field: ${key}`);
    }
  }
}

function assertString(value, label, code = "MANIFEST_INVALID") {
  if (typeof value !== "string" || value.length === 0) {
    fail(code, `${label} must be a non-empty string`);
  }
}

function assertIsoTimestamp(value, label) {
  assertString(value, label);
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    fail("MANIFEST_INVALID", `${label} must be an ISO UTC timestamp`);
  }
}

function cloneManifest(manifest) {
  return JSON.parse(JSON.stringify(manifest));
}

function nowIso(now) {
  const value = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(value.valueOf())) fail("MANIFEST_INVALID", "Invalid clock value");
  return value.toISOString();
}

export function isManagedMutatingRunId(value) {
  return typeof value === "string" && RUN_ID_PATTERN.test(value);
}

export function createManagedMutatingRunId({
  now = new Date(),
  random = randomBytes,
} = {}) {
  const timestamp = nowIso(now)
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const bytes = random(5);
  let suffix = "";
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      suffix += BASE32_ALPHABET[(accumulator >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (suffix.length !== 8) {
    fail("RUN_ID_GENERATION_FAILED", "Could not generate a safe run suffix");
  }

  const runId = `M4QA-${timestamp}-${suffix}`;
  if (!isManagedMutatingRunId(runId)) {
    fail("RUN_ID_GENERATION_FAILED", "Generated run ID did not match its contract");
  }
  return runId;
}

export function getOwnershipDescriptor(entityType) {
  const descriptor = ENTITY_DESCRIPTORS[entityType];
  if (!descriptor) fail("UNSUPPORTED_MUTATING_ENTITY", `Unsupported entity: ${entityType}`);
  return descriptor;
}

export function createOwnershipValue(entityType, runId) {
  if (!isManagedMutatingRunId(runId)) {
    fail("MANIFEST_INVALID", "Ownership value requires a valid managed run ID");
  }
  return `${getOwnershipDescriptor(entityType).ownershipPrefix}${runId}`;
}

export function createRunManifest({ runId, now = new Date() }) {
  if (!isManagedMutatingRunId(runId)) fail("MANIFEST_INVALID", "Invalid run ID");
  const timestamp = nowIso(now);
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    runId,
    createdAt: timestamp,
    updatedAt: timestamp,
    state: "active",
    resources: [],
  };
}

export function createPlannedResource({
  resourceId,
  entityType,
  runId,
  ownershipValue = createOwnershipValue(entityType, runId),
  now = new Date(),
}) {
  if (!RESOURCE_ID_PATTERN.test(resourceId ?? "")) {
    fail("MANIFEST_INVALID", "Invalid resource ID");
  }
  const descriptor = getOwnershipDescriptor(entityType);
  const resource = {
    resourceId,
    entityType,
    runId,
    ownershipField: descriptor.ownershipField,
    ownershipValue,
    state: "planned",
    createdAt: nowIso(now),
  };
  validateResource(resource, runId);
  return resource;
}

export function validateResource(resource, runId) {
  assertExactKeys(
    resource,
    new Set([
      "resourceId",
      "entityType",
      "runId",
      "ownershipField",
      "ownershipValue",
      "remoteId",
      "publicReference",
      "state",
      "createdAt",
      "cleanedAt",
    ]),
  );
  if (!RESOURCE_ID_PATTERN.test(resource.resourceId ?? "")) {
    fail("MANIFEST_INVALID", "Invalid resource ID");
  }
  if (resource.runId !== runId || !isManagedMutatingRunId(resource.runId)) {
    fail("MANIFEST_INVALID", "Resource run ID does not match its manifest");
  }
  const descriptor = getOwnershipDescriptor(resource.entityType);
  if (resource.ownershipField !== descriptor.ownershipField) {
    fail("MANIFEST_INVALID", "Ownership field is not allowed for entity");
  }
  assertString(resource.ownershipValue, "ownershipValue");
  if (!resource.ownershipValue.includes(runId)) {
    fail("MANIFEST_INVALID", "Ownership value must contain the exact run ID");
  }
  if (!RESOURCE_STATES.includes(resource.state)) {
    fail("MANIFEST_INVALID", "Unknown resource state");
  }
  assertIsoTimestamp(resource.createdAt, "resource.createdAt");
  for (const optionalField of ["remoteId", "publicReference", "cleanedAt"]) {
    if (optionalField in resource) {
      assertString(resource[optionalField], `resource.${optionalField}`);
    }
  }
  if ("cleanedAt" in resource && resource.state !== "clean") {
    fail("MANIFEST_INVALID", "cleanedAt requires a clean resource");
  }
  if (resource.state === "clean" && !("cleanedAt" in resource)) {
    fail("MANIFEST_INVALID", "Clean resource requires cleanedAt");
  }
  return resource;
}

export function validateManifest(manifest) {
  assertExactKeys(
    manifest,
    new Set(["schemaVersion", "runId", "createdAt", "updatedAt", "state", "resources"]),
  );
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    fail("MANIFEST_INVALID", "Unsupported manifest schema version");
  }
  if (!isManagedMutatingRunId(manifest.runId)) fail("MANIFEST_INVALID", "Invalid run ID");
  assertIsoTimestamp(manifest.createdAt, "createdAt");
  assertIsoTimestamp(manifest.updatedAt, "updatedAt");
  if (!RUN_STATES.includes(manifest.state)) fail("MANIFEST_INVALID", "Unknown run state");
  if (!Array.isArray(manifest.resources)) fail("MANIFEST_INVALID", "resources must be an array");

  const resourceIds = new Set();
  for (const resource of manifest.resources) {
    validateResource(resource, manifest.runId);
    if (resourceIds.has(resource.resourceId)) {
      fail("MANIFEST_INVALID", "Duplicate resource ID");
    }
    resourceIds.add(resource.resourceId);
  }

  if (manifest.state !== "blocked" && manifest.resources.some((resource) => resource.state === "blocked")) {
    fail("MANIFEST_INVALID", "Blocked resource requires a blocked manifest");
  }
  if (manifest.state === "active" && manifest.resources.some((resource) => !["planned", "created"].includes(resource.state))) {
    fail("MANIFEST_INVALID", "Active manifest has invalid resource progress");
  }
  if (
    manifest.state === "cleanup_required"
    && manifest.resources.some((resource) => !["planned", "created", "cleanup_pending", "clean"].includes(resource.state))
  ) {
    fail("MANIFEST_INVALID", "Cleanup-required manifest has invalid resource progress");
  }
  if (manifest.state === "clean" && manifest.resources.some((resource) => resource.state !== "clean")) {
    fail("MANIFEST_INVALID", "Clean manifest contains non-clean resources");
  }
  return manifest;
}

function assertRunTransition(current, next) {
  if (!RUN_TRANSITIONS[current]?.has(next)) {
    fail("INVALID_STATE_TRANSITION", `Run cannot transition ${current} to ${next}`);
  }
}

function assertResourceTransition(current, next) {
  if (!RESOURCE_TRANSITIONS[current]?.has(next)) {
    fail("INVALID_STATE_TRANSITION", `Resource cannot transition ${current} to ${next}`);
  }
}

function updated(manifest, now) {
  const next = cloneManifest(manifest);
  validateManifest(next);
  next.updatedAt = nowIso(now);
  return next;
}

export function addPlannedResource(manifest, resource, { now = new Date() } = {}) {
  const next = updated(manifest, now);
  if (next.state !== "active") fail("INVALID_STATE_TRANSITION", "Only active runs can add resources");
  validateResource(resource, next.runId);
  if (next.resources.some((entry) => entry.resourceId === resource.resourceId)) {
    fail("MANIFEST_INVALID", "Duplicate resource ID");
  }
  next.resources.push(cloneManifest(resource));
  return next;
}

function findResource(manifest, resourceId) {
  const resource = manifest.resources.find((entry) => entry.resourceId === resourceId);
  if (!resource) fail("MANIFEST_INVALID", "Manifest resource was not found");
  return resource;
}

export function markResourceCreated(manifest, resourceId, { remoteId, publicReference, now = new Date() }) {
  const next = updated(manifest, now);
  const resource = findResource(next, resourceId);
  assertResourceTransition(resource.state, "created");
  assertString(remoteId, "remoteId");
  resource.remoteId = remoteId;
  if (publicReference !== undefined) {
    assertString(publicReference, "publicReference");
    resource.publicReference = publicReference;
  }
  resource.state = "created";
  return next;
}

export function markResourceCleanupPending(manifest, resourceId, { now = new Date() } = {}) {
  const next = updated(manifest, now);
  const resource = findResource(next, resourceId);
  assertResourceTransition(resource.state, "cleanup_pending");
  resource.state = "cleanup_pending";
  if (next.state === "active") {
    assertRunTransition(next.state, "cleanup_required");
    next.state = "cleanup_required";
  }
  return next;
}

export function markResourceClean(manifest, resourceId, { now = new Date() } = {}) {
  const next = updated(manifest, now);
  const resource = findResource(next, resourceId);
  assertResourceTransition(resource.state, "clean");
  resource.state = "clean";
  resource.cleanedAt = nowIso(now);
  if (next.resources.every((entry) => entry.state === "clean")) {
    assertRunTransition(next.state, "clean");
    next.state = "clean";
  }
  return next;
}

export function blockRun(manifest, { resourceId, now = new Date() } = {}) {
  const next = updated(manifest, now);
  if (resourceId) {
    const resource = findResource(next, resourceId);
    assertResourceTransition(resource.state, "blocked");
    resource.state = "blocked";
  }
  assertRunTransition(next.state, "blocked");
  next.state = "blocked";
  return next;
}

export function verifyResourceOwnership(resource, remoteRow) {
  try {
    validateResource(resource, resource?.runId ?? "");
  } catch {
    return { ok: false, code: "OWNERSHIP_MISMATCH", reason: "invalid_manifest_resource" };
  }
  if (!remoteRow || typeof remoteRow !== "object" || Array.isArray(remoteRow)) {
    return { ok: false, code: "OWNERSHIP_MISMATCH", reason: "remote_row_missing" };
  }
  if (resource.remoteId !== undefined && remoteRow.id !== resource.remoteId) {
    return { ok: false, code: "OWNERSHIP_MISMATCH", reason: "remote_id_mismatch" };
  }
  if (remoteRow[resource.ownershipField] !== resource.ownershipValue) {
    return { ok: false, code: "OWNERSHIP_MISMATCH", reason: "ownership_value_mismatch" };
  }
  return { ok: true, code: "OWNERSHIP_VERIFIED" };
}

async function applyPortableMode(pathname, mode) {
  try {
    await chmod(pathname, mode);
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EPERM"].includes(error?.code)) throw error;
  }
}

function manifestPath(root, runId) {
  if (!isManagedMutatingRunId(runId)) fail("MANIFEST_INVALID", "Invalid run ID");
  return join(resolve(root), `${runId}.json`);
}

export async function writeManifestAtomic(manifest, { root = MANIFEST_ROOT } = {}) {
  validateManifest(manifest);
  const resolvedRoot = resolve(root);
  await mkdir(resolvedRoot, { recursive: true, mode: 0o700 });
  await applyPortableMode(resolvedRoot, 0o700);
  const finalPath = manifestPath(resolvedRoot, manifest.runId);
  const temporaryPath = join(resolvedRoot, `.${manifest.runId}.${randomUUID()}.tmp`);
  const file = await open(temporaryPath, "w", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  await applyPortableMode(temporaryPath, 0o600);
  await rename(temporaryPath, finalPath);
  await applyPortableMode(finalPath, 0o600);
  return finalPath;
}

export async function readManifest(manifestFile) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(manifestFile, "utf8"));
  } catch {
    fail("MANIFEST_INVALID", "Manifest JSON could not be read");
  }
  return validateManifest(parsed);
}

export async function discoverManifests({ root = MANIFEST_ROOT } = {}) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { clean: [], pending: [], invalid: [] };
    throw error;
  }

  const result = { clean: [], pending: [], invalid: [] };
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile()) continue;
    const file = join(root, entry.name);
    if (!entry.name.endsWith(".json")) {
      result.invalid.push({ file: basename(file), code: "MANIFEST_INVALID" });
      continue;
    }
    try {
      const manifest = await readManifest(file);
      const target = manifest.state === "clean" ? result.clean : result.pending;
      target.push({ file: basename(file), manifest });
    } catch (error) {
      result.invalid.push({ file: basename(file), code: error.code ?? "MANIFEST_INVALID" });
    }
  }
  return result;
}

export function evaluateResidueGate(discovery) {
  const invalid = discovery.invalid.length;
  const pending = discovery.pending.length;
  return {
    allowed: invalid === 0 && pending === 0,
    code: invalid === 0 && pending === 0 ? "RESIDUE_GATE_CLEAR" : "NEW_MUTATING_RUN_BLOCKED",
    invalid,
    pending,
    clean: discovery.clean.length,
  };
}
