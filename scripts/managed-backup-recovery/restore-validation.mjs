import { createHash } from "node:crypto";

import { accessMutableTablePlan } from "./restore-planning.mjs";
import { withAdmittedManagedDataSql } from "./sql-admission.mjs";

const HEX_DIGEST = /^[a-f0-9]{64}$/;
const MIGRATION_VERSION = /^\d{14}$/;
const EPHEMERAL_AUTH_TABLES = Object.freeze([
  "auth.sessions", "auth.refresh_tokens", "auth.flow_state", "auth.one_time_tokens", "auth.mfa_challenges",
  "auth.mfa_amr_claims", "auth.saml_relay_states", "auth.sso_sessions", "auth.audit_log_entries",
]);
const querySql = new WeakMap();
const validationPlanDetails = new WeakMap();
const storageExpectationDetails = new WeakMap();
const loginExpectationDetails = new WeakMap();
const foreignKeyCatalogDetails = new WeakMap();
const foreignKeyIntegrityPasses = new WeakSet();
const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryValidationError";
  error.code = code;
  throw error;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys, code = "RECOVERY_VALIDATION_OUTPUT_INVALID") {
  if (!plain(value) || Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) fail(code, "Restore validation output is invalid");
}

export function canonicalField(value) {
  if (value === null) return "N";
  if (typeof value !== "string") fail("RECOVERY_VALIDATION_INPUT_INVALID", "Canonical validation field is invalid");
  return `S${Buffer.byteLength(value, "utf8")}:${value}`;
}

export function canonicalRecord(fields) {
  if (!Array.isArray(fields)) fail("RECOVERY_VALIDATION_INPUT_INVALID", "Canonical validation record is invalid");
  return fields.map(canonicalField).join("");
}

export function digestCanonicalRecords(records) {
  if (!Array.isArray(records) || records.some((record) => !Array.isArray(record))) fail("RECOVERY_VALIDATION_INPUT_INVALID", "Confidential validation set is invalid");
  const normalized = records.map(canonicalRecord).sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
  return createHash("sha256").update(normalized.map(canonicalField).join(""), "utf8").digest("hex");
}

export function deriveConfidentialAuthExpectation({ users, identities, profileIds } = {}) {
  if (!Array.isArray(users) || users.some((item) => typeof item?.id !== "string" || typeof item?.encryptedPassword !== "string")
    || !Array.isArray(identities) || identities.some((item) => typeof item?.id !== "string" || typeof item?.userId !== "string")
    || !Array.isArray(profileIds) || profileIds.some((value) => typeof value !== "string")) fail("RECOVERY_AUTH_EXPECTATION_INVALID", "Confidential Auth expectation is invalid");
  const userIds = new Set(users.map(({ id }) => id));
  if (identities.some(({ userId }) => !userIds.has(userId)) || profileIds.some((id) => !userIds.has(id))) fail("RECOVERY_AUTH_RELATION_INVALID", "Auth identity/profile continuity is invalid in the admitted source");
  return Object.freeze({
    userCount: users.length,
    identityCount: identities.length,
    userIdDigest: digestCanonicalRecords(users.map(({ id }) => [id])),
    passwordDigest: digestCanonicalRecords(users.map(({ id, encryptedPassword }) => [id, encryptedPassword])),
    identityPairDigest: digestCanonicalRecords(identities.map(({ id, userId }) => [id, userId])),
    profileIdDigest: digestCanonicalRecords(profileIds.map((id) => [id])),
  });
}

