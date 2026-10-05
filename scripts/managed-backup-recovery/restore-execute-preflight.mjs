import { accessMutableTablePlan, accessSanitizedManagedDataAdmission, accessTargetCompatibleManagedData, sanitizeEphemeralAuthState, validateTargetCatalogIdentity } from "./restore-planning.mjs";
import { admitManagedDataSql, withAdmittedManagedDataSql } from "./sql-admission.mjs";

const SAFE_SCHEMAS = new Set(["auth", "private", "public", "storage"]);
const NAME = /^[a-z][a-z0-9_]*$/;
const MAX_FINDING_IDENTITIES = 32;
const MAX_COPY_COLUMN_FINDING_TABLES = 32;
const MAX_COPY_COLUMN_FINDING_COLUMNS_PER_TABLE = 32;
const MAX_COPY_COLUMN_FINDING_COLUMNS_TOTAL = 64;
const STORAGE_VERSIONING_SEMANTIC_IDENTITY = "storage.buckets";
const STORAGE_VERSIONING_SEMANTIC_COLUMN = "versioning_status";
const EXACT_INACTIVE_STORAGE_DRIFT_COLUMNS = Object.freeze([
  "storage.buckets.lifecycle_configuration",
  "storage.buckets.lifecycle_configuration_generation",
  "storage.buckets.versioning_status",
  "storage.objects.archived_at",
  "storage.objects.is_delete_marker",
  "storage.objects.is_versioned",
]);
const EXACT_INACTIVE_STORAGE_OMISSIONS = new Map([
  ["storage.buckets", new Set(["lifecycle_configuration", "lifecycle_configuration_generation", "versioning_status"])],
  ["storage.objects", new Set(["archived_at", "is_delete_marker", "is_versioned"])],
]);
export const RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES = Object.freeze([
  "replicationAuthority",
  "columnCatalog",
  "foreignKeyCatalog",
  "sequenceCatalog",
  "tablePrivileges",
]);

const querySql = new WeakMap();
const executorCandidateQuerySql = new WeakMap();
const executorAuthorities = new WeakMap();
const preflightDetails = new WeakMap();
const governedFindings = new WeakMap();
const compatibleAdmissionHandles = new WeakMap();

export const SUPABASE_ADMIN_RESTORE_EXECUTOR = Object.freeze({ candidate: "SUPABASE_ADMIN" });
executorAuthorities.set(SUPABASE_ADMIN_RESTORE_EXECUTOR, Object.freeze({ role: "supabase_admin" }));

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryRestoreExecutePreflightError";
  error.code = code;
  throw error;
}

function finding(code, metadata = {}) {
  const error = new Error("Restore execute preflight found an incompatible target authority");
  error.name = "ManagedRecoveryRestoreExecutePreflightFinding";
  error.code = code;
  governedFindings.set(error, Object.freeze(metadata));
  throw error;
}

function createQuery(name, sql) {
  const handle = Object.freeze({ name, statementClass: "SELECT_READ_ONLY" });
  querySql.set(handle, sql);
  return handle;
}

function createExecutorCandidateQuery(name, sql, executorAuthority) {
  if (!executorAuthorities.has(executorAuthority)) fail("RECOVERY_RESTORE_EXECUTOR_AUTHORITY_REQUIRED", "Governed restore executor candidate authority is required");
  const handle = Object.freeze({ name, statementClass: "SELECT_READ_ONLY" });
  executorCandidateQuerySql.set(handle, Object.freeze({ sql, executorAuthority }));
  return handle;
}

export function accessRestoreExecutePreflightQuerySql(handle, callback) {
  const sql = querySql.get(handle);
  if (typeof sql !== "string" || typeof callback !== "function") fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_QUERY_REQUIRED", "Governed restore execute preflight query is required");
  return callback(sql);
}

export function accessSupabaseAdminRestoreExecutorQuerySql({ executorAuthority, query } = {}, callback) {
  const details = executorCandidateQuerySql.get(query);
  if (
    !executorAuthorities.has(executorAuthority)
    || details?.executorAuthority !== executorAuthority
    || typeof details.sql !== "string"
    || typeof callback !== "function"
  ) fail("RECOVERY_RESTORE_EXECUTOR_QUERY_REQUIRED", "Governed Supabase Admin restore executor query is required");
  return callback(details.sql);
}

export function accessRestoreExecutePreflightFinding(error, callback) {
  const metadata = governedFindings.get(error);
  if (!metadata || typeof callback !== "function") fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_FINDING_INVALID", "Governed restore execute preflight finding is required");
  return callback(Object.freeze({ code: error.code, metadata }));
}

