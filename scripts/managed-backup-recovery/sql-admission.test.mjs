import assert from "node:assert/strict";
import test from "node:test";

import {
  admitManagedDataSql,
  classifyManagedSqlArtifacts,
  classifyUnsupportedManagedDataStatement,
  MANAGED_SQL_CLASSIFICATIONS,
} from "./sql-admission.mjs";
import { VALID_MANAGED_DATA_SQL, createValidBundleFixture } from "./test-helpers.mjs";

test("all five SQL artifacts receive their exact non-executing classification", async () => {
  const fixture = await createValidBundleFixture();
  const result = await classifyManagedSqlArtifacts(fixture.root);
  assert.deepEqual(result.classifications, MANAGED_SQL_CLASSIFICATIONS);
  assert.equal(result.managedData.status, "ADMITTED");
  assert.deepEqual(result.managedData.mutableTables, ["auth.identities", "auth.users", "public.perfiles"]);
  assert.equal(result.managedData.ephemeralAuthState, "EXCLUDED");
});

test("managed data admission accepts only the governed COPY/session/setval subset", () => {
  const source = `${VALID_MANAGED_DATA_SQL}SELECT pg_catalog.setval('public.example_id_seq'::regclass, 1, true);\n`;
  const result = admitManagedDataSql(source);
  assert.equal(result.status, "ADMITTED");
  assert.equal(result.sequenceCount, 1);
  assert.equal(result.mutableTableCount, 3);
});

test("managed data admission accepts the exact Supabase CLI data wrapper as transport metadata", () => {
  const source = [
    "-- Supabase CLI data-only wrapper",
    "SET session_replication_role = replica;",
    VALID_MANAGED_DATA_SQL.trimEnd(),
    "RESET ALL;",
    "-- wrapper end",
    "",
  ].join("\n");
  const result = admitManagedDataSql(source);
  assert.equal(result.status, "ADMITTED");
  assert.equal(result.mutableTableCount, 3);
  assert.equal(result.sequenceCount, 0);
  assert.deepEqual(result.mutableTables, ["auth.identities", "auth.users", "public.perfiles"]);
  assert.ok(!JSON.stringify(result).includes("session_replication_role"));
});

test("managed data admission detects ephemeral Auth state without exposing rows", () => {
  const source = [
    "COPY auth.users (id) FROM stdin;",
    "user-sensitive-value",
    "\\.",
    "COPY auth.sessions (id) FROM stdin;",
    "session-sensitive-value",
    "\\.",
    "",
  ].join("\n");
  const result = admitManagedDataSql(source);
  assert.equal(result.ephemeralAuthState, "PRESENT_REQUIRES_SANITIZATION");
  assert.equal(result.ephemeralAuthTableCount, 1);
  assert.ok(!JSON.stringify(result).includes("sensitive-value"));
});

const forbidden = [
  "CREATE TABLE public.bad (id int);",
  "ALTER TABLE public.bad ADD COLUMN value text;",
  "DROP TABLE public.bad;",
  "GRANT SELECT ON public.bad TO anon;",
  "REVOKE SELECT ON public.bad FROM anon;",
  "CREATE ROLE attacker;",
  "ALTER ROLE postgres PASSWORD 'unsafe';",
  "CREATE EXTENSION unsafe;",
  "COPY public.bad TO PROGRAM 'unsafe';",
  "\\include unsafe.sql",
  "\\i unsafe.sql",
  "\\copy public.bad FROM 'unsafe'",
  "BEGIN;",
  "COMMIT;",
  "SET ROLE postgres;",
  "VACUUM;",
];

for (const statement of forbidden) {
  test(`managed data admission rejects forbidden or unknown statement: ${statement.split(" ")[0]}`, () => {
    assert.throws(() => admitManagedDataSql(`${VALID_MANAGED_DATA_SQL}${statement}\n`));
  });
}