export function deriveConfidentialAuthExpectationFromAdmission(admission) {
  return withAdmittedManagedDataSql(admission, (model) => {
    const rows = new Map();
    for (const block of model.copyBlocks) {
      if (!["auth.users", "auth.identities", "public.perfiles"].includes(block.identity)) continue;
      rows.set(block.identity, model.lines.slice(block.start + 1, block.end).map((line) => {
        const values = line.split("\t");
        return Object.fromEntries(block.columns.map((column, index) => [column, values[index]]));
      }));
    }
    const users = rows.get("auth.users") ?? [];
    const identities = rows.get("auth.identities") ?? [];
    const profiles = rows.get("public.perfiles") ?? [];
    if (!["auth.users", "auth.identities", "public.perfiles"].every((identity) => rows.has(identity))
      || users.some((row) => typeof row.id !== "string" || typeof row.encrypted_password !== "string" || row.encrypted_password === "\\N")
      || identities.some((row) => typeof row.id !== "string" || row.id === "\\N" || typeof row.user_id !== "string" || row.user_id === "\\N")
      || profiles.some((row) => typeof row.id !== "string" || row.id === "\\N")) fail("RECOVERY_AUTH_EXPECTATION_INVALID", "Managed data lacks required confidential Auth continuity columns");
    return deriveConfidentialAuthExpectation({
      users: users.map((row) => ({ id: row.id, encryptedPassword: row.encrypted_password })),
      identities: identities.map((row) => ({ id: row.id, userId: row.user_id })),
      profileIds: profiles.map((row) => row.id),
    });
  });
}

export function deriveLoginExpectationFromAdmission(admission) {
  return withAdmittedManagedDataSql(admission, (model) => {
    const block = model.copyBlocks.find((item) => item.identity === "auth.users");
    const idIndex = block?.columns.indexOf("id") ?? -1;
    if (!block || idIndex < 0) fail("RECOVERY_LOGIN_EXPECTATION_INVALID", "Managed data lacks Auth user identity authority");
    const ids = model.lines.slice(block.start + 1, block.end).map((line) => line.split("\t")[idIndex]);
    if (ids.length === 0 || ids.some((id) => typeof id !== "string" || id.length === 0 || id === "\\N") || new Set(ids).size !== ids.length) fail("RECOVERY_LOGIN_EXPECTATION_INVALID", "Managed data Auth user identity authority is invalid");
    const handle = Object.freeze({ status: "ADMITTED", userCount: ids.length });
    loginExpectationDetails.set(handle, new Set(ids));
    return handle;
  });
}

export function assertExpectedRestoredUser(handle, userId) {
  const ids = loginExpectationDetails.get(handle);
  if (!ids || typeof userId !== "string" || !ids.has(userId)) fail("RECOVERY_AUTH_LOGIN_IDENTITY_MISMATCH", "Local recovery login user is outside the restored source authority");
  return Object.freeze({ status: "PASS" });
}

export function deriveStorageExpectation(storageInventory) {
  if (!storageInventory || storageInventory.valid !== true || !Array.isArray(storageInventory.objects)) fail("RECOVERY_STORAGE_EXPECTATION_INVALID", "Verified Storage inventory is required");
  const objects = storageInventory.objects.map(({ path, size, sha256 }) => {
    if (typeof path !== "string" || !Number.isSafeInteger(size) || size < 0 || !HEX_DIGEST.test(sha256 ?? "")) fail("RECOVERY_STORAGE_EXPECTATION_INVALID", "Verified Storage inventory entry is invalid");
    return Object.freeze({ path, size, sha256 });
  });
  if (storageInventory.objectCount !== objects.length || storageInventory.totalBytes !== objects.reduce((sum, object) => sum + object.size, 0)) fail("RECOVERY_STORAGE_EXPECTATION_INVALID", "Verified Storage inventory aggregates are inconsistent");
  const result = Object.freeze({ bucket: "godel-files", public: false, objectCount: storageInventory.objectCount, totalBytes: storageInventory.totalBytes, inventoryDigest: digestCanonicalRecords(objects.map(({ path, size, sha256 }) => [path, String(size), sha256])) });
  storageExpectationDetails.set(result, Object.freeze(objects));
  return result;
}

export function accessStorageExpectation(handle, callback) {
  const objects = storageExpectationDetails.get(handle);
  if (!objects || typeof callback !== "function") fail("RECOVERY_STORAGE_EXPECTATION_HANDLE_REQUIRED", "Verified Storage expectation handle is required");
  return callback(objects);
}

