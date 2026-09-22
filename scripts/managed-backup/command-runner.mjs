import { spawn } from "node:child_process";
import { resolve } from "node:path";

const SECRET_ARG_NAME = /^--?(?:password|pass|token|secret|api[-_]?key|access[-_]?key|private[-_]?key|db[-_]?url|connection[-_]?string)(?:=|$)/i;
const SECRET_LITERAL_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/i,
  /AGE-SECRET-KEY-[A-Z0-9-]+/,
  /\bsb_secret_[A-Za-z0-9_-]+/,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];
const MAX_OUTPUT_BYTES = 128 * 1024;

export class ManagedBackupCommandError extends Error {
  constructor({ operation, exitCode = null, signal = null, stderrSummary = "Command failed", code = "COMMAND_FAILED" }) {
    super(`${operation}: ${stderrSummary}`);
    this.name = "ManagedBackupCommandError";
    this.code = code;
    this.operation = operation;
    this.exitCode = exitCode;
    this.signal = signal;
    this.stderrSummary = stderrSummary;
  }
}

function fail(code, message) {
  throw new ManagedBackupCommandError({ operation: "validate command", stderrSummary: message, code });
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function redact(source, secrets) {
  let output = String(source ?? "");
  for (const secret of secrets.filter((value) => typeof value === "string" && value.length >= 4)) {
    output = output.split(secret).join("[REDACTED]");
  }
  output = output.replace(/postgres(?:ql)?:\/\/[^\s/:]+:[^\s@]+@/gi, "postgresql://[REDACTED]@");
  output = output.replace(/AGE-SECRET-KEY-[A-Z0-9-]+/g, "[REDACTED]");
  output = output.replace(/\bsb_secret_[A-Za-z0-9_-]+/g, "[REDACTED]");
  output = output.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]");
  return output.slice(0, 4096).trim();
}

export function validateSecretSafeArgs(args, { secretValues = [] } = {}) {
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    fail("COMMAND_PLAN_INVALID", "Command args must be an array of strings");
  }
  for (const [index, value] of args.entries()) {
    if (SECRET_ARG_NAME.test(value)) fail("SECRET_IN_ARGV", "Secret-bearing command option is forbidden");
    if (SECRET_LITERAL_PATTERNS.some((pattern) => pattern.test(value))) fail("SECRET_IN_ARGV", "Secret-like command value is forbidden");
    if (secretValues.some((secret) => typeof secret === "string" && secret.length > 0 && value.includes(secret))) {
      fail("SECRET_IN_ARGV", "Known secret value is forbidden in argv");
    }
    if (index > 0 && SECRET_ARG_NAME.test(args[index - 1])) fail("SECRET_IN_ARGV", "Secret-bearing command value is forbidden");
  }
  return args;
}

export function validateSecretSafeDatabaseTransport(transport) {
  if (!plain(transport)) fail("DATABASE_TRANSPORT_INVALID", "Database credential transport must be explicit");
  const keys = ["mechanism", "argvContainsPassword", "argvContainsFullDatabaseUrl", "provenLocally"];
  if (Object.keys(transport).length !== keys.length || Object.keys(transport).some((key) => !keys.includes(key))) {
    fail("DATABASE_TRANSPORT_INVALID", "Database credential transport contains unexpected fields");
  }
  const allowed = new Set(["environment", "temporary-credential-file", "native-credential-store", "stdin"]);
  if (!allowed.has(transport.mechanism)) fail("DATABASE_TRANSPORT_INVALID", "Database credential transport is unsupported");
  if (transport.argvContainsPassword !== false || transport.argvContainsFullDatabaseUrl !== false) {
    fail("DATABASE_TRANSPORT_UNSAFE", "Database secrets or full URLs in argv are forbidden");
  }
  if (transport.provenLocally !== true) {
    fail("DATABASE_TRANSPORT_UNPROVEN", "Database secret-safe transport is pending local proof");
  }
  return transport;
}

function appendLimited(chunks, chunk, currentSize) {
  if (currentSize >= MAX_OUTPUT_BYTES) return currentSize;
  const buffer = Buffer.from(chunk);
  const remaining = MAX_OUTPUT_BYTES - currentSize;
  chunks.push(buffer.subarray(0, remaining));
  return currentSize + Math.min(buffer.length, remaining);
}

export async function runCommand(options) {
  if (!plain(options)) fail("COMMAND_PLAN_INVALID", "Command options must be an object");
  const allowedKeys = new Set(["operation", "executable", "args", "allowedEnvironment", "stdin", "cwd", "secretValues"]);
  if (Object.keys(options).some((key) => !allowedKeys.has(key))) fail("COMMAND_PLAN_INVALID", "Unexpected command option");
  const {
    operation,
    executable,
    args = [],
    allowedEnvironment = {},
    stdin,
    cwd,
    secretValues = [],
  } = options;
  if (typeof operation !== "string" || operation.length === 0 || typeof executable !== "string" || executable.length === 0) {
    fail("COMMAND_PLAN_INVALID", "Command operation and executable are required");
  }
  if (typeof cwd !== "string" || cwd.length === 0) fail("COMMAND_PLAN_INVALID", "Command cwd must be explicit");
  if (!plain(allowedEnvironment) || Object.entries(allowedEnvironment).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string")) {
    fail("COMMAND_PLAN_INVALID", "Command environment must be an explicit string map");
  }
  validateSecretSafeArgs(args, { secretValues });
  const secretEnvironmentValues = Object.entries(allowedEnvironment)
    .filter(([key]) => /(password|pass|token|secret|key|credential|database.?url|dsn|identity)/i.test(key))
    .map(([, value]) => value);
  const redactions = [...secretValues, ...secretEnvironmentValues];

  return new Promise((accept, reject) => {
    const child = spawn(executable, args, {
      cwd: resolve(cwd),
      env: { ...allowedEnvironment },
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    child.stdout.on("data", (chunk) => { stdoutSize = appendLimited(stdout, chunk, stdoutSize); });
    child.stderr.on("data", (chunk) => { stderrSize = appendLimited(stderr, chunk, stderrSize); });
    child.on("error", (error) => reject(new ManagedBackupCommandError({
      operation,
      stderrSummary: redact(error?.code === "ENOENT" ? "Executable is unavailable" : error?.message, redactions),
      code: error?.code === "ENOENT" ? "EXECUTABLE_UNAVAILABLE" : "COMMAND_START_FAILED",
    })));
    child.on("close", (exitCode, signal) => {
      const sanitizedStdout = redact(Buffer.concat(stdout).toString("utf8"), redactions);
      const sanitizedStderr = redact(Buffer.concat(stderr).toString("utf8"), redactions);
      if (exitCode !== 0) {
        reject(new ManagedBackupCommandError({ operation, exitCode, signal, stderrSummary: sanitizedStderr || "Command exited unsuccessfully" }));
        return;
      }
      accept({ exitCode, signal, stdout: sanitizedStdout, stderr: sanitizedStderr });
    });
    if (stdin === undefined || stdin === null) child.stdin.end();
    else if (typeof stdin === "string" || Buffer.isBuffer(stdin)) child.stdin.end(stdin);
    else {
      child.kill();
      reject(new ManagedBackupCommandError({ operation, stderrSummary: "stdin must be text or bytes", code: "COMMAND_PLAN_INVALID" }));
    }
  });
}