export function accessRestoreExecuteCompatibleManagedDataAdmission(handle, callback) {
  const admission = compatibleAdmissionHandles.get(handle);
  if (!admission || typeof callback !== "function") fail("RECOVERY_RESTORE_EXECUTE_COMPATIBILITY_HANDLE_INVALID", "Governed restore execute compatibility authority is required");
  return callback(admission);
}

const REPLICATION_AUTHORITY_SQL = [
  "SELECT json_build_object(",
  "  'currentUserIsPostgres', current_user = 'postgres',",
  "  'canSetSessionReplicationRole', has_parameter_privilege(current_user, 'session_replication_role', 'SET')",
  ")::text;",
].join("\n");

const SUPABASE_ADMIN_REPLICATION_AUTHORITY_SQL = [
  "SELECT json_build_object(",
  "  'currentUserIsSupabaseAdmin', current_user = 'supabase_admin',",
  "  'canSetSessionReplicationRole', has_parameter_privilege(current_user, 'session_replication_role', 'SET'),",
  "  'isSuperuser', COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)",
  ")::text;",
].join("\n");

const COLUMN_CATALOG_SQL = [
  "SELECT COALESCE(json_agg(json_build_object(",
  "  'tableSchema', table_schema,",
  "  'tableName', table_name,",
  "  'columnName', column_name,",
  "  'ordinalPosition', ordinal_position,",
  "  'isNullable', is_nullable = 'YES',",
  "  'hasDefault', column_default IS NOT NULL,",
  "  'isIdentity', is_identity = 'YES',",
  "  'isGenerated', is_generated <> 'NEVER'",
  ") ORDER BY table_schema, table_name, ordinal_position), '[]'::json)::text",
  "FROM information_schema.columns",
  "WHERE table_schema IN ('auth','private','public','storage');",
].join("\n");

const FOREIGN_KEY_CATALOG_SQL = [
  "SELECT COALESCE(json_agg(json_build_object(",
  "  'parentIdentity', parent_schema || '.' || parent_table,",
  "  'childIdentity', child_schema || '.' || child_table",
  ") ORDER BY parent_schema, parent_table, child_schema, child_table), '[]'::json)::text",
  "FROM (",
  "  SELECT DISTINCT pn.nspname AS parent_schema, pc.relname AS parent_table, cn.nspname AS child_schema, cc.relname AS child_table",
  "  FROM pg_constraint fk",
  "  JOIN pg_class pc ON pc.oid = fk.confrelid",
  "  JOIN pg_namespace pn ON pn.oid = pc.relnamespace",
  "  JOIN pg_class cc ON cc.oid = fk.conrelid",
  "  JOIN pg_namespace cn ON cn.oid = cc.relnamespace",
  "  WHERE fk.contype = 'f'",
  "    AND pn.nspname IN ('auth','private','public','storage')",
  "    AND cn.nspname IN ('auth','private','public','storage')",
  ") governed_fk;",
].join("\n");

const SEQUENCE_CATALOG_SQL = [
  "SELECT COALESCE(json_agg(json_build_object(",
  "  'identity', n.nspname || '.' || c.relname,",
  "  'canUpdate', has_sequence_privilege(current_user, c.oid, 'UPDATE')",
  ") ORDER BY n.nspname, c.relname), '[]'::json)::text",
  "FROM pg_class c",
  "JOIN pg_namespace n ON n.oid = c.relnamespace",
  "WHERE c.relkind = 'S'",
  "  AND n.nspname IN ('auth','private','public','storage');",
].join("\n");

const TABLE_PRIVILEGES_SQL = [
  "SELECT COALESCE(json_agg(json_build_object(",
  "  'identity', n.nspname || '.' || c.relname,",
  "  'canTruncate', has_table_privilege(current_user, c.oid, 'TRUNCATE'),",
  "  'canInsert', has_table_privilege(current_user, c.oid, 'INSERT')",
  ") ORDER BY n.nspname, c.relname), '[]'::json)::text",
  "FROM pg_class c",
  "JOIN pg_namespace n ON n.oid = c.relnamespace",
  "WHERE c.relkind IN ('r','p')",
  "  AND n.nspname IN ('auth','private','public','storage');",
].join("\n");

