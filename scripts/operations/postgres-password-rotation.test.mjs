import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  POSTGRES_PASSWORD_LENGTH,
  POSTGRES_PASSWORD_POST_POINTER_BOUNDARY,
  POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION,
  POSTGRES_PASSWORD_ROTATION_REASON,
  POSTGRES_PASSWORD_ROTATION_STAGES,
  POSTGRES_ROTATED_ROLES,
  buildPostgresPasswordRotationCandidate,
  buildPostgresPasswordRotationSql,
  buildSupavisorCredentialCurlConfig,
  generatePostgresPassword,
  getPostgresPasswordPrePointerCompensation,
  isValidPostgresPassword,
  validatePostgresPasswordRotationCandidate,
  validateSupavisorCredentialApiResult,
} from "./postgres-password-rotation.mjs";

const sourcePassword = "a".repeat(64);
const targetPassword = "b".repeat(64);
const resultSafetyTargetPassword = "0123456789abcdef".repeat(4);
const sentinelToken = "SYNTHETIC_SERVICE_ROLE_TOKEN_DO_NOT_PRINT";
const sentinelTenant = "SYNTHETIC_TENANT_DO_NOT_PRINT";

function sourceSupabase({ extra = "" } = {}) {
  return Buffer.from(
    `POSTGRES_PASSWORD=${sourcePassword}\nSERVICE_ROLE_KEY=${sentinelToken}\nPOOLER_TENANT_ID=${sentinelTenant}\nJWT_SECRET=retained\n${extra}`,
    "utf8",
  );
}

function sourceGodel() {
  return Buffer.from("SUPABASE_SECRET_KEY=unchanged\n", "utf8");
}

test("Postgres password generator returns fresh 32-byte lowercase hexadecimal values", () => {
  const first = generatePostgresPassword();
  const second = generatePostgresPassword();
  assert.equal(first.length, POSTGRES_PASSWORD_LENGTH);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.match(second, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(isValidPostgresPassword(first), true);
});

test("candidate changes only POSTGRES_PASSWORD and retains Godel bytes", () => {
  const source = sourceSupabase();
  const godel = sourceGodel();
  const candidate = buildPostgresPasswordRotationCandidate({
    sourceSupabaseSnapshot: source,
    sourceGodelSnapshot: godel,
    targetPassword,
  });
  assert.equal(candidate.reason, POSTGRES_PASSWORD_ROTATION_REASON);
  assert.equal(candidate.godelSnapshot.equals(godel), true);
  assert.match(candidate.supabaseSnapshot.toString("utf8"), new RegExp(`^POSTGRES_PASSWORD=${targetPassword}$`, "m"));
  assert.match(candidate.supabaseSnapshot.toString("utf8"), /^SERVICE_ROLE_KEY=SYNTHETIC_SERVICE_ROLE_TOKEN_DO_NOT_PRINT$/m);
  assert.match(candidate.supabaseSnapshot.toString("utf8"), /^POOLER_TENANT_ID=SYNTHETIC_TENANT_DO_NOT_PRINT$/m);
  assert.match(candidate.supabaseSnapshot.toString("utf8"), /^JWT_SECRET=retained$/m);
});

test("candidate validator returns structural metadata without propagating the target password", () => {
  const source = sourceSupabase();
  const godel = sourceGodel();
  const candidate = buildPostgresPasswordRotationCandidate({
    sourceSupabaseSnapshot: source,
    sourceGodelSnapshot: godel,
    targetPassword: resultSafetyTargetPassword,
  });
  const result = validatePostgresPasswordRotationCandidate({
    sourceSupabaseSnapshot: source,
    candidateSupabaseSnapshot: candidate.supabaseSnapshot,
    sourceGodelSnapshot: godel,
    candidateGodelSnapshot: candidate.godelSnapshot,
  });

  assert.deepEqual(result, { reason: POSTGRES_PASSWORD_ROTATION_REASON });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(result).includes(resultSafetyTargetPassword), false);
  assert.equal(`${result}`.includes(resultSafetyTargetPassword), false);
});

