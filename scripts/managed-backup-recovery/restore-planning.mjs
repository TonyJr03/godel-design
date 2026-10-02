import { resolveContainedPath } from "../managed-backup/safety.mjs";
import { admitManagedDataSql, withAdmittedManagedDataSql } from "./sql-admission.mjs";
import { isGovernedMigrationHistoryAuditEvidence } from "./sql-audit.mjs";

const SAFE_SCHEMAS = new Set(["auth", "private", "public", "storage"]);
const EPHEMERAL_AUTH_TABLES = new Set([
  "auth.sessions", "auth.refresh_tokens", "auth.flow_state", "auth.one_time_tokens", "auth.mfa_challenges",
  "auth.mfa_amr_claims", "auth.saml_relay_states", "auth.sso_sessions", "auth.audit_log_entries",
]);
const FORBIDDEN_TABLES = new Set([
  "supabase_migrations.schema_migrations", "supabase_migrations.seed_files", "storage.migrations", "auth.schema_migrations",
]);
const STORAGE_METADATA_TABLES = new Set(["storage.buckets", "storage.objects"]);
const MUTABLE_CATALOG_CLASSES = Object.freeze([
  "AUTH_EPHEMERAL_KNOWN", "AUTH_OTHER", "PRIVATE", "PUBLIC", "STORAGE_METADATA", "STORAGE_OTHER",
]);
const MAX_MUTABLE_CATALOG_DIAGNOSTIC_IDENTITIES = 32;
const mutableCatalogMismatchHandles = new WeakMap();
const mutableCatalogDiagnosticHandles = new WeakSet();
const mutablePlanHandles = new WeakSet();
const mutablePlanDetails = new WeakMap();
const sanitizedSqlHandles = new WeakMap();
const storagePlanHandles = new WeakMap();
const storageMetadataGateHandles = new WeakSet();

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
    truncateTables: Object.freeze([...admitted]),
    excludedEphemeralTables: Object.freeze(excludedEphemeralTables),
    storageMetadataTables: Object.freeze(mutableTables.filter((identity) => STORAGE_METADATA_TABLES.has(identity))),
  });
  mutablePlanHandles.add(plan);
  mutablePlanDetails.set(plan, Object.freeze({ catalog: Object.freeze(catalogIdentities), admitted: Object.freeze(admitted) }));
  return plan;
}

function classifyMutableIdentity(identity) {
  if (EPHEMERAL_AUTH_TABLES.has(identity)) return "AUTH_EPHEMERAL_KNOWN";
  if (identity.startsWith("auth.")) return "AUTH_OTHER";
  if (STORAGE_METADATA_TABLES.has(identity)) return "STORAGE_METADATA";
  if (identity.startsWith("storage.")) return "STORAGE_OTHER";
  if (identity.startsWith("public.")) return "PUBLIC";
  if (identity.startsWith("private.")) return "PRIVATE";
  fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Mutable catalog identity could not be classified");
}

export function classifyMutableCatalogMismatch({ admission, targetTables } = {}) {
  if (!Array.isArray(targetTables)) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Target catalog is required for mutable catalog diagnosis");
  return withAdmittedManagedDataSql(admission, () => {
    const targetIdentities = targetTables.map(validateTargetCatalogIdentity);
    const targetIdentitySet = new Set(targetIdentities);
    if (targetIdentitySet.size !== targetIdentities.length) fail("RECOVERY_TARGET_CATALOG_DUPLICATE", "Target catalog contains a duplicate table identity");
    const sourceIdentities = admission.mutableTables.map(validateAdmittedMutableIdentity);
    const missingIdentities = sourceIdentities.filter((identity) => !targetIdentitySet.has(identity)).sort((left, right) => left.localeCompare(right, "en"));
    if (missingIdentities.length > MAX_MUTABLE_CATALOG_DIAGNOSTIC_IDENTITIES) {
      fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_TOO_LARGE", "Mutable catalog diagnostic exceeds its bounded identity limit");
    }
    const classCounts = new Map(MUTABLE_CATALOG_CLASSES.map((name) => [name, 0]));
    for (const identity of missingIdentities) {
      const name = classifyMutableIdentity(identity);
      classCounts.set(name, classCounts.get(name) + 1);
    }
    const missingClasses = [...classCounts]
      .filter(([, count]) => count > 0)
      .map(([name, count]) => Object.freeze({ class: name, count }))
      .sort((left, right) => left.class.localeCompare(right.class, "en"));
    const result = Object.freeze({
      missingCount: missingIdentities.length,
      missingClasses: Object.freeze(missingClasses),
      missingIdentities: Object.freeze(missingIdentities),
    });
    mutableCatalogMismatchHandles.set(result, Object.freeze({ admission, missingIdentities: result.missingIdentities }));
    return result;
  });
}