function targetCompatiblePlanDetails(restorePlan) {
  if (
    restorePlan?.status !== "READY"
    || restorePlan?.storage?.objectCount !== 0
    || restorePlan?.storage?.totalBytes !== 0
  ) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_PLAN_INVALID", "Ready empty-Storage restore plan is required");
  let targetAdmission;
  accessTargetCompatibleManagedData(restorePlan.targetCompatibility, (admission) => { targetAdmission = admission; });
  accessMutableTablePlan(restorePlan.mutable, (details) => {
    if (
      details.admitted.length !== targetAdmission.mutableTables.length
      || details.admitted.some((identity, index) => identity !== targetAdmission.mutableTables[index])
    ) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_PLAN_INVALID", "Target-compatible admission and mutable plan authority do not match");
  });
  const sanitized = sanitizeEphemeralAuthState({ admission: targetAdmission, mutablePlan: restorePlan.mutable });
  let persistentAdmission;
  accessSanitizedManagedDataAdmission(sanitized, (admission) => { persistentAdmission = admission; });
  return Object.freeze({ restorePlan, targetAdmission, persistentAdmission });
}

function preflightQueries(create, replicationSql, executorAuthority) {
  return Object.freeze({
    replicationAuthority: create("replicationAuthority", replicationSql, executorAuthority),
    columnCatalog: create("columnCatalog", COLUMN_CATALOG_SQL, executorAuthority),
    foreignKeyCatalog: create("foreignKeyCatalog", FOREIGN_KEY_CATALOG_SQL, executorAuthority),
    sequenceCatalog: create("sequenceCatalog", SEQUENCE_CATALOG_SQL, executorAuthority),
    tablePrivileges: create("tablePrivileges", TABLE_PRIVILEGES_SQL, executorAuthority),
  });
}

export function buildRestoreExecutePreflight({ restorePlan } = {}) {
  const details = targetCompatiblePlanDetails(restorePlan);
  const queries = preflightQueries(createQuery, REPLICATION_AUTHORITY_SQL);
  const result = Object.freeze({ status: "READY", phase: "RESTORE_EXECUTE_PREFLIGHT", queryCount: RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES.length, queries });
  preflightDetails.set(result, Object.freeze({ ...details, executorCandidate: undefined }));
  return result;
}

export function buildSupabaseAdminRestoreExecutorPreflight({ restorePlan, executorAuthority } = {}) {
  if (!executorAuthorities.has(executorAuthority)) fail("RECOVERY_RESTORE_EXECUTOR_AUTHORITY_REQUIRED", "Governed restore executor candidate authority is required");
  const details = targetCompatiblePlanDetails(restorePlan);
  const queries = preflightQueries(createExecutorCandidateQuery, SUPABASE_ADMIN_REPLICATION_AUTHORITY_SQL, executorAuthority);
  const result = Object.freeze({ status: "READY", phase: "RESTORE_EXECUTOR_PREFLIGHT", executorCandidate: "SUPABASE_ADMIN", queryCount: RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES.length, queries });
  preflightDetails.set(result, Object.freeze({ ...details, executorCandidate: "SUPABASE_ADMIN", executorAuthority }));
  return result;
}

