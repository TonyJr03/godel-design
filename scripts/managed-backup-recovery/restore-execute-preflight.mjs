import { accessMutableTablePlan, accessTargetCompatibleManagedData, validateTargetCatalogIdentity } from "./restore-planning.mjs";
import { withAdmittedManagedDataSql } from "./sql-admission.mjs";

const SAFE_SCHEMAS = new Set(["auth", "private", "public", "storage"]);
const NAME = /^[a-z][a-z0-9_]*$/;
const MAX_FINDING_IDENTITIES = 32;
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
  return Object.freeze({ restorePlan, targetAdmission });
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

function evaluateTargetCompatibility(details, outputs) {
  const columns = parseColumnCatalog(outputs.columnCatalog);
  const foreignKeys = parseForeignKeys(outputs.foreignKeyCatalog);
  const sequences = parseSequenceCatalog(outputs.sequenceCatalog);
  const tablePrivileges = parseTablePrivileges(outputs.tablePrivileges);
  let copyBlocks;
  let sequenceIdentities;
  withAdmittedManagedDataSql(details.targetAdmission, (model) => {
    copyBlocks = model.copyBlocks.map((block) => Object.freeze({ identity: block.identity, columns: block.columns }));
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
    const missingColumnCount = block.columns.filter((column) => !targetByName.has(column)).length;
    if (missingColumnCount > 0) missingCopyColumns.push(Object.freeze({ identity: block.identity, missingColumnCount }));
    const requiredMissingCount = targetColumns.filter((column) => !column.isNullable && !column.hasDefault && !column.isIdentity && !column.isGenerated && !sourceColumns.has(column.columnName)).length;
    if (requiredMissingCount > 0) missingRequiredColumns.push(Object.freeze({ identity: block.identity, requiredMissingCount }));
    const generatedConflictCount = block.columns.filter((column) => targetByName.get(column)?.isGenerated === true).length;
    if (generatedConflictCount > 0) generatedConflicts.push(Object.freeze({ identity: block.identity, generatedConflictCount }));
  }
  if (missingCopyColumns.length > 0) finding("RECOVERY_RESTORE_EXECUTE_COPY_COLUMN_MISSING", tableCountMetadata(missingCopyColumns, "missingColumnCount"));
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
  const privilegeFindings = details.targetAdmission.mutableTables.map((tableIdentity) => {
    const privileges = privilegeMap.get(tableIdentity);
    const missingPrivileges = [];
    if (privileges?.canTruncate !== true) missingPrivileges.push("TRUNCATE");
    if (privileges?.canInsert !== true) missingPrivileges.push("INSERT");
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
    copyColumnCompatibility: "PASS",
    targetRequiredColumns: "PASS",
    truncateFkClosure: "PASS",
    sequenceCompatibility: "PASS",
    mutationPrivileges: "PASS",
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
  return Object.freeze({
    status: "PASS",
    phase: "RESTORE_EXECUTE_PREFLIGHT",
    restorePlan: "READY",
    replicationRoleAuthority: "PASS",
    ...evaluateTargetCompatibility(details, outputs),
  });
}

export function evaluateSupabaseAdminRestoreExecutorPreflight({ preflight, outputs } = {}) {
  const details = governedPreflightDetails(preflight, outputs, "SUPABASE_ADMIN");
  if (!executorAuthorities.has(details.executorAuthority)) fail("RECOVERY_RESTORE_EXECUTOR_AUTHORITY_REQUIRED", "Governed restore executor candidate authority is required");
  const replication = parseSupabaseAdminReplicationAuthority(outputs.replicationAuthority);
  if (!replication.currentUserIsSupabaseAdmin) finding("RECOVERY_RESTORE_EXECUTOR_IDENTITY_MISMATCH");
  if (!replication.canSetSessionReplicationRole) finding("RECOVERY_RESTORE_EXECUTOR_REPLICATION_ROLE_UNAUTHORIZED");
  return Object.freeze({
    status: "PASS",
    phase: "RESTORE_EXECUTOR_PREFLIGHT",
    restorePlan: "READY",
    executorCandidate: "SUPABASE_ADMIN",
    executorIdentity: "VERIFIED",
    replicationRoleAuthority: "PASS",
    ...evaluateTargetCompatibility(details, outputs),
  });
}
