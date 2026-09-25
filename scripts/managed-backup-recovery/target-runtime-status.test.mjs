import assert from "node:assert/strict";
import test from "node:test";

import { accessLocalSupabaseStatus, admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

function fixture(overrides = {}) {
  return JSON.stringify({
    API_URL: "http://127.0.0.1:54321",
    DB_URL: "postgresql://postgres:confidential@127.0.0.1:54322/postgres",
    ANON_KEY: "local-anon-confidential",
    SERVICE_ROLE_KEY: "local-service-role-confidential",
    STORAGE_S3_URL: "http://localhost:54321/storage/v1/s3",
    S3_PROTOCOL_ACCESS_KEY_ID: "local-access-confidential",
    S3_PROTOCOL_ACCESS_KEY_SECRET: "local-secret-confidential",
    S3_PROTOCOL_REGION: "local",
    ...overrides,
  });
}

test("raw local Supabase status becomes an opaque sanitized admission", () => {
  const admitted = admitLocalSupabaseStatus(fixture());
  assert.deepEqual(JSON.parse(JSON.stringify(admitted)), {
    status: "ADMITTED", apiEndpoint: "LOCAL_LOOPBACK", dbHost: "LOCAL_LOOPBACK", storageS3Endpoint: "LOCAL_LOOPBACK",
    requiredServices: { api: true, database: true, storageS3: true },
  });
  const publicText = JSON.stringify(admitted);
  for (const secret of ["confidential", "54321", "54322", "postgresql://"]) assert.ok(!publicText.includes(secret));
  accessLocalSupabaseStatus(admitted, (status) => assert.equal(status.S3_PROTOCOL_REGION, "local"));
});

test("local Supabase status rejects remote, linked, missing-secret, and malformed output without echoing raw values", () => {
  for (const raw of [
    fixture({ API_URL: "https://production-secret.invalid" }),
    fixture({ LINKED_PROJECT_REF: "production-secret" }),
    fixture({ SERVICE_ROLE_KEY: "" }),
    "{production-secret",
  ]) {
    assert.throws(() => admitLocalSupabaseStatus(raw), (error) => !error.message.includes("production-secret"));
  }
});
