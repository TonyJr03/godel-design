import { resolveContainedPath } from "../managed-backup/safety.mjs";
import { admitManagedDataSql, withAdmittedManagedDataSql } from "./sql-admission.mjs";

const SAFE_SCHEMAS = new Set(["auth", "private", "public", "storage"]);
const EPHEMERAL_AUTH_TABLES = new Set([
  "auth.sessions", "auth.refresh_tokens", "auth.flow_state", "auth.one_time_tokens", "auth.mfa_challenges",
  "auth.mfa_amr_claims", "auth.saml_relay_states", "auth.sso_sessions", "auth.audit_log_entries",
]);
const FORBIDDEN_TABLES = new Set([
  "supabase_migrations.schema_migrations", "supabase_migrations.seed_files", "storage.migrations", "auth.schema_migrations",
]);
const STORAGE_METADATA_TABLES = new Set(["storage.buckets", "storage.objects"]);
const mutablePlanHandles = new WeakSet();
const mutablePlanDetails = new WeakMap();
const sanitizedSqlHandles = new WeakMap();
const storagePlanHandles = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryRestorePlanningError";
  error.code = code;
  throw error;
}

export function validateTargetCatalogIdentity(value) {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(value)) fail("RECOVERY_TARGET_CATALOG_IDENTITY_INVALID", "Target catalog identity is invalid");
  const [schema] = value.split(".");
  if (!SAFE_SCHEMAS.has(schema)) fail("RECOVERY_TARGET_CATALOG_IDENTITY_INVALID", "Target catalog identity is outside the governed schemas");
  return value;
}

export function validateAdmittedMutableIdentity(value) {
  validateTargetCatalogIdentity(value);
  if (FORBIDDEN_TABLES.has(value)) fail("RECOVERY_MUTABLE_TABLE_FORBIDDEN", "Mutable table is outside the admitted restore contract");
  return value;
}

export function buildMutableTablePlan({ admission, targetTables } = {}) {
  if (!admission || admission.status !== "ADMITTED" || !Array.isArray(targetTables)) fail("RECOVERY_MUTABLE_PLAN_INVALID", "Managed SQL admission and target catalog are required");
  const catalogIdentities = targetTables.map(validateTargetCatalogIdentity);
  const catalog = new Set(catalogIdentities);
  if (catalog.size !== catalogIdentities.length) fail("RECOVERY_TARGET_CATALOG_DUPLICATE", "Target catalog contains a duplicate table identity");
  const admitted = admission.mutableTables.map(validateAdmittedMutableIdentity);
  if (admitted.some((identity) => !catalog.has(identity))) fail("RECOVERY_MUTABLE_TABLE_UNKNOWN", "Managed data references a table absent from the target");
  const excludedEphemeralTables = admitted.filter((identity) => EPHEMERAL_AUTH_TABLES.has(identity));
  const mutableTables = admitted.filter((identity) => !EPHEMERAL_AUTH_TABLES.has(identity));
  if (mutableTables.length === 0) fail("RECOVERY_MUTABLE_PLAN_EMPTY", "No persistent mutable table remains after admission");
  const plan = Object.freeze({
    status: "ADMITTED",
    mutableTables: Object.freeze(mutableTables),
    truncateTables: Object.freeze([...mutableTables]),
    excludedEphemeralTables: Object.freeze(excludedEphemeralTables),
    storageMetadataTables: Object.freeze(mutableTables.filter((identity) => STORAGE_METADATA_TABLES.has(identity))),
  });
  mutablePlanHandles.add(plan);
  mutablePlanDetails.set(plan, Object.freeze({ catalog: Object.freeze(catalogIdentities), admitted: Object.freeze(admitted) }));
  return plan;
}

export function accessMutableTablePlan(handle, callback) {
  const details = mutablePlanDetails.get(handle);
  if (!details || typeof callback !== "function") fail("RECOVERY_MUTABLE_PLAN_REQUIRED", "Admitted mutable plan is required");
  return callback(details);
}

export function verifyManagedDataCounts({ admission, manifestTableCounts } = {}) {
  if (!Array.isArray(manifestTableCounts)) fail("RECOVERY_MANAGED_DATA_COUNTS_INVALID", "Manifest table counts are required");
  return withAdmittedManagedDataSql(admission, (model) => {
    const actual = model.copyBlocks.map((block) => Object.freeze({ identity: block.identity, rowCount: block.end - block.start - 1 })).sort((left, right) => left.identity.localeCompare(right.identity, "en"));
    const expected = manifestTableCounts.map((table) => {
      if (!table || typeof table.schema !== "string" || typeof table.name !== "string" || !Number.isSafeInteger(table.rowCount) || table.rowCount < 0) fail("RECOVERY_MANAGED_DATA_COUNTS_INVALID", "Manifest table count is invalid");
      return Object.freeze({ identity: `${table.schema}.${table.name}`, rowCount: table.rowCount });
    }).sort((left, right) => left.identity.localeCompare(right.identity, "en"));
    if (actual.length !== expected.length || actual.some((item, index) => item.identity !== expected[index].identity || item.rowCount !== expected[index].rowCount)) {
      fail("RECOVERY_MANAGED_DATA_COUNTS_MISMATCH", "Managed data COPY counts do not match the manifest");
    }
    return Object.freeze({ status: "PASS", tableCounts: Object.freeze(actual) });
  });
}