function sqlField(expression) {
  return `(CASE WHEN ${expression} IS NULL THEN 'N' ELSE 'S' || octet_length((${expression})::text)::text || ':' || (${expression})::text END)`;
}

function sqlDigest(table, expressions) {
  const record = expressions.map(sqlField).join(" || ");
  return `(SELECT encode(digest(COALESCE(string_agg('S' || octet_length(canonical_record)::text || ':' || canonical_record, '' ORDER BY canonical_record COLLATE \"C\"), ''), 'sha256'), 'hex') FROM (SELECT ${record} AS canonical_record FROM ${table}) canonical_rows)`;
}

function createQuery(name, sql) {
  const handle = Object.freeze({ status: "READY", name, readOnly: true });
  querySql.set(handle, sql);
  return handle;
}

export function accessPostRestoreValidationSql(handle, callback) {
  const sql = querySql.get(handle);
  if (typeof sql !== "string" || typeof callback !== "function") fail("RECOVERY_VALIDATION_QUERY_HANDLE_REQUIRED", "Governed validation query handle is required");
  return callback(sql);
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function authAggregateSql(presentEphemeralTables) {
  const ephemeralAbsent = presentEphemeralTables.length === 0 ? "TRUE" : presentEphemeralTables.map((identity) => `NOT EXISTS (SELECT 1 FROM \"${identity.split(".")[0]}\".\"${identity.split(".")[1]}\")`).join(" AND ");
  return `SELECT json_build_object(
  'userCount', (SELECT count(*)::bigint FROM auth.users),
  'identityCount', (SELECT count(*)::bigint FROM auth.identities),
  'userIdDigest', ${sqlDigest("auth.users", ["id"])},
  'passwordDigest', ${sqlDigest("auth.users", ["id", "encrypted_password"])},
  'identityPairDigest', ${sqlDigest("auth.identities", ["id", "user_id"])},
  'profileIdDigest', ${sqlDigest("public.perfiles", ["id"])},
  'relationshipsValid', NOT EXISTS (SELECT 1 FROM auth.identities i LEFT JOIN auth.users u ON u.id = i.user_id WHERE u.id IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.perfiles p LEFT JOIN auth.users u ON u.id = p.id WHERE u.id IS NULL),
  'ephemeralStateAbsent', ${ephemeralAbsent}
)::text;`;
}

function governedValues(tableIdentities) {
  return tableIdentities.map((identity) => { const [schema, table] = identity.split("."); return `(${sqlLiteral(schema)}, ${sqlLiteral(table)})`; }).join(", ");
}

function constraintAggregateSql(truncateTables) {
  const values = governedValues(truncateTables);
  return `WITH governed(schema_name, table_name) AS (VALUES ${values}), governed_relations AS (
  SELECT c.oid FROM governed g JOIN pg_namespace n ON n.nspname = g.schema_name JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = g.table_name
)
SELECT json_build_object(
  'invalidConstraintCount', (SELECT count(*)::bigint FROM pg_constraint c JOIN governed_relations r ON r.oid = c.conrelid WHERE c.convalidated = false),
  'disabledTriggerCount', (SELECT count(*)::bigint FROM pg_trigger t JOIN governed_relations r ON r.oid = t.tgrelid WHERE t.tgisinternal = false AND t.tgenabled <> 'O'),
  'disabledForeignKeyTriggerCount', (SELECT count(*)::bigint FROM pg_trigger t JOIN pg_constraint fk ON fk.oid = t.tgconstraint AND fk.contype = 'f' JOIN governed_relations r ON r.oid = fk.conrelid WHERE t.tgenabled NOT IN ('O', 'A')),
  'privateAuditTableCount', ((to_regclass('private.internal_user_creation_audit') IS NOT NULL)::int + (to_regclass('private.internal_user_password_reset_audit') IS NOT NULL)::int)
)::text;`;
}

function foreignKeyCatalogSql(truncateTables) {
  const values = governedValues(truncateTables);
  return `WITH governed_child(schema_name, table_name) AS (VALUES ${values}), foreign_keys AS (
  SELECT fk.oid, fk.contype::text AS constraint_type, fk.confmatchtype::text AS match_type,
    child_ns.nspname AS child_schema, child.relname AS child_table,
    parent_ns.nspname AS parent_schema, parent.relname AS parent_table,
    child.oid AS child_oid, parent.oid AS parent_oid, fk.conkey, fk.confkey
  FROM pg_constraint fk
  JOIN pg_class child ON child.oid = fk.conrelid
  JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
  JOIN governed_child governed ON governed.schema_name = child_ns.nspname AND governed.table_name = child.relname
  JOIN pg_class parent ON parent.oid = fk.confrelid
  JOIN pg_namespace parent_ns ON parent_ns.oid = parent.relnamespace
  WHERE fk.contype = 'f'
), foreign_key_columns AS (
  SELECT fk.oid, keys.ordinality::int AS ordinal, child_attribute.attname AS child_column, parent_attribute.attname AS parent_column
  FROM foreign_keys fk
  CROSS JOIN LATERAL unnest(fk.conkey, fk.confkey) WITH ORDINALITY AS keys(child_attnum, parent_attnum, ordinality)
  JOIN pg_attribute child_attribute ON child_attribute.attrelid = fk.child_oid AND child_attribute.attnum = keys.child_attnum
  JOIN pg_attribute parent_attribute ON parent_attribute.attrelid = fk.parent_oid AND parent_attribute.attnum = keys.parent_attnum
)
SELECT COALESCE(json_agg(json_build_object(
  'constraintType', fk.constraint_type,
  'matchType', fk.match_type,
  'childSchema', fk.child_schema,
  'childTable', fk.child_table,
  'parentSchema', fk.parent_schema,
  'parentTable', fk.parent_table,
  'columns', (SELECT json_agg(json_build_object('ordinal', columns.ordinal, 'child', columns.child_column, 'parent', columns.parent_column) ORDER BY columns.ordinal) FROM foreign_key_columns columns WHERE columns.oid = fk.oid)
) ORDER BY fk.child_schema, fk.child_table, fk.oid), '[]'::json)::text
FROM foreign_keys fk;`;
}

function storageMetadataSql(objects) {
  const expected = objects.length === 0 ? "ARRAY[]::text[]" : `ARRAY[${objects.map(({ path }) => sqlLiteral(path)).join(", ")}]::text[]`;
  return `WITH expected(name) AS (SELECT unnest(${expected}))
SELECT json_build_object(
  'bucketExists', (SELECT count(*) = 1 FROM storage.buckets WHERE id = 'godel-files'),
  'bucketPublic', COALESCE((SELECT public FROM storage.buckets WHERE id = 'godel-files'), true),
  'objectCount', (SELECT count(*)::bigint FROM storage.objects WHERE bucket_id = 'godel-files'),
  'unexpectedObjectCount', (SELECT count(*)::bigint FROM storage.objects o WHERE o.bucket_id = 'godel-files' AND NOT EXISTS (SELECT 1 FROM expected e WHERE e.name = o.name))
)::text;`;
}

export function buildPostRestoreValidationQueries({ mutablePlan, runtimeVersions, storageExpectation } = {}) {
  if (!Array.isArray(runtimeVersions) || runtimeVersions.length !== 6 || runtimeVersions.some((value) => !MIGRATION_VERSION.test(value)) || new Set(runtimeVersions).size !== 6) fail("RECOVERY_VALIDATION_PLAN_INVALID", "Runtime migration authority is invalid");
  if (!storageExpectationDetails.has(storageExpectation)) fail("RECOVERY_VALIDATION_PLAN_INVALID", "Storage expectation authority is invalid");
  let details;
  accessMutableTablePlan(mutablePlan, (value) => { details = value; });
  const mutableTables = mutablePlan.mutableTables;
  const catalog = new Set(details.catalog);
  for (const required of ["auth.users", "auth.identities", "public.perfiles", "storage.buckets", "storage.objects"]) if (!catalog.has(required)) fail("RECOVERY_VALIDATION_PLAN_INVALID", "Target catalog lacks a required validation table");
  const presentEphemeralTables = EPHEMERAL_AUTH_TABLES.filter((identity) => catalog.has(identity));
  const absentEphemeralTables = EPHEMERAL_AUTH_TABLES.filter((identity) => !catalog.has(identity));
  let objects;
  accessStorageExpectation(storageExpectation, (value) => { objects = value; });
  const plan = Object.freeze({
    status: "READY",
    tableCounts: Object.freeze(mutableTables.map((identity) => createQuery(`table-count:${identity}`, `SELECT count(*)::bigint FROM \"${identity.split(".")[0]}\".\"${identity.split(".")[1]}\";`))),
    migrationHistory: createQuery("migration-history", "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"),
    replicationRole: createQuery("replication-role", "SHOW session_replication_role;"),
    auth: createQuery("auth-confidential-aggregate", authAggregateSql(presentEphemeralTables)),
    constraints: createQuery("constraints-and-triggers-aggregate", constraintAggregateSql(mutablePlan.truncateTables)),
    foreignKeyCatalog: createQuery("foreign-key-catalog", foreignKeyCatalogSql(mutablePlan.truncateTables)),
    storageMetadata: createQuery("storage-metadata-aggregate", storageMetadataSql(objects)),
    ephemeralCatalog: Object.freeze({ presentCount: presentEphemeralTables.length, absentCount: absentEphemeralTables.length, absentTreatment: "ABSENT_TARGET_TABLE_HAS_NO_STATE" }),
  });
  validationPlanDetails.set(plan, Object.freeze({ mutableTables: Object.freeze([...mutableTables]), runtimeVersions: Object.freeze([...runtimeVersions].sort()), storageExpectation }));
  return plan;
}

function admittedIdentifier(value) {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value);
}

