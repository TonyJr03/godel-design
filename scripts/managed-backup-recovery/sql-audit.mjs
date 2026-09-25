const GOVERNED_SCHEMAS = Object.freeze(["auth", "private", "public", "storage"]);
const SHA_VERSION = /^\d{14}$/;

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoverySqlAuditError";
  error.code = code;
  throw error;
}

function text(value, label) {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) fail("RECOVERY_SQL_AUDIT_INVALID", `${label} must be nonempty text`);
  return value.replace(/\r\n/g, "\n");
}

function statements(source) {
  return source.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("--"));
}

export function auditRolesSql(source) {
  const value = text(source, "roles.sql");
  if (/(?:password|passwd|scram-sha-256|md5[0-9a-f]{20,})/i.test(value)) fail("RECOVERY_ROLES_CREDENTIAL_MATERIAL", "roles.sql contains credential material");
  const allowed = [
    /^SET [a-z_]+ = (?:[^;]+);$/,
    /^SELECT pg_catalog\.set_config\('search_path', '', false\);$/,
    /^CREATE ROLE "?[a-z_][a-z0-9_-]*"?;$/i,
    /^ALTER ROLE "?[a-z_][a-z0-9_-]*"? WITH (?:SUPERUSER|NOSUPERUSER|CREATEDB|NOCREATEDB|CREATEROLE|NOCREATEROLE|INHERIT|NOINHERIT|LOGIN|NOLOGIN|REPLICATION|NOREPLICATION|BYPASSRLS|NOBYPASSRLS|CONNECTION LIMIT -?\d+|VALID UNTIL '[^']+')(?:(?:\s+)(?:SUPERUSER|NOSUPERUSER|CREATEDB|NOCREATEDB|CREATEROLE|NOCREATEROLE|INHERIT|NOINHERIT|LOGIN|NOLOGIN|REPLICATION|NOREPLICATION|BYPASSRLS|NOBYPASSRLS|CONNECTION LIMIT -?\d+|VALID UNTIL '[^']+'))*;$/i,
    /^GRANT "?[a-z_][a-z0-9_-]*"? TO "?[a-z_][a-z0-9_-]*"?(?: WITH ADMIN OPTION)?;$/i,
  ];
  const lines = statements(value);
  if (lines.some((line) => !allowed.some((pattern) => pattern.test(line)))) fail("RECOVERY_ROLES_DIALECT_UNEXPECTED", "roles.sql contains an unexpected statement");
  return Object.freeze({ status: "PASS", statementCount: lines.length, credentials: "ABSENT", treatment: "AUDIT_ONLY" });
}