test("unsupported managed data statements receive only bounded safe classifications", () => {
  const cases = [
    ["SET default_tablespace = '';", { statementClass: "SET_PARAMETER", parameter: "default_tablespace" }],
    ["SET default_table_access_method = heap;", { statementClass: "SET_PARAMETER", parameter: "default_table_access_method" }],
    ["SELECT pg_catalog.setval('private.sequence', 1);", { statementClass: "SELECT_PG_CATALOG_SETVAL_VARIANT" }],
    ["SELECT email FROM private.people;", { statementClass: "SELECT_OTHER" }],
    ["INSERT INTO private.people VALUES ('sensitive');", { statementClass: "INSERT" }],
    ["UPDATE private.people SET email = 'sensitive';", { statementClass: "UPDATE" }],
    ["DELETE FROM private.people;", { statementClass: "DELETE" }],
    ["BEGIN;", { statementClass: "TRANSACTION_CONTROL" }],
    ["VACUUM private.people;", { statementClass: "OTHER_SQL" }],
  ];
  for (const [source, expected] of cases) assert.deepEqual(classifyUnsupportedManagedDataStatement(source), expected);
  for (const keyword of ["ALTER", "CREATE", "DROP", "TRUNCATE", "GRANT", "REVOKE"]) {
    assert.deepEqual(classifyUnsupportedManagedDataStatement(`${keyword} sensitive raw identifiers`), { statementClass: "DDL" });
  }
  const serialized = JSON.stringify(cases.map(([source]) => classifyUnsupportedManagedDataStatement(source)));
  for (const forbiddenValue of ["private", "people", "sensitive", "email", "sequence"]) assert.ok(!serialized.includes(forbiddenValue));
});

test("forbidden admission errors expose only safe classifier metadata", () => {
  const secret = "secret-value@example.test";
  assert.throws(
    () => admitManagedDataSql(`${VALID_MANAGED_DATA_SQL}SET default_tablespace = '${secret}';\n`),
    (error) => {
      assert.equal(error.code, "RECOVERY_SQL_STATEMENT_FORBIDDEN");
      assert.equal(error.statementClass, "SET_PARAMETER");
      assert.equal(error.parameter, "default_tablespace");
      assert.deepEqual(Object.keys(error).sort(), ["code", "name", "parameter", "statementClass"]);
      assert.ok(!JSON.stringify(error).includes(secret));
      return true;
    },
  );
});

const forbiddenReplicationRoleVariants = [
  "SET session_replication_role = origin;",
  "SET session_replication_role = local;",
  "SET session_replication_role = 'replica';",
  "SET LOCAL session_replication_role = replica;",
  "SET SESSION session_replication_role = replica;",
  "SET session_replication_role TO replica;",
  "RESET session_replication_role;",
  "RESET ALL;",
];

for (const statement of forbiddenReplicationRoleVariants) {
  test(`managed data admission rejects replication-role wrapper variant: ${statement}`, () => {
    assert.throws(
      () => admitManagedDataSql(`${VALID_MANAGED_DATA_SQL}${statement}\n`),
      { code: "RECOVERY_SQL_STATEMENT_FORBIDDEN" },
    );
  });
}

test("managed data admission rejects incomplete, duplicate, or misplaced Supabase wrappers", () => {
  const prefix = "SET session_replication_role = replica;";
  const suffix = "RESET ALL;";
  const valid = VALID_MANAGED_DATA_SQL.trimEnd();
  const invalid = [
    [prefix, prefix, valid, suffix, ""],
    [prefix, valid, suffix, suffix, ""],
    [prefix, valid, ""],
    [valid, suffix, ""],
    ["SET statement_timeout = 0;", prefix, valid, suffix, ""],
    [prefix, suffix, valid, ""],
    [prefix, valid, suffix, "SET statement_timeout = 0;", ""],
  ];
  for (const lines of invalid) {
    assert.throws(
      () => admitManagedDataSql(lines.join("\n")),
      { code: "RECOVERY_SQL_STATEMENT_FORBIDDEN" },
    );
  }
});
