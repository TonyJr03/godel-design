import { randomBytes } from "node:crypto";

import { applyAllowlistedEnvironmentChanges } from "./secret-generation.mjs";

export const POSTGRES_PASSWORD_ROTATION_REASON = "postgres-password-rotation";
export const POSTGRES_PASSWORD_BYTES = 32;
export const POSTGRES_PASSWORD_LENGTH = POSTGRES_PASSWORD_BYTES * 2;
export const POSTGRES_ROTATED_ROLES = Object.freeze([
  "postgres",
  "supabase_admin",
  "authenticator",
  "pgbouncer",
  "supabase_auth_admin",
  "supabase_functions_admin",
  "supabase_storage_admin",
]);
export const POSTGRES_PASSWORD_ROTATION_STAGES = Object.freeze([
  "PREFLIGHT_SOURCE",
  "MAINTENANCE_CLOSED",
  "SUPAVISOR_TARGET",
  "DATABASE_TARGET",
  "DATABASE_TARGET_VERIFIED",
  "ENV_TARGET",
  "ENV_TARGET_VERIFIED",
  "POINTER_TARGET",
  "SOURCE_RESTORED",
  "DB_RUNTIME_TARGET",
  "RUNTIME_TARGET",
  "ACCEPTANCE_TARGET",
  "TARGET_ACCEPTED",
  "MAINTENANCE_OPEN",
  "COMPLETE",
]);
export const POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION = Object.freeze({
  pointer: "SOURCE_REQUIRED",
  supavisorTargetAttempted: "SUPAVISOR_SOURCE_RESTORATION_REQUIRED",
  databaseTargetAttempted: "DATABASE_SOURCE_TRANSACTION_RESTORATION_REQUIRED",
  environmentTargetAttempted: "ENVIRONMENT_SOURCE_RESTORATION_REQUIRED",
  releaseMaintenance: "ONLY_AFTER_SOURCE_COMPONENTS_INDEPENDENTLY_VERIFY",
});
export const POSTGRES_PASSWORD_POST_POINTER_BOUNDARY = Object.freeze({
  pointer: "TARGET",
  recovery: "TRACKED_ROLLBACK_TARGET_TO_SOURCE_REQUIRED",
});

const PASSWORD_PATTERN = /^[a-f0-9]{64}$/;
const RESTORABLE_PASSWORD_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{64})$/;
const REQUIRED_SOURCE_NAMES = Object.freeze([
  "POSTGRES_PASSWORD",
  "SERVICE_ROLE_KEY",
  "POOLER_TENANT_ID",
]);
const SUPAVISOR_MANAGER_ROLE = "pgbouncer";
const SUPAVISOR_STATUS = "204";

function fail(code) {
  throw new Error(code);
}

function toBuffer(value, code) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") return Buffer.from(value, "utf8");
  fail(code);
}

function parseEnvironment(snapshot, code) {
  const source = toBuffer(snapshot, code).toString("utf8");
  const values = new Map();
  const lines = source.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, name, raw] = match;
    if (values.has(name)) fail(code);
    const value = raw.trim();
    values.set(
      name,
      value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        ? value.slice(1, -1)
        : value,
    );
  }

  return values;
}

function required(values, name, code) {
  const value = values.get(name);
  if (typeof value !== "string" || !value) fail(code);
  return value;
}

function assertSourceSnapshot(sourceSnapshot) {
  const values = parseEnvironment(sourceSnapshot, "POSTGRES_ROTATION_SOURCE_INVALID");
  for (const name of REQUIRED_SOURCE_NAMES) required(values, name, "POSTGRES_ROTATION_SOURCE_INVALID");
  if (!isRestorablePostgresPassword(required(values, "POSTGRES_PASSWORD", "POSTGRES_ROTATION_SOURCE_INVALID"))) {
    fail("POSTGRES_ROTATION_SOURCE_INVALID");
  }
  return values;
}

