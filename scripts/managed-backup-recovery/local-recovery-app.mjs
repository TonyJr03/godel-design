import { fork } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, realpath, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { accessVerifiedRecoveryAppRuntimeAuthority, isVerifiedRecoveryAppRuntimeAuthority, RECOVERY_APP_BYTE_EXACT_PATHS } from "./app-runtime-authority.mjs";
import { buildRecoveryGitEnvironment } from "./git-environment.mjs";
import { accessLocalSupabaseStatus } from "./target-runtime-status.mjs";
import { probeAvailableLocalPort } from "./target-workspace.mjs";

const HOST = "127.0.0.1";
const PLATFORM_ENVIRONMENT = Object.freeze(["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]);
const workspaceDetails = new WeakMap();
const appDetails = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryLocalApplicationError";
  error.code = code;
  throw error;
}

function contained(parent, candidate) {
  const value = relative(parent, candidate);
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

async function existingRealDirectory(pathname, code) {
  const state = await lstat(pathname).catch(() => null);
  if (!state?.isDirectory() || state.isSymbolicLink()) fail(code, "Recovery application workspace boundary is invalid");
  const actual = await realpath(pathname);
  if (actual !== resolve(pathname)) fail(code, "Recovery application workspace resolved unexpectedly");
  return actual;
}

export async function prepareLocalRecoveryAppWorkspace({ session, repoRoot = process.cwd() } = {}) {
  if (!session || typeof session.evidence !== "string" || typeof session.root !== "string" || !isAbsolute(repoRoot)) fail("RECOVERY_APP_WORKSPACE_INVALID", "Recovery application workspace inputs are invalid");
  const sessionRoot = await existingRealDirectory(session.root, "RECOVERY_APP_WORKSPACE_INVALID");
  const evidence = await existingRealDirectory(session.evidence, "RECOVERY_APP_WORKSPACE_INVALID");
  if (!contained(sessionRoot, evidence)) fail("RECOVERY_APP_WORKSPACE_INVALID", "Recovery application evidence escaped its session");
  const runtimeRoot = join(evidence, "application-runtime");
  const projectDir = join(runtimeRoot, "source");
  const distDir = join(projectDir, ".next-recovery");
  const tempDir = join(runtimeRoot, "temp");
  if (contained(resolve(repoRoot), runtimeRoot) || resolve(repoRoot, ".next") === distDir) fail("RECOVERY_APP_WORKSPACE_INVALID", "Recovery application runtime overlaps the repository");
  try {
    await mkdir(runtimeRoot, { recursive: false, mode: 0o700 });
    await mkdir(projectDir, { recursive: false, mode: 0o700 });
    await mkdir(distDir, { recursive: false, mode: 0o700 });
    await mkdir(tempDir, { recursive: false, mode: 0o700 });
  } catch { fail("RECOVERY_APP_WORKSPACE_INVALID", "Recovery application workspace could not be created exactly"); }
  for (const pathname of [runtimeRoot, projectDir, distDir, tempDir]) {
    const actual = await existingRealDirectory(pathname, "RECOVERY_APP_WORKSPACE_INVALID");
    if (!contained(evidence, actual)) fail("RECOVERY_APP_WORKSPACE_INVALID", "Recovery application workspace escaped its evidence boundary");
  }
  const relativeDistDir = relative(projectDir, distDir);
  if (relativeDistDir.startsWith("..") || resolve(projectDir, relativeDistDir) !== distDir) fail("RECOVERY_APP_DIST_DIR_UNSUPPORTED", "Session-contained Next distDir cannot be represented exactly");
  const handle = Object.freeze({ status: "PREPARED", cacheBoundary: "RECOVERY_SESSION_ONLY", toJSON: () => ({ status: "PREPARED", cacheBoundary: "RECOVERY_SESSION_ONLY" }) });
  workspaceDetails.set(handle, Object.freeze({ repoRoot: resolve(repoRoot), runtimeRoot, projectDir, distDir, tempDir, relativeDistDir }));
  return handle;
}

function governedSourcePath(pathname) {
  return RECOVERY_APP_BYTE_EXACT_PATHS.some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

export async function materializeRecoveryAppSource({ workspace, runtimeAuthority, environment = process.env, execute = runCommand } = {}) {
  if (!isVerifiedRecoveryAppRuntimeAuthority(runtimeAuthority) || typeof execute !== "function") fail("RECOVERY_APP_RUNTIME_AUTHORITY_REQUIRED", "Verified recovery application runtime authority is required");
  let paths;
  accessLocalRecoveryAppWorkspace(workspace, (value) => { paths = value; });
  let runtimePackageJson;
  accessVerifiedRecoveryAppRuntimeAuthority(runtimeAuthority, (value) => { runtimePackageJson = value.runtimePackageJson; });
  const plan = {
    operation: "list governed recovery application source",
    executable: "git",
    args: ["ls-files", "-z", "--", ...RECOVERY_APP_BYTE_EXACT_PATHS],
    cwd: paths.repoRoot,
    allowedEnvironment: buildRecoveryGitEnvironment({ sourceEnvironment: environment, repoRoot: paths.repoRoot }),
    preserveOutput: true,
    maxOutputBytes: 8 * 1024 * 1024,
  };
  let output;
  try { output = (await execute(plan)).stdout; } catch { fail("RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED", "Governed recovery application source is unavailable"); }
  const names = String(output ?? "").split("\0").filter(Boolean);
  if (names.length === 0 || new Set(names).size !== names.length || names.some((name) => !governedSourcePath(name) || name.includes("\\") || name.startsWith("/") || name.split("/").includes(".."))) fail("RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED", "Governed recovery application source inventory is invalid");
  for (const name of names) {
    const source = resolve(paths.repoRoot, ...name.split("/"));
    const destination = resolve(paths.projectDir, ...name.split("/"));
    if (!contained(paths.repoRoot, source) || !contained(paths.projectDir, destination)) fail("RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED", "Governed recovery application source escaped its boundary");
    const state = await lstat(source).catch(() => null);
    if (!state?.isFile() || state.isSymbolicLink() || await realpath(source) !== source) fail("RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED", "Governed recovery application source entry is invalid");
    await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
    try { await copyFile(source, destination, fsConstants.COPYFILE_EXCL); } catch { fail("RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED", "Governed recovery application source could not be copied exactly"); }
  }
  try { await writeFile(join(paths.projectDir, "package.json"), runtimePackageJson, { encoding: "utf8", flag: "wx", mode: 0o600 }); } catch { fail("RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED", "Production recovery application package manifest could not be materialized exactly"); }
  return Object.freeze({ status: "MATERIALIZED", sourceAuthority: "GIT_GOVERNED", packageAuthority: "PRODUCTION_RUNTIME", fileCount: names.length + 1 });
}

export function accessLocalRecoveryAppWorkspace(handle, callback) {
  const details = workspaceDetails.get(handle);
  if (!details || typeof callback !== "function") fail("RECOVERY_APP_WORKSPACE_HANDLE_INVALID", "Prepared recovery application workspace is required");
  return callback(details);
}

export function buildLocalRecoveryAppEnvironment({ localStatus, workspace, sourceEnvironment = process.env } = {}) {
  let runtime;
  accessLocalSupabaseStatus(localStatus, (value) => { runtime = value; });
  let paths;
  accessLocalRecoveryAppWorkspace(workspace, (value) => { paths = value; });
  const environment = {};
  for (const key of PLATFORM_ENVIRONMENT) if (typeof sourceEnvironment?.[key] === "string") environment[key] = sourceEnvironment[key];
  Object.assign(environment, {
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_PATH: join(paths.repoRoot, "node_modules"),
    TEMP: paths.tempDir,
    TMP: paths.tempDir,
    NEXT_PUBLIC_SUPABASE_URL: runtime.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: runtime.ANON_KEY,
    SUPABASE_SERVER_URL: runtime.API_URL,
  });
  return Object.freeze(environment);
}

export function verifyNextProgrammaticDistDirOverride({ createNextServer, workspace, port = 32123 } = {}) {
  if (typeof createNextServer !== "function" || !Number.isSafeInteger(port)) fail("RECOVERY_APP_DIST_DIR_UNSUPPORTED", "Next programmatic server factory is unavailable");
  let paths;
  accessLocalRecoveryAppWorkspace(workspace, (value) => { paths = value; });
  const app = createNextServer({ dev: true, dir: paths.projectDir, hostname: HOST, port, quiet: true, webpack: true, conf: { distDir: paths.relativeDistDir } });
  if (!app || resolve(paths.projectDir, app.options?.conf?.distDir ?? "") !== paths.distDir) fail("RECOVERY_APP_DIST_DIR_UNSUPPORTED", "Installed Next version rejected the governed distDir override");
  return Object.freeze({ status: "SUPPORTED", runtimeBoundary: "RECOVERY_SESSION_ONLY" });
}

function appendRedacted(current, chunk, redactions) {
  let value = `${current}${String(chunk ?? "")}`.slice(-8192);
  for (const secret of redactions) if (typeof secret === "string" && secret.length >= 4) value = value.split(secret).join("[REDACTED]");
  return value;
}

function waitForChild(child, acceptedTypes, timeoutMs, code) {
  return new Promise((accept, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(Object.assign(new Error("Recovery application process timed out"), { code })); }, timeoutMs);
    const onMessage = (message) => {
      if (message?.type === "failure") { cleanup(); reject(Object.assign(new Error("Recovery application process failed"), { code: message.code ?? code })); return; }
      if (acceptedTypes.has(message?.type)) { cleanup(); accept(message); }
    };
    const onExit = () => { cleanup(); reject(Object.assign(new Error("Recovery application process exited unexpectedly"), { code: "RECOVERY_APP_PROCESS_FAILED" })); };
    const onError = () => { cleanup(); reject(Object.assign(new Error("Recovery application process failed"), { code })); };
    const cleanup = () => { clearTimeout(timeout); child.off("message", onMessage); child.off("exit", onExit); child.off("error", onError); };
    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

async function cleanupFailedStart(child, port, timeoutMs, probeClosed) {
  if (child.exitCode === null) {
    const exited = new Promise((accept, reject) => {
      const timeout = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeoutMs);
      const onExit = () => { cleanup(); accept(); };
      const onError = () => { cleanup(); reject(new Error("process error")); };
      const cleanup = () => { clearTimeout(timeout); child.off("exit", onExit); child.off("error", onError); };
      child.once("exit", onExit);
      child.once("error", onError);
    });
    try {
      if (child.kill() === false) throw new Error("kill rejected");
      await exited;
    } catch {
      fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Failed recovery application process could not be stopped");
    }
  }
  if (await probeClosed({ port, host: HOST }) !== true) fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Failed recovery application port remained open");
}

export async function startLocalRecoveryApp({ localStatus, session, runtimeAuthority, repoRoot = process.cwd(), sourceEnvironment = process.env, allocatePort = probeAvailableLocalPort, createNextServer, forkProcess = fork, materializeSource = materializeRecoveryAppSource, execute = runCommand, probeClosed = probeClosedLocalPort, timeoutMs = 120_000 } = {}) {
  const workspace = await prepareLocalRecoveryAppWorkspace({ session, repoRoot });
  await materializeSource({ workspace, runtimeAuthority, environment: sourceEnvironment, execute });
  const port = await allocatePort("recovery-application");
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) fail("RECOVERY_APP_PORT_INVALID", "Recovery application port is invalid");
  const nextFactory = createNextServer ?? (await import("next")).default;
  verifyNextProgrammaticDistDirOverride({ createNextServer: nextFactory, workspace, port });
  const environment = buildLocalRecoveryAppEnvironment({ localStatus, workspace, sourceEnvironment });
  let paths;
  accessLocalRecoveryAppWorkspace(workspace, (value) => { paths = value; });
  let runtime;
  accessLocalSupabaseStatus(localStatus, (value) => { runtime = value; });
  const worker = fileURLToPath(new URL("./local-recovery-app-worker.mjs", import.meta.url));
  const child = forkProcess(worker, [], { cwd: repoRoot, env: environment, windowsHide: true, silent: true, serialization: "json" });
  const redactions = [runtime.API_URL, runtime.ANON_KEY, paths.repoRoot, paths.runtimeRoot, paths.distDir, paths.tempDir];
  const state = { logs: "", unexpectedExit: false, stopping: false };
  child.stdout?.on("data", (chunk) => { state.logs = appendRedacted(state.logs, chunk, redactions); });
  child.stderr?.on("data", (chunk) => { state.logs = appendRedacted(state.logs, chunk, redactions); });
  child.on("exit", () => { if (!state.stopping) state.unexpectedExit = true; });
  const ready = waitForChild(child, new Set(["ready"]), timeoutMs, "RECOVERY_APP_START_FAILED");
  child.send({ type: "start", host: HOST, port, projectDir: paths.projectDir, distDir: paths.distDir });
  try { await ready; } catch (error) {
    state.stopping = true;
    await cleanupFailedStart(child, port, timeoutMs, probeClosed);
    throw error;
  }
  const handle = Object.freeze({ status: "RUNNING", locality: "LOCAL_LOOPBACK", cacheBoundary: "RECOVERY_SESSION_ONLY", toJSON: () => ({ status: "RUNNING", locality: "LOCAL_LOOPBACK", cacheBoundary: "RECOVERY_SESSION_ONLY" }) });
  appDetails.set(handle, { child, port, origin: `http://${HOST}:${port}`, supabaseOrigin: new URL(runtime.API_URL).origin, state, workspace });
  return handle;
}

export function accessLocalRecoveryApp(handle, callback) {
  const details = appDetails.get(handle);
  if (!details || typeof callback !== "function") fail("RECOVERY_APP_HANDLE_INVALID", "Running recovery application handle is required");
  if (details.state.unexpectedExit) fail("RECOVERY_APP_PROCESS_FAILED", "Recovery application process exited unexpectedly");
  return callback(Object.freeze({ origin: details.origin, supabaseOrigin: details.supabaseOrigin, port: details.port }));
}

export function probeClosedLocalPort({ port, host = HOST, timeoutMs = 1000 } = {}) {
  return new Promise((accept) => {
    const socket = connect({ host, port });
    const finish = (closed) => { socket.destroy(); accept(closed); };
    socket.setTimeout(timeoutMs, () => finish(true));
    socket.once("error", () => finish(true));
    socket.once("connect", () => finish(false));
  });
}

export async function stopLocalRecoveryApp(handle, { timeoutMs = 30_000, probeClosed = probeClosedLocalPort } = {}) {
  const details = appDetails.get(handle);
  if (!details) fail("RECOVERY_APP_HANDLE_INVALID", "Running recovery application handle is required");
  details.state.stopping = true;
  if (details.child.exitCode === null) {
    const stopped = waitForChild(details.child, new Set(["stopped"]), timeoutMs, "RECOVERY_APP_CLEANUP_INCOMPLETE");
    details.child.send({ type: "stop" });
    try { await stopped; } catch { if (details.child.exitCode === null) details.child.kill(); fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Recovery application cleanup did not complete"); }
    if (details.child.exitCode === null) {
      try {
        await new Promise((accept, reject) => {
          const timeout = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeoutMs);
          const onExit = () => { cleanup(); accept(); };
          const cleanup = () => { clearTimeout(timeout); details.child.off("exit", onExit); };
          details.child.once("exit", onExit);
        });
      } catch { if (details.child.exitCode === null) details.child.kill(); fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Recovery application process did not exit"); }
    }
  }
  if (await probeClosed({ port: details.port, host: HOST }) !== true) fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Recovery application port remained open");
  appDetails.delete(handle);
  return Object.freeze({ status: "PASS", applicationCleanup: "PASS" });
}
