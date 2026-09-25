import assert from "node:assert/strict";
import test from "node:test";

import { MANAGED_BASELINE_MIGRATIONS } from "./runtime-authority.mjs";
import { auditManagedSchemaSql, auditMigrationHistorySql, auditRolesSql, validateTargetBaseline } from "./sql-audit.mjs";

const VERSIONS = MANAGED_BASELINE_MIGRATIONS.map((name) => name.slice(0, 14));
const SCHEMA = [
  "CREATE SCHEMA public;", "CREATE SCHEMA private;", "CREATE SCHEMA auth;", "CREATE SCHEMA storage;", "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
  "CREATE TABLE public.example (id uuid);", "CREATE TABLE private.audit (id uuid);", "CREATE TABLE auth.users (id uuid);", "CREATE TABLE storage.objects (id uuid);",
].join("\n");
const HISTORY_SCHEMA = "CREATE TABLE supabase_migrations.schema_migrations (version text);\n";
const HISTORY_DATA = `COPY supabase_migrations.schema_migrations (version) FROM stdin;\n${VERSIONS.join("\n")}\n\\.\n`;

test("audit-only SQL accepts governed role/schema/history dialect without executing it", () => {
  assert.equal(auditRolesSql("CREATE ROLE authenticator;\nALTER ROLE authenticator WITH LOGIN NOSUPERUSER;\n").status, "PASS");
  assert.deepEqual(auditManagedSchemaSql(SCHEMA, { requiredExtensions: ["pgcrypto"] }).schemas, ["auth", "private", "public", "storage"]);
  assert.deepEqual(auditMigrationHistorySql({ schemaSql: HISTORY_SCHEMA, dataSql: HISTORY_DATA, baselineVersions: VERSIONS }).versions, [...VERSIONS].sort());
});

test("roles audit rejects passwords and unexpected statements", () => {
  assert.throws(() => auditRolesSql("ALTER ROLE postgres PASSWORD 'secret';"), { code: "RECOVERY_ROLES_CREDENTIAL_MATERIAL" });
  assert.throws(() => auditRolesSql("DROP ROLE postgres;"), { code: "RECOVERY_ROLES_DIALECT_UNEXPECTED" });
});

test("schema and history audits reject unexpected authority and version mismatch", () => {
  assert.throws(() => auditManagedSchemaSql(`${SCHEMA}\nCREATE SCHEMA foreign;`, { requiredExtensions: ["pgcrypto"] }), { code: "RECOVERY_SCHEMA_UNEXPECTED" });
  assert.throws(() => auditManagedSchemaSql(`${SCHEMA}\nCREATE EXTENSION unsafe;`, { requiredExtensions: ["pgcrypto"] }), { code: "RECOVERY_EXTENSION_UNEXPECTED" });
  assert.throws(() => auditMigrationHistorySql({ schemaSql: HISTORY_SCHEMA, dataSql: HISTORY_DATA.replace(VERSIONS[5], "20260811131899"), baselineVersions: VERSIONS }), { code: "RECOVERY_MIGRATION_HISTORY_MISMATCH" });
  assert.throws(() => auditMigrationHistorySql({ schemaSql: HISTORY_SCHEMA, dataSql: `${HISTORY_DATA}DELETE FROM supabase_migrations.schema_migrations;`, baselineVersions: VERSIONS }), { code: "RECOVERY_MIGRATION_HISTORY_DATA_INVALID" });
});

test("baseline gate requires exact versions, extension, schemas and private bucket", () => {
  const authority = { evidence: { versions: VERSIONS } };
  const targetState = { migrationVersions: VERSIONS, schemas: ["public", "private", "auth", "storage"], extensions: ["pgcrypto"], bucket: { id: "godel-files", public: false } };
  assert.equal(validateTargetBaseline({ authority, targetState }).status, "PASS");
  assert.throws(() => validateTargetBaseline({ authority, targetState: { ...targetState, migrationVersions: VERSIONS.slice(0, 5) } }), { code: "RECOVERY_TARGET_BASELINE_MISMATCH" });
  assert.throws(() => validateTargetBaseline({ authority, targetState: { ...targetState, extensions: [] } }), { code: "RECOVERY_TARGET_EXTENSION_MISSING" });
  assert.throws(() => validateTargetBaseline({ authority, targetState: { ...targetState, schemas: ["public", "auth", "storage"] } }), { code: "RECOVERY_TARGET_SCHEMA_MISSING" });
  assert.throws(() => validateTargetBaseline({ authority, targetState: { ...targetState, bucket: { id: "godel-files", public: true } } }), { code: "RECOVERY_TARGET_BUCKET_INVALID" });
});

export { HISTORY_DATA, HISTORY_SCHEMA, SCHEMA, VERSIONS };
