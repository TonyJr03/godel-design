import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { buildS3CommandPlan } from "./command-plans.mjs";

export const PRODUCTION_BACKUP_CONFIRMATION = "ALLOW_SINGLE_PRODUCTION_BACKUP_CAPTURE";
export const PRODUCTION_WRITER_FREEZE_CONFIRMATION = "CONFIRM_NO_PRODUCTION_WRITERS";
export const PRODUCTION_BACKUP_BRANCH = "ops/managed-free-production-pilot";
export const PRODUCTION_S3_REMOTE_NAME = "godelprod";

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const AGE_RECIPIENT_PATTERN = /^(?:age1[ac-hj-np-z02-9]{20,}|age-plugin-[A-Za-z0-9+._-]+-[A-Za-z0-9+/_=-]+)$/;
const PRODUCTION_S3_OPERATIONS = new Set(["list-source", "download-copy", "verify-listing"]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedProductionBackupError";
  error.code = code;
  throw error;
}

function required(environment, name, code = "PRODUCTION_CONFIG_MISSING") {
  const value = environment[name];
  if (typeof value !== "string" || value.length === 0) fail(code, `${name} is required`);
  return value;
}

function cleanHttpsUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("PRODUCTION_S3_CONFIG_INVALID", "Production S3 endpoint must be a valid HTTPS URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail("PRODUCTION_S3_CONFIG_INVALID", "Production S3 endpoint must be a clean HTTPS URL");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function assertProductionConfirmation(environment = {}) {
  if (environment.GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM !== PRODUCTION_BACKUP_CONFIRMATION) {
    fail("PRODUCTION_BACKUP_CONFIRMATION_REQUIRED", "Exact one-shot Production backup confirmation is required");
  }
}

export function assertWriterFreezeConfirmation(environment = {}) {
  if (environment.GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM !== PRODUCTION_WRITER_FREEZE_CONFIRMATION) {
    fail("WRITER_FREEZE_CONFIRMATION_REQUIRED", "Exact Production writer-freeze confirmation is required");
  }
}

export function readProductionBackupConfiguration(environment = {}) {
  for (const forbidden of ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (typeof environment[forbidden] === "string" && environment[forbidden].length > 0) {
      fail("FORBIDDEN_PRODUCTION_SECRET", `${forbidden} is forbidden for managed backup capture`);
    }
  }
  const projectRef = required(environment, "GODEL_MANAGED_SUPABASE_PROJECT_REF");
  const productionRuntimeSha = required(environment, "GODEL_MANAGED_PRODUCTION_RUNTIME_SHA");
  const ageRecipient = required(environment, "GODEL_MANAGED_BACKUP_AGE_RECIPIENT", "AGE_RECIPIENT_REQUIRED");
  const outputRoot = required(environment, "GODEL_MANAGED_BACKUP_OUTPUT_ROOT");
  if (!PROJECT_REF_PATTERN.test(projectRef)) fail("PROJECT_REF_INVALID", "Configured Supabase project ref is invalid");
  if (!SHA_PATTERN.test(productionRuntimeSha)) fail("PRODUCTION_RUNTIME_SHA_INVALID", "Production runtime SHA is invalid");
  if (!AGE_RECIPIENT_PATTERN.test(ageRecipient)) fail("AGE_RECIPIENT_INVALID", "Production age recipient is invalid");
  if (!isAbsolute(outputRoot)) fail("UNSAFE_OUTPUT_ROOT", "Managed backup output root must be absolute");

  const databasePassword = required(environment, "SUPABASE_DB_PASSWORD", "DATABASE_PASSWORD_REQUIRED");
  const s3AccessKeyId = required(environment, "GODEL_MANAGED_STORAGE_S3_ACCESS_KEY_ID", "S3_CREDENTIALS_REQUIRED");
  const s3SecretAccessKey = required(environment, "GODEL_MANAGED_STORAGE_S3_SECRET_ACCESS_KEY", "S3_CREDENTIALS_REQUIRED");
  const s3Region = required(environment, "GODEL_MANAGED_STORAGE_S3_REGION", "S3_CONFIG_REQUIRED");
  if (!/^[a-z0-9-]{2,40}$/.test(s3Region)) fail("PRODUCTION_S3_CONFIG_INVALID", "Production S3 region is invalid");

  return Object.freeze({
    projectRef,
    productionRuntimeSha,
    ageRecipient,
    outputRoot: resolve(outputRoot),
    databasePassword,
    s3Endpoint: cleanHttpsUrl(required(environment, "GODEL_MANAGED_STORAGE_S3_ENDPOINT", "S3_CONFIG_REQUIRED")),
    s3Region,
    s3AccessKeyId,
    s3SecretAccessKey,
  });
}

