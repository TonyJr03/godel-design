import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { admitManagedDataSql } from "./sql-admission.mjs";
import { accessAuthorizedStorageByteEntries, accessManagedRestoreSql, authorizeStorageByteRestore, buildManagedRestoreSql, buildMutableTablePlan, buildStorageByteRestorePlan, sanitizeEphemeralAuthState, verifyManagedDataCounts } from "./restore-planning.mjs";

const PERSISTENT = [
  "COPY auth.users (id, encrypted_password) FROM stdin;",
  "11111111-1111-4111-8111-111111111111\thash-sensitive",
  "\\.",
  "COPY public.perfiles (id) FROM stdin;",
  "11111111-1111-4111-8111-111111111111",
  "\\.",
].join("\n");

function source(ephemeral = false) {
  return `${PERSISTENT}\n${ephemeral ? "COPY auth.sessions (id) FROM stdin;\nsession-sensitive\n\\.\n" : ""}`;
}

test("mutable plan admits existing persistent tables and excludes ephemeral Auth tables", () => {
  const admission = admitManagedDataSql(source(true));
  const plan = buildMutableTablePlan({ admission, targetTables: ["auth.users", "auth.sessions", "auth.schema_migrations", "storage.migrations", "public.perfiles"] });
  assert.deepEqual(plan.mutableTables, ["auth.users", "public.perfiles"]);
  assert.deepEqual(plan.truncateTables, ["auth.users", "public.perfiles"]);
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

test("managed COPY row counts must agree exactly with manifest table counts", () => {
  const admission = admitManagedDataSql(source(true));
  assert.equal(verifyManagedDataCounts({ admission, manifestTableCounts: [
    { schema: "auth", name: "sessions", rowCount: 1 }, { schema: "auth", name: "users", rowCount: 1 }, { schema: "public", name: "perfiles", rowCount: 1 },
  ] }).status, "PASS");
  assert.throws(() => verifyManagedDataCounts({ admission, manifestTableCounts: [{ schema: "auth", name: "users", rowCount: 2 }] }), { code: "RECOVERY_MANAGED_DATA_COUNTS_MISMATCH" });
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

test("restore stdin uses replica locally, exact admitted truncation, and no transaction statements", () => {
  const admission = admitManagedDataSql(source());
  const plan = buildMutableTablePlan({ admission, targetTables: admission.mutableTables });
  const sanitized = sanitizeEphemeralAuthState({ admission, mutablePlan: plan });
  const handle = buildManagedRestoreSql({ mutablePlan: plan, sanitized });
  accessManagedRestoreSql(handle, (sql) => {
    assert.match(sql, /^SET LOCAL session_replication_role = replica;/);
    assert.match(sql, /TRUNCATE TABLE "auth"\."users", "public"\."perfiles" CASCADE;/);
    assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT|ROLLBACK)\s*;/im);
    assert.ok(!sql.includes("arbitrary_table"));
  });
});

test("zero-object Storage produces a validated no-op and never authorizes transfer", () => {
  const plan = buildStorageByteRestorePlan({ storageInventory: { valid: true, objectCount: 0, totalBytes: 0, objects: [] }, bundleRoot: "C:\\bundle" });
  assert.equal(plan.status, "VALIDATED_NO_OP");
  const authorized = authorizeStorageByteRestore(plan, { status: "PASS", bucket: "godel-files", public: false, objectCount: 0 });
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
    const handle = authorizeStorageByteRestore(plan, { status: "PASS", bucket: "godel-files", public: false, objectCount: 1 });
    accessAuthorizedStorageByteEntries(handle, (entries) => {
      assert.equal(entries[0].source, join(root, "storage", "orders", "a.pdf"));
      assert.equal(entries[0].destination, "godel-files/orders/a.pdf");
      assert.equal(entries[0].sha256, "a".repeat(64));
    });
  } finally { await rm(root, { recursive: true, force: true }); }
});
