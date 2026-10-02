import assert from "node:assert/strict";
import test from "node:test";

import { MANAGED_BASELINE_MIGRATIONS } from "./runtime-authority.mjs";
import {
  auditManagedSchemaSql,
  auditMigrationHistorySql,
  auditRolesSql,
  classifyUnexpectedRolesSql,
  ROLE_SQL_STATEMENT_CLASSES,
  validateTargetBaseline,
} from "./sql-audit.mjs";

const VERSIONS = MANAGED_BASELINE_MIGRATIONS.map((name) => name.slice(0, 14));
const SCHEMA = [
  "CREATE SCHEMA public;", "CREATE SCHEMA private;", "CREATE SCHEMA auth;", "CREATE SCHEMA storage;", "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
  "CREATE TABLE public.example (id uuid);", "CREATE TABLE private.audit (id uuid);", "CREATE TABLE auth.users (id uuid);", "CREATE TABLE storage.objects (id uuid);",
].join("\n");
const HISTORY_SCHEMA = "CREATE TABLE supabase_migrations.schema_migrations (version text);\n";
const HISTORY_DATA = `SET session_replication_role = replica;\n\nCOPY supabase_migrations.schema_migrations (version) FROM stdin;\n${VERSIONS.join("\n")}\n\\.\n\nRESET ALL;\n`;

test("audit-only SQL accepts governed role/schema/history dialect without executing it", () => {
  assert.equal(auditRolesSql("CREATE ROLE authenticator;\nALTER ROLE authenticator WITH LOGIN NOSUPERUSER;\n").status, "PASS");
  assert.deepEqual(auditManagedSchemaSql(SCHEMA, { requiredExtensions: ["pgcrypto"] }).schemas, ["auth", "private", "public", "storage"]);
  assert.deepEqual(auditMigrationHistorySql({ schemaSql: HISTORY_SCHEMA, dataSql: HISTORY_DATA, baselineVersions: VERSIONS }).versions, [...VERSIONS].sort());
});