export function parseForeignKeyCatalog({ mutablePlan, rawOutput } = {}) {
  let details;
  accessMutableTablePlan(mutablePlan, (value) => { details = value; });
  let value;
  try { value = JSON.parse(String(rawOutput ?? "").trim()); } catch { fail("RECOVERY_FOREIGN_KEY_CATALOG_INVALID", "Foreign key catalog output is invalid"); }
  if (!Array.isArray(value)) fail("RECOVERY_FOREIGN_KEY_CATALOG_INVALID", "Foreign key catalog output is invalid");
  const authority = new Set(mutablePlan.truncateTables);
  const catalog = value.map((item) => {
    exactKeys(item, ["constraintType", "matchType", "childSchema", "childTable", "parentSchema", "parentTable", "columns"], "RECOVERY_FOREIGN_KEY_CATALOG_INVALID");
    if (item.constraintType !== "f" || item.matchType !== "s" || ![item.childSchema, item.childTable, item.parentSchema, item.parentTable].every(admittedIdentifier)
      || !authority.has(`${item.childSchema}.${item.childTable}`) || !Array.isArray(item.columns) || item.columns.length === 0) {
      fail("RECOVERY_FOREIGN_KEY_CATALOG_INVALID", "Foreign key catalog shape is unsupported");
    }
    const columns = item.columns.map((column, index) => {
      exactKeys(column, ["ordinal", "child", "parent"], "RECOVERY_FOREIGN_KEY_CATALOG_INVALID");
      if (column.ordinal !== index + 1 || !admittedIdentifier(column.child) || !admittedIdentifier(column.parent)) fail("RECOVERY_FOREIGN_KEY_CATALOG_INVALID", "Foreign key column mapping is invalid");
      return Object.freeze({ ordinal: column.ordinal, child: column.child, parent: column.parent });
    });
    if (new Set(columns.map((column) => column.child)).size !== columns.length || new Set(columns.map((column) => column.parent)).size !== columns.length) fail("RECOVERY_FOREIGN_KEY_CATALOG_INVALID", "Foreign key column mapping is ambiguous");
    return Object.freeze({ childSchema: item.childSchema, childTable: item.childTable, parentSchema: item.parentSchema, parentTable: item.parentTable, columns: Object.freeze(columns) });
  });
  if (!details || catalog.length > 10_000) fail("RECOVERY_FOREIGN_KEY_CATALOG_INVALID", "Foreign key catalog is invalid");
  const handle = Object.freeze({ status: "ADMITTED", foreignKeyCount: catalog.length, toJSON: () => ({ status: "ADMITTED", foreignKeyCount: catalog.length }) });
  foreignKeyCatalogDetails.set(handle, Object.freeze(catalog));
  return handle;
}