function validateMutableCatalogDiagnosticShape(value) {
  const keys = ["missingCount", "missingClasses", "missingIdentities", "missingData"];
  if (
    !value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length
    || Object.keys(value).some((key) => !keys.includes(key))
    || !Number.isSafeInteger(value.missingCount) || value.missingCount < 0
    || value.missingCount > MAX_MUTABLE_CATALOG_DIAGNOSTIC_IDENTITIES
    || !Array.isArray(value.missingClasses) || !Array.isArray(value.missingIdentities) || !Array.isArray(value.missingData)
    || value.missingIdentities.length !== value.missingCount || value.missingData.length !== value.missingCount
  ) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Mutable catalog diagnostic shape is invalid");
  const missingIdentities = value.missingIdentities.map(validateTargetCatalogIdentity);
  if (
    new Set(missingIdentities).size !== missingIdentities.length
    || missingIdentities.some((identity, index) => index > 0 && missingIdentities[index - 1].localeCompare(identity, "en") >= 0)
  ) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Mutable catalog diagnostic identities are invalid");
  const expectedCounts = new Map(MUTABLE_CATALOG_CLASSES.map((name) => [name, 0]));
  for (const identity of missingIdentities) {
    const name = classifyMutableIdentity(identity);
    expectedCounts.set(name, expectedCounts.get(name) + 1);
  }
  const expectedClasses = [...expectedCounts]
    .filter(([, count]) => count > 0)
    .map(([name, count]) => Object.freeze({ class: name, count }))
    .sort((left, right) => left.class.localeCompare(right.class, "en"));
  const missingClasses = value.missingClasses.map((item) => {
    if (
      !item || typeof item !== "object" || Array.isArray(item)
      || Object.keys(item).length !== 2 || !Object.hasOwn(item, "class") || !Object.hasOwn(item, "count")
      || !MUTABLE_CATALOG_CLASSES.includes(item.class)
      || !Number.isSafeInteger(item.count) || item.count <= 0
    ) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Mutable catalog diagnostic class is invalid");
    return Object.freeze({ class: item.class, count: item.count });
  });
  if (
    missingClasses.length !== expectedClasses.length
    || missingClasses.some((item, index) => item.class !== expectedClasses[index].class || item.count !== expectedClasses[index].count)
  ) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Mutable catalog diagnostic classes do not match its identities");
  const missingData = value.missingData.map((item, index) => {
    if (
      !item || typeof item !== "object" || Array.isArray(item)
      || Object.keys(item).length !== 2 || !Object.hasOwn(item, "identity") || !Object.hasOwn(item, "rowState")
      || validateTargetCatalogIdentity(item.identity) !== missingIdentities[index]
      || (item.rowState !== "EMPTY" && item.rowState !== "NONEMPTY")
    ) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Mutable catalog data occupancy is invalid");
    return Object.freeze({ identity: item.identity, rowState: item.rowState });
  });
  return Object.freeze({
    missingCount: value.missingCount,
    missingClasses: Object.freeze(missingClasses),
    missingIdentities: Object.freeze(missingIdentities),
    missingData: Object.freeze(missingData),
  });
}