test("migration history audit admits the exact Supabase CLI 2.109.1 wrapper as audit-only", () => {
  const result = auditMigrationHistorySql({
    schemaSql: HISTORY_SCHEMA,
    dataSql: HISTORY_DATA,
    baselineVersions: VERSIONS,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.treatment, "AUDIT_ONLY");
  assert.deepEqual(result.versions, [...VERSIONS].sort());
});

test("roles audit rejects passwords and unexpected statements", () => {
  assert.throws(() => auditRolesSql("ALTER ROLE postgres PASSWORD 'secret';"), { code: "RECOVERY_ROLES_CREDENTIAL_MATERIAL" });
  assert.throws(() => auditRolesSql("DROP ROLE postgres;"), { code: "RECOVERY_ROLES_DIALECT_UNEXPECTED" });
});

test("roles diagnostic leaves the current admitted grammar unchanged", () => {
  const source = [
    "-- admitted role dump",
    "SET client_encoding = 'UTF8';",
    "SELECT pg_catalog.set_config('search_path', '', false);",
    'CREATE ROLE "authenticator";',
    'ALTER ROLE "authenticator" WITH LOGIN NOSUPERUSER;',
    'GRANT "reader" TO "authenticator" WITH ADMIN OPTION;',
    "",
  ].join("\r\n");
  assert.equal(auditRolesSql(source).status, "PASS");
  assert.deepEqual(classifyUnexpectedRolesSql(source), { status: "PASS", unexpectedStatementCount: 0, classes: [] });
});

test("roles audit admits only the exact remediated Supabase and PostgreSQL 17 dialect", () => {
  const source = [
    "RESET ALL;",
    'ALTER ROLE "role-a" SET "statement_timeout" TO \'5s\';',
    'ALTER ROLE "role-a" SET "session_replication_role" TO \'replica\';',
    'ALTER ROLE "role-a" SET "track_io_timing" TO \'on\';',
    'ALTER ROLE "role-a" SET "pgaudit.log" TO \'write\';',
    'ALTER ROLE "role-a" SET "pgaudit.log" TO \'write\'\'ddl\';',
    'ALTER ROLE "role-a" SET "pgrst.db_schemas" TO \'public\', \'private\';',
    'GRANT SET ON PARAMETER "x" TO "role-a";',
    'GRANT ALTER SYSTEM ON PARAMETER "x" TO "role-a";',
    'GRANT ALL ON PARAMETER "x" TO "role-a";',
    'GRANT SET, ALTER SYSTEM ON PARAMETER "x" TO "role-a";',
    'GRANT SET ON PARAMETER "x" TO "role-a" WITH GRANT OPTION;',
    'GRANT ALL ON PARAMETER "x" TO PUBLIC WITH GRANT OPTION;',
    'REVOKE SET ON PARAMETER "x" FROM "role-a";',
    'REVOKE ALTER SYSTEM ON PARAMETER "x" FROM "role-a";',
    'REVOKE ALL ON PARAMETER "x" FROM PUBLIC;',
    "",
  ].join("\n");
  const audit = auditRolesSql(source);
  assert.equal(audit.status, "PASS");
  assert.equal(audit.treatment, "AUDIT_ONLY");
  assert.equal(audit.statementCount, 16);
  assert.deepEqual(classifyUnexpectedRolesSql(source), { status: "PASS", unexpectedStatementCount: 0, classes: [] });
});

test("roles audit rejects non-contractual reset, config, parameter ACL, and role variants", () => {
  const cases = [
    ["RESET statement_timeout;", "OTHER_ROLE_SQL"],
    ["RESET SESSION AUTHORIZATION;", "OTHER_ROLE_SQL"],
    ['ALTER ROLE "role-a" SET "pgrst." TO \'hidden\';', "ALTER_ROLE_SET_OTHER_CONFIG"],
    ['ALTER ROLE "role-a" SET "pgaudit." TO \'hidden\';', "ALTER_ROLE_SET_OTHER_CONFIG"],
    ['ALTER ROLE "role-a" SET "work_mem" TO \'hidden\';', "ALTER_ROLE_SET_OTHER_CONFIG"],
    ['ALTER ROLE "role-a" SET "statement_timeout" TO now();', "ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG"],
    ['ALTER ROLE "role-a" SET "statement_timeout" TO $$hidden$$;', "ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG"],
    ['ALTER ROLE "role-a" SET "statement_timeout" TO \'x\'; DROP ROLE "role-b";', "ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG"],
    ['GRANT "role-a" TO "member-a"\n  WITH ADMIN OPTION, INHERIT TRUE, SET FALSE\n  GRANTED BY "grantor-a";', "GRANT_ROLE_MEMBERSHIP_VARIANT"],
    ['GRANT CREATE ON PARAMETER "x" TO "role-a";', "ROLE_PARAMETER_PRIVILEGE_VARIANT"],
    ['GRANT EXECUTE ON PARAMETER "x" TO "role-a";', "ROLE_PARAMETER_PRIVILEGE_VARIANT"],
    ['GRANT ALTER SYSTEM, SET ON PARAMETER "x" TO "role-a";', "ROLE_PARAMETER_PRIVILEGE_VARIANT"],
    ['REVOKE SET ON PARAMETER "x" FROM "role-a" WITH GRANT OPTION;', "ROLE_PARAMETER_PRIVILEGE_VARIANT"],
    ['GRANT SET ON PARAMETER "x" TO "role-a" GRANTED BY "grantor-a";', "ROLE_PARAMETER_PRIVILEGE_VARIANT"],
    ['GRANT SET ON PARAMETER "x" TO "role-a" WITH ADMIN OPTION;', "ROLE_PARAMETER_PRIVILEGE_VARIANT"],
    ['GRANT SET ON PARAMETER "x" TO "role-a" CASCADE;', "ROLE_PARAMETER_PRIVILEGE_VARIANT"],
    ['CREATE ROLE "role-a" WITH LOGIN;', "CREATE_ROLE_VARIANT"],
    ['ALTER ROLE "role-a" WITH LOGIN UNKNOWN_ATTRIBUTE;', "ALTER_ROLE_WITH_VARIANT"],
    ["SET ROLE postgres;", "SET_STATEMENT_VARIANT"],
    ['SET SESSION AUTHORIZATION "role-a";', "SET_STATEMENT_VARIANT"],
    ["DROP ROLE postgres;", "OTHER_ROLE_SQL"],
  ];
  for (const [source, statementClass] of cases) {
    assert.throws(() => auditRolesSql(source), { code: "RECOVERY_ROLES_DIALECT_UNEXPECTED" });
    assert.deepEqual(classifyUnexpectedRolesSql(source), {
      status: "FINDING",
      unexpectedStatementCount: 1,
      classes: [{ statementClass, count: 1 }],
    });
  }
  assert.deepEqual(ROLE_SQL_STATEMENT_CLASSES, [
    "RESET_ALL",
    "ALTER_ROLE_SET_SUPABASE_ALLOWED_CONFIG",
    "ALTER_ROLE_SET_OTHER_CONFIG",
    "GRANT_ROLE_MEMBERSHIP_VARIANT",
    "ROLE_PARAMETER_PRIVILEGE_VARIANT",
    "CREATE_ROLE_VARIANT",
    "ALTER_ROLE_WITH_VARIANT",
    "SET_STATEMENT_VARIANT",
    "OTHER_ROLE_SQL",
  ]);
});

test("roles diagnostic aggregates exact counts with deterministic sorting and no SQL disclosure", () => {
  const secrets = ["role-private", "member-private", "value-private"];
  const result = classifyUnexpectedRolesSql([
    `ALTER ROLE "${secrets[0]}" SET "work_mem" TO '${secrets[2]}';`,
    'GRANT EXECUTE ON PARAMETER "private-parameter" TO "private-member";',
    `ALTER ROLE "${secrets[0]}" SET "work_mem" TO '${secrets[2]}';`,
    `GRANT "${secrets[0]}" TO "${secrets[1]}" WITH INHERIT FALSE;`,
    "",
  ].join("\n"));
  assert.deepEqual(result, {
    status: "FINDING",
    unexpectedStatementCount: 4,
    classes: [
      { statementClass: "ALTER_ROLE_SET_OTHER_CONFIG", count: 2 },
      { statementClass: "GRANT_ROLE_MEMBERSHIP_VARIANT", count: 1 },
      { statementClass: "ROLE_PARAMETER_PRIVILEGE_VARIANT", count: 1 },
    ],
  });
  const serialized = JSON.stringify(result);
  for (const secret of secrets) assert.ok(!serialized.includes(secret));
  assert.ok(!serialized.includes("ALTER ROLE"));
});

test("roles diagnostic preserves credential material as a hard failure without classifications", () => {
  for (const source of [
    "ALTER ROLE postgres PASSWORD 'credential-private';",
    "ALTER ROLE postgres SET passwd TO 'credential-private';",
    "-- scram-sha-256 credential-private",
    "ALTER ROLE postgres SET work_mem TO 'md5abcdefabcdefabcdefabcdef';",
  ]) {
    assert.throws(
      () => classifyUnexpectedRolesSql(source),
      (error) => {
        assert.equal(error.code, "RECOVERY_ROLES_CREDENTIAL_MATERIAL");
        assert.deepEqual(Object.keys(error).sort(), ["code", "name"]);
        assert.equal("classes" in error, false);
        assert.ok(!JSON.stringify(error).includes("credential-private"));
        return true;
      },
    );
  }
});

test("schema and history audits reject unexpected authority and version mismatch", () => {
  assert.throws(() => auditManagedSchemaSql(`${SCHEMA}\nCREATE SCHEMA foreign;`, { requiredExtensions: ["pgcrypto"] }), { code: "RECOVERY_SCHEMA_UNEXPECTED" });
  assert.throws(() => auditManagedSchemaSql(`${SCHEMA}\nCREATE EXTENSION unsafe;`, { requiredExtensions: ["pgcrypto"] }), { code: "RECOVERY_EXTENSION_UNEXPECTED" });
  assert.throws(() => auditMigrationHistorySql({ schemaSql: HISTORY_SCHEMA, dataSql: HISTORY_DATA.replace(VERSIONS[5], "20260811131899"), baselineVersions: VERSIONS }), { code: "RECOVERY_MIGRATION_HISTORY_MISMATCH" });
  assert.throws(() => auditMigrationHistorySql({ schemaSql: HISTORY_SCHEMA, dataSql: `${HISTORY_DATA}DELETE FROM supabase_migrations.schema_migrations;`, baselineVersions: VERSIONS }), { code: "RECOVERY_MIGRATION_HISTORY_DATA_INVALID" });
});

test("migration history audit rejects RESET variants and invalid suffix positions", () => {
  const invalidData = [
    HISTORY_DATA.replace("RESET ALL;", "RESET statement_timeout;"),
    HISTORY_DATA.replace("RESET ALL;", "RESET ROLE;"),
    HISTORY_DATA.replace("RESET ALL;", "RESET SESSION AUTHORIZATION;"),
    HISTORY_DATA.replace("RESET ALL;", "RESET ALL"),
    HISTORY_DATA.replace("RESET ALL;", "reset all;"),
    HISTORY_DATA.replace("RESET ALL;\n", ""),
    HISTORY_DATA.replace("RESET ALL;", "RESET ALL;\nRESET ALL;"),
    `RESET ALL;\n${HISTORY_DATA}`,
    HISTORY_DATA.replace(VERSIONS[0], "RESET ALL;"),
    HISTORY_DATA.replace("RESET ALL;", "RESET ALL; DELETE FROM supabase_migrations.schema_migrations;"),
  ];
  for (const dataSql of invalidData) {
    assert.throws(
      () => auditMigrationHistorySql({ schemaSql: HISTORY_SCHEMA, dataSql, baselineVersions: VERSIONS }),
      { code: "RECOVERY_MIGRATION_HISTORY_DATA_INVALID" },
    );
  }
});

test("migration history audit rejects every significant statement after RESET ALL", () => {
  for (const statement of [
    "DELETE FROM supabase_migrations.schema_migrations;",
    "INSERT INTO supabase_migrations.schema_migrations VALUES ('unsafe');",
    "UPDATE supabase_migrations.schema_migrations SET version = 'unsafe';",
    "ALTER ROLE postgres WITH SUPERUSER;",
    "CREATE EXTENSION unsafe;",
  ]) {
    assert.throws(
      () => auditMigrationHistorySql({
        schemaSql: HISTORY_SCHEMA,
        dataSql: `${HISTORY_DATA}${statement}\n`,
        baselineVersions: VERSIONS,
      }),
      { code: "RECOVERY_MIGRATION_HISTORY_DATA_INVALID" },
    );
  }
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
