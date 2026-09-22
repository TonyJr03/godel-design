import { isAbsolute } from "node:path";

import {
  validateSecretSafeArgs,
  validateSecretSafeDatabaseTransport,
} from "./command-runner.mjs";
import { validateRelativeArtifactPath } from "./safety.mjs";

const AGE_RECIPIENT_PATTERN = /^(?:age1[ac-hj-np-z02-9]{20,}|age-plugin-[A-Za-z0-9+._-]+-[A-Za-z0-9+/_=-]+)$/;
const FORBIDDEN_S3_OPERATION = /^(?:delete|move|purge|sync|rmdir|deletefile)$/i;

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

export function buildSupabaseDatabaseCommandPlans({ outputDirectory = "database" } = {}) {
  validateRelativeArtifactPath(outputDirectory);
  const file = (name) => `${outputDirectory}/${name}`;
  const definitions = [
    ["dump roles", ["db", "dump", "--role-only", "--file", file("roles.sql")]],
    ["dump managed schemas", ["db", "dump", "--schema", "public,private", "--file", file("managed-schema.sql")]],
    ["dump managed data", ["db", "dump", "--data-only", "--use-copy", "--schema", "public,private,auth,storage", "--exclude", "storage.buckets_vectors", "--exclude", "storage.vector_indexes", "--file", file("managed-data.sql")]],
    ["dump migration history schema", ["db", "dump", "--schema", "supabase_migrations", "--file", file("migration-history-schema.sql")]],
    ["dump migration history data", ["db", "dump", "--data-only", "--use-copy", "--schema", "supabase_migrations", "--file", file("migration-history-data.sql")]],
  ];
  return Object.freeze(definitions.map(([operation, args]) => freezePlan({
    operation,
    executable: "supabase",
    args,
    credentialTransport: "PENDING_LOCAL_PROOF",
    executionReady: false,
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

function assertSafeEndpoint(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) fail("S3_PLAN_INVALID", `${label} is required`);
  if (/[\r\n\0]/.test(value) || /:\/\/[^\s/:]+:[^\s@]+@/.test(value)) {
    fail("S3_PLAN_INVALID", `${label} contains unsafe credential material`);
  }
}

export function buildS3CommandPlan(options = {}) {
  exactOptions(options, ["operation", "source", "destination", "executable"], "S3 plan");
  const { operation, source, destination, executable = "rclone" } = options;
  if (FORBIDDEN_S3_OPERATION.test(operation ?? "")) fail("S3_OPERATION_FORBIDDEN", "Destructive S3 operations are forbidden");
  assertSafeEndpoint(source, "S3 source");
  if (!["list-source", "download-copy", "upload-restore", "verify-listing"].includes(operation)) {
    fail("S3_PLAN_INVALID", "Unsupported S3 operation");
  }
  let args;
  if (operation === "list-source" || operation === "verify-listing") {
    args = ["lsjson", source, "--recursive", "--files-only"];
  } else {
    assertSafeEndpoint(destination, "S3 destination");
    args = ["copy", source, destination, "--immutable", "--metadata"];
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