export function classifyMissingMutableDataOccupancy(options = {}) {
  const keys = ["admission", "mutableCatalog"];
  if (
    !options || typeof options !== "object" || Array.isArray(options)
    || Object.keys(options).length !== keys.length
    || Object.keys(options).some((key) => !keys.includes(key))
  ) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Governed mutable catalog occupancy inputs are required");
  const { admission, mutableCatalog } = options;
  const provenance = mutableCatalogMismatchHandles.get(mutableCatalog);
  if (!provenance || provenance.admission !== admission) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Governed mutable catalog mismatch evidence is required");
  return withAdmittedManagedDataSql(admission, (model) => {
    const missingIdentitySet = new Set(provenance.missingIdentities);
    const copyBlocks = new Map();
    for (const block of model.copyBlocks) {
      if (!missingIdentitySet.has(block.identity)) continue;
      if (copyBlocks.has(block.identity)) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Missing mutable identity has multiple COPY blocks");
      copyBlocks.set(block.identity, block);
    }
    if (copyBlocks.size !== provenance.missingIdentities.length) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Missing mutable identity COPY block is unavailable");
    const missingData = provenance.missingIdentities.map((identity) => {
      const block = copyBlocks.get(identity);
      const structuralRowCount = block.end - block.start - 1;
      if (!Number.isSafeInteger(structuralRowCount) || structuralRowCount < 0) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Missing mutable identity COPY structure is invalid");
      return Object.freeze({ identity, rowState: structuralRowCount === 0 ? "EMPTY" : "NONEMPTY" });
    });
    const result = validateMutableCatalogDiagnosticShape({ ...mutableCatalog, missingData });
    mutableCatalogDiagnosticHandles.add(result);
    return result;
  });
}

export function validateMutableCatalogDiagnostic(value) {
  if (!mutableCatalogDiagnosticHandles.has(value)) fail("RECOVERY_MUTABLE_CATALOG_DIAGNOSTIC_INVALID", "Governed mutable catalog occupancy evidence is required");
  return validateMutableCatalogDiagnosticShape(value);
}

export function accessMutableTablePlan(handle, callback) {
  const details = mutablePlanDetails.get(handle);
  if (!details || typeof callback !== "function") fail("RECOVERY_MUTABLE_PLAN_REQUIRED", "Admitted mutable plan is required");
  return callback(details);
}

export function verifyManagedDataCounts({ admission, manifestTableCounts, migrationHistory } = {}) {
  if (
    !Array.isArray(manifestTableCounts)
    || !isGovernedMigrationHistoryAuditEvidence(migrationHistory)
    || migrationHistory.status !== "PASS"
    || migrationHistory.treatment !== "AUDIT_ONLY"
    || !Number.isSafeInteger(migrationHistory.rowCount)
    || migrationHistory.rowCount < 0
  ) fail("RECOVERY_MANAGED_DATA_COUNTS_INVALID", "Manifest table counts and governed migration history evidence are required");
  return withAdmittedManagedDataSql(admission, (model) => {
    const actual = model.copyBlocks.map((block) => Object.freeze({ identity: block.identity, rowCount: block.end - block.start - 1 })).sort((left, right) => left.identity.localeCompare(right.identity, "en"));
    const manifest = manifestTableCounts.map((table) => {
      if (!table || typeof table.schema !== "string" || typeof table.name !== "string" || !Number.isSafeInteger(table.rowCount) || table.rowCount < 0) fail("RECOVERY_MANAGED_DATA_COUNTS_INVALID", "Manifest table count is invalid");
      return Object.freeze({ identity: `${table.schema}.${table.name}`, rowCount: table.rowCount });
    }).sort((left, right) => left.identity.localeCompare(right.identity, "en"));
    const historyIdentity = "supabase_migrations.schema_migrations";
    const historyCounts = manifest.filter(({ identity }) => identity === historyIdentity);
    const expected = manifest.filter(({ identity }) => identity !== historyIdentity);
    if (
      historyCounts.length !== 1
      || historyCounts[0].rowCount !== migrationHistory.rowCount
      || actual.length !== expected.length
      || actual.some((item, index) => item.identity !== expected[index].identity || item.rowCount !== expected[index].rowCount)
    ) {
      fail("RECOVERY_MANAGED_DATA_COUNTS_MISMATCH", "Managed data COPY counts do not match the manifest");
    }
    return Object.freeze({ status: "PASS", tableCounts: Object.freeze(actual) });
  });
}