test("candidate validation rejects missing, empty, invalid, unchanged, unrelated, and Godel-mutated inputs", () => {
  const godel = sourceGodel();
  assert.throws(
    () => buildPostgresPasswordRotationCandidate({ sourceSupabaseSnapshot: Buffer.from("SERVICE_ROLE_KEY=x\nPOOLER_TENANT_ID=y\n"), sourceGodelSnapshot: godel, targetPassword }),
    /POSTGRES_ROTATION_SOURCE_INVALID/,
  );
  assert.throws(
    () => buildPostgresPasswordRotationCandidate({ sourceSupabaseSnapshot: Buffer.from("POSTGRES_PASSWORD=\nSERVICE_ROLE_KEY=x\nPOOLER_TENANT_ID=y\n"), sourceGodelSnapshot: godel, targetPassword }),
    /POSTGRES_ROTATION_SOURCE_INVALID/,
  );
  assert.throws(
    () => buildPostgresPasswordRotationCandidate({ sourceSupabaseSnapshot: sourceSupabase(), sourceGodelSnapshot: godel, targetPassword: "invalid" }),
    /POSTGRES_ROTATION_PASSWORD_INVALID/,
  );
  assert.throws(
    () => buildPostgresPasswordRotationCandidate({ sourceSupabaseSnapshot: sourceSupabase(), sourceGodelSnapshot: godel, targetPassword: sourcePassword }),
    /POSTGRES_ROTATION_PASSWORD_UNCHANGED/,
  );
  assert.throws(
    () => validatePostgresPasswordRotationCandidate({
      sourceSupabaseSnapshot: sourceSupabase(),
      candidateSupabaseSnapshot: Buffer.from(`POSTGRES_PASSWORD=${targetPassword}\nSERVICE_ROLE_KEY=changed\nPOOLER_TENANT_ID=${sentinelTenant}\nJWT_SECRET=retained\n`),
      sourceGodelSnapshot: godel,
      candidateGodelSnapshot: godel,
    }),
    /POSTGRES_ROTATION_CANDIDATE_UNRELATED_CHANGE/,
  );
  assert.throws(
    () => validatePostgresPasswordRotationCandidate({
      sourceSupabaseSnapshot: sourceSupabase(),
      candidateSupabaseSnapshot: Buffer.from(`POSTGRES_PASSWORD=${targetPassword}\nSERVICE_ROLE_KEY=${sentinelToken}\nPOOLER_TENANT_ID=${sentinelTenant}\nJWT_SECRET=retained\n`),
      sourceGodelSnapshot: godel,
      candidateGodelSnapshot: Buffer.from("SUPABASE_SECRET_KEY=changed\n"),
    }),
    /POSTGRES_ROTATION_GODEL_MUTATED/,
  );
});

test("candidate validation rejects non-environment comment and formatting mutations", () => {
  const source = sourceSupabase();
  const godel = sourceGodel();
  const candidate = buildPostgresPasswordRotationCandidate({
    sourceSupabaseSnapshot: source,
    sourceGodelSnapshot: godel,
    targetPassword,
  });
  const commentMutation = Buffer.concat([
    candidate.supabaseSnapshot,
    Buffer.from("# candidate-only comment\n", "utf8"),
  ]);
  const formattingMutation = Buffer.from(
    candidate.supabaseSnapshot.toString("utf8").replace("JWT_SECRET=retained\n", "JWT_SECRET=retained\n\n"),
    "utf8",
  );

  for (const candidateSupabaseSnapshot of [commentMutation, formattingMutation]) {
    assert.throws(
      () => validatePostgresPasswordRotationCandidate({
        sourceSupabaseSnapshot: source,
        candidateSupabaseSnapshot,
        sourceGodelSnapshot: godel,
        candidateGodelSnapshot: godel,
      }),
      /POSTGRES_ROTATION_CANDIDATE_UNRELATED_CHANGE/,
    );
  }
});

test("role SQL is transactional and limited to the approved seven roles", () => {
  const sql = buildPostgresPasswordRotationSql(targetPassword);
  assert.match(sql, /^BEGIN;\n/);
  assert.match(sql, /\nCOMMIT;\n$/);
  assert.equal((sql.match(/ALTER ROLE /g) ?? []).length, 7);
  assert.deepEqual([...sql.matchAll(/ALTER ROLE ([a-z_]+) WITH PASSWORD/g)].map((match) => match[1]), POSTGRES_ROTATED_ROLES);
  assert.doesNotMatch(sql, /DROP|CREATE SCHEMA|_supavisor/i);
  assert.throws(() => buildPostgresPasswordRotationSql("invalid"), /POSTGRES_ROTATION_PASSWORD_INVALID/);
});

