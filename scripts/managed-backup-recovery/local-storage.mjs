import { accessAuthorizedStorageByteEntries } from "./restore-planning.mjs";
import { accessStorageExpectation, digestCanonicalRecords } from "./restore-validation.mjs";
import { accessLocalSupabaseStatus } from "./target-runtime-status.mjs";

const commandPlans = new WeakMap();
const REMOTE_NAME = "GODELM53LOCAL";
const SAFE_ENV_KEYS = Object.freeze(["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE"]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryLocalStorageError";
  error.code = code;
  throw error;
}

function safePath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !/[\0-\x1f]/.test(value) && value.split("/").every((part) => part && part !== "." && part !== "..");
}

function localRcloneEnvironment(localStatus, source) {
  let status;
  accessLocalSupabaseStatus(localStatus, (value) => { status = value; });
  const environment = {};
  for (const key of SAFE_ENV_KEYS) if (typeof source?.[key] === "string") environment[key] = source[key];
  Object.assign(environment, {
    [`RCLONE_CONFIG_${REMOTE_NAME}_TYPE`]: "s3",
    [`RCLONE_CONFIG_${REMOTE_NAME}_PROVIDER`]: "Other",
    [`RCLONE_CONFIG_${REMOTE_NAME}_ENV_AUTH`]: "false",
    [`RCLONE_CONFIG_${REMOTE_NAME}_ENDPOINT`]: status.STORAGE_S3_URL,
    [`RCLONE_CONFIG_${REMOTE_NAME}_REGION`]: status.S3_PROTOCOL_REGION,
    [`RCLONE_CONFIG_${REMOTE_NAME}_ACCESS_KEY_ID`]: status.S3_PROTOCOL_ACCESS_KEY_ID,
    [`RCLONE_CONFIG_${REMOTE_NAME}_SECRET_ACCESS_KEY`]: status.S3_PROTOCOL_ACCESS_KEY_SECRET,
    [`RCLONE_CONFIG_${REMOTE_NAME}_FORCE_PATH_STYLE`]: "true",
  });
  return Object.freeze(environment);
}

function createPlan(operation, args, cwd, environment) {
  if (args.some((value) => /(?:https?:\/\/|amazonaws\.com|r2\.cloudflarestorage\.com)/i.test(value))) fail("RECOVERY_LOCAL_STORAGE_REMOTE_FORBIDDEN", "Local Storage plan contains a remote endpoint");
  const handle = Object.freeze({ status: "READY", operation, transport: "LOCAL_S3", credentialTransport: "ENVIRONMENT_ONLY" });
  commandPlans.set(handle, Object.freeze({ operation, executable: "rclone", args: Object.freeze(args), cwd, allowedEnvironment: environment }));
  return handle;
}

export function accessLocalStorageCommandPlan(handle, callback) {
  const plan = commandPlans.get(handle);
  if (!plan || typeof callback !== "function") fail("RECOVERY_LOCAL_STORAGE_PLAN_REQUIRED", "Governed local Storage command plan is required");
  return callback(plan);
}

export function buildLocalStorageTransferPlans({ authorizedStorageByteRestore, localStatus, cwd, environment = process.env } = {}) {
  if (authorizedStorageByteRestore?.status === "VALIDATED_NO_OP" && authorizedStorageByteRestore.invokeTransfer === false && authorizedStorageByteRestore.objectCount === 0) {
    return Object.freeze({ status: "VALIDATED_NO_OP", invokeTransfer: false, objectCount: 0, plans: Object.freeze([]) });
  }
  let entries;
  accessAuthorizedStorageByteEntries(authorizedStorageByteRestore, (value) => { entries = value; });
  const localEnvironment = localRcloneEnvironment(localStatus, environment);
  const plans = entries.map((entry) => {
    if (!safePath(entry.destination) || !entry.destination.startsWith("godel-files/")) fail("RECOVERY_LOCAL_STORAGE_PATH_INVALID", "Local Storage destination is invalid");
    return createPlan("restore exact local Storage object", ["copyto", entry.source, `${REMOTE_NAME}:${entry.destination}`, "--no-check-dest"], cwd, localEnvironment);
  });
  return Object.freeze({ status: "READY", invokeTransfer: true, objectCount: plans.length, plans: Object.freeze(plans) });
}

export function buildLocalStorageInventoryPlan({ localStatus, cwd, environment = process.env } = {}) {
  return createPlan("inventory restored local Storage bytes", ["lsjson", `${REMOTE_NAME}:godel-files`, "--recursive", "--files-only", "--hash"], cwd, localRcloneEnvironment(localStatus, environment));
}

export function parseLocalStorageInventory({ rawOutput, storageExpectation } = {}) {
  let expected;
  accessStorageExpectation(storageExpectation, (value) => { expected = value; });
  let rows;
  try { rows = JSON.parse(rawOutput); } catch { fail("RECOVERY_LOCAL_STORAGE_INVENTORY_INVALID", "Local Storage inventory output is invalid JSON"); }
  if (!Array.isArray(rows)) fail("RECOVERY_LOCAL_STORAGE_INVENTORY_INVALID", "Local Storage inventory output is invalid");
  const seen = new Set();
  const objects = rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) || row.IsDir !== false || !safePath(row.Path)
      || !Number.isSafeInteger(row.Size) || row.Size < 0 || !row.Hashes || typeof row.Hashes !== "object" || !/^[a-f0-9]{64}$/.test(row.Hashes["SHA-256"] ?? "")) {
      fail("RECOVERY_LOCAL_STORAGE_INVENTORY_INVALID", "Local Storage inventory entry is invalid");
    }
    if (seen.has(row.Path)) fail("RECOVERY_LOCAL_STORAGE_INVENTORY_INVALID", "Local Storage inventory contains a duplicate object");
    seen.add(row.Path);
    return Object.freeze({ path: row.Path, size: row.Size, sha256: row.Hashes["SHA-256"] });
  });
  const expectedPaths = new Set(expected.map(({ path }) => path));
  return Object.freeze({
    objectCount: objects.length,
    totalBytes: objects.reduce((sum, object) => sum + object.size, 0),
    inventoryDigest: digestCanonicalRecords(objects.map(({ path, size, sha256 }) => [path, String(size), sha256])),
    unexpectedObjectCount: objects.filter(({ path }) => !expectedPaths.has(path)).length,
  });
}
