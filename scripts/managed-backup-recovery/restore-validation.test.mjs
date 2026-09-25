import assert from "node:assert/strict";
import test from "node:test";

import { buildMutableTablePlan } from "./restore-planning.mjs";
import {
  accessPostRestoreValidationSql,
  buildPostRestoreValidationQueries,
  canonicalField,
  canonicalRecord,
  createFutureLoginGateContract,
  deriveConfidentialAuthExpectation,
  deriveConfidentialAuthExpectationFromAdmission,
  deriveStorageExpectation,
  digestCanonicalRecords,
  parsePostRestoreValidationOutputs,
  validateManagedRestoreResult,
} from "./restore-validation.mjs";
import { admitManagedDataSql } from "./sql-admission.mjs";

const VERSIONS = ["20260811131824", "20260811131825", "20260811131826", "20260811131827", "20260811131828", "20260811131829"];
const SQL = [
  "COPY auth.users (id, encrypted_password) FROM stdin;", "user-1\tsensitive-hash", "\\.",
  "COPY auth.identities (id, user_id) FROM stdin;", "identity-1\tuser-1", "\\.",
  "COPY public.perfiles (id) FROM stdin;", "user-1", "\\.", "",
].join("\n");

function fixture() {
  const admission = admitManagedDataSql(SQL);
  const mutablePlan = buildMutableTablePlan({ admission, targetTables: [
    "auth.users", "auth.identities", "auth.sessions", "auth.schema_migrations", "storage.buckets", "storage.objects", "storage.migrations", "public.perfiles",
  ] });
  const auth = deriveConfidentialAuthExpectationFromAdmission(admission);
  const storage = deriveStorageExpectation({ valid: true, objectCount: 0, totalBytes: 0, objects: [] });
  const plan = buildPostRestoreValidationQueries({ mutablePlan, runtimeVersions: VERSIONS, storageExpectation: storage });
  const outputs = {
    tableCounts: ["1\n", "1\n", "1\n"],
    migrationHistory: `${VERSIONS.join("\n")}\n`,
    replicationRole: "origin\n",
    auth: JSON.stringify({ ...auth, relationshipsValid: true, ephemeralStateAbsent: true }),
    constraints: JSON.stringify({ invalidConstraintCount: 0, disabledTriggerCount: 0, privateAuditTableCount: 2 }),
    storageMetadata: JSON.stringify({ bucketExists: true, bucketPublic: false, objectCount: 0, unexpectedObjectCount: 0 }),
    storageInventory: { objectCount: 0, totalBytes: 0, inventoryDigest: storage.inventoryDigest, unexpectedObjectCount: 0 },
  };
  const expected = { tableCounts: { "auth.users": 1, "auth.identities": 1, "public.perfiles": 1 }, auth, storage };
  return { admission, auth, storage, plan, outputs, expected };
}

test("canonical Node records are length-prefixed and Auth SQL implements the same unambiguous shape without PII", () => {
  assert.equal(canonicalField("a:b"), "S3:a:b");
  assert.equal(canonicalRecord(["a", "bc"]), "S1:aS2:bc");
  assert.notEqual(canonicalRecord(["a", "bc"]), canonicalRecord(["ab", "c"]));
  assert.equal(digestCanonicalRecords([["b"], ["a"]]), digestCanonicalRecords([["a"], ["b"]]));
  const { plan } = fixture();
  accessPostRestoreValidationSql(plan.auth, (sql) => {
    assert.match(sql, /octet_length\(canonical_record\).*ORDER BY canonical_record/s);
    assert.match(sql, /auth\.identities/);
    assert.match(sql, /\bid\b.*\buser_id\b/s);
    for (const confidential of ["user-1", "identity-1", "sensitive-hash"]) assert.ok(!sql.includes(confidential));
  });
});

test("real read-only validation plans are governed by the admitted mutable/catalog handles", () => {
  const { plan } = fixture();
  assert.equal(plan.tableCounts.length, 3);
  assert.equal(plan.ephemeralCatalog.presentCount, 1);
  for (const query of [plan.migrationHistory, plan.replicationRole, plan.auth, plan.constraints, plan.storageMetadata, ...plan.tableCounts]) {
    accessPostRestoreValidationSql(query, (sql) => {
      assert.match(sql, /^(?:SELECT|SHOW|WITH)\b/);
      assert.doesNotMatch(sql, /confidential-.*-plan|governed-constraint-and-trigger-plan/);
    });
  }
  assert.throws(() => buildPostRestoreValidationQueries({ mutablePlan: {}, runtimeVersions: VERSIONS, storageExpectation: {} }));
});