function quoteIdentifier(value) {
  if (!admittedIdentifier(value)) fail("RECOVERY_FOREIGN_KEY_CATALOG_INVALID", "Foreign key identifier is invalid");
  return `"${value}"`;
}

export function buildForeignKeyIntegrityQueries(catalogHandle) {
  const catalog = foreignKeyCatalogDetails.get(catalogHandle);
  if (!catalog) fail("RECOVERY_FOREIGN_KEY_CATALOG_REQUIRED", "Admitted foreign key catalog is required");
  return Object.freeze(catalog.map((foreignKey, index) => {
    const child = `${quoteIdentifier(foreignKey.childSchema)}.${quoteIdentifier(foreignKey.childTable)}`;
    const parent = `${quoteIdentifier(foreignKey.parentSchema)}.${quoteIdentifier(foreignKey.parentTable)}`;
    const present = foreignKey.columns.map((column) => `child.${quoteIdentifier(column.child)} IS NOT NULL`).join(" AND ");
    const relation = foreignKey.columns.map((column) => `parent.${quoteIdentifier(column.parent)} = child.${quoteIdentifier(column.child)}`).join(" AND ");
    return createQuery(`foreign-key-integrity:${index}`, `SELECT count(*)::bigint FROM ${child} child WHERE ${present} AND NOT EXISTS (SELECT 1 FROM ${parent} parent WHERE ${relation});`);
  }));
}