export function auditManagedSchemaSql(source, { requiredExtensions = [] } = {}) {
  const value = text(source, "managed-schema.sql");
  if (/\b(?:CREATE|ALTER|DROP)\s+ROLE\b/i.test(value)) fail("RECOVERY_SCHEMA_ROLE_FORBIDDEN", "managed-schema.sql contains role mutation");
  const createdSchemas = [...value.matchAll(/\bCREATE\s+SCHEMA(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"([a-z][a-z0-9_]*)"|([a-z][a-z0-9_]*))/gi)].map((match) => (match[1] ?? match[2]).toLowerCase());
  const referencedSchemas = new Set([...value.matchAll(/(?:^|[^a-z0-9_"])(?:"(auth|private|public|storage)"|(auth|private|public|storage))\s*\./gim)].map((match) => (match[1] ?? match[2]).toLowerCase()));
  for (const schema of createdSchemas) if (!GOVERNED_SCHEMAS.includes(schema)) fail("RECOVERY_SCHEMA_UNEXPECTED", "managed-schema.sql creates an unexpected schema");
  const objectSchemas = [...value.matchAll(/\b(?:TABLE|SEQUENCE|FUNCTION|VIEW|TYPE|INDEX|TRIGGER|POLICY|REFERENCES|COPY)\s+(?:ONLY\s+)?(?:"([a-z][a-z0-9_]*)"|([a-z][a-z0-9_]*))\s*\./gi)].map((match) => (match[1] ?? match[2]).toLowerCase());
  if (objectSchemas.some((schema) => !new Set([...GOVERNED_SCHEMAS, "extensions", "pg_catalog", "supabase_migrations"]).has(schema))) fail("RECOVERY_SCHEMA_UNEXPECTED", "managed-schema.sql references an unexpected schema authority");
  if (GOVERNED_SCHEMAS.some((schema) => !createdSchemas.includes(schema) && !referencedSchemas.has(schema))) fail("RECOVERY_SCHEMA_MISSING", "managed-schema.sql does not cover every governed schema");
  const extensions = [...value.matchAll(/\bCREATE\s+EXTENSION(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"([a-z][a-z0-9_]*)"|([a-z][a-z0-9_]*))/gi)].map((match) => (match[1] ?? match[2]).toLowerCase());
  if (extensions.some((name) => !requiredExtensions.includes(name))) fail("RECOVERY_EXTENSION_UNEXPECTED", "managed-schema.sql declares an unexpected extension");
  return Object.freeze({ status: "PASS", schemas: GOVERNED_SCHEMAS, extensions: Object.freeze([...new Set(extensions)].sort()), treatment: "AUDIT_ONLY" });
}

export function auditMigrationHistorySql({ schemaSql, dataSql, baselineVersions } = {}) {
  const schema = text(schemaSql, "migration-history-schema.sql");
  const data = text(dataSql, "migration-history-data.sql");
  if (!Array.isArray(baselineVersions) || baselineVersions.length !== 6 || baselineVersions.some((value) => !SHA_VERSION.test(value))) fail("RECOVERY_MIGRATION_HISTORY_EXPECTATION_INVALID", "Baseline migration versions are invalid");
  if (!/supabase_migrations\.schema_migrations|"supabase_migrations"\."schema_migrations"/i.test(schema)) fail("RECOVERY_MIGRATION_HISTORY_SCHEMA_INVALID", "Migration history schema contract is missing");
  if (/\b(?:CREATE|ALTER|DROP)\s+ROLE\b|\bCREATE\s+EXTENSION\b/i.test(schema)) fail("RECOVERY_MIGRATION_HISTORY_SCHEMA_INVALID", "Migration history schema contains an unexpected authority");
  const lines = data.replace(/\r\n/g, "\n").split("\n");
  let inCopy = false;
  let copyCount = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("--")) continue;
    if (inCopy) {
      if (line === "\\.") { inCopy = false; continue; }
      if (!/^\d{14}(?:\t[^\x00-\x1f]*)*$/.test(line)) fail("RECOVERY_MIGRATION_HISTORY_DATA_INVALID", "Migration history row is invalid");
      continue;
    }
    if (/^COPY (?:"supabase_migrations"|supabase_migrations)\.(?:"schema_migrations"|schema_migrations) \([^)]+\) FROM stdin;$/.test(line)) {
      copyCount += 1;
      inCopy = true;
      continue;
    }
    if (/^SET [a-z_]+ = [^;]+;$/.test(line) || line === "SELECT pg_catalog.set_config('search_path', '', false);") continue;
    fail("RECOVERY_MIGRATION_HISTORY_DATA_INVALID", "Migration history data contains an unexpected statement");
  }
  if (inCopy || copyCount !== 1) fail("RECOVERY_MIGRATION_HISTORY_DATA_INVALID", "Migration history data COPY contract is invalid");
  const versions = [...new Set([...data.matchAll(/(?:^|\D)(\d{14})(?=\D|$)/gm)].map((match) => match[1]))].sort();
  const expected = [...baselineVersions].sort();
  if (versions.length !== expected.length || versions.some((value, index) => value !== expected[index])) fail("RECOVERY_MIGRATION_HISTORY_MISMATCH", "Captured migration history does not match baseline 01-06");
  return Object.freeze({ status: "PASS", versions: Object.freeze(versions), treatment: "AUDIT_ONLY" });
}

export function validateTargetBaseline({ authority, targetState, requiredExtensions = ["pgcrypto"] } = {}) {
  const expectedVersions = authority?.evidence?.versions;
  if (!Array.isArray(expectedVersions) || expectedVersions.length !== 6 || !targetState || typeof targetState !== "object") fail("RECOVERY_TARGET_BASELINE_INVALID", "Target baseline evidence is invalid");
  const versions = [...(targetState.migrationVersions ?? [])].sort();
  const schemas = new Set(targetState.schemas ?? []);
  const extensions = new Set(targetState.extensions ?? []);
  if (versions.length !== 6 || versions.some((value, index) => value !== [...expectedVersions].sort()[index])) fail("RECOVERY_TARGET_BASELINE_MISMATCH", "Target migration history is not exact baseline 01-06");
  if (GOVERNED_SCHEMAS.some((schema) => !schemas.has(schema))) fail("RECOVERY_TARGET_SCHEMA_MISSING", "Target is missing a governed schema");
  if (requiredExtensions.some((name) => !extensions.has(name))) fail("RECOVERY_TARGET_EXTENSION_MISSING", "Target is missing a required extension");
  if (targetState.bucket?.id !== "godel-files" || targetState.bucket?.public !== false) fail("RECOVERY_TARGET_BUCKET_INVALID", "Target godel-files bucket must exist and be private");
  return Object.freeze({ status: "PASS", migrationCount: 6, schemas: GOVERNED_SCHEMAS, bucket: "PRIVATE" });
}
