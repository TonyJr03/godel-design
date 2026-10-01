import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

export const MANAGED_R2_ENV_KEYS = Object.freeze([
  "GODEL_BACKUP_R2_BUCKET",
  "GODEL_BACKUP_R2_ENDPOINT",
  "GODEL_BACKUP_R2_ACCESS_KEY_ID",
  "GODEL_BACKUP_R2_SECRET_ACCESS_KEY",
]);

const MAX_ENV_FILE_BYTES = 16 * 1024;
const allowedKeys = new Set(MANAGED_R2_ENV_KEYS);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryR2LocalEnvironmentError";
  error.code = code;
  throw error;
}

function parseValue(source) {
  const value = source.trim();
  if (value.length === 0 || value.includes("\0") || value.includes("${") || value.includes("$(") || value.includes("`")) {
    fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file contains an unsupported value");
  }
  const quote = value[0];
  if (quote === "\"" || quote === "'") {
    if (value.length < 2 || value.at(-1) !== quote) fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file contains an invalid quoted value");
    const inner = value.slice(1, -1);
    if (inner.length === 0 || inner.includes(quote) || inner.includes("\\") || inner.includes("\r") || inner.includes("\n")) {
      fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file contains an unsupported quoted value");
    }
    return inner;
  }
  if (value.includes("\"") || value.includes("'") || value.includes("\\") || /\s/.test(value)) {
    fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file contains an unsupported unquoted value");
  }
  return value;
}

export function parseManagedR2LocalEnvironment(source) {
  if (typeof source !== "string" || source.length === 0 || source.includes("\0")) fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file is invalid");
  const values = {};
  for (const rawLine of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || !allowedKeys.has(match[1]) || Object.hasOwn(values, match[1])) fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file has invalid keys");
    values[match[1]] = parseValue(match[2]);
  }
  if (Object.keys(values).length !== MANAGED_R2_ENV_KEYS.length || MANAGED_R2_ENV_KEYS.some((key) => !Object.hasOwn(values, key))) {
    fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file is incomplete");
  }
  return Object.freeze(Object.fromEntries(MANAGED_R2_ENV_KEYS.map((key) => [key, values[key]])));
}

export async function resolveManagedR2RecoveryEnvironment({ repoRoot = process.cwd(), environment = process.env } = {}) {
  const present = MANAGED_R2_ENV_KEYS.filter((key) => typeof environment?.[key] === "string");
  if (present.length === MANAGED_R2_ENV_KEYS.length) return Object.freeze({ source: "PROCESS_ENV", environment: Object.freeze({ ...environment }) });
  if (present.length !== 0) fail("RECOVERY_R2_LOCAL_ENV_CONFLICT", "Managed R2 process environment is partial and cannot be merged");
  if (typeof repoRoot !== "string" || !isAbsolute(repoRoot)) fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 repository authority is invalid");
  const pathname = resolve(repoRoot, ".env.managed.r2.local");
  let state;
  try {
    state = await lstat(pathname);
  } catch (error) {
    if (error?.code === "ENOENT") fail("RECOVERY_R2_LOCAL_ENV_FILE_MISSING", "Managed R2 local environment file is missing");
    fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file cannot be admitted");
  }
  if (!state.isFile() || state.isSymbolicLink() || state.size <= 0 || state.size > MAX_ENV_FILE_BYTES) fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file is unsafe");
  const actual = await realpath(pathname);
  if (actual !== pathname) fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file resolves unexpectedly");
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(pathname));
  } catch {
    fail("RECOVERY_R2_LOCAL_ENV_INVALID", "Managed R2 local environment file is not valid UTF-8");
  }
  const values = parseManagedR2LocalEnvironment(source);
  return Object.freeze({ source: "LOCAL_FILE", environment: Object.freeze({ ...environment, ...values }) });
}
