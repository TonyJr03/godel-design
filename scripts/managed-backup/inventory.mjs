const SHA_PATTERN = /^[a-f0-9]{40}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ITEM_STATUSES = new Set(["committed", "reserved", "expired", "cancelled"]);
const EPHEMERAL_TREATMENTS = new Set(["excluded", "invalidate-after-restore"]);

export const STORAGE_OBJECTS_BOUNDARY = Object.freeze({
  classification: "PROVIDER_METADATA_CAPTURE_EVIDENCE",
  operationalSqlMutation: "FORBIDDEN",
  restoreMechanism: "SUPPORTED_SUPABASE_LOGICAL_METADATA_PLUS_STORAGE_API_OR_S3_BYTES",
});

export class ManagedBackupInventoryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ManagedBackupInventoryError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ManagedBackupInventoryError(code, message);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, label) {
  if (!plain(value)) fail("INVENTORY_INVALID", `${label} must be an object`);
  const actual = Object.keys(value);
  if (actual.length !== keys.length || actual.some((key) => !keys.includes(key))) {
    fail("INVENTORY_INVALID", `${label} contains unexpected fields`);
  }
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail("INVENTORY_INVALID", `${label} must be known`);
}

function safePath(value, label = "object path") {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 4096
    || value.startsWith("/")
    || value.includes("\\")
    || /[\0-\x1f]/.test(value)
    || value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) fail("INVENTORY_INVALID", `${label} is unsafe`);
  return value;
}

function validateUnique(records, identity, label) {
  const seen = new Set();
  for (const record of records) {
    const key = identity(record);
    if (seen.has(key)) fail("DUPLICATE_PATH", `${label} contains duplicate ${key}`);
    seen.add(key);
  }
  return seen;
}

export function validateAuthInventory(inventory) {
  exactKeys(inventory, ["schemaVersion", "tables", "assertions", "ephemeralState"], "Auth inventory");
  if (inventory.schemaVersion !== 1) fail("AUTH_INVENTORY_INVALID", "Auth inventory schema version is unsupported");
  exactKeys(inventory.tables, ["users", "identities"], "Auth tables");
  for (const tableName of ["users", "identities"]) {
    const table = inventory.tables[tableName];
    exactKeys(table, ["present", "count"], `auth.${tableName}`);
    if (table.present !== true) fail("AUTH_REQUIRED_TABLE_MISSING", `auth.${tableName} is required`);
    count(table.count, `auth.${tableName} count`);
  }
  exactKeys(inventory.assertions, ["uuidContinuityAvailable", "encryptedPasswordCoverageAvailable"], "Auth assertions");
  if (inventory.assertions.uuidContinuityAvailable !== true) fail("AUTH_UUID_ASSERTION_MISSING", "Auth UUID continuity assertion is required");
  if (inventory.assertions.encryptedPasswordCoverageAvailable !== true) fail("AUTH_PASSWORD_HASH_ASSERTION_MISSING", "Auth password-hash coverage assertion is required");
  exactKeys(inventory.ephemeralState, ["sessions", "refreshTokens", "otpFlowState"], "Auth ephemeral state");
  for (const [name, treatment] of Object.entries(inventory.ephemeralState)) {
    if (!EPHEMERAL_TREATMENTS.has(treatment)) fail("AUTH_EPHEMERAL_STATE_UNRESOLVED", `Auth ${name} treatment is unresolved`);
  }
  return {
    valid: true,
    userCount: inventory.tables.users.count,
    identityCount: inventory.tables.identities.count,
  };
}

function validateItem(item) {
  exactKeys(item, ["id", "status", "archivoId", "objectPath", "size"], "upload item");
  if (typeof item.id !== "string" || item.id.length === 0 || !ITEM_STATUSES.has(item.status)) fail("INVENTORY_INVALID", "Upload item identity or status is invalid");
  if (item.archivoId !== null && typeof item.archivoId !== "string") fail("INVENTORY_INVALID", "Upload item archivoId is invalid");
  safePath(item.objectPath);
  if (!Number.isSafeInteger(item.size) || item.size < 0) fail("INVENTORY_INVALID", "Upload item size is invalid");
  if (item.status === "committed" && item.archivoId === null) fail("COMMITTED_ITEM_INVALID", "Committed item requires archivoId");
  if (item.status !== "committed" && item.archivoId !== null) fail("TRANSIENT_ITEM_INVALID", "Transient item cannot reference an archivo");
}

function validateArchivo(archivo) {
  exactKeys(archivo, ["id", "bucket", "filePath", "size"], "archivo row");
  if (typeof archivo.id !== "string" || archivo.id.length === 0 || typeof archivo.bucket !== "string") fail("INVENTORY_INVALID", "Archivo identity is invalid");
  safePath(archivo.filePath);
  if (!Number.isSafeInteger(archivo.size) || archivo.size < 0) fail("INVENTORY_INVALID", "Archivo size is invalid");
}