export function sanitizeEphemeralAuthState({ admission, mutablePlan } = {}) {
  if (!mutablePlanHandles.has(mutablePlan)) fail("RECOVERY_MUTABLE_PLAN_REQUIRED", "Admitted mutable plan is required");
  return withAdmittedManagedDataSql(admission, (model) => {
    const excluded = new Set(mutablePlan.excludedEphemeralTables);
    const omittedLines = new Set(model.transportOnlyLines);
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

function assertRestoreSqlAuthority(sql) {
  const lines = sql.replace(/\r\n/g, "\n").split("\n");
  let inCopy = false;
  let replicationRoleStatementCount = 0;
  let exactLocalReplicaCount = 0;
  let resetAllCount = 0;
  for (const line of lines) {
    if (inCopy) {
      if (line === "\\.") inCopy = false;
      continue;
    }
    if (line.startsWith("COPY ")) {
      inCopy = true;
      continue;
    }
    if (line === "" || line.startsWith("--")) continue;
    if (/^SET\s+(?:(?:LOCAL|SESSION)\s+)?session_replication_role\b/i.test(line)) replicationRoleStatementCount += 1;
    if (line === "SET LOCAL session_replication_role = replica;") exactLocalReplicaCount += 1;
    if (line === "RESET ALL;") resetAllCount += 1;
  }
  if (inCopy || replicationRoleStatementCount !== 1 || exactLocalReplicaCount !== 1 || resetAllCount !== 0) {
    fail("RECOVERY_RESTORE_AUTHORITY_INVALID", "Managed restore SQL authority is invalid");
  }
}

export function buildManagedRestoreSql({ mutablePlan, sanitized } = {}) {
  if (!mutablePlanHandles.has(mutablePlan) || !sanitizedSqlHandles.has(sanitized)) fail("RECOVERY_RESTORE_PLAN_INVALID", "Admitted mutable plan and sanitized SQL are required");
  const data = sanitizedSqlHandles.get(sanitized);
  if (/^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im.test(data)) fail("RECOVERY_RESTORE_TRANSACTION_FORBIDDEN", "Managed data must not govern its own transaction");
  const sql = [
    `TRUNCATE TABLE ${mutablePlan.truncateTables.map(quoteTable).join(", ")};`,
    "SET LOCAL session_replication_role = replica;",
    data,
  ].join("\n");
  assertRestoreSqlAuthority(sql);
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
  if (!entries || !storageMetadataGateHandles.has(metadataGate) || metadataGate?.status !== "PASS" || metadataGate?.bucket !== "godel-files" || metadataGate?.public !== false || metadataGate?.objectCount !== plan.objectCount) {
    fail("RECOVERY_STORAGE_METADATA_GATE_FAILED", "Storage metadata gate must pass before byte restore");
  }
  if (plan.status === "VALIDATED_NO_OP") return Object.freeze({ status: "VALIDATED_NO_OP", invokeTransfer: false, objectCount: 0 });
  const authorized = Object.freeze({ status: "AUTHORIZED", invokeTransfer: true, objectCount: entries.length });
  storagePlanHandles.set(authorized, entries);
  return authorized;
}

export function admitStorageMetadataGate({ rawOutput, expectedObjectCount } = {}) {
  let value;
  try { value = JSON.parse(String(rawOutput ?? "").trim()); } catch { fail("RECOVERY_STORAGE_METADATA_GATE_FAILED", "Storage metadata gate output is invalid"); }
  const keys = ["bucketExists", "bucketPublic", "objectCount", "unexpectedObjectCount"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))
    || value.bucketExists !== true || value.bucketPublic !== false || !Number.isSafeInteger(value.objectCount) || value.objectCount < 0
    || !Number.isSafeInteger(value.unexpectedObjectCount) || value.unexpectedObjectCount !== 0 || value.objectCount !== expectedObjectCount) {
    fail("RECOVERY_STORAGE_METADATA_GATE_FAILED", "Storage metadata gate did not prove the exact private target state");
  }
  const handle = Object.freeze({ status: "PASS", bucket: "godel-files", public: false, objectCount: value.objectCount, unexpectedObjectCount: 0 });
  storageMetadataGateHandles.add(handle);
  return handle;
}

export function accessAuthorizedStorageByteEntries(handle, callback) {
  const entries = storagePlanHandles.get(handle);
  if (handle?.status !== "AUTHORIZED" || !entries || typeof callback !== "function") fail("RECOVERY_STORAGE_BYTE_AUTHORITY_REQUIRED", "Authorized Storage byte plan is required");
  return callback(entries);
}