function parseJson(output) {
  if (typeof output !== "string" || output.length === 0 || output.length > 512 * 1024 || output.includes("\0")) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Restore execute preflight output is invalid");
  try { return JSON.parse(output.trim()); } catch { fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Restore execute preflight output is invalid"); }
}

function exactObject(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && Object.keys(value).every((key) => keys.includes(key));
}

function identity(value) {
  try { return validateTargetCatalogIdentity(value); } catch { fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Restore execute preflight identity is invalid"); }
}

function bounded(values) {
  const sorted = [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
  if (sorted.length > MAX_FINDING_IDENTITIES) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Restore execute preflight finding exceeds its bounded identity limit");
  return Object.freeze(sorted);
}

function parseReplicationAuthority(output) {
  const value = parseJson(output);
  const keys = ["currentUserIsPostgres", "canSetSessionReplicationRole"];
  if (!exactObject(value, keys) || keys.some((key) => typeof value[key] !== "boolean")) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Replication-role authority output is invalid");
  return Object.freeze({ currentUserIsPostgres: value.currentUserIsPostgres, canSetSessionReplicationRole: value.canSetSessionReplicationRole });
}

function parseSupabaseAdminReplicationAuthority(output) {
  const value = parseJson(output);
  const keys = ["currentUserIsSupabaseAdmin", "canSetSessionReplicationRole", "isSuperuser"];
  if (!exactObject(value, keys) || keys.some((key) => typeof value[key] !== "boolean")) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Restore executor authority output is invalid");
  return Object.freeze({
    currentUserIsSupabaseAdmin: value.currentUserIsSupabaseAdmin,
    canSetSessionReplicationRole: value.canSetSessionReplicationRole,
    isSuperuser: value.isSuperuser,
  });
}

function parseColumnCatalog(output) {
  const value = parseJson(output);
  if (!Array.isArray(value)) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target column catalog output is invalid");
  const keys = ["tableSchema", "tableName", "columnName", "ordinalPosition", "isNullable", "hasDefault", "isIdentity", "isGenerated"];
  const seenColumns = new Set();
  const seenOrdinals = new Set();
  return Object.freeze(value.map((item) => {
    if (
      !exactObject(item, keys)
      || typeof item.tableSchema !== "string" || !SAFE_SCHEMAS.has(item.tableSchema)
      || typeof item.tableName !== "string" || !NAME.test(item.tableName)
      || typeof item.columnName !== "string" || !NAME.test(item.columnName)
      || !Number.isSafeInteger(item.ordinalPosition) || item.ordinalPosition <= 0
      || [item.isNullable, item.hasDefault, item.isIdentity, item.isGenerated].some((flag) => typeof flag !== "boolean")
    ) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target column catalog output is invalid");
    const tableIdentity = identity(`${item.tableSchema}.${item.tableName}`);
    const columnKey = `${tableIdentity}.${item.columnName}`;
    const ordinalKey = `${tableIdentity}:${item.ordinalPosition}`;
    if (seenColumns.has(columnKey) || seenOrdinals.has(ordinalKey)) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target column catalog contains duplicate metadata");
    seenColumns.add(columnKey);
    seenOrdinals.add(ordinalKey);
    return Object.freeze({ identity: tableIdentity, columnName: item.columnName, ordinalPosition: item.ordinalPosition, isNullable: item.isNullable, hasDefault: item.hasDefault, isIdentity: item.isIdentity, isGenerated: item.isGenerated });
  }));
}

function parseForeignKeys(output) {
  const value = parseJson(output);
  if (!Array.isArray(value)) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target foreign-key catalog output is invalid");
  const seen = new Set();
  return Object.freeze(value.map((item) => {
    if (!exactObject(item, ["parentIdentity", "childIdentity"])) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target foreign-key catalog output is invalid");
    const parentIdentity = identity(item.parentIdentity);
    const childIdentity = identity(item.childIdentity);
    const key = `${parentIdentity}->${childIdentity}`;
    if (seen.has(key)) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target foreign-key catalog contains duplicate metadata");
    seen.add(key);
    return Object.freeze({ parentIdentity, childIdentity });
  }));
}

function parseSequenceCatalog(output) {
  const value = parseJson(output);
  if (!Array.isArray(value)) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target sequence catalog output is invalid");
  const seen = new Set();
  return Object.freeze(value.map((item) => {
    if (!exactObject(item, ["identity", "canUpdate"]) || typeof item.canUpdate !== "boolean") fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target sequence catalog output is invalid");
    const sequenceIdentity = identity(item.identity);
    if (seen.has(sequenceIdentity)) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target sequence catalog contains duplicate metadata");
    seen.add(sequenceIdentity);
    return Object.freeze({ identity: sequenceIdentity, canUpdate: item.canUpdate });
  }));
}

function parseTablePrivileges(output) {
  const value = parseJson(output);
  if (!Array.isArray(value)) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target table privilege output is invalid");
  const seen = new Set();
  return Object.freeze(value.map((item) => {
    if (!exactObject(item, ["identity", "canTruncate", "canInsert"]) || typeof item.canTruncate !== "boolean" || typeof item.canInsert !== "boolean") fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target table privilege output is invalid");
    const tableIdentity = identity(item.identity);
    if (seen.has(tableIdentity)) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Target table privilege output contains duplicate metadata");
    seen.add(tableIdentity);
    return Object.freeze({ identity: tableIdentity, canTruncate: item.canTruncate, canInsert: item.canInsert });
  }));
}

function tableCountMetadata(items, countField) {
  if (items.length === 1) return Object.freeze({ identity: items[0].identity, [countField]: items[0][countField] });
  return Object.freeze({ tableCount: items.length, identities: bounded(items.map((item) => item.identity)) });
}

function copyColumnFindingMetadata(items) {
  const tables = [...items].sort((left, right) => left.identity.localeCompare(right.identity, "en"));
  const totalColumns = tables.reduce((total, table) => total + table.missingColumns.length, 0);
  if (
    tables.length > MAX_COPY_COLUMN_FINDING_TABLES
    || totalColumns > MAX_COPY_COLUMN_FINDING_COLUMNS_TOTAL
    || tables.some((table) => table.missingColumns.length > MAX_COPY_COLUMN_FINDING_COLUMNS_PER_TABLE)
  ) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Restore execute COPY-column finding exceeds its bounded metadata limits");
  const normalized = tables.map((table) => Object.freeze({
    identity: identity(table.identity),
    missingColumns: Object.freeze([...table.missingColumns]
      .sort((left, right) => left.name.localeCompare(right.name, "en"))
      .map((column) => {
        const includesStorageVersioningSemantics = table.identity === STORAGE_VERSIONING_SEMANTIC_IDENTITY && column.name === STORAGE_VERSIONING_SEMANTIC_COLUMN;
        const keys = includesStorageVersioningSemantics ? ["name", "dataState", "semanticState"] : ["name", "dataState"];
        if (
          !exactObject(column, keys)
          || !NAME.test(column.name)
          || !["COPY_EMPTY", "ALL_NULL", "HAS_NON_NULL"].includes(column.dataState)
          || (includesStorageVersioningSemantics && !["ALL_DISABLED", "NOT_ALL_DISABLED"].includes(column.semanticState))
        ) {
          fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Restore execute COPY-column finding metadata is invalid");
        }
        return Object.freeze(includesStorageVersioningSemantics
          ? { name: column.name, dataState: column.dataState, semanticState: column.semanticState }
          : { name: column.name, dataState: column.dataState });
      })),
  }));
  if (normalized.length === 1) return normalized[0];
  return Object.freeze({ tableCount: normalized.length, tables: Object.freeze(normalized) });
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function prepareStorageSchemaCompatibleAdmission(admission, targetColumns) {
  return withAdmittedManagedDataSql(admission, (model) => {
    const targetByTable = new Map();
    for (const column of targetColumns) {
      if (!targetByTable.has(column.identity)) targetByTable.set(column.identity, new Set());
      targetByTable.get(column.identity).add(column.columnName);
    }
    const missingColumns = model.copyBlocks
      .flatMap((block) => block.columns
        .filter((column) => !targetByTable.get(block.identity)?.has(column))
        .map((column) => `${block.identity}.${column}`))
      .sort((left, right) => left.localeCompare(right, "en"));
    if (missingColumns.length === 0) return Object.freeze({ compatibility: "NOT_REQUIRED", admission });
    if (!sameStrings(missingColumns, EXACT_INACTIVE_STORAGE_DRIFT_COLUMNS)) return Object.freeze({ compatibility: "INCOMPATIBLE", admission });

    const buckets = model.copyBlocks.find((block) => block.identity === "storage.buckets");
    const objects = model.copyBlocks.find((block) => block.identity === "storage.objects");
    if (!buckets || !objects || objects.end - objects.start - 1 !== 0 || buckets.end - buckets.start - 1 <= 0) {
      return Object.freeze({ compatibility: "INCOMPATIBLE", admission });
    }
    const lifecycleIndex = buckets.columns.indexOf("lifecycle_configuration");
    const lifecycleGenerationIndex = buckets.columns.indexOf("lifecycle_configuration_generation");
    const versioningIndex = buckets.columns.indexOf("versioning_status");
    if ([lifecycleIndex, lifecycleGenerationIndex, versioningIndex].some((index) => index < 0)) return Object.freeze({ compatibility: "INCOMPATIBLE", admission });
    for (let lineIndex = buckets.start + 1; lineIndex < buckets.end; lineIndex += 1) {
      const fields = model.lines[lineIndex].split("\t");
      if (fields[lifecycleIndex] !== "\\N" || fields[lifecycleGenerationIndex] !== "\\N" || fields[versioningIndex] !== "DISABLED") {
        return Object.freeze({ compatibility: "INCOMPATIBLE", admission });
      }
    }

    const replacements = new Map();
    const originalRows = new Map();
    for (const block of model.copyBlocks) {
      const omitted = EXACT_INACTIVE_STORAGE_OMISSIONS.get(block.identity) ?? new Set();
      const retainedIndexes = block.columns.map((_, index) => index).filter((index) => !omitted.has(block.columns[index]));
      const retainedColumns = retainedIndexes.map((index) => block.columns[index]);
      if (retainedColumns.length === 0) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Storage compatibility cannot remove every COPY column");
      const rows = [];
      for (let lineIndex = block.start + 1; lineIndex < block.end; lineIndex += 1) rows.push(model.lines[lineIndex].split("\t"));
      originalRows.set(block.identity, Object.freeze(rows.map((fields) => Object.freeze(fields))));
      if (omitted.size > 0) {
        replacements.set(block.start, `COPY ${block.identity} (${retainedColumns.join(", ")}) FROM stdin;`);
        for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
          replacements.set(block.start + 1 + rowIndex, retainedIndexes.map((index) => rows[rowIndex][index]).join("\t"));
        }
      }
    }
    const normalizedSql = model.lines.map((line, index) => replacements.get(index) ?? line).join("\n");
    const normalizedAdmission = admitManagedDataSql(normalizedSql);
    if (!sameStrings(admission.mutableTables, normalizedAdmission.mutableTables)) {
      fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Storage compatibility changed the mutable table set");
    }
    withAdmittedManagedDataSql(normalizedAdmission, (normalizedModel) => {
      if (
        normalizedModel.copyBlocks.length !== model.copyBlocks.length
        || !sameStrings(normalizedModel.sequenceIdentities, model.sequenceIdentities)
      ) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Storage compatibility changed COPY or sequence structure");
      for (let blockIndex = 0; blockIndex < model.copyBlocks.length; blockIndex += 1) {
        const sourceBlock = model.copyBlocks[blockIndex];
        const normalizedBlock = normalizedModel.copyBlocks[blockIndex];
        const omitted = EXACT_INACTIVE_STORAGE_OMISSIONS.get(sourceBlock.identity) ?? new Set();
        const retainedIndexes = sourceBlock.columns.map((_, index) => index).filter((index) => !omitted.has(sourceBlock.columns[index]));
        const expectedColumns = retainedIndexes.map((index) => sourceBlock.columns[index]);
        const normalizedRows = normalizedModel.lines.slice(normalizedBlock.start + 1, normalizedBlock.end).map((line) => line.split("\t"));
        const sourceRows = originalRows.get(sourceBlock.identity);
        if (
          normalizedBlock.identity !== sourceBlock.identity
          || !sameStrings(normalizedBlock.columns, expectedColumns)
          || normalizedRows.length !== sourceRows.length
          || normalizedRows.some((row, rowIndex) => !sameStrings(row, retainedIndexes.map((index) => sourceRows[rowIndex][index])))
        ) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Storage compatibility changed preserved COPY structure or values");
      }
    });
    return Object.freeze({ compatibility: "EXACT_INACTIVE_STORAGE_DRIFT", admission: normalizedAdmission });
  });
}

function evaluateTargetCompatibility(details, outputs) {
  const columns = parseColumnCatalog(outputs.columnCatalog);
  const foreignKeys = parseForeignKeys(outputs.foreignKeyCatalog);
  const sequences = parseSequenceCatalog(outputs.sequenceCatalog);
  const tablePrivileges = parseTablePrivileges(outputs.tablePrivileges);
  const storageCompatibility = prepareStorageSchemaCompatibleAdmission(details.persistentAdmission, columns);
  const compatibleAdmission = storageCompatibility.admission;
  let copyBlocks;
  let sequenceIdentities;
  withAdmittedManagedDataSql(compatibleAdmission, (model) => {
    copyBlocks = model.copyBlocks.map((block) => {
      const structuralRowCount = block.end - block.start - 1;
      const dataStates = new Map(block.columns.map((column) => [column, structuralRowCount === 0 ? "COPY_EMPTY" : "ALL_NULL"]));
      const storageVersioningColumnIndex = block.identity === STORAGE_VERSIONING_SEMANTIC_IDENTITY
        ? block.columns.indexOf(STORAGE_VERSIONING_SEMANTIC_COLUMN)
        : -1;
      let storageVersioningSemanticState = storageVersioningColumnIndex >= 0 && structuralRowCount > 0 ? "ALL_DISABLED" : undefined;
      for (let lineIndex = block.start + 1; lineIndex < block.end; lineIndex += 1) {
        const fields = model.lines[lineIndex].split("\t");
        for (let columnIndex = 0; columnIndex < block.columns.length; columnIndex += 1) {
          if (fields[columnIndex] !== "\\N") dataStates.set(block.columns[columnIndex], "HAS_NON_NULL");
        }
        if (storageVersioningColumnIndex >= 0 && fields[storageVersioningColumnIndex] !== "DISABLED") storageVersioningSemanticState = "NOT_ALL_DISABLED";
      }
      return Object.freeze({ identity: block.identity, columns: block.columns, dataStates, storageVersioningSemanticState });
    });
    sequenceIdentities = Object.freeze([...model.sequenceIdentities]);
  });
  const columnsByTable = new Map();
  for (const column of columns) {
    if (!columnsByTable.has(column.identity)) columnsByTable.set(column.identity, []);
    columnsByTable.get(column.identity).push(column);
  }
  const missingCopyColumns = [];
  const missingRequiredColumns = [];
  const generatedConflicts = [];
  for (const block of copyBlocks) {
    const targetColumns = columnsByTable.get(block.identity) ?? [];
    const targetByName = new Map(targetColumns.map((column) => [column.columnName, column]));
    const sourceColumns = new Set(block.columns);
    const missingColumns = block.columns
      .filter((column) => !targetByName.has(column))
      .map((column) => {
        if (block.identity !== STORAGE_VERSIONING_SEMANTIC_IDENTITY || column !== STORAGE_VERSIONING_SEMANTIC_COLUMN) {
          return Object.freeze({ name: column, dataState: block.dataStates.get(column) });
        }
        if (!block.storageVersioningSemanticState) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Storage versioning semantics cannot be proven from an empty COPY");
        return Object.freeze({ name: column, dataState: block.dataStates.get(column), semanticState: block.storageVersioningSemanticState });
      });
    if (missingColumns.length > 0) missingCopyColumns.push(Object.freeze({ identity: block.identity, missingColumns: Object.freeze(missingColumns) }));
    const requiredMissingCount = targetColumns.filter((column) => !column.isNullable && !column.hasDefault && !column.isIdentity && !column.isGenerated && !sourceColumns.has(column.columnName)).length;
    if (requiredMissingCount > 0) missingRequiredColumns.push(Object.freeze({ identity: block.identity, requiredMissingCount }));
    const generatedConflictCount = block.columns.filter((column) => targetByName.get(column)?.isGenerated === true).length;
    if (generatedConflictCount > 0) generatedConflicts.push(Object.freeze({ identity: block.identity, generatedConflictCount }));
  }
  if (missingCopyColumns.length > 0) finding("RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING", copyColumnFindingMetadata(missingCopyColumns));
  if (missingRequiredColumns.length > 0) finding("RECOVERY_RESTORE_EXECUTE_TARGET_REQUIRED_COLUMN_MISSING", tableCountMetadata(missingRequiredColumns, "requiredMissingCount"));
  if (generatedConflicts.length > 0) finding("RECOVERY_RESTORE_EXECUTE_GENERATED_COLUMN_CONFLICT", tableCountMetadata(generatedConflicts, "generatedConflictCount"));

  const truncateTables = new Set(details.restorePlan.mutable.truncateTables);
  const openEdges = foreignKeys.filter((edge) => truncateTables.has(edge.parentIdentity) && !truncateTables.has(edge.childIdentity));
  if (openEdges.length > 0) finding("RECOVERY_RESTORE_EXECUTE_TRUNCATE_FK_OPEN", Object.freeze({
    edgeCount: openEdges.length,
    parentIdentities: bounded(openEdges.map((edge) => edge.parentIdentity)),
    childIdentities: bounded(openEdges.map((edge) => edge.childIdentity)),
  }));

  const sequenceMap = new Map(sequences.map((item) => [item.identity, item]));
  const requiredSequences = [...new Set(sequenceIdentities)].sort((left, right) => left.localeCompare(right, "en"));
  const missingSequences = requiredSequences.filter((sequenceIdentity) => !sequenceMap.has(sequenceIdentity));
  if (missingSequences.length > 0) finding("RECOVERY_RESTORE_EXECUTE_SEQUENCE_MISSING", Object.freeze({ sequenceCount: missingSequences.length, identities: bounded(missingSequences) }));
  const unauthorizedSequences = requiredSequences.filter((sequenceIdentity) => sequenceMap.get(sequenceIdentity)?.canUpdate !== true);
  if (unauthorizedSequences.length > 0) finding("RECOVERY_RESTORE_EXECUTE_SEQUENCE_UNAUTHORIZED", Object.freeze({ sequenceCount: unauthorizedSequences.length, identities: bounded(unauthorizedSequences) }));

  const privilegeMap = new Map(tablePrivileges.map((item) => [item.identity, item]));
  const truncateRequired = new Set(details.restorePlan.mutable.truncateTables);
  const insertRequired = new Set(compatibleAdmission.mutableTables);
  const privilegeTables = [...new Set([...truncateRequired, ...insertRequired])].sort((left, right) => left.localeCompare(right, "en"));
  const privilegeFindings = privilegeTables.map((tableIdentity) => {
    const privileges = privilegeMap.get(tableIdentity);
    const missingPrivileges = [];
    if (truncateRequired.has(tableIdentity) && privileges?.canTruncate !== true) missingPrivileges.push("TRUNCATE");
    if (insertRequired.has(tableIdentity) && privileges?.canInsert !== true) missingPrivileges.push("INSERT");
    return Object.freeze({ identity: tableIdentity, missingPrivileges: Object.freeze(missingPrivileges) });
  }).filter((item) => item.missingPrivileges.length > 0);
  if (privilegeFindings.length > 0) {
    const identities = bounded(privilegeFindings.map((item) => item.identity));
    const missingPrivileges = Object.freeze([...new Set(privilegeFindings.flatMap((item) => item.missingPrivileges))].sort());
    const metadata = privilegeFindings.length === 1
      ? Object.freeze({ identity: privilegeFindings[0].identity, missingPrivileges: privilegeFindings[0].missingPrivileges })
      : Object.freeze({ tableCount: privilegeFindings.length, identities, missingPrivileges });
    finding("RECOVERY_RESTORE_EXECUTE_TABLE_PRIVILEGE_MISSING", metadata);
  }

  return Object.freeze({
    admission: compatibleAdmission,
    evidence: Object.freeze({
      storageSchemaCompatibility: storageCompatibility.compatibility,
      copyColumnCompatibility: "PASS",
      targetRequiredColumns: "PASS",
      truncateFkClosure: "PASS",
      sequenceCompatibility: "PASS",
      mutationPrivileges: "PASS",
    }),
  });
}

function governedPreflightDetails(preflight, outputs, expectedCandidate) {
  const details = preflightDetails.get(preflight);
  if (
    !details
    || details.executorCandidate !== expectedCandidate
    || !exactObject(outputs, RESTORE_EXECUTE_PREFLIGHT_QUERY_NAMES)
  ) fail("RECOVERY_RESTORE_EXECUTE_PREFLIGHT_OUTPUT_INVALID", "Complete governed restore execute preflight outputs are required");
  return details;
}

export function evaluateRestoreExecutePreflight({ preflight, outputs } = {}) {
  const details = governedPreflightDetails(preflight, outputs, undefined);
  const replication = parseReplicationAuthority(outputs.replicationAuthority);
  if (!replication.currentUserIsPostgres || !replication.canSetSessionReplicationRole) finding("RECOVERY_RESTORE_EXECUTE_REPLICATION_ROLE_UNAUTHORIZED");
  const compatibility = evaluateTargetCompatibility(details, outputs);
  const result = Object.freeze({
    status: "PASS",
    phase: "RESTORE_EXECUTE_PREFLIGHT",
    restorePlan: "READY",
    replicationRoleAuthority: "PASS",
    ...compatibility.evidence,
  });
  compatibleAdmissionHandles.set(result, compatibility.admission);
  return result;
}

export function evaluateSupabaseAdminRestoreExecutorPreflight({ preflight, outputs } = {}) {
  const details = governedPreflightDetails(preflight, outputs, "SUPABASE_ADMIN");
  if (!executorAuthorities.has(details.executorAuthority)) fail("RECOVERY_RESTORE_EXECUTOR_AUTHORITY_REQUIRED", "Governed restore executor candidate authority is required");
  const replication = parseSupabaseAdminReplicationAuthority(outputs.replicationAuthority);
  if (!replication.currentUserIsSupabaseAdmin) finding("RECOVERY_RESTORE_EXECUTOR_IDENTITY_MISMATCH");
  if (!replication.canSetSessionReplicationRole) finding("RECOVERY_RESTORE_EXECUTOR_REPLICATION_ROLE_UNAUTHORIZED");
  const compatibility = evaluateTargetCompatibility(details, outputs);
  const result = Object.freeze({
    status: "PASS",
    phase: "RESTORE_EXECUTOR_PREFLIGHT",
    restorePlan: "READY",
    executorCandidate: "SUPABASE_ADMIN",
    executorIdentity: "VERIFIED",
    replicationRoleAuthority: "PASS",
    ...compatibility.evidence,
  });
  compatibleAdmissionHandles.set(result, compatibility.admission);
  return result;
}