function validateStorageObject(object) {
  exactKeys(object, ["bucket", "name", "size", "sha256"], "storage object metadata");
  if (typeof object.bucket !== "string") fail("INVENTORY_INVALID", "Storage object bucket is invalid");
  safePath(object.name);
  if (!Number.isSafeInteger(object.size) || object.size < 0) fail("INVENTORY_INVALID", "Storage object size is invalid");
  if (object.sha256 !== null && !SHA256_PATTERN.test(object.sha256)) fail("INVENTORY_INVALID", "Storage object SHA-256 is invalid");
}

function validateCapturedObject(object) {
  exactKeys(object, ["path", "size", "sha256"], "captured byte object");
  safePath(object.path);
  if (!Number.isSafeInteger(object.size) || object.size < 0 || !SHA256_PATTERN.test(object.sha256)) {
    fail("INVENTORY_INVALID", "Captured object size or SHA-256 is invalid");
  }
}

export function validateStorageDurableInventory(inventory) {
  exactKeys(inventory, ["schemaVersion", "bucket", "items", "archivos", "storageObjects", "capturedObjects"], "Storage inventory");
  if (inventory.schemaVersion !== 1 || inventory.bucket !== "godel-files") fail("WRONG_BUCKET", "Storage durable inventory requires godel-files");
  for (const name of ["items", "archivos", "storageObjects", "capturedObjects"]) {
    if (!Array.isArray(inventory[name])) fail("INVENTORY_INVALID", `${name} must be an array`);
  }
  inventory.items.forEach(validateItem);
  inventory.archivos.forEach(validateArchivo);
  inventory.storageObjects.forEach(validateStorageObject);
  inventory.capturedObjects.forEach(validateCapturedObject);
  validateUnique(inventory.items, (item) => item.id, "items");
  validateUnique(inventory.archivos, (archivo) => archivo.id, "archivos");
  validateUnique(inventory.storageObjects, (object) => `${object.bucket}/${object.name}`, "storageObjects");
  validateUnique(inventory.capturedObjects, (object) => object.path, "capturedObjects");

  const archivosById = new Map(inventory.archivos.map((archivo) => [archivo.id, archivo]));
  const metadataByPath = new Map(inventory.storageObjects.map((object) => [`${object.bucket}/${object.name}`, object]));
  const bytesByPath = new Map(inventory.capturedObjects.map((object) => [object.path, object]));
  const durable = [];
  for (const item of inventory.items) {
    if (item.status !== "committed") continue;
    const archivo = archivosById.get(item.archivoId);
    if (!archivo) fail("ARCHIVO_ROW_MISSING", "Committed item is missing its archivos row");
    if (archivo.bucket !== inventory.bucket) fail("WRONG_BUCKET", "Committed archivo uses the wrong bucket");
    if (archivo.filePath !== item.objectPath || archivo.id !== item.archivoId) fail("ARCHIVO_RELATION_MISMATCH", "Committed item and archivo relation do not match");
    const metadata = metadataByPath.get(`${inventory.bucket}/${item.objectPath}`);
    if (!metadata) fail("STORAGE_METADATA_MISSING", "Committed object is missing provider metadata");
    if (metadata.bucket !== inventory.bucket || metadata.name !== item.objectPath) fail("STORAGE_METADATA_MISMATCH", "Provider metadata does not match committed object");
    const captured = bytesByPath.get(item.objectPath);
    if (!captured) fail("CAPTURED_BYTE_MISSING", "Committed object bytes are missing");
    if (item.size !== archivo.size || item.size !== metadata.size || item.size !== captured.size) fail("STORAGE_SIZE_MISMATCH", "Committed object sizes do not match");
    if (metadata.sha256 !== null && metadata.sha256 !== captured.sha256) fail("STORAGE_HASH_MISMATCH", "Committed object SHA-256 does not match");
    durable.push({ path: item.objectPath, size: captured.size, sha256: captured.sha256 });
  }

  const durablePaths = new Set(durable.map((object) => object.path));
  const extraBytes = inventory.capturedObjects.filter((object) => !durablePaths.has(object.path));
  if (extraBytes.length > 0) fail("UNEXPECTED_CAPTURED_BYTE", "Captured bytes contain objects outside the durable set");
  if (durablePaths.size !== inventory.capturedObjects.length) fail("STORAGE_COUNT_MISMATCH", "Durable metadata and byte counts differ");

  durable.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return {
    valid: true,
    objectCount: durable.length,
    totalBytes: durable.reduce((sum, object) => sum + object.size, 0),
    objects: durable,
    excludedTransientCount: inventory.items.filter((item) => item.status !== "committed").length,
    boundary: STORAGE_OBJECTS_BOUNDARY,
  };
}

function httpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("CONFIG_SNAPSHOT_INVALID", `${label} must be a valid URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail("CONFIG_SNAPSHOT_INVALID", `${label} must be a clean HTTPS URL`);
  }
}

export function validateConfigSnapshot(snapshot) {
  exactKeys(snapshot, [
    "schemaVersion",
    "supabaseRegion",
    "authSiteUrl",
    "redirectAllowlist",
    "signupEnabled",
    "anonymousEnabled",
    "bucket",
    "requiredExtensions",
    "realtime",
    "vercelEnvironmentVariableNames",
    "productionRuntimeSha",
    "toolingGitSha",
  ], "configuration snapshot");
  if (snapshot.schemaVersion !== 1 || !/^[a-z0-9-]{2,40}$/.test(snapshot.supabaseRegion ?? "")) fail("CONFIG_SNAPSHOT_INVALID", "Supabase region is invalid");
  exactKeys(snapshot.authSiteUrl, ["classification", "value"], "Auth Site URL");
  if (snapshot.authSiteUrl.classification !== "ENCRYPTED_INTERNAL_ONLY") fail("CONFIG_SNAPSHOT_INVALID", "Auth Site URL classification is invalid");
  httpsUrl(snapshot.authSiteUrl.value, "Auth Site URL");
  if (!Array.isArray(snapshot.redirectAllowlist)) fail("CONFIG_SNAPSHOT_INVALID", "Redirect allowlist must be an array");
  snapshot.redirectAllowlist.forEach((value) => httpsUrl(value, "Auth redirect"));
  if (new Set(snapshot.redirectAllowlist).size !== snapshot.redirectAllowlist.length) fail("CONFIG_SNAPSHOT_INVALID", "Redirect allowlist contains duplicates");
  if (typeof snapshot.signupEnabled !== "boolean" || typeof snapshot.anonymousEnabled !== "boolean") fail("CONFIG_SNAPSHOT_INVALID", "Auth flags must be boolean");
  exactKeys(snapshot.bucket, ["id", "public", "fileSizeLimit", "allowedMimeTypes"], "bucket configuration");
  if (snapshot.bucket.id !== "godel-files" || snapshot.bucket.public !== false || !Number.isSafeInteger(snapshot.bucket.fileSizeLimit) || snapshot.bucket.fileSizeLimit < 1) fail("CONFIG_SNAPSHOT_INVALID", "Bucket configuration is invalid");
  for (const list of [snapshot.bucket.allowedMimeTypes, snapshot.requiredExtensions, snapshot.vercelEnvironmentVariableNames]) {
    if (!Array.isArray(list) || list.some((value) => typeof value !== "string" || value.length === 0) || new Set(list).size !== list.length) fail("CONFIG_SNAPSHOT_INVALID", "Configuration list is invalid");
    if ([...list].sort((left, right) => left.localeCompare(right, "en")).join("\0") !== list.join("\0")) fail("CONFIG_SNAPSHOT_INVALID", "Configuration lists must be sorted");
  }
  if (snapshot.bucket.allowedMimeTypes.some((value) => !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(value))) fail("CONFIG_SNAPSHOT_INVALID", "Bucket MIME allowlist is invalid");
  if (snapshot.requiredExtensions.some((value) => !/^[a-z][a-z0-9_]*$/.test(value))) fail("CONFIG_SNAPSHOT_INVALID", "Required extension name is invalid");
  if (snapshot.vercelEnvironmentVariableNames.some((value) => !/^[A-Z][A-Z0-9_]*$/.test(value))) fail("CONFIG_SNAPSHOT_INVALID", "Vercel environment variable name is invalid");
  exactKeys(snapshot.realtime, ["required", "publications"], "Realtime configuration");
  if (typeof snapshot.realtime.required !== "boolean" || !Array.isArray(snapshot.realtime.publications)) fail("CONFIG_SNAPSHOT_INVALID", "Realtime configuration is invalid");
  if (
    (!snapshot.realtime.required && snapshot.realtime.publications.length > 0)
    || new Set(snapshot.realtime.publications).size !== snapshot.realtime.publications.length
    || snapshot.realtime.publications.some((value) => typeof value !== "string" || !/^[a-z][a-z0-9_]*$/.test(value))
  ) fail("CONFIG_SNAPSHOT_INVALID", "Realtime publications are inconsistent");
  if (!SHA_PATTERN.test(snapshot.productionRuntimeSha ?? "") || !SHA_PATTERN.test(snapshot.toolingGitSha ?? "")) fail("CONFIG_SNAPSHOT_INVALID", "Configuration Git authority is invalid");
  return snapshot;
}
