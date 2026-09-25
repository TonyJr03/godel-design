const statusSecrets = new WeakMap();
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const REQUIRED_FIELDS = Object.freeze([
  "API_URL",
  "DB_URL",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "STORAGE_S3_URL",
  "S3_PROTOCOL_ACCESS_KEY_ID",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
  "S3_PROTOCOL_REGION",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryTargetStatusError";
  error.code = code;
  throw error;
}

function parseLoopbackUrl(value, protocols) {
  try {
    const url = new URL(value);
    if (!protocols.has(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

function confidentialValue(value) {
  return typeof value === "string" && value.length > 0 && !/[\r\n\0]/.test(value);
}

export function admitLocalSupabaseStatus(rawOutput) {
  let raw;
  try {
    raw = JSON.parse(rawOutput);
  } catch {
    fail("RECOVERY_TARGET_STATUS_INVALID", "Local Supabase status output is not valid JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("RECOVERY_TARGET_STATUS_INVALID", "Local Supabase status output is invalid");
  if (REQUIRED_FIELDS.some((field) => !confidentialValue(raw[field]))) fail("RECOVERY_TARGET_STATUS_REQUIRED_FIELD_MISSING", "Local Supabase status is missing a required runtime field");
  const api = parseLoopbackUrl(raw.API_URL, new Set(["http:", "https:"]));
  const database = parseLoopbackUrl(raw.DB_URL, new Set(["postgres:", "postgresql:"]));
  const storage = parseLoopbackUrl(raw.STORAGE_S3_URL, new Set(["http:", "https:"]));
  if (!api || !database || !storage) fail("RECOVERY_TARGET_STATUS_REMOTE_FORBIDDEN", "Local Supabase status contains a non-local endpoint");
  for (const field of ["PROJECT_REF", "LINKED_PROJECT_REF", "SUPABASE_PROJECT_REF"]) {
    if (raw[field] !== undefined && raw[field] !== null && raw[field] !== "") fail("RECOVERY_TARGET_STATUS_LINKED_FORBIDDEN", "Linked Supabase status is forbidden");
  }
  const sanitized = Object.freeze({
    status: "ADMITTED",
    apiEndpoint: "LOCAL_LOOPBACK",
    dbHost: "LOCAL_LOOPBACK",
    storageS3Endpoint: "LOCAL_LOOPBACK",
    requiredServices: Object.freeze({ api: true, database: true, storageS3: true }),
    toJSON() {
      return { status: this.status, apiEndpoint: this.apiEndpoint, dbHost: this.dbHost, storageS3Endpoint: this.storageS3Endpoint, requiredServices: this.requiredServices };
    },
  });
  statusSecrets.set(sanitized, Object.freeze(Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, raw[field]]))));
  return sanitized;
}

export function accessLocalSupabaseStatus(handle, callback) {
  const secrets = statusSecrets.get(handle);
  if (!secrets || typeof callback !== "function") fail("RECOVERY_TARGET_STATUS_HANDLE_REQUIRED", "Admitted local Supabase status is required");
  return callback(secrets);
}

export function isAdmittedLocalSupabaseStatus(handle) {
  return statusSecrets.has(handle);
}
