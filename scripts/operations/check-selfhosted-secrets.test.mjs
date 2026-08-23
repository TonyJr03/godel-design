import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkSecretContractFiles } from "./check-selfhosted-secrets.mjs";

const TEST_TEMPLATE = `POSTGRES_PASSWORD=template-postgres-password-not-for-runtime
JWT_SECRET=template-jwt-secret-not-for-runtime-123456
ANON_KEY=template.anon.key
SERVICE_ROLE_KEY=template.service.key
SUPABASE_PUBLISHABLE_KEY=template-publishable-key-not-for-runtime
SUPABASE_SECRET_KEY=template-secret-key-not-for-runtime
DASHBOARD_PASSWORD=template-dashboard-password-not-for-runtime
SECRET_KEY_BASE=template-secret-key-base-not-for-runtime-123456789012345678901234567890
REALTIME_DB_ENC_KEY=template-realtime
VAULT_ENC_KEY=template-vault-key-not-for-runtime
PG_META_CRYPTO_KEY=template-meta-key-not-for-runtime
`;

function validSupabase(overrides = {}) {
  return {
    POSTGRES_PASSWORD: "production-postgres-password-123",
    JWT_SECRET: "production-jwt-secret-12345678901234567890",
    ANON_KEY: "header.payload.signature",
    SERVICE_ROLE_KEY: "service.payload.signature",
    SUPABASE_PUBLISHABLE_KEY: "publishable-key-production-123",
    SUPABASE_SECRET_KEY: "secret-key-production-123456",
    JWT_KEYS: '[{"kty":"EC","kid":"test"}]',
    JWT_JWKS: '{"keys":[{"kty":"EC","kid":"test"}]}',
    ANON_KEY_ASYMMETRIC: "asymmetric.anon.key",
    SERVICE_ROLE_KEY_ASYMMETRIC: "asymmetric.service.key",
    DASHBOARD_PASSWORD: "dashboard-password-production-123",
    SECRET_KEY_BASE: "a".repeat(64),
    REALTIME_DB_ENC_KEY: "realtime-key-1234",
    VAULT_ENC_KEY: "vault-key-production-123456789012",
    PG_META_CRYPTO_KEY: "meta-key-production-1234567890123",
    DISABLE_SIGNUP: "true",
    ENABLE_EMAIL_SIGNUP: "true",
    ENABLE_PHONE_SIGNUP: "false",
    ENABLE_PHONE_AUTOCONFIRM: "false",
    ENABLE_ANONYMOUS_USERS: "false",
    ...overrides,
  };
}

function validGodel(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://godel.example.invalid",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-production-123",
    SUPABASE_SERVER_URL: "http://api-gw:8000",
    SUPABASE_SECRET_KEY: "secret-key-production-123456",
    ...overrides,
  };
}

function environmentText(values) {
  return Object.entries(values).map(([name, value]) => `${name}=${value}`).join("\n") + "\n";
}

async function withFixtures(t, { supabase = {}, godel = {} }, callback) {
  const directory = await mkdtemp(join(tmpdir(), "godel-secrets-contract-"));
  const paths = {
    supabaseEnv: join(directory, "supabase.env"),
    godelEnv: join(directory, "godel.env"),
    templateEnv: join(directory, "template.env"),
  };

  await Promise.all([
    writeFile(paths.supabaseEnv, environmentText(validSupabase(supabase)), { mode: 0o600 }),
    writeFile(paths.godelEnv, environmentText(validGodel(godel)), { mode: 0o600 }),
    writeFile(paths.templateEnv, TEST_TEMPLATE, { mode: 0o600 }),
  ]);

  t.after(() => rm(directory, { recursive: true, force: true }));
  return callback(paths);
}

test("accepts a valid hardened contract", async (t) => {
  await withFixtures(t, {}, async (paths) => {
    const result = await checkSecretContractFiles(paths);
    assert.deepEqual(result.errors, []);
  });
});

test("rejects a missing core secret", async (t) => {
  await withFixtures(t, { supabase: { VAULT_ENC_KEY: "" } }, async (paths) => {
    const result = await checkSecretContractFiles(paths);
    assert.ok(result.errors.includes("VAULT_ENC_KEY is missing or empty"));
  });
});

test("rejects a known template default", async (t) => {
  await withFixtures(t, { supabase: { JWT_SECRET: "template-jwt-secret-not-for-runtime-123456" } }, async (paths) => {
    const result = await checkSecretContractFiles(paths);
    assert.ok(result.errors.includes("JWT_SECRET is using a forbidden default-like value"));
  });
});

test("rejects cross-file secret mismatch without returning values", async (t) => {
  await withFixtures(t, { godel: { SUPABASE_SECRET_KEY: "different-secret-key-production" } }, async (paths) => {
    const result = await checkSecretContractFiles(paths);
    assert.ok(result.errors.includes("SUPABASE_SECRET_KEY mismatch"));
  });
});

test("rejects public signup", async (t) => {
  await withFixtures(t, { supabase: { DISABLE_SIGNUP: "false" } }, async (paths) => {
    const result = await checkSecretContractFiles(paths);
    assert.ok(result.errors.includes("DISABLE_SIGNUP does not satisfy the Godel Auth contract"));
  });
});

test("rejects a disabled email/password provider", async (t) => {
  await withFixtures(t, { supabase: { ENABLE_EMAIL_SIGNUP: "false" } }, async (paths) => {
    const result = await checkSecretContractFiles(paths);
    assert.ok(result.errors.includes("ENABLE_EMAIL_SIGNUP does not satisfy the Godel Auth contract"));
  });
});

test("rejects phone signup", async (t) => {
  await withFixtures(t, { supabase: { ENABLE_PHONE_SIGNUP: "true" } }, async (paths) => {
    const result = await checkSecretContractFiles(paths);
    assert.ok(result.errors.includes("ENABLE_PHONE_SIGNUP does not satisfy the Godel Auth contract"));
  });
});