export function validateForeignKeyIntegrityOutputs({ catalog, outputs } = {}) {
  const details = foreignKeyCatalogDetails.get(catalog);
  if (!details || !Array.isArray(outputs) || outputs.length !== details.length) fail("RECOVERY_FOREIGN_KEY_INTEGRITY_OUTPUT_INVALID", "Foreign key integrity outputs are incomplete");
  for (const output of outputs) {
    if (typeof output !== "string" || !/^\d+\s*$/.test(output)) fail("RECOVERY_FOREIGN_KEY_INTEGRITY_OUTPUT_INVALID", "Foreign key integrity output is invalid");
    const count = Number(output.trim());
    if (!Number.isSafeInteger(count) || count < 0) fail("RECOVERY_FOREIGN_KEY_INTEGRITY_OUTPUT_INVALID", "Foreign key integrity output is invalid");
    if (count > 0) fail("RECOVERY_FOREIGN_KEY_INTEGRITY_FAILED", "Restored rows violate referential integrity");
  }
  const result = Object.freeze({ status: "PASS", referentialIntegrity: "PASS", foreignKeyCount: details.length });
  foreignKeyIntegrityPasses.add(result);
  return result;
}

function parseJsonObject(output, keys) {
  let value;
  try { value = JSON.parse(output.trim()); } catch { fail("RECOVERY_VALIDATION_OUTPUT_INVALID", "Restore validation output is invalid JSON"); }
  exactKeys(value, keys);
  return value;
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function parsePostRestoreValidationOutputs({ plan, outputs } = {}) {
  const details = validationPlanDetails.get(plan);
  const outputKeys = ["tableCounts", "migrationHistory", "replicationRole", "auth", "constraints", "storageMetadata", "storageInventory"];
  if (!details || !plain(outputs) || Object.keys(outputs).length !== outputKeys.length || Object.keys(outputs).some((key) => !outputKeys.includes(key)) || !Array.isArray(outputs.tableCounts) || outputs.tableCounts.length !== details.mutableTables.length) fail("RECOVERY_VALIDATION_OUTPUT_INVALID", "Restore validation outputs are incomplete");
  const tableCounts = {};
  outputs.tableCounts.forEach((output, index) => {
    const value = typeof output === "string" && /^\d+\s*$/.test(output) ? Number(output.trim()) : NaN;
    if (!Number.isSafeInteger(value) || value < 0) fail("RECOVERY_VALIDATION_OUTPUT_INVALID", "Table count output is invalid");
    tableCounts[details.mutableTables[index]] = value;
  });
  const versions = typeof outputs.migrationHistory === "string" ? outputs.migrationHistory.split(/\r?\n/).filter(Boolean) : [];
  const migrationHistoryExact = versions.length === details.runtimeVersions.length && versions.every((value, index) => value === details.runtimeVersions[index]);
  const role = typeof outputs.replicationRole === "string" ? outputs.replicationRole.trim() : "";
  if (!new Set(["origin", "replica", "local"]).has(role)) fail("RECOVERY_VALIDATION_OUTPUT_INVALID", "Replication role output is invalid");
  const auth = parseJsonObject(outputs.auth, ["userCount", "identityCount", "userIdDigest", "passwordDigest", "identityPairDigest", "profileIdDigest", "relationshipsValid", "ephemeralStateAbsent"]);
  if (![auth.userCount, auth.identityCount].every(nonnegativeInteger) || ![auth.userIdDigest, auth.passwordDigest, auth.identityPairDigest, auth.profileIdDigest].every((value) => HEX_DIGEST.test(value)) || typeof auth.relationshipsValid !== "boolean" || typeof auth.ephemeralStateAbsent !== "boolean") fail("RECOVERY_VALIDATION_OUTPUT_INVALID", "Auth aggregate output is invalid");
  const structural = parseJsonObject(outputs.constraints, ["invalidConstraintCount", "disabledTriggerCount", "disabledForeignKeyTriggerCount", "privateAuditTableCount"]);
  if (![structural.invalidConstraintCount, structural.disabledTriggerCount, structural.disabledForeignKeyTriggerCount, structural.privateAuditTableCount].every(nonnegativeInteger)) fail("RECOVERY_VALIDATION_OUTPUT_INVALID", "Structural aggregate output is invalid");
  const metadata = parseJsonObject(outputs.storageMetadata, ["bucketExists", "bucketPublic", "objectCount", "unexpectedObjectCount"]);
  if (typeof metadata.bucketExists !== "boolean" || typeof metadata.bucketPublic !== "boolean" || !nonnegativeInteger(metadata.objectCount) || !nonnegativeInteger(metadata.unexpectedObjectCount)) fail("RECOVERY_VALIDATION_OUTPUT_INVALID", "Storage metadata aggregate output is invalid");
  const bytes = outputs.storageInventory;
  exactKeys(bytes, ["objectCount", "totalBytes", "inventoryDigest", "unexpectedObjectCount"]);
  if (!nonnegativeInteger(bytes.objectCount) || !nonnegativeInteger(bytes.totalBytes) || !HEX_DIGEST.test(bytes.inventoryDigest) || !nonnegativeInteger(bytes.unexpectedObjectCount)) fail("RECOVERY_VALIDATION_OUTPUT_INVALID", "Storage byte aggregate output is invalid");
  if (metadata.objectCount !== bytes.objectCount) fail("RECOVERY_STORAGE_VALIDATION_FAILED", "Storage metadata and byte counts differ");
  return Object.freeze({
    tableCounts: Object.freeze(tableCounts), migrationHistoryExact,
    privateAuditTablesPresent: structural.privateAuditTableCount === 2,
    constraintsOperational: structural.invalidConstraintCount === 0,
    triggersOperational: structural.disabledTriggerCount === 0,
    foreignKeyTriggersOperational: structural.disabledForeignKeyTriggerCount === 0,
    sessionReplicationRole: role,
    auth: Object.freeze(auth),
    storage: Object.freeze({ bucket: "godel-files", public: metadata.bucketPublic, objectCount: bytes.objectCount, totalBytes: bytes.totalBytes, inventoryDigest: bytes.inventoryDigest, unexpectedObjectCount: metadata.unexpectedObjectCount + bytes.unexpectedObjectCount, bucketExists: metadata.bucketExists }),
  });
}

export function validateManagedRestoreResult({ expected, actual, referentialIntegrity } = {}) {
  if (!expected || !actual || typeof expected !== "object" || typeof actual !== "object") fail("RECOVERY_VALIDATION_INPUT_INVALID", "Restore validation aggregates are required");
  if (!foreignKeyIntegrityPasses.has(referentialIntegrity) || referentialIntegrity?.referentialIntegrity !== "PASS") fail("RECOVERY_FOREIGN_KEY_INTEGRITY_REQUIRED", "Foreign key data integrity gate is required");
  const expectedCountEntries = Object.entries(expected.tableCounts ?? {}).sort(([left], [right]) => left.localeCompare(right, "en"));
  const actualCountEntries = Object.entries(actual.tableCounts ?? {}).sort(([left], [right]) => left.localeCompare(right, "en"));
  if (expectedCountEntries.length !== actualCountEntries.length || expectedCountEntries.some(([identity, count], index) => identity !== actualCountEntries[index][0] || count !== actualCountEntries[index][1])) fail("RECOVERY_DB_ROW_COUNT_MISMATCH", "Restored table row counts do not match the manifest");
  if (actual.foreignKeyTriggersOperational !== true) fail("RECOVERY_FOREIGN_KEY_TRIGGER_DISABLED", "Foreign key constraint triggers are not operational");
  if (actual.migrationHistoryExact !== true || actual.privateAuditTablesPresent !== true || actual.constraintsOperational !== true || actual.triggersOperational !== true) fail("RECOVERY_DB_VALIDATION_FAILED", "Restored database structural validation failed");
  if (actual.sessionReplicationRole !== "origin") fail("RECOVERY_REPLICATION_ROLE_NOT_ORIGIN", "Restore session replication role did not return to origin");
  for (const key of ["userCount", "identityCount", "userIdDigest", "passwordDigest", "identityPairDigest", "profileIdDigest"]) if (expected.auth?.[key] !== actual.auth?.[key]) fail(key === "passwordDigest" ? "RECOVERY_AUTH_PASSWORD_CONTINUITY_FAILED" : "RECOVERY_AUTH_CONTINUITY_FAILED", "Restored Auth continuity validation failed");
  if (actual.auth?.ephemeralStateAbsent !== true) fail("RECOVERY_AUTH_EPHEMERAL_STATE_PRESENT", "Ephemeral Auth state remains usable");
  if (actual.auth?.relationshipsValid !== true) fail("RECOVERY_AUTH_RELATION_INVALID", "Restored Auth identity/profile relationship is invalid");
  for (const key of ["bucket", "public", "objectCount", "totalBytes", "inventoryDigest"]) if (expected.storage?.[key] !== actual.storage?.[key]) fail("RECOVERY_STORAGE_VALIDATION_FAILED", "Restored Storage aggregate validation failed");
  if (actual.storage?.bucketExists !== true || actual.storage?.unexpectedObjectCount !== 0) fail("RECOVERY_STORAGE_VALIDATION_FAILED", "Unexpected restored Storage objects were detected");
  return Object.freeze({ status: "PASS", database: "PASS", auth: "PASS", storage: "PASS", referentialIntegrity: "PASS", passwordContinuity: "PASS", uuidContinuity: "PASS", sessionReplicationRole: "origin" });
}

export function createFutureLoginGateContract() {
  return Object.freeze({ status: "NOT_EXECUTED", evidenceField: "REAL_INTERNAL_LOGIN", credentialTransport: "INTERACTIVE_MEMORY_ONLY", forbiddenTransports: Object.freeze(["environment", "argv", "file", "logs", "evidence"]), closeEligible: false });
}