export function sanitizeEphemeralAuthState({ admission, mutablePlan } = {}) {
  if (!mutablePlanHandles.has(mutablePlan)) fail("RECOVERY_MUTABLE_PLAN_REQUIRED", "Admitted mutable plan is required");
  return withAdmittedManagedDataSql(admission, (model) => {
    const excluded = new Set(mutablePlan.excludedEphemeralTables);
    const omittedLines = new Set();
    for (const block of model.copyBlocks) {
      if (excluded.has(block.identity)) for (let index = block.start; index <= block.end; index += 1) omittedLines.add(index);
    }
    const sql = model.lines.filter((_, index) => !omittedLines.has(index)).join("\n");
    const readmission = admitManagedDataSql(sql);
    if (readmission.mutableTables.some((identity) => excluded.has(identity))) fail("RECOVERY_AUTH_SANITIZATION_FAILED", "Ephemeral Auth COPY block remained after sanitization");
    const result = Object.freeze({
      status: "PASS",
      ephemeralAuthState: excluded.size === 0 ? "EXCLUDED" : "SANITIZED",
      excludedTableCount: excluded.size,
      persistentCopyCount: readmission.mutableTableCount,
    });
    sanitizedSqlHandles.set(result, sql);
    return result;
  });
}

function quoteTable(identity) {
  return identity.split(".").map((part) => `"${part}"`).join(".");
}

export function buildManagedRestoreSql({ mutablePlan, sanitized } = {}) {
  if (!mutablePlanHandles.has(mutablePlan) || !sanitizedSqlHandles.has(sanitized)) fail("RECOVERY_RESTORE_PLAN_INVALID", "Admitted mutable plan and sanitized SQL are required");
  const data = sanitizedSqlHandles.get(sanitized);
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(data)) fail("RECOVERY_RESTORE_TRANSACTION_FORBIDDEN", "Managed data must not govern its own transaction");
  const sql = [
    "SET LOCAL session_replication_role = replica;",
    `TRUNCATE TABLE ${mutablePlan.truncateTables.map(quoteTable).join(", ")} CASCADE;`,
    data,
  ].join("\n");
  const result = Object.freeze({
    status: "READY",
    transactionAuthority: "PSQL_SINGLE_TRANSACTION",
    sessionReplicationRole: "REPLICA_LOCAL_ONLY",
    truncateTableCount: mutablePlan.truncateTables.length,
  });
  sanitizedSqlHandles.set(result, sql);
  return result;
}

export function accessManagedRestoreSql(handle, callback) {
  const sql = sanitizedSqlHandles.get(handle);
  if (typeof sql !== "string" || typeof callback !== "function") fail("RECOVERY_RESTORE_SQL_HANDLE_INVALID", "Managed restore SQL handle is invalid");
  return callback(sql);
}

export function buildStorageByteRestorePlan({ storageInventory, bundleRoot } = {}) {
  if (!storageInventory || storageInventory.valid !== true || !Array.isArray(storageInventory.objects)) fail("RECOVERY_STORAGE_PLAN_INVALID", "Verified Storage inventory is required");
  if (storageInventory.objectCount === 0) {
    const plan = Object.freeze({ status: "VALIDATED_NO_OP", phase: "EMPTY_STORAGE_BYTE_RESTORE", objectCount: 0, totalBytes: 0, metadataGateRequired: true });
    storagePlanHandles.set(plan, Object.freeze([]));
    return plan;
  }
  const entries = storageInventory.objects.map((object) => {
    if (typeof object.path !== "string" || !Number.isSafeInteger(object.size) || !/^[a-f0-9]{64}$/.test(object.sha256 ?? "")) fail("RECOVERY_STORAGE_PLAN_INVALID", "Storage byte inventory entry is invalid");
    return Object.freeze({ source: resolveContainedPath(bundleRoot, `storage/${object.path}`), destination: `godel-files/${object.path}`, size: object.size, sha256: object.sha256 });
  });
  const plan = Object.freeze({ status: "PENDING_METADATA_GATE", phase: "STORAGE_BYTE_RESTORE", objectCount: entries.length, totalBytes: entries.reduce((sum, item) => sum + item.size, 0), metadataGateRequired: true });
  storagePlanHandles.set(plan, Object.freeze(entries));
  return plan;
}

export function authorizeStorageByteRestore(plan, metadataGate) {
  const entries = storagePlanHandles.get(plan);
  if (!entries || metadataGate?.status !== "PASS" || metadataGate?.bucket !== "godel-files" || metadataGate?.public !== false || metadataGate?.objectCount !== plan.objectCount) {
    fail("RECOVERY_STORAGE_METADATA_GATE_FAILED", "Storage metadata gate must pass before byte restore");
  }
  if (plan.status === "VALIDATED_NO_OP") return Object.freeze({ status: "VALIDATED_NO_OP", invokeTransfer: false, objectCount: 0 });
  const authorized = Object.freeze({ status: "AUTHORIZED", invokeTransfer: true, objectCount: entries.length });
  storagePlanHandles.set(authorized, entries);
  return authorized;
}

export function accessAuthorizedStorageByteEntries(handle, callback) {
  const entries = storagePlanHandles.get(handle);
  if (handle?.status !== "AUTHORIZED" || !entries || typeof callback !== "function") fail("RECOVERY_STORAGE_BYTE_AUTHORITY_REQUIRED", "Authorized Storage byte plan is required");
  return callback(entries);
}
