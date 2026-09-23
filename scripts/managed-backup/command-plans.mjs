import { isAbsolute } from "node:path";

import {
  validateSecretSafeArgs,
  validateSecretSafeDatabaseTransport,
} from "./command-runner.mjs";
import { validateRelativeArtifactPath } from "./safety.mjs";

const AGE_RECIPIENT_PATTERN = /^(?:age1[ac-hj-np-z02-9]{20,}|age-plugin-[A-Za-z0-9+._-]+-[A-Za-z0-9+/_=-]+)$/;
const FORBIDDEN_S3_OPERATION = /^(?:delete|move|purge|sync|rmdir|deletefile)$/i;
const RCLONE_REMOTE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const INLINE_REMOTE_CONFIG_PATTERN = /(?:^:|,[^,:]*=|(?:access[-_]?key[-_]?id|secret[-_]?access[-_]?key|session[-_]?token|password|token|client[-_]?secret)\s*=)/i;
const DATABASE_TARGETS = new Set(["local", "linked"]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedBackupPlanError";
  error.code = code;
  throw error;
}

function exactOptions(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("COMMAND_PLAN_INVALID", `${label} options must be an object`);
  }
  if (Object.keys(value).some((key) => !keys.includes(key))) fail("COMMAND_PLAN_INVALID", `${label} contains unexpected options`);
}

function freezePlan(plan) {
  validateSecretSafeArgs(plan.args);
  return Object.freeze({ ...plan, args: Object.freeze([...plan.args]) });
}

function explicitProcessEnvironment(source = process.env) {
  const environment = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") environment[key] = source[key];
  }
  return environment;
}

export function buildSupabaseDatabaseEnvironment({
  target,
  databasePassword,
  sourceEnvironment = process.env,
} = {}) {
  if (!DATABASE_TARGETS.has(target)) fail("DATABASE_TARGET_INVALID", "Database target must be explicit");
  if (target === "local" && databasePassword !== undefined) {
    fail("DATABASE_TRANSPORT_INVALID", "Local database execution does not accept a database password");
  }
  if (target === "linked" && (typeof databasePassword !== "string" || databasePassword.length === 0)) {
    fail("DATABASE_TRANSPORT_INVALID", "Linked database execution requires SUPABASE_DB_PASSWORD in the environment");
  }
  const allowedEnvironment = {
    ...explicitProcessEnvironment(sourceEnvironment),
    SUPABASE_TELEMETRY_DISABLED: "1",
  };
  if (target === "linked") allowedEnvironment.SUPABASE_DB_PASSWORD = databasePassword;
  return Object.freeze({
    target,
    selector: target === "local" ? "--local" : "--linked",
    allowedEnvironment: Object.freeze(allowedEnvironment),
    transport: Object.freeze({
      mechanism: "environment",
      argvContainsPassword: false,
      argvContainsFullDatabaseUrl: false,
      provenLocally: true,
    }),
  });
}

export function buildSupabaseDatabaseCommandPlans({ outputDirectory = "database", target = "local", executable = "supabase" } = {}) {
  validateRelativeArtifactPath(outputDirectory);
  if (!DATABASE_TARGETS.has(target)) fail("DATABASE_TARGET_INVALID", "Database target must be explicit");
  if (typeof executable !== "string" || executable.length === 0) fail("COMMAND_PLAN_INVALID", "Supabase executable is required");
  const selector = target === "local" ? "--local" : "--linked";
  const file = (name) => `${outputDirectory}/${name}`;
  const definitions = [
    ["dump roles", ["db", "dump", selector, "--role-only", "--file", file("roles.sql")]],
    ["dump managed schemas for audit", ["db", "dump", selector, "--schema", "public,private", "--file", file("managed-schema.sql")]],
    ["dump managed data", ["db", "dump", selector, "--data-only", "--use-copy", "--exclude", "storage.buckets_vectors", "--exclude", "storage.vector_indexes", "--file", file("managed-data.sql")]],
    ["dump migration history schema", ["db", "dump", selector, "--schema", "supabase_migrations", "--file", file("migration-history-schema.sql")]],
    ["dump migration history data", ["db", "dump", selector, "--data-only", "--use-copy", "--schema", "supabase_migrations", "--file", file("migration-history-data.sql")]],
  ];
  return Object.freeze(definitions.map(([operation, args]) => freezePlan({
    operation,
    executable,
    args,
    target,
    credentialTransport: target === "local" ? "LOCAL_EXPLICIT_NO_SECRET" : "SUPABASE_DB_PASSWORD_ENV",
    executionReady: true,
  })));
}

export function authorizeDatabaseCommandPlan(plan, transport) {
  validateSecretSafeDatabaseTransport(transport);
  if (!plan || plan.executionReady !== false || plan.credentialTransport !== "PENDING_LOCAL_PROOF") {
    fail("DATABASE_PLAN_INVALID", "Only a pending managed database plan can be authorized");
  }
  validateSecretSafeArgs(plan.args);
  return freezePlan({ ...plan, credentialTransport: transport.mechanism, executionReady: true });
}