function assertSafeInlineValue(value, code) {
  if (typeof value !== "string" || !value || /[\r\n\0]/.test(value)) fail(code);
  return value;
}

function quoteCurlConfig(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function isValidPostgresPassword(value) {
  return typeof value === "string" && PASSWORD_PATTERN.test(value);
}

export function isRestorablePostgresPassword(value) {
  return typeof value === "string" && RESTORABLE_PASSWORD_PATTERN.test(value);
}

export function generatePostgresPassword() {
  return randomBytes(POSTGRES_PASSWORD_BYTES).toString("hex");
}

export function validatePostgresPassword(value) {
  if (!isValidPostgresPassword(value)) fail("POSTGRES_ROTATION_PASSWORD_INVALID");
  return value;
}

export function validateRestorablePostgresPassword(value) {
  if (!isRestorablePostgresPassword(value)) fail("POSTGRES_ROTATION_RESTORABLE_PASSWORD_INVALID");
  return value;
}

export function validatePostgresPasswordRotationCandidate({
  sourceSupabaseSnapshot,
  candidateSupabaseSnapshot,
  sourceGodelSnapshot,
  candidateGodelSnapshot,
}) {
  const sourceSupabase = toBuffer(sourceSupabaseSnapshot, "POSTGRES_ROTATION_SOURCE_INVALID");
  const candidateSupabase = toBuffer(candidateSupabaseSnapshot, "POSTGRES_ROTATION_CANDIDATE_INVALID");
  const sourceGodel = toBuffer(sourceGodelSnapshot, "POSTGRES_ROTATION_GODEL_INVALID");
  const candidateGodel = toBuffer(candidateGodelSnapshot, "POSTGRES_ROTATION_GODEL_INVALID");
  const source = assertSourceSnapshot(sourceSupabase);
  const candidate = parseEnvironment(candidateSupabase, "POSTGRES_ROTATION_CANDIDATE_INVALID");

  const sourcePassword = required(source, "POSTGRES_PASSWORD", "POSTGRES_ROTATION_SOURCE_INVALID");
  const targetPassword = required(candidate, "POSTGRES_PASSWORD", "POSTGRES_ROTATION_CANDIDATE_INVALID");
  validatePostgresPassword(targetPassword);
  if (sourcePassword === targetPassword) fail("POSTGRES_ROTATION_PASSWORD_UNCHANGED");

  const expectedCandidate = Buffer.from(
    applyAllowlistedEnvironmentChanges(
      sourceSupabase.toString("utf8"),
      { POSTGRES_PASSWORD: targetPassword },
      ["POSTGRES_PASSWORD"],
    ),
    "utf8",
  );
  if (!candidateSupabase.equals(expectedCandidate)) fail("POSTGRES_ROTATION_CANDIDATE_UNRELATED_CHANGE");
  if (!sourceGodel.equals(candidateGodel)) fail("POSTGRES_ROTATION_GODEL_MUTATED");

  return Object.freeze({ reason: POSTGRES_PASSWORD_ROTATION_REASON });
}

export function buildPostgresPasswordRotationCandidate({ sourceSupabaseSnapshot, sourceGodelSnapshot, targetPassword = generatePostgresPassword() }) {
  const sourceSupabase = toBuffer(sourceSupabaseSnapshot, "POSTGRES_ROTATION_SOURCE_INVALID");
  const sourceGodel = toBuffer(sourceGodelSnapshot, "POSTGRES_ROTATION_GODEL_INVALID");
  assertSourceSnapshot(sourceSupabase);
  validatePostgresPassword(targetPassword);
  const candidateSupabase = Buffer.from(
    applyAllowlistedEnvironmentChanges(
      sourceSupabase.toString("utf8"),
      { POSTGRES_PASSWORD: targetPassword },
      ["POSTGRES_PASSWORD"],
    ),
    "utf8",
  );
  const candidate = validatePostgresPasswordRotationCandidate({
    sourceSupabaseSnapshot: sourceSupabase,
    candidateSupabaseSnapshot: candidateSupabase,
    sourceGodelSnapshot: sourceGodel,
    candidateGodelSnapshot: sourceGodel,
  });

  return Object.freeze({
    reason: candidate.reason,
    supabaseSnapshot: candidateSupabase,
    godelSnapshot: Buffer.from(sourceGodel),
  });
}

export function buildPostgresPasswordRotationSql(targetPassword) {
  validatePostgresPassword(targetPassword);
  return buildPostgresPasswordSql(targetPassword);
}

export function buildPostgresPasswordRestorationSql(sourcePassword) {
  validateRestorablePostgresPassword(sourcePassword);
  return buildPostgresPasswordSql(sourcePassword);
}

function buildPostgresPasswordSql(password) {
  return `BEGIN;\n${POSTGRES_ROTATED_ROLES.map((role) => `ALTER ROLE ${role} WITH PASSWORD '${password}';`).join("\n")}\nCOMMIT;\n`;
}

export function buildSupavisorCredentialCurlConfig({ tenantId, serviceRoleKey, targetPassword }) {
  assertSafeInlineValue(tenantId, "POSTGRES_ROTATION_SUPAVISOR_INPUT_INVALID");
  assertSafeInlineValue(serviceRoleKey, "POSTGRES_ROTATION_SUPAVISOR_INPUT_INVALID");
  validateRestorablePostgresPassword(targetPassword);
  const endpoint = `http://127.0.0.1:4000/api/tenants/${encodeURIComponent(tenantId)}/update_auth_credentials`;
  const payload = JSON.stringify({ db_user: SUPAVISOR_MANAGER_ROLE, db_password: targetPassword });

  return [
    `request = ${quoteCurlConfig("POST")}`,
    `url = ${quoteCurlConfig(endpoint)}`,
    `header = ${quoteCurlConfig(`Authorization: Bearer ${serviceRoleKey}`)}`,
    `header = ${quoteCurlConfig("Content-Type: application/json")}`,
    `data = ${quoteCurlConfig(payload)}`,
    `output = ${quoteCurlConfig("/dev/null")}`,
    `write-out = ${quoteCurlConfig("%{http_code}")}`,
    "",
  ].join("\n");
}

export function validateSupavisorCredentialApiResult({ exitCode, stdout }) {
  if (exitCode !== 0) fail("POSTGRES_ROTATION_SUPAVISOR_API_FAILED");
  if (typeof stdout !== "string" || stdout.trim() !== SUPAVISOR_STATUS) {
    fail("POSTGRES_ROTATION_SUPAVISOR_STATUS_INVALID");
  }
  return Object.freeze({ status: Number(SUPAVISOR_STATUS) });
}

export function getPostgresPasswordPrePointerCompensation({
  supavisorTargetAttempted = false,
  databaseTargetAttempted = false,
  environmentTargetAttempted = false,
  pointerAtSource = true,
} = {}) {
  if (!pointerAtSource) fail("POSTGRES_ROTATION_TRACKED_ROLLBACK_REQUIRED");
  if (![supavisorTargetAttempted, databaseTargetAttempted, environmentTargetAttempted].every((value) => typeof value === "boolean")) {
    fail("POSTGRES_ROTATION_COMPENSATION_MODEL_INVALID");
  }
  const requirements = [POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.pointer];
  if (supavisorTargetAttempted) requirements.push(POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.supavisorTargetAttempted);
  if (databaseTargetAttempted) requirements.push(POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.databaseTargetAttempted);
  if (environmentTargetAttempted) requirements.push(POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.environmentTargetAttempted);
  requirements.push(POSTGRES_PASSWORD_PRE_POINTER_COMPENSATION.releaseMaintenance);
  return Object.freeze(requirements);
}
