import assert from "node:assert/strict";
import test from "node:test";

import { performLocalAuthLogin } from "./local-auth-login.mjs";
import { deriveLoginExpectationFromAdmission } from "./restore-validation.mjs";
import { admitManagedDataSql } from "./sql-admission.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

const USER = "11111111-1111-4111-8111-111111111111";
const admission = admitManagedDataSql(`COPY auth.users (id, encrypted_password) FROM stdin;\n${USER}\thash\n\\.\n`);
const expectation = deriveLoginExpectationFromAdmission(admission);
const status = admitLocalSupabaseStatus(JSON.stringify({ API_URL: "http://127.0.0.1:54321", DB_URL: "postgresql://postgres:secret@127.0.0.1:54322/postgres", ANON_KEY: "anon-secret", SERVICE_ROLE_KEY: "role-secret", STORAGE_S3_URL: "http://127.0.0.1:54321/storage/v1/s3", S3_PROTOCOL_ACCESS_KEY_ID: "access", S3_PROTOCOL_ACCESS_KEY_SECRET: "secret", S3_PROTOCOL_REGION: "local" }));

test("local Auth login uses no-persistence client settings and returns PASS-only evidence", async () => {
  let clientArgs;
  let loginArgs;
  const result = await performLocalAuthLogin({ localStatus: status, loginExpectation: expectation, credentials: { identifier: "person@example.invalid", password: "password" }, createSupabaseClient: (...args) => { clientArgs = args; return { auth: { signInWithPassword: async (value) => { loginArgs = value; return { data: { session: { token: "secret-token" }, user: { id: USER, email: "person@example.invalid" } }, error: null }; } } }; } });
  assert.deepEqual(result, { status: "PASS" });
  assert.deepEqual(clientArgs[2], { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  assert.deepEqual(loginArgs, { email: "person@example.invalid", password: "password" });
  for (const value of [USER, "person@example.invalid", "password", "secret-token"]) assert.ok(!JSON.stringify(result).includes(value));
});

test("local Auth login rejects failure, missing session, and user outside source authority", async () => {
  const credentials = { identifier: "person@example.invalid", password: "password" };
  for (const response of [
    { data: null, error: new Error("secret") },
    { data: { session: null, user: { id: USER } }, error: null },
    { data: { session: {}, user: { id: "22222222-2222-4222-8222-222222222222" } }, error: null },
  ]) await assert.rejects(performLocalAuthLogin({ localStatus: status, loginExpectation: expectation, credentials, createSupabaseClient: () => ({ auth: { signInWithPassword: async () => response } }) }));
});
