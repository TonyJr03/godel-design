import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { admitManagedDataSql } from "./sql-admission.mjs";
import { auditMigrationHistorySql } from "./sql-audit.mjs";
import { accessAuthorizedStorageByteEntries, accessManagedRestoreSql, admitStorageMetadataGate, authorizeStorageByteRestore, buildManagedRestoreSql, buildMutableTablePlan, buildStorageByteRestorePlan, sanitizeEphemeralAuthState, verifyManagedDataCounts } from "./restore-planning.mjs";

function metadataGate(objectCount) {
  return admitStorageMetadataGate({ rawOutput: JSON.stringify({ bucketExists: true, bucketPublic: false, objectCount, unexpectedObjectCount: 0 }), expectedObjectCount: objectCount });
}

const PERSISTENT = [
  "COPY auth.users (id, encrypted_password) FROM stdin;",
  "11111111-1111-4111-8111-111111111111\thash-sensitive",
  "\\.",
  "COPY public.perfiles (id) FROM stdin;",
  "11111111-1111-4111-8111-111111111111",
  "\\.",
].join("\n");
const BASELINE_VERSIONS = Object.freeze([
  "20260811131824", "20260811131825", "20260811131826",
  "20260811131827", "20260811131828", "20260811131829",
]);

function migrationHistoryEvidence() {
  return auditMigrationHistorySql({
    schemaSql: "CREATE TABLE supabase_migrations.schema_migrations (version text);\n",
    dataSql: `SET session_replication_role = replica;\nCOPY supabase_migrations.schema_migrations (version) FROM stdin;\n${BASELINE_VERSIONS.join("\n")}\n\\.\nRESET ALL;\n`,
    baselineVersions: BASELINE_VERSIONS,
  });
}

function source(ephemeral = false) {
  return `${PERSISTENT}\n${ephemeral ? "COPY auth.sessions (id) FROM stdin;\nsession-sensitive\n\\.\n" : ""}`;
}

function wrappedSource(ephemeral = false) {
  return [
    "-- Supabase CLI 2.109.1 data-only wrapper",
    "SET session_replication_role = replica;",
    source(ephemeral).trimEnd(),
    "SELECT pg_catalog.setval('\"public\".\"example_id_seq\"', 9223372036854775807, true);",
    "RESET ALL;",
    "",
  ].join("\n");
}

test("mutable plan admits existing persistent tables and excludes ephemeral Auth tables", () => {
  const admission = admitManagedDataSql(source(true));
  const plan = buildMutableTablePlan({ admission, targetTables: ["auth.users", "auth.sessions", "auth.schema_migrations", "storage.migrations", "public.perfiles"] });
  assert.deepEqual(plan.mutableTables, ["auth.users", "public.perfiles"]);
  assert.deepEqual(plan.truncateTables, ["auth.sessions", "auth.users", "public.perfiles"]);
  assert.deepEqual(plan.excludedEphemeralTables, ["auth.sessions"]);
});

test("target catalog admits internal migration tables while source admission rejects them", () => {
  const admission = admitManagedDataSql(source());
  assert.throws(() => buildMutableTablePlan({ admission, targetTables: ["auth.users"] }), { code: "RECOVERY_MUTABLE_TABLE_UNKNOWN" });
  assert.equal(buildMutableTablePlan({ admission, targetTables: ["auth.users", "public.perfiles", "auth.schema_migrations", "storage.migrations"] }).status, "ADMITTED");
  for (const identity of ["auth.schema_migrations", "storage.migrations"]) {
    const forbidden = admitManagedDataSql(`COPY ${identity} (version) FROM stdin;\n1\n\\.\n`);
    assert.throws(() => buildMutableTablePlan({ admission: forbidden, targetTables: [identity] }), { code: "RECOVERY_MUTABLE_TABLE_FORBIDDEN" });
  }
  assert.throws(() => buildMutableTablePlan({ admission, targetTables: ["auth.users", "public.perfiles", "auth.users"] }), { code: "RECOVERY_TARGET_CATALOG_DUPLICATE" });
});

test("database counts reconcile exact managed data plus exact audit-only migration history", () => {
  const admission = admitManagedDataSql(source());
  const result = verifyManagedDataCounts({
    admission,
    manifestTableCounts: [
      { schema: "auth", name: "users", rowCount: 1 },
      { schema: "public", name: "perfiles", rowCount: 1 },
      { schema: "supabase_migrations", name: "schema_migrations", rowCount: 6 },
    ],
    migrationHistory: migrationHistoryEvidence(),
  });
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.tableCounts, [
    { identity: "auth.users", rowCount: 1 },
    { identity: "public.perfiles", rowCount: 1 },
  ]);
});

