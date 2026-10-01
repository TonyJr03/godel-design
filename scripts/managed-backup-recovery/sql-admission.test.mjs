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

test("managed data admission retains the exact governed legacy regclass sequence syntax", () => {
  const source = [
    VALID_MANAGED_DATA_SQL.trimEnd(),
    "SELECT pg_catalog.setval('public.example_id_seq'::regclass, -9223372036854775808, false);",
    "SELECT pg_catalog.setval('private.other_id_seq'::regclass, 9223372036854775807, true);",
    "",
  ].join("\n");
  const result = admitManagedDataSql(source);
  assert.equal(result.status, "ADMITTED");
  assert.equal(result.sequenceCount, 2);
  assert.equal(result.mutableTableCount, 3);
});

test("managed data admission accepts canonical quoted pg_dump sequence sets across governed int64 cases", () => {
  const cases = [
    "SELECT pg_catalog.setval('\"public\".\"positive_id_seq\"', 42, true);",
    "SELECT pg_catalog.setval('\"private\".\"zero_id_seq\"', 0, false);",
    "SELECT pg_catalog.setval('\"auth\".\"negative_id_seq\"', -42, true);",
    "SELECT pg_catalog.setval('\"storage\".\"minimum_id_seq\"', -9223372036854775808, false);",
    "SELECT pg_catalog.setval('\"public\".\"maximum_id_seq\"', 9223372036854775807, true);",
  ];
  for (const statement of cases) {
    const result = admitManagedDataSql(`${VALID_MANAGED_DATA_SQL}${statement}\n`);
    assert.equal(result.sequenceCount, 1);
  }
});

test("sequenceCount includes multiple canonical and governed legacy sequence sets without exposing identities", () => {
  const source = [
    VALID_MANAGED_DATA_SQL.trimEnd(),
    "SELECT pg_catalog.setval('\"public\".\"first_id_seq\"', 1, true);",
    "SELECT pg_catalog.setval('\"storage\".\"second_id_seq\"', -1, false);",
    "SELECT pg_catalog.setval('private.legacy_id_seq'::regclass, 0, true);",
    "",
  ].join("\n");
  const result = admitManagedDataSql(source);
  assert.equal(result.sequenceCount, 3);
  assert.ok(!JSON.stringify(result).includes("id_seq"));
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
    ["SELECT setval('unsafe', 1);", { statementClass: "SELECT_PG_CATALOG_SETVAL_VARIANT" }],
    ["SELECT public.setval('unsafe', 1);", { statementClass: "SELECT_PG_CATALOG_SETVAL_VARIANT" }],
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

test("managed data admission rejects canonical and legacy sequence sets outside governed schemas without disclosure", () => {
  for (const schema of ["pg_catalog", "information_schema", "supabase_migrations", "extensions", "realtime", "vault"]) {
    const statements = [
      `SELECT pg_catalog.setval('"${schema}"."sequence"', 1, true);`,
      `SELECT pg_catalog.setval('${schema}.sequence'::regclass, 1, true);`,
    ];
    for (const statement of statements) {
      assert.throws(
        () => admitManagedDataSql(`${VALID_MANAGED_DATA_SQL}${statement}\n`),
        (error) => {
          assert.equal(error.code, "RECOVERY_SQL_SEQUENCE_SCHEMA_FORBIDDEN");
          assert.deepEqual(Object.keys(error).sort(), ["code", "name"]);
          assert.ok(!error.message.includes(schema));
          return true;
        },
      );
    }
  }
});

test("managed data admission rejects every non-contractual pg_dump sequence-set variant", () => {
  const invalid = [
    "SELECT setval('\"public\".\"sequence\"', 1, true);",
    "SELECT public.setval('\"public\".\"sequence\"', 1, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1, true, false);",
    "SELECT pg_catalog.setval(pg_catalog.pg_get_serial_sequence('public.table', 'id'), 1, true);",
    "SELECT pg_catalog.setval('public.sequence', 1, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"'::regclass, 1, true);",
    "SELECT pg_catalog.setval('\"public\".\"BadSequence\"', 1, true);",
    "SELECT pg_catalog.setval('\"public\"', 1, true);",
    "SELECT pg_catalog.setval('\"public.with.dot\".\"sequence\"', 1, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence name\"', 1, true);",
    "SELECT pg_catalog.setval('\"public\".\"bad\"\"sequence\"', 1, true);",
    "SELECT pg_catalog.setval('\"public\".\"bad\\\\sequence\"', 1, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', +1, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 01, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', -0, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1.0, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1e3, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', NaN, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', Infinity, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', -9223372036854775809, true);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 9223372036854775808, true);",
    `SELECT pg_catalog.setval('"public"."sequence"', ${"9".repeat(128)}, true);`,
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1, TRUE);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1, FALSE);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1, 't');",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1, 'f');",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1, 1);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1, 0);",
    "SELECT pg_catalog.setval('\"public\".\"sequence\"', 1, NULL);",
    "SELECT pg_catalog.setval('\"public\".\"sequence'';drop_table\"', 1, true);",
  ];
  for (const statement of invalid) {
    assert.throws(
      () => admitManagedDataSql(`${VALID_MANAGED_DATA_SQL}${statement}\n`),
      (error) => {
        assert.equal(error.code, "RECOVERY_SQL_STATEMENT_FORBIDDEN");
        assert.equal(error.statementClass, "SELECT_PG_CATALOG_SETVAL_VARIANT");
        assert.ok(!JSON.stringify(error).includes("9223372036854775809"));
        return true;
      },
    );
  }
});
