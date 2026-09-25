import { lstat, readFile } from "node:fs/promises";

import { resolveContainedPath } from "../managed-backup/safety.mjs";

export const MANAGED_SQL_CLASSIFICATIONS = Object.freeze({
  "database/roles.sql": "AUDIT_ONLY",
  "database/managed-schema.sql": "AUDIT_ONLY",
  "database/migration-history-schema.sql": "AUDIT_ONLY",
  "database/migration-history-data.sql": "AUDIT_ONLY",
  "database/managed-data.sql": "MUTATING_DATA_CANDIDATE",
});

const COPY_HEADER = /^COPY (?:(?:"([a-z][a-z0-9_]*)")|([a-z][a-z0-9_]*))\.(?:(?:"([a-z][a-z0-9_]*)")|([a-z][a-z0-9_]*)) \(([^)]+)\) FROM stdin;$/;
const SAFE_SCHEMAS = new Set(["auth", "private", "public", "storage"]);
const EPHEMERAL_AUTH_TABLES = new Set([
  "auth.audit_log_entries",
  "auth.flow_state",
  "auth.mfa_amr_claims",
  "auth.mfa_challenges",
  "auth.one_time_tokens",
  "auth.refresh_tokens",
  "auth.saml_relay_states",
  "auth.sessions",
  "auth.sso_sessions",
]);
const ALLOWED_SESSION_STATEMENTS = new Set([
  "SET statement_timeout = 0;",
  "SET lock_timeout = 0;",
  "SET idle_in_transaction_session_timeout = 0;",
  "SET transaction_timeout = 0;",
  "SET client_encoding = 'UTF8';",
  "SET standard_conforming_strings = on;",
  "SELECT pg_catalog.set_config('search_path', '', false);",
  "SET check_function_bodies = false;",
  "SET xmloption = content;",
  "SET client_min_messages = warning;",
  "SET row_security = off;",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoverySqlAdmissionError";
  error.code = code;
  throw error;
}

function parseColumns(source) {
  const columns = source.split(", ").map((value) => value.replace(/^"|"$/g, ""));
  if (columns.length === 0 || columns.some((value) => !/^[a-z][a-z0-9_]*$/.test(value)) || new Set(columns).size !== columns.length) {
    fail("RECOVERY_SQL_COPY_UNSUPPORTED", "Managed data COPY column list is unsupported");
  }
  return columns;
}

function validateCopyRow(line, columnCount) {
  if (line.includes("\0") || /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(line)) {
    fail("RECOVERY_SQL_COPY_UNSUPPORTED", "Managed data COPY row contains unsupported control data");
  }
  if (line.split("\t").length !== columnCount) fail("RECOVERY_SQL_COPY_INVALID", "Managed data COPY row has an invalid column count");
}

function isSetval(statement) {
  return /^SELECT pg_catalog\.setval\('[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*'::regclass, (?:0|[1-9]\d*), (?:true|false)\);$/.test(statement);
}

export function admitManagedDataSql(source) {
  if (typeof source !== "string" || source.length === 0 || source.includes("\0")) fail("RECOVERY_SQL_INVALID", "Managed data SQL must be nonempty text");
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const tables = new Set();
  let sequenceCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "" || line.startsWith("--")) continue;
    if (line.startsWith("\\")) fail("RECOVERY_SQL_META_COMMAND_FORBIDDEN", "Managed data SQL meta commands are forbidden");
    if (ALLOWED_SESSION_STATEMENTS.has(line)) continue;
    if (isSetval(line)) {
      sequenceCount += 1;
      continue;
    }
    if (!line.startsWith("COPY ")) fail("RECOVERY_SQL_STATEMENT_FORBIDDEN", "Managed data SQL contains a statement outside the admitted data-only dialect");
    const match = line.match(COPY_HEADER);
    if (!match) fail("RECOVERY_SQL_COPY_UNSUPPORTED", "Managed data COPY statement is unsupported");
    const schema = match[1] ?? match[2];
    const table = match[3] ?? match[4];
    if (!SAFE_SCHEMAS.has(schema)) fail("RECOVERY_SQL_SCHEMA_FORBIDDEN", "Managed data COPY schema is not admitted");
    const identity = `${schema}.${table}`;
    if (tables.has(identity)) fail("RECOVERY_SQL_COPY_DUPLICATE", "Managed data COPY table appears more than once");
    const columns = parseColumns(match[5]);
    let terminated = false;
    for (index += 1; index < lines.length; index += 1) {
      if (lines[index] === "\\.") {
        terminated = true;
        break;
      }
      validateCopyRow(lines[index], columns.length);
    }
    if (!terminated) fail("RECOVERY_SQL_COPY_INVALID", "Managed data COPY block is not terminated");
    tables.add(identity);
  }
  if (tables.size === 0) fail("RECOVERY_SQL_COPY_MISSING", "Managed data SQL contains no admitted COPY tables");
  const mutableTables = [...tables].sort((left, right) => left.localeCompare(right, "en"));
  const ephemeralTables = mutableTables.filter((identity) => EPHEMERAL_AUTH_TABLES.has(identity));
  return Object.freeze({
    status: "ADMITTED",
    mutableTables: Object.freeze(mutableTables),
    mutableTableCount: mutableTables.length,
    sequenceCount,
    ephemeralAuthState: ephemeralTables.length === 0 ? "EXCLUDED" : "PRESENT_REQUIRES_SANITIZATION",
    ephemeralAuthTableCount: ephemeralTables.length,
  });
}

async function readRegular(root, pathname) {
  const target = resolveContainedPath(root, pathname);
  const state = await lstat(target).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink() || state.size <= 0) fail("RECOVERY_SQL_ARTIFACT_INVALID", "Managed SQL artifact must be a nonempty regular file");
  return readFile(target, "utf8");
}

export async function classifyManagedSqlArtifacts(root) {
  const classifications = {};
  let managedData;
  for (const [pathname, classification] of Object.entries(MANAGED_SQL_CLASSIFICATIONS)) {
    const source = await readRegular(root, pathname);
    classifications[pathname] = classification;
    if (classification === "MUTATING_DATA_CANDIDATE") managedData = admitManagedDataSql(source);
  }
  return Object.freeze({ classifications: Object.freeze(classifications), managedData });
}