function rejectInlineRemoteConfig(value) {
  if (typeof value === "string" && INLINE_REMOTE_CONFIG_PATTERN.test(value)) {
    fail("INLINE_REMOTE_CONFIG_FORBIDDEN", "Inline rclone backend or credential configuration is forbidden");
  }
}

function assertRemoteName(value) {
  rejectInlineRemoteConfig(value);
  if (typeof value !== "string" || !RCLONE_REMOTE_NAME_PATTERN.test(value)) {
    fail("S3_PLAN_INVALID", "S3 remoteName is invalid");
  }
}

function assertRemotePath(value) {
  rejectInlineRemoteConfig(value);
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 2048
    || value.includes(":")
    || value.includes("\\")
    || value.startsWith("/")
    || /[\r\n\0]/.test(value)
    || value.split("/").some((part) => part === "" || part === "." || part === "..")
  ) fail("S3_PLAN_INVALID", "S3 remotePath is invalid");
}

function assertLocalPath(value) {
  rejectInlineRemoteConfig(value);
  const looksLikeRemote = typeof value === "string"
    && /^[^/\\]+:/.test(value)
    && !/^[A-Za-z]:[/\\]/.test(value);
  if (typeof value !== "string" || value.length === 0 || value.length > 4096 || /[\r\n\0]/.test(value) || looksLikeRemote) {
    fail("S3_PLAN_INVALID", "S3 localPath is invalid");
  }
}

export function buildS3CommandPlan(options = {}) {
  exactOptions(options, ["operation", "remoteName", "remotePath", "localPath", "executable"], "S3 plan");
  const { operation, remoteName, remotePath, localPath, executable = "rclone" } = options;
  if (FORBIDDEN_S3_OPERATION.test(operation ?? "")) fail("S3_OPERATION_FORBIDDEN", "Destructive S3 operations are forbidden");
  if (!["list-source", "download-copy", "upload-restore", "verify-listing"].includes(operation)) {
    fail("S3_PLAN_INVALID", "Unsupported S3 operation");
  }
  assertRemoteName(remoteName);
  assertRemotePath(remotePath);
  const remote = `${remoteName}:${remotePath}`;
  let args;
  if (operation === "list-source" || operation === "verify-listing") {
    if (localPath !== undefined) fail("S3_PLAN_INVALID", "Listing operations do not accept localPath");
    args = ["lsjson", remote, "--recursive", "--files-only"];
  } else {
    assertLocalPath(localPath);
    args = operation === "download-copy"
      ? ["copy", remote, localPath, "--immutable", "--metadata"]
      : ["copy", localPath, remote, "--no-check-dest", "--metadata"];
  }
  return freezePlan({
    operation,
    executable,
    args,
    credentialTransport: "environment-or-protected-config-file",
    destructive: false,
  });
}

export function buildAgeEncryptPlan(options = {}) {
  exactOptions(options, ["recipient", "inputPath", "outputPath"], "Age encryption plan");
  const { recipient, inputPath, outputPath } = options;
  if (typeof recipient !== "string" || !AGE_RECIPIENT_PATTERN.test(recipient)) {
    fail("AGE_PLAN_INVALID", "A valid public age recipient is required");
  }
  if (typeof inputPath !== "string" || inputPath.length === 0 || typeof outputPath !== "string" || outputPath.length === 0) {
    fail("AGE_PLAN_INVALID", "Age input and output paths are required");
  }
  return freezePlan({
    operation: "encrypt managed backup bundle",
    executable: "age",
    args: ["--encrypt", "--recipient", recipient, "--output", outputPath, inputPath],
    privateIdentityTransport: "not-required-for-encryption",
  });
}

export function buildAgeDecryptVerificationPlan(options = {}) {
  exactOptions(options, ["ciphertextPath", "outputPath", "identityFile"], "Age verification plan");
  const { ciphertextPath, outputPath, identityFile } = options;
  if (![ciphertextPath, outputPath, identityFile].every((value) => typeof value === "string" && value.length > 0)) {
    fail("AGE_PLAN_INVALID", "Ciphertext, verification output, and identity file paths are required");
  }
  if (!isAbsolute(identityFile) || /AGE-SECRET-KEY-/i.test(identityFile)) {
    fail("AGE_PLAN_INVALID", "Age identity must be supplied as an absolute protected file path, never as key material");
  }
  return freezePlan({
    operation: "verify managed backup ciphertext by decryption",
    executable: "age",
    args: ["--decrypt", "--identity", identityFile, "--output", outputPath, ciphertextPath],
    privateIdentityTransport: "protected-file",
  });
}