test("role SQL failures never disclose a synthetic target password", () => {
  const sentinelPassword = "c".repeat(63);
  let error;
  try { buildPostgresPasswordRotationSql(sentinelPassword); } catch (caught) { error = caught; }
  assert.ok(error instanceof Error);
  assert.doesNotMatch(error.message, new RegExp(sentinelPassword));
  assert.doesNotMatch(JSON.stringify({ error: error.message }), new RegExp(sentinelPassword));
});

test("Supavisor curl config confines all synthetic credentials to stdin configuration", () => {
  const config = buildSupavisorCredentialCurlConfig({
    tenantId: sentinelTenant,
    serviceRoleKey: sentinelToken,
    targetPassword,
  });
  assert.match(config, /^request = "POST"$/m);
  assert.match(config, /^url = "http:\/\/127\.0\.0\.1:4000\/api\/tenants\/SYNTHETIC_TENANT_DO_NOT_PRINT\/update_auth_credentials"$/m);
  assert.match(config, /^header = "Authorization: Bearer SYNTHETIC_SERVICE_ROLE_TOKEN_DO_NOT_PRINT"$/m);
  assert.match(config, /\\"db_user\\":\\"pgbouncer\\"/);
  assert.match(config, new RegExp(targetPassword));
  assert.match(config, /^output = "\/dev\/null"$/m);
  assert.match(config, /^write-out = "%\{http_code\}"$/m);
});

test("Supavisor result validation requires curl success and HTTP 204 without leaking sentinels", () => {
  assert.deepEqual(validateSupavisorCredentialApiResult({ exitCode: 0, stdout: "204" }), { status: 204 });
  for (const value of [
    { exitCode: 1, stdout: "204" },
    { exitCode: 0, stdout: "200" },
    { exitCode: 0, stdout: "unexpected response" },
  ]) {
    assert.throws(() => validateSupavisorCredentialApiResult(value), /POSTGRES_ROTATION_SUPAVISOR_(API_FAILED|STATUS_INVALID)/);
  }
  let error;
  try { buildSupavisorCredentialCurlConfig({ tenantId: sentinelTenant, serviceRoleKey: "", targetPassword }); } catch (caught) { error = caught; }
  assert.ok(error instanceof Error);
  const rendered = `${error.message}${JSON.stringify({ error: error.message })}`;
  assert.doesNotMatch(rendered, new RegExp(sentinelTenant));
  assert.doesNotMatch(rendered, new RegExp(sentinelToken));
  assert.doesNotMatch(rendered, new RegExp(targetPassword));
});

test("future stages and compensation boundary are immutable and fail closed", () => {
  assert.deepEqual(POSTGRES_PASSWORD_ROTATION_STAGES, [
    "PREFLIGHT_SOURCE", "MAINTENANCE_CLOSED", "SUPAVISOR_TARGET", "DATABASE_TARGET",
    "DATABASE_TARGET_VERIFIED", "ENV_TARGET", "ENV_TARGET_VERIFIED", "POINTER_TARGET",
    "RUNTIME_TARGET", "ACCEPTANCE_TARGET", "COMPLETE",
  ]);
  assert.equal(Object.isFrozen(POSTGRES_PASSWORD_ROTATION_STAGES), true);
  assert.equal(Object.isFrozen(POSTGRES_ROTATED_ROLES), true);
  assert.equal(POSTGRES_PASSWORD_POST_POINTER_BOUNDARY.recovery, "TRACKED_ROLLBACK_TARGET_TO_SOURCE_REQUIRED");
  assert.deepEqual(getPostgresPasswordPrePointerCompensation({ supavisorTargetAttempted: true, databaseTargetAttempted: true, environmentTargetAttempted: true }), [
    POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.pointer,
    POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.supavisorTargetAttempted,
    POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.databaseTargetAttempted,
    POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.environmentTargetAttempted,
    POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.releaseMaintenance,
  ]);
  assert.throws(() => getPostgresPasswordPrePointerCompensation({ pointerAtSource: false }), /POSTGRES_ROTATION_TRACKED_ROLLBACK_REQUIRED/);
});

test("production module has no direct persisted-credential SQL path", async () => {
  const source = await readFile(resolve(import.meta.dirname, "postgres-password-rotation.mjs"), "utf8");
  assert.doesNotMatch(source, /_supavisor\s*\./);
  assert.doesNotMatch(source, /db_pass_encrypted/);
  assert.doesNotMatch(source, /UPDATE\s+/i);
});