test("database counts reconciliation fails closed for every domain mismatch", () => {
  const admission = admitManagedDataSql(source());
  const history = migrationHistoryEvidence();
  const managed = [
    { schema: "auth", name: "users", rowCount: 1 },
    { schema: "public", name: "perfiles", rowCount: 1 },
  ];
  const historyCount = { schema: "supabase_migrations", name: "schema_migrations", rowCount: 6 };
  const mismatches = [
    [{ ...managed[0], rowCount: 2 }, managed[1], historyCount],
    [managed[0], historyCount],
    managed,
    [...managed, { ...historyCount, rowCount: 7 }],
    [...managed, historyCount, historyCount],
    [...managed, historyCount, { schema: "public", name: "unexpected_table", rowCount: 0 }],
    [...managed, historyCount, { schema: "auth", name: "schema_migrations", rowCount: 6 }],
    [...managed, historyCount, { schema: "storage", name: "migrations", rowCount: 6 }],
    [...managed, historyCount, { schema: "foreign", name: "anything", rowCount: 0 }],
    [...managed, { schema: "supabase_migrations", name: "seed_files", rowCount: 6 }],
  ];
  for (const manifestTableCounts of mismatches) {
    assert.throws(
      () => verifyManagedDataCounts({ admission, manifestTableCounts, migrationHistory: history }),
      { code: "RECOVERY_MANAGED_DATA_COUNTS_MISMATCH" },
    );
  }
});

test("database counts reconciliation rejects invalid or ungoverned migration history evidence", () => {
  const admission = admitManagedDataSql(source());
  const manifestTableCounts = [
    { schema: "auth", name: "users", rowCount: 1 },
    { schema: "public", name: "perfiles", rowCount: 1 },
    { schema: "supabase_migrations", name: "schema_migrations", rowCount: 6 },
  ];
  for (const migrationHistory of [
    null,
    { status: "FAIL", treatment: "AUDIT_ONLY", rowCount: 6 },
    { status: "PASS", treatment: "AUDIT_ONLY", rowCount: -1 },
    { status: "PASS", treatment: "AUDIT_ONLY", rowCount: 6 },
  ]) {
    assert.throws(
      () => verifyManagedDataCounts({ admission, manifestTableCounts, migrationHistory }),
      { code: "RECOVERY_MANAGED_DATA_COUNTS_INVALID" },
    );
  }
});

test("Auth sanitization removes only admitted ephemeral COPY blocks deterministically and re-admits output", () => {
  const admission = admitManagedDataSql(source(true));
  const plan = buildMutableTablePlan({ admission, targetTables: admission.mutableTables });
  const first = sanitizeEphemeralAuthState({ admission, mutablePlan: plan });
  const second = sanitizeEphemeralAuthState({ admission, mutablePlan: plan });
  assert.equal(first.ephemeralAuthState, "SANITIZED");
  assert.equal(first.persistentCopyCount, 2);
  let firstSql;
  let secondSql;
  accessManagedRestoreSql(first, (sql) => { firstSql = sql; });
  accessManagedRestoreSql(second, (sql) => { secondSql = sql; });
  assert.equal(firstSql, secondSql);
  assert.ok(firstSql.includes(PERSISTENT));
  assert.ok(!firstSql.includes("session-sensitive"));
});

test("Auth sanitization reports EXCLUDED when no ephemeral COPY exists", () => {
  const admission = admitManagedDataSql(source());
  const plan = buildMutableTablePlan({ admission, targetTables: admission.mutableTables });
  assert.equal(sanitizeEphemeralAuthState({ admission, mutablePlan: plan }).ephemeralAuthState, "EXCLUDED");
});

test("restore stdin truncates the exact admitted set before replica mode without CASCADE or transaction statements", () => {
  const admission = admitManagedDataSql(source(true));
  const plan = buildMutableTablePlan({ admission, targetTables: admission.mutableTables });
  const sanitized = sanitizeEphemeralAuthState({ admission, mutablePlan: plan });
  const handle = buildManagedRestoreSql({ mutablePlan: plan, sanitized });
  accessManagedRestoreSql(handle, (sql) => {
    assert.match(sql, /^TRUNCATE TABLE "auth"\."sessions", "auth"\."users", "public"\."perfiles";\nSET LOCAL session_replication_role = replica;/);
    assert.doesNotMatch(sql, /\bCASCADE\b/i);
    assert.ok(!sql.includes("session-sensitive"));
    assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im);
    assert.ok(!sql.includes("arbitrary_table"));
  });
  assert.equal(handle.transactionAuthority, "PSQL_SINGLE_TRANSACTION");
});

