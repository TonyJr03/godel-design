import assert from "node:assert/strict";
import test from "node:test";

import { admitManagedDataSql, classifyManagedSqlArtifacts, MANAGED_SQL_CLASSIFICATIONS } from "./sql-admission.mjs";
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
