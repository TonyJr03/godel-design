import { validateTargetCatalogIdentity } from "./restore-planning.mjs";
import { REQUIRED_TARGET_EXTENSIONS, validateTargetBaseline } from "./sql-audit.mjs";
import { buildGovernedTargetPsqlPlan, executeGovernedTargetPlan } from "./target-executor.mjs";

export const TARGET_BASELINE_QUERY_NAMES = Object.freeze(["migrationHistory", "requiredSchemas", "requiredExtensions", "storageBucket", "targetCatalog", "replicationRole"]);
const REQUIRED_TABLES = Object.freeze(["auth.users", "auth.identities", "public.perfiles", "storage.buckets", "storage.objects"]);
const VERSION = /^\d{14}$/;
const NAME = /^[a-z][a-z0-9_]*$/;
const baselineDetails = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryTargetBaselineError";
  error.code = code;
  throw error;
}

export function buildTargetBaselineQueryPlans({ executor, containerAuthority, environment = process.env } = {}) {
  return Object.freeze(Object.fromEntries(TARGET_BASELINE_QUERY_NAMES.map((queryName) => [queryName, buildGovernedTargetPsqlPlan({ executor, containerAuthority, environment, operation: "query", queryName })])));
}

function exactLines(output, pattern, code) {
  if (typeof output !== "string" || output.includes("\0")) fail(code, "Recovery target query output is invalid");
  const normalized = output.replaceAll("\r\n", "\n");
  if (normalized.includes("\r")) fail(code, "Recovery target query output is invalid");
  const lines = normalized.endsWith("\n") ? normalized.slice(0, -1).split("\n") : normalized.split("\n");
  if (lines.length === 1 && lines[0] === "") return Object.freeze([]);
  if (lines.some((value) => value.trim() !== value || !pattern.test(value)) || new Set(lines).size !== lines.length) fail(code, "Recovery target query output is invalid");
  return Object.freeze(lines);
}

export function parseTargetBaselineOutputs({ authority, outputs, containerAuthority } = {}) {
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs) || Object.keys(outputs).length !== TARGET_BASELINE_QUERY_NAMES.length || Object.keys(outputs).some((key) => !TARGET_BASELINE_QUERY_NAMES.includes(key))) fail("LOCAL_RECOVERY_BASELINE_OUTPUT_INVALID", "Recovery target baseline outputs are incomplete");
  const migrationVersions = exactLines(outputs.migrationHistory, VERSION, "LOCAL_RECOVERY_MIGRATION_OUTPUT_INVALID");
  const schemas = exactLines(outputs.requiredSchemas, NAME, "LOCAL_RECOVERY_SCHEMA_OUTPUT_INVALID");
  const extensions = exactLines(outputs.requiredExtensions, NAME, "LOCAL_RECOVERY_EXTENSION_OUTPUT_INVALID");
  if (extensions.some((name) => !REQUIRED_TARGET_EXTENSIONS.includes(name))) fail("LOCAL_RECOVERY_EXTENSION_OUTPUT_INVALID", "Recovery target extension output is invalid");
  const catalogIdentities = exactLines(outputs.targetCatalog, /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/, "LOCAL_RECOVERY_CATALOG_OUTPUT_INVALID").map(validateTargetCatalogIdentity);
  const bucketParts = typeof outputs.storageBucket === "string" ? outputs.storageBucket.trim().split("|") : [];
  if (bucketParts.length !== 2 || bucketParts[0] !== "godel-files" || bucketParts[1] !== "f") fail("RECOVERY_TARGET_BUCKET_INVALID", "Recovery target bucket output is invalid");
  const replicationRole = typeof outputs.replicationRole === "string" ? outputs.replicationRole.trim() : "";
  if (replicationRole !== "origin") fail("RECOVERY_REPLICATION_ROLE_NOT_ORIGIN", "Recovery target replication role is not origin");
  const catalog = new Set(catalogIdentities);
  if (REQUIRED_TABLES.some((identity) => !catalog.has(identity))) fail("RECOVERY_TARGET_CATALOG_REQUIRED_TABLE_MISSING", "Recovery target catalog lacks a required restore table");
  const targetState = Object.freeze({ migrationVersions, schemas, extensions, bucket: Object.freeze({ id: "godel-files", public: false }) });
  const baseline = validateTargetBaseline({ authority, targetState, requiredExtensions: REQUIRED_TARGET_EXTENSIONS });
  const evidence = Object.freeze({ status: "PASS", baseline, targetCatalogVerified: true, replicationRole });
  baselineDetails.set(evidence, Object.freeze({ targetState, targetTables: Object.freeze(catalogIdentities), containerAuthority }));
  return evidence;
}

export function accessTargetBaselineEvidence(handle, callback) {
  const details = baselineDetails.get(handle);
  if (!details || typeof callback !== "function") fail("RECOVERY_TARGET_BASELINE_AUTHORITY_REQUIRED", "Verified recovery target baseline authority is required");
  return callback(details);
}

export async function runTargetBaselineGate({ executor, containerAuthority, authority, environment = process.env } = {}) {
  const plans = buildTargetBaselineQueryPlans({ executor, containerAuthority, environment });
  const outputs = {};
  for (const queryName of TARGET_BASELINE_QUERY_NAMES) outputs[queryName] = (await executeGovernedTargetPlan(executor, plans[queryName])).stdout;
  return parseTargetBaselineOutputs({ authority, outputs, containerAuthority });
}