test("Supabase source wrapper is transport-only and leaves one governed restore authority", () => {
  const admission = admitManagedDataSql(wrappedSource(true));
  assert.equal(admission.sequenceCount, 1);
  const plan = buildMutableTablePlan({ admission, targetTables: admission.mutableTables });
  const sanitized = sanitizeEphemeralAuthState({ admission, mutablePlan: plan });
  accessManagedRestoreSql(sanitized, (sql) => {
    assert.ok(sql.includes("COPY auth.users (id, encrypted_password) FROM stdin;"));
    assert.ok(sql.includes("COPY public.perfiles (id) FROM stdin;"));
    assert.ok(!sql.includes("COPY auth.sessions (id) FROM stdin;"));
    assert.equal(sql.split("\n").filter((line) => line === "SET session_replication_role = replica;").length, 0);
    assert.equal(sql.split("\n").filter((line) => line === "RESET ALL;").length, 0);
    assert.equal(sql.split("\n").filter((line) => line.startsWith("SELECT pg_catalog.setval(")).length, 1);
  });
  const handle = buildManagedRestoreSql({ mutablePlan: plan, sanitized });
  accessManagedRestoreSql(handle, (sql) => {
    assert.equal(sql.split("\n").filter((line) => line === "SET session_replication_role = replica;").length, 0);
    assert.equal(sql.split("\n").filter((line) => line === "SET LOCAL session_replication_role = replica;").length, 1);
    assert.equal(sql.split("\n").filter((line) => line === "RESET ALL;").length, 0);
    assert.equal(sql.split("\n").filter((line) => line.startsWith("SELECT pg_catalog.setval(")).length, 1);
    assert.ok(sql.includes("COPY auth.users (id, encrypted_password) FROM stdin;"));
    assert.ok(sql.includes("COPY public.perfiles (id) FROM stdin;"));
  });
  assert.equal(handle.transactionAuthority, "PSQL_SINGLE_TRANSACTION");
  assert.equal(handle.sessionReplicationRole, "REPLICA_LOCAL_ONLY");
});

test("zero-object Storage produces a validated no-op and never authorizes transfer", () => {
  const plan = buildStorageByteRestorePlan({ storageInventory: { valid: true, objectCount: 0, totalBytes: 0, objects: [] }, bundleRoot: "C:\\bundle" });
  assert.equal(plan.status, "VALIDATED_NO_OP");
  assert.throws(() => authorizeStorageByteRestore(plan, { status: "PASS", bucket: "godel-files", public: false, objectCount: 0, unexpectedObjectCount: 0 }), { code: "RECOVERY_STORAGE_METADATA_GATE_FAILED" });
  const authorized = authorizeStorageByteRestore(plan, metadataGate(0));
  assert.equal(authorized.invokeTransfer, false);
  assert.throws(() => accessAuthorizedStorageByteEntries(authorized, () => undefined), { code: "RECOVERY_STORAGE_BYTE_AUTHORITY_REQUIRED" });
});

test("nonempty Storage plan is exact and remains blocked before metadata gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "godel-storage-plan-"));
  try {
    const inventory = { valid: true, objectCount: 1, totalBytes: 4, objects: [{ path: "orders/a.pdf", size: 4, sha256: "a".repeat(64) }] };
    const plan = buildStorageByteRestorePlan({ storageInventory: inventory, bundleRoot: root });
    assert.equal(plan.status, "PENDING_METADATA_GATE");
    assert.throws(() => authorizeStorageByteRestore(plan, { status: "FAIL" }), { code: "RECOVERY_STORAGE_METADATA_GATE_FAILED" });
    const handle = authorizeStorageByteRestore(plan, metadataGate(1));
    accessAuthorizedStorageByteEntries(handle, (entries) => {
      assert.equal(entries[0].source, join(root, "storage", "orders", "a.pdf"));
      assert.equal(entries[0].destination, "godel-files/orders/a.pdf");
      assert.equal(entries[0].sha256, "a".repeat(64));
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});
