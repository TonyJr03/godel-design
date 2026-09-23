import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { ManagedBackupCommandError, validateSecretSafeArgs } from "./command-runner.mjs";

const MAX_OUTPUT_BYTES = 128 * 1024;

function fail(message) {
  throw new ManagedBackupCommandError({
    operation: "validate pipeline",
    stderrSummary: message,
    code: "COMMAND_PLAN_INVALID",
  });
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function validateStage(stage, label, secretValues) {
  if (!plain(stage) || Object.keys(stage).some((key) => !["executable", "args"].includes(key))) {
    fail(`${label} pipeline stage is invalid`);
  }
  if (typeof stage.executable !== "string" || stage.executable.length === 0) fail(`${label} executable is required`);
  validateSecretSafeArgs(stage.args, { secretValues });
}

function appendLimited(chunks, chunk, currentSize) {
  if (currentSize >= MAX_OUTPUT_BYTES) return currentSize;
  const buffer = Buffer.from(chunk);
  const remaining = MAX_OUTPUT_BYTES - currentSize;
  chunks.push(buffer.subarray(0, remaining));
  return currentSize + Math.min(buffer.length, remaining);
}

function sanitizeSummary(value, secrets = []) {
  let output = String(value ?? "");
  for (const secret of secrets.filter((candidate) => typeof candidate === "string" && candidate.length >= 4)) {
    output = output.split(secret).join("[REDACTED]");
  }
  return output
    .replace(/AGE-SECRET-KEY-[A-Z0-9-]+/g, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .slice(0, 4096)
    .trim();
}

export async function runPipeline(options) {
  if (!plain(options)) fail("Pipeline options must be an object");
  const allowedKeys = new Set(["operation", "left", "right", "allowedEnvironment", "cwd", "secretValues"]);
  if (Object.keys(options).some((key) => !allowedKeys.has(key))) fail("Unexpected pipeline option");
  const {
    operation,
    left,
    right,
    allowedEnvironment = {},
    cwd,
    secretValues = [],
  } = options;
  if (typeof operation !== "string" || operation.length === 0) fail("Pipeline operation is required");
  if (typeof cwd !== "string" || cwd.length === 0) fail("Pipeline cwd must be explicit");
  if (!plain(allowedEnvironment) || Object.entries(allowedEnvironment).some(([key, value]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string")) {
    fail("Pipeline environment must be an explicit string map");
  }
  if (!Array.isArray(secretValues) || secretValues.some((value) => typeof value !== "string")) fail("Pipeline secret values are invalid");
  validateStage(left, "Left", secretValues);
  validateStage(right, "Right", secretValues);
  const secretEnvironmentValues = Object.entries(allowedEnvironment)
    .filter(([key]) => /(password|pass|token|secret|key|credential|database.?url|dsn|identity)/i.test(key))
    .map(([, value]) => value);
  const redactions = [...secretValues, ...secretEnvironmentValues];

  return new Promise((accept, reject) => {
    const spawnOptions = {
      cwd: resolve(cwd),
      env: { ...allowedEnvironment },
      shell: false,
      windowsHide: true,
    };
    const producer = spawn(left.executable, left.args, { ...spawnOptions, stdio: ["ignore", "pipe", "pipe"] });
    const consumer = spawn(right.executable, right.args, { ...spawnOptions, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const producerStderr = [];
    const consumerStderr = [];
    let stdoutSize = 0;
    let producerStderrSize = 0;
    let consumerStderrSize = 0;
    let settled = false;
    let producerClose;
    let consumerClose;

    const stop = () => {
      if (!producer.killed) producer.kill();
      if (!consumer.killed) consumer.kill();
    };
    const rejectOnce = (code, summary) => {
      if (settled) return;
      settled = true;
      stop();
      reject(new ManagedBackupCommandError({ operation, stderrSummary: sanitizeSummary(summary, redactions) || "Pipeline failed", code }));
    };
    const finish = () => {
      if (settled || producerClose === undefined || consumerClose === undefined) return;
      const [producerCode, producerSignal] = producerClose;
      const [consumerCode, consumerSignal] = consumerClose;
      if (producerCode !== 0 || consumerCode !== 0) {
        const summary = Buffer.concat(producerCode !== 0 ? producerStderr : consumerStderr).toString("utf8");
        settled = true;
        reject(new ManagedBackupCommandError({
          operation,
          exitCode: producerCode !== 0 ? producerCode : consumerCode,
          signal: producerCode !== 0 ? producerSignal : consumerSignal,
          stderrSummary: sanitizeSummary(summary, redactions) || "Pipeline stage exited unsuccessfully",
        }));
        return;
      }
      settled = true;
      accept({
        stdout: sanitizeSummary(Buffer.concat(stdout).toString("utf8"), redactions),
        stderr: sanitizeSummary(Buffer.concat([...producerStderr, ...consumerStderr]).toString("utf8"), redactions),
      });
    };

    producer.on("error", (error) => rejectOnce(error?.code === "ENOENT" ? "EXECUTABLE_UNAVAILABLE" : "COMMAND_START_FAILED", "Producer executable is unavailable"));
    consumer.on("error", (error) => rejectOnce(error?.code === "ENOENT" ? "EXECUTABLE_UNAVAILABLE" : "COMMAND_START_FAILED", "Consumer executable is unavailable"));
    producer.stderr.on("data", (chunk) => { producerStderrSize = appendLimited(producerStderr, chunk, producerStderrSize); });
    consumer.stdout.on("data", (chunk) => { stdoutSize = appendLimited(stdout, chunk, stdoutSize); });
    consumer.stderr.on("data", (chunk) => { consumerStderrSize = appendLimited(consumerStderr, chunk, consumerStderrSize); });
    producer.stdout.pipe(consumer.stdin);
    producer.on("close", (code, signal) => { producerClose = [code, signal]; finish(); });
    consumer.on("close", (code, signal) => { consumerClose = [code, signal]; finish(); });
  });
}