export function assertProductionGitAuthority(authority) {
  if (!authority || typeof authority !== "object") fail("GIT_AUTHORITY_INVALID", "Git authority is required");
  if (authority.branch !== PRODUCTION_BACKUP_BRANCH) fail("WRONG_TOOLING_BRANCH", "Production backup tooling branch is not authorized");
  if (authority.clean !== true) fail("DIRTY_TOOLING_WORKTREE", "Production backup tooling worktree must be clean");
  if (!SHA_PATTERN.test(authority.head ?? "")) fail("GIT_AUTHORITY_INVALID", "Tooling HEAD is invalid");
  return Object.freeze({ branch: authority.branch, head: authority.head, clean: true });
}

export async function readLinkedProjectRef({ repoRoot, read = readFile } = {}) {
  if (typeof repoRoot !== "string" || typeof read !== "function") fail("LINKED_PROJECT_MISSING", "Linked project reader is invalid");
  let value;
  try {
    value = String(await read(join(repoRoot, "supabase", ".temp", "project-ref"), "utf8")).trim();
  } catch {
    fail("LINKED_PROJECT_MISSING", "Supabase CLI linked project is required");
  }
  if (!PROJECT_REF_PATTERN.test(value)) fail("LINKED_PROJECT_MISSING", "Supabase CLI linked project is invalid");
  return value;
}

export function assertLinkedProject(expected, actual) {
  if (!PROJECT_REF_PATTERN.test(expected ?? "") || !PROJECT_REF_PATTERN.test(actual ?? "")) {
    fail("LINKED_PROJECT_MISMATCH", "Linked Supabase project does not match configured authority");
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    fail("LINKED_PROJECT_MISMATCH", "Linked Supabase project does not match configured authority");
  }
  return true;
}

export function buildProductionS3Environment(configuration, sourceEnvironment = process.env) {
  if (!configuration || typeof configuration !== "object") fail("PRODUCTION_S3_CONFIG_INVALID", "Production S3 configuration is required");
  const environment = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof sourceEnvironment[key] === "string") environment[key] = sourceEnvironment[key];
  }
  Object.assign(environment, {
    RCLONE_CONFIG_GODELPROD_TYPE: "s3",
    RCLONE_CONFIG_GODELPROD_PROVIDER: "Other",
    RCLONE_CONFIG_GODELPROD_ENV_AUTH: "true",
    RCLONE_CONFIG_GODELPROD_ENDPOINT: configuration.s3Endpoint,
    RCLONE_CONFIG_GODELPROD_REGION: configuration.s3Region,
    RCLONE_CONFIG_GODELPROD_FORCE_PATH_STYLE: "true",
    RCLONE_CONFIG_GODELPROD_LIST_VERSION: "2",
    AWS_ACCESS_KEY_ID: configuration.s3AccessKeyId,
    AWS_SECRET_ACCESS_KEY: configuration.s3SecretAccessKey,
  });
  return Object.freeze({
    allowedEnvironment: Object.freeze(environment),
    secretValues: Object.freeze([configuration.s3AccessKeyId, configuration.s3SecretAccessKey]),
  });
}

export function buildProductionS3CommandPlan(options = {}) {
  if (!PRODUCTION_S3_OPERATIONS.has(options.operation)) {
    fail("PRODUCTION_S3_OPERATION_FORBIDDEN", "Production backup permits only read-only S3 capture operations");
  }
  const plan = buildS3CommandPlan({ ...options, remoteName: PRODUCTION_S3_REMOTE_NAME });
  const args = options.operation === "verify-listing"
    ? Object.freeze(["size", `${PRODUCTION_S3_REMOTE_NAME}:${options.remotePath}`, "--json"])
    : plan.args;
  return Object.freeze({ ...plan, args, credentialTransport: "environment" });
}

export function createWriterFreezeRecord({ startedAt, dbStartedAt, dbEndedAt, storageStartedAt, storageEndedAt, endedAt } = {}) {
  const record = { schemaVersion: 1, startedAt, dbCapture: { startedAt: dbStartedAt, endedAt: dbEndedAt }, storageCapture: { startedAt: storageStartedAt, endedAt: storageEndedAt }, endedAt };
  const timestamps = [startedAt, dbStartedAt, dbEndedAt, storageStartedAt, storageEndedAt, endedAt];
  if (timestamps.some((value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return true;
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value;
  })) {
    fail("WRITER_FREEZE_RECORD_INVALID", "Writer freeze record requires ISO UTC timestamps");
  }
  for (let index = 1; index < timestamps.length; index += 1) {
    if (timestamps[index] < timestamps[index - 1]) fail("WRITER_FREEZE_RECORD_INVALID", "Writer freeze intervals are not ordered");
  }
  return Object.freeze(record);
}