test("synthetic SQL outputs parse to sanitized actual aggregates and validate PASS", () => {
  const { plan, outputs, expected } = fixture();
  const actual = parsePostRestoreValidationOutputs({ plan, outputs });
  assert.equal(validateManagedRestoreResult({ expected, actual }).status, "PASS");
  const text = JSON.stringify(actual);
  for (const confidential of ["user-1", "identity-1", "sensitive-hash"]) assert.ok(!text.includes(confidential));
});

test("identity UUID, password, profile relation, and ephemeral residue fail their gates", () => {
  const { plan, outputs, expected } = fixture();
  const variants = [
    [{ ...JSON.parse(outputs.auth), identityPairDigest: "b".repeat(64) }, "RECOVERY_AUTH_CONTINUITY_FAILED"],
    [{ ...JSON.parse(outputs.auth), passwordDigest: "b".repeat(64) }, "RECOVERY_AUTH_PASSWORD_CONTINUITY_FAILED"],
    [{ ...JSON.parse(outputs.auth), relationshipsValid: false }, "RECOVERY_AUTH_RELATION_INVALID"],
    [{ ...JSON.parse(outputs.auth), ephemeralStateAbsent: false }, "RECOVERY_AUTH_EPHEMERAL_STATE_PRESENT"],
  ];
  for (const [auth, code] of variants) {
    const actual = parsePostRestoreValidationOutputs({ plan, outputs: { ...outputs, auth: JSON.stringify(auth) } });
    assert.throws(() => validateManagedRestoreResult({ expected, actual }), { code });
  }
});

test("constraint and disabled-trigger aggregate failures remain visible", () => {
  const { plan, outputs, expected } = fixture();
  for (const structural of [
    { invalidConstraintCount: 1, disabledTriggerCount: 0, privateAuditTableCount: 2 },
    { invalidConstraintCount: 0, disabledTriggerCount: 1, privateAuditTableCount: 2 },
  ]) {
    const actual = parsePostRestoreValidationOutputs({ plan, outputs: { ...outputs, constraints: JSON.stringify(structural) } });
    assert.throws(() => validateManagedRestoreResult({ expected, actual }), { code: "RECOVERY_DB_VALIDATION_FAILED" });
  }
});

test("unexpected local Storage aggregate fails the final restore gate", () => {
  const { plan, outputs, expected } = fixture();
  const actual = parsePostRestoreValidationOutputs({ plan, outputs: { ...outputs, storageInventory: { ...outputs.storageInventory, unexpectedObjectCount: 1 } } });
  assert.throws(() => validateManagedRestoreResult({ expected, actual }), { code: "RECOVERY_STORAGE_VALIDATION_FAILED" });
});

test("confidential expectations include identity UUID and reject orphan relationships", () => {
  const one = deriveConfidentialAuthExpectation({ users: [{ id: "user-1", encryptedPassword: "hash" }], identities: [{ id: "identity-1", userId: "user-1" }], profileIds: ["user-1"] });
  const two = deriveConfidentialAuthExpectation({ users: [{ id: "user-1", encryptedPassword: "hash" }], identities: [{ id: "identity-2", userId: "user-1" }], profileIds: ["user-1"] });
  assert.notEqual(one.identityPairDigest, two.identityPairDigest);
  assert.throws(() => deriveConfidentialAuthExpectation({ users: [{ id: "user-1", encryptedPassword: "hash" }], identities: [{ id: "identity", userId: "missing" }], profileIds: ["user-1"] }), { code: "RECOVERY_AUTH_RELATION_INVALID" });
});

test("login gate contract remains not executed and forbids persisted credential transports", () => {
  const contract = createFutureLoginGateContract();
  assert.equal(contract.status, "NOT_EXECUTED");
  assert.equal(contract.credentialTransport, "INTERACTIVE_MEMORY_ONLY");
  assert.deepEqual(contract.forbiddenTransports, ["environment", "argv", "file", "logs", "evidence"]);
  assert.equal(contract.closeEligible, false);
});
