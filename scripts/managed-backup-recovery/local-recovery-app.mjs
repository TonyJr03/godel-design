import { fork } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { copyFile, lstat, mkdir, open, realpath, symlink, unlink, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { accessVerifiedRecoveryAppRuntimeAuthority, isVerifiedRecoveryAppRuntimeAuthority, RECOVERY_APP_BYTE_EXACT_PATHS } from "./app-runtime-authority.mjs";
import { verifyPhysicalLocalRecoveryNextVolumeTopology } from "./application-runtime-topology.mjs";
import { buildRecoveryGitEnvironment } from "./git-environment.mjs";
import { accessLocalSupabaseStatus } from "./target-runtime-status.mjs";
import { probeAvailableLocalPort } from "./target-workspace.mjs";

const HOST = "127.0.0.1";
const PLATFORM_ENVIRONMENT = Object.freeze(["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]);
const DIAGNOSTIC_EVENT_BUDGET_BYTES = 8 * 1024;
const DIAGNOSTIC_EVENT_COUNT_LIMIT = 256;
const DIAGNOSTIC_QUIET_MS = 50;
const DIAGNOSTIC_MAX_SETTLE_MS = 1000;
const GENERATED_TYPES_MAX_BYTES = 16 * 1024;
const workspaceDetails = new WeakMap();
const appDetails = new WeakMap();
const dependencyMountDetails = new WeakMap();
const diagnosticCheckpointDetails = new WeakMap();

export const RECOVERY_APP_SHUTDOWN_FAILURE_CODES = Object.freeze([
  "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED",
  "RECOVERY_APP_SHUTDOWN_EXIT_FAILED",
  "RECOVERY_APP_SHUTDOWN_PORT_OPEN",
]);

export const RECOVERY_APP_CLEANUP_FAILURE_CODES = Object.freeze([
  ...RECOVERY_APP_SHUTDOWN_FAILURE_CODES,
  "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED",
]);

export const RECOVERY_APP_RUNTIME_DIAGNOSTICS = Object.freeze([
  "MODULE_RESOLUTION_FAILURE",
  "COMPILE_FAILURE",
  "RUNTIME_FAILURE",
  "UNCLASSIFIED",
]);

export const RECOVERY_APP_MODULE_TAXONOMY = Object.freeze([
  "PROJECT_ALIAS",
  "RELATIVE_IMPORT",
  "NEXT_INTERNAL",
  "DECLARED_PACKAGE",
  "OTHER_BARE_PACKAGE",
  "NODE_BUILTIN",
  "ABSOLUTE_PATH",
  "REDACTED_PATH",
  "LOADER_REQUEST",
  "UNPARSED",
  "MIXED",
  "UNKNOWN",
]);

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
  const distDir = join(projectDir, ".next");
  const tempDir = join(runtimeRoot, "temp");
  if (contained(resolve(repoRoot), runtimeRoot) || resolve(repoRoot, ".next") === distDir) fail("RECOVERY_APP_WORKSPACE_INVALID", "Recovery application runtime overlaps the repository");
  try {
    await mkdir(runtimeRoot, { recursive: false, mode: 0o700 });
    await mkdir(projectDir, { recursive: false, mode: 0o700 });
    await mkdir(tempDir, { recursive: false, mode: 0o700 });
  } catch { fail("RECOVERY_APP_WORKSPACE_INVALID", "Recovery application workspace could not be created exactly"); }
  for (const pathname of [runtimeRoot, projectDir, tempDir]) {
    const actual = await existingRealDirectory(pathname, "RECOVERY_APP_WORKSPACE_INVALID");
    if (!contained(evidence, actual)) fail("RECOVERY_APP_WORKSPACE_INVALID", "Recovery application workspace escaped its evidence boundary");
  }
  if (await lstat(distDir).catch(() => null)) fail("RECOVERY_APP_DIST_DIR_UNSUPPORTED", "Recovery application default distDir exists unexpectedly");
  const handle = Object.freeze({ status: "PREPARED", cacheBoundary: "RECOVERY_SESSION_ONLY", toJSON: () => ({ status: "PREPARED", cacheBoundary: "RECOVERY_SESSION_ONLY" }) });
  workspaceDetails.set(handle, Object.freeze({ repoRoot: resolve(repoRoot), runtimeRoot, projectDir, distDir, tempDir }));
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

async function inspectOptional(pathname, inspect, code) {
  try { return await inspect(pathname); }
  catch (error) {
    if (error?.code === "ENOENT") return null;
    fail(code, "Recovery application dependency filesystem state is invalid");
  }
}

async function resolveRealPath(pathname, resolveReal, code) {
  try { return await resolveReal(pathname); }
  catch { fail(code, "Recovery application dependency filesystem state is invalid"); }
}

async function removePartialDependencyMount({ mountPath, inspect, removeMount }) {
  const state = await inspectOptional(mountPath, inspect, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  if (state === null) return;
  if (!state.isSymbolicLink()) fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency mount cleanup was unsafe");
  try { await removeMount(mountPath); } catch { fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency mount cleanup failed"); }
  if (await inspectOptional(mountPath, inspect, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED") !== null) {
    fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency mount cleanup was incomplete");
  }
}

export async function mountLocalRecoveryAppDependencies({
  workspace,
  platform = process.platform,
  inspect = lstat,
  resolveReal = realpath,
  createMount = symlink,
  removeMount = unlink,
} = {}) {
  if (![inspect, resolveReal, createMount, removeMount].every((value) => typeof value === "function")) {
    fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency mount primitives are invalid");
  }
  let paths;
  accessLocalRecoveryAppWorkspace(workspace, (value) => { paths = value; });
  const dependencyPath = resolve(paths.repoRoot, "node_modules");
  if (dirname(dependencyPath) !== paths.repoRoot || !contained(paths.repoRoot, dependencyPath)) {
    fail("RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "Repository dependency authority is invalid");
  }
  const dependencyState = await inspectOptional(dependencyPath, inspect, "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID");
  if (!dependencyState?.isDirectory() || dependencyState.isSymbolicLink()) {
    fail("RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "Repository dependency authority is invalid");
  }
  const dependencyAuthority = await resolveRealPath(dependencyPath, resolveReal, "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID");
  if (dependencyAuthority !== dependencyPath) fail("RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "Repository dependency authority resolved unexpectedly");

  const mountPath = resolve(paths.projectDir, "node_modules");
  if (dirname(mountPath) !== paths.projectDir || !contained(paths.projectDir, mountPath)) {
    fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency mount path is invalid");
  }
  if (await inspectOptional(mountPath, inspect, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID") !== null) {
    fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency mount path already exists");
  }

  let creationAttempted = false;
  try {
    creationAttempted = true;
    await createMount(dependencyAuthority, mountPath, platform === "win32" ? "junction" : "dir");
    const mountedState = await inspectOptional(mountPath, inspect, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID");
    const mountedAuthority = await resolveRealPath(mountPath, resolveReal, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID");
    if (!mountedState?.isSymbolicLink() || mountedAuthority !== dependencyAuthority) {
      fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency mount verification failed");
    }
  } catch (error) {
    if (creationAttempted) await removePartialDependencyMount({ mountPath, inspect, removeMount });
    if (error?.code === "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED") throw error;
    fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency mount failed");
  }

  const handle = Object.freeze({
    status: "MOUNTED",
    dependencyAuthority: "REPO_LOCAL",
    toJSON: () => ({ status: "MOUNTED", dependencyAuthority: "REPO_LOCAL" }),
  });
  dependencyMountDetails.set(handle, Object.freeze({ dependencyPath, dependencyAuthority, mountPath, inspect, resolveReal, removeMount }));
  return handle;
}

export async function unmountLocalRecoveryAppDependencies(handle) {
  const details = dependencyMountDetails.get(handle);
  if (!details) fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency mount handle is invalid");
  const { dependencyPath, dependencyAuthority, mountPath, inspect, resolveReal, removeMount } = details;
  const mountState = await inspectOptional(mountPath, inspect, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  const sourceState = await inspectOptional(dependencyPath, inspect, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  if (!mountState?.isSymbolicLink() || !sourceState?.isDirectory() || sourceState.isSymbolicLink()) {
    fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency mount state is invalid");
  }
  const mountedAuthority = await resolveRealPath(mountPath, resolveReal, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  const currentAuthority = await resolveRealPath(dependencyPath, resolveReal, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  if (mountedAuthority !== dependencyAuthority || currentAuthority !== dependencyAuthority || currentAuthority !== dependencyPath) {
    fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency authority changed before cleanup");
  }
  try { await removeMount(mountPath); } catch { fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency unmount failed"); }
  if (await inspectOptional(mountPath, inspect, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED") !== null) {
    fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency mount survived cleanup");
  }
  const remainingSource = await inspectOptional(dependencyPath, inspect, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  const remainingAuthority = await resolveRealPath(dependencyPath, resolveReal, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  if (!remainingSource?.isDirectory() || remainingSource.isSymbolicLink() || remainingAuthority !== dependencyAuthority) {
    fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Repository dependency authority did not survive cleanup");
  }
  dependencyMountDetails.delete(handle);
  return Object.freeze({ status: "UNMOUNTED" });
}

export async function verifyLocalRecoveryAppDependencyTopology({ projectDir, nodePath, inspect = lstat, resolveReal = realpath } = {}) {
  if (typeof projectDir !== "string" || !isAbsolute(projectDir) || typeof nodePath !== "string" || !isAbsolute(nodePath)
    || typeof inspect !== "function" || typeof resolveReal !== "function") {
    fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency topology is invalid");
  }
  const project = resolve(projectDir);
  const mountPath = resolve(project, "node_modules");
  const dependencyPath = resolve(nodePath);
  if (dirname(mountPath) !== project) fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency topology is invalid");
  const mountState = await inspectOptional(mountPath, inspect, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID");
  const dependencyState = await inspectOptional(dependencyPath, inspect, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID");
  if (!mountState?.isSymbolicLink() || !dependencyState?.isDirectory() || dependencyState.isSymbolicLink()) {
    fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency topology is invalid");
  }
  const mountedAuthority = await resolveRealPath(mountPath, resolveReal, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID");
  const nodeAuthority = await resolveRealPath(dependencyPath, resolveReal, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID");
  if (mountedAuthority !== nodeAuthority || nodeAuthority !== dependencyPath) {
    fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency topology does not match bootstrap authority");
  }
  return Object.freeze({ status: "VERIFIED", dependencyAuthority: "REPO_LOCAL" });
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

export async function verifyLocalRecoveryAppDistDirBoundary(workspace) {
  let paths;
  accessLocalRecoveryAppWorkspace(workspace, (value) => { paths = value; });
  const expected = resolve(paths.projectDir, ".next");
  if (paths.distDir !== expected || !contained(paths.projectDir, expected) || !contained(paths.runtimeRoot, expected)
    || expected === resolve(paths.repoRoot, ".next") || await lstat(expected).catch(() => null)) {
    fail("RECOVERY_APP_DIST_DIR_UNSUPPORTED", "Recovery application default distDir boundary is invalid");
  }
  return Object.freeze({ status: "VERIFIED", distDirAuthority: "PRODUCT_DEFAULT", runtimeBoundary: "RECOVERY_SESSION_ONLY" });
}

export function buildLocalRecoveryNextOptions({ projectDir, host = HOST, port } = {}) {
  if (typeof projectDir !== "string" || !isAbsolute(projectDir) || host !== HOST || !Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    fail("RECOVERY_APP_DIST_DIR_UNSUPPORTED", "Recovery application Next invocation is invalid");
  }
  return Object.freeze({ dev: true, dir: projectDir, hostname: host, port, quiet: true, webpack: true });
}

function generatedImportTargets(text) {
  const targets = [];
  const patterns = [
    /^\s*import(?:\s+type)?(?:\s+[^'"\r\n]+?\s+from)?\s*['"]([^'"\r\n]+)['"]\s*;?\s*$/gm,
    /^\s*export(?:\s+type)?\s+[^'"\r\n]+?\s+from\s*['"]([^'"\r\n]+)['"]\s*;?\s*$/gm,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) targets.push(match[1]);
  return targets;
}

function filesystemAbsoluteImport(target) {
  return isAbsolute(target) || /^[A-Za-z]:[\\/]/.test(target) || /^\\\\/.test(target) || /^file:/i.test(target);
}

export async function verifyLocalRecoveryAppGeneratedRuntime({ projectDir } = {}) {
  if (typeof projectDir !== "string" || !isAbsolute(projectDir)) fail("RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH", "Recovery application generated runtime boundary is invalid");
  const resolvedProjectDir = resolve(projectDir);
  const distDir = resolve(resolvedProjectDir, ".next");
  const distState = await lstat(distDir).catch(() => null);
  if (!distState?.isDirectory() || distState.isSymbolicLink() || await realpath(distDir).catch(() => null) !== distDir || !contained(resolvedProjectDir, distDir)) {
    fail("RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH", "Recovery application generated distDir is invalid");
  }

  const generatedTypesPath = resolve(resolvedProjectDir, "next-env.d.ts");
  const generatedTypesState = await lstat(generatedTypesPath).catch(() => null);
  if (!generatedTypesState) return Object.freeze({ status: "VERIFIED", distDirAuthority: "PRODUCT_DEFAULT", generatedTypes: "NOT_OBSERVED" });
  if (!generatedTypesState.isFile() || generatedTypesState.isSymbolicLink() || generatedTypesState.size > GENERATED_TYPES_MAX_BYTES
    || await realpath(generatedTypesPath).catch(() => null) !== generatedTypesPath || !contained(resolvedProjectDir, generatedTypesPath)) {
    fail("RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH", "Recovery application generated types boundary is invalid");
  }

  let handle;
  let text;
  try {
    handle = await open(generatedTypesPath, "r");
    const openedState = await handle.stat();
    if (!openedState.isFile() || openedState.size > GENERATED_TYPES_MAX_BYTES) fail("RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH", "Recovery application generated types boundary is invalid");
    const bounded = Buffer.alloc(GENERATED_TYPES_MAX_BYTES + 1);
    const { bytesRead } = await handle.read(bounded, 0, bounded.length, 0);
    if (bytesRead > GENERATED_TYPES_MAX_BYTES) fail("RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH", "Recovery application generated types boundary is invalid");
    text = bounded.subarray(0, bytesRead).toString("utf8");
  } catch (error) {
    if (error?.code === "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH") throw error;
    fail("RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH", "Recovery application generated types could not be inspected safely");
  } finally { if (handle) await handle.close().catch(() => {}); }
  for (const target of generatedImportTargets(text)) {
    if (filesystemAbsoluteImport(target)) fail("RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH", "Recovery application generated types import is outside the default distDir");
    if (/^\.\.?[\\/]/.test(target)) {
      const resolvedTarget = resolve(resolvedProjectDir, target);
      if (resolvedTarget === distDir || !contained(distDir, resolvedTarget)) fail("RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH", "Recovery application generated types import is outside the default distDir");
    }
  }
  return Object.freeze({ status: "VERIFIED", distDirAuthority: "PRODUCT_DEFAULT", generatedTypes: "OBSERVED" });
}

function redactDiagnosticText(chunk, redactions) {
  let value = String(chunk ?? "");
  for (const secret of redactions) if (typeof secret === "string" && secret.length >= 4) value = value.split(secret).join("[REDACTED]");
  return value
    .replace(/\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F\u007F]/g, "")
    .slice(-DIAGNOSTIC_EVENT_BUDGET_BYTES);
}

function appendDiagnosticEvent(state, chunk, redactions, declaredPackageNames) {
  const redactedText = redactDiagnosticText(chunk, redactions);
  const analysis = analyzeRuntimeDiagnosticText(redactedText, declaredPackageNames);
  state.diagnosticSequence += 1;
  state.events.push(Object.freeze({ sequence: state.diagnosticSequence, byteWeight: redactedText.length, ...analysis }));
  state.eventBytes += redactedText.length;
  while ((state.eventBytes > DIAGNOSTIC_EVENT_BUDGET_BYTES || state.events.length > DIAGNOSTIC_EVENT_COUNT_LIMIT) && state.events.length > 0) {
    if (state.events.length > DIAGNOSTIC_EVENT_COUNT_LIMIT) {
      const removed = state.events.shift();
      state.eventBytes -= removed.byteWeight;
      continue;
    }
    const oldest = state.events[0];
    state.events.shift();
    state.eventBytes -= oldest.byteWeight;
  }
}

function isFilesystemAbsoluteSpecifier(specifier) {
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(specifier)) return true;
  if (!/^file:/i.test(specifier)) return false;
  try {
    const value = new URL(specifier);
    return value.protocol === "file:" && (value.host.length > 0 || value.pathname.startsWith("/"));
  } catch { return false; }
}

function barePackageRoot(specifier) {
  if (!/^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)(?:\/[A-Za-z0-9._~$&'()*+,;=:@-]+)*$/.test(specifier)) return null;
  const segments = specifier.split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  return specifier.startsWith("@") ? `${segments[0]}/${segments[1]}` : segments[0];
}

function classifyMissingModuleSpecifier(specifier, declaredPackageNames) {
  if (typeof specifier !== "string" || specifier.length === 0) return "UNKNOWN";
  if (specifier.includes("[REDACTED]")) return "REDACTED_PATH";
  if (isFilesystemAbsoluteSpecifier(specifier)) return "ABSOLUTE_PATH";
  if (/[!?]/.test(specifier)) return "LOADER_REQUEST";
  if (specifier.startsWith("@/")) return specifier.length > 2 ? "PROJECT_ALIAS" : "UNKNOWN";
  if (/^(?:\.\.?[\\/]).+/.test(specifier)) return "RELATIVE_IMPORT";
  if (/^node:[A-Za-z0-9_./-]+$/.test(specifier)) return "NODE_BUILTIN";
  const packageRoot = barePackageRoot(specifier);
  if (!packageRoot) return "UNKNOWN";
  if (packageRoot === "next" || /^private-next-[a-z0-9][a-z0-9._~-]*$/.test(packageRoot)) return "NEXT_INTERNAL";
  return declaredPackageNames.has(packageRoot) ? "DECLARED_PACKAGE" : "OTHER_BARE_PACKAGE";
}

function extractMissingModuleSpecifiers(text) {
  const specifiers = [];
  const patterns = [
    /Module not found[^\r\n]*?Can't resolve\s+['"]([^'"\r\n]+)['"]/gi,
    /Cannot find module\s+['"]([^'"\r\n]+)['"]/gi,
    /ERR_MODULE_NOT_FOUND[^\r\n]*?(?:package|module|specifier)\s+['"]([^'"\r\n]+)['"]/gi,
  ];
  for (const pattern of patterns) for (const match of text.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

function analyzeRuntimeDiagnosticText(text, declaredPackageNames) {
  const moduleResolution = /module not found|can't resolve|cannot find module|ERR_MODULE_NOT_FOUND/i.test(text);
  const moduleCategories = moduleResolution
    ? [...new Set(extractMissingModuleSpecifiers(text).map((specifier) => classifyMissingModuleSpecifier(specifier, declaredPackageNames)))]
    : [];
  return Object.freeze({
    moduleResolution,
    moduleCategories: Object.freeze(moduleCategories),
    compileFailure: /failed to compile|webpack compilation (?:error|failed)|compilation failed/i.test(text),
    runtimeFailure: /unhandled runtime error|uncaught runtime error|runtime error:/i.test(text),
  });
}

function classifyRuntimeDiagnostic(events) {
  if (events.some((event) => event.moduleResolution)) {
    const categories = new Set(events.flatMap((event) => event.moduleCategories));
    const moduleCategory = categories.size === 0 ? "UNPARSED" : categories.size === 1 ? [...categories][0] : "MIXED";
    return Object.freeze({ diagnostic: "MODULE_RESOLUTION_FAILURE", moduleCategory });
  }
  if (events.some((event) => event.compileFailure)) return Object.freeze({ diagnostic: "COMPILE_FAILURE" });
  if (events.some((event) => event.runtimeFailure)) return Object.freeze({ diagnostic: "RUNTIME_FAILURE" });
  return Object.freeze({ diagnostic: "UNCLASSIFIED" });
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

function createShutdownTerminalWait(child, timeoutMs) {
  let cancel = () => {};
  const promise = new Promise((accept, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(Object.assign(new Error("Recovery application stop acknowledgement timed out"), { code: "RECOVERY_APP_CLEANUP_INCOMPLETE" })); }, timeoutMs);
    const onMessage = (message) => {
      if (message?.type === "stopped") { cleanup(); accept(Object.freeze({ status: "ACKNOWLEDGED" })); return; }
      if (message?.type === "failure" && message.code === "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED") {
        cleanup();
        accept(Object.freeze({ status: "FAILED", code: message.code }));
      }
    };
    const onExit = () => { cleanup(); reject(Object.assign(new Error("Recovery application exited before stop acknowledgement"), { code: "RECOVERY_APP_CLEANUP_INCOMPLETE" })); };
    const onError = () => { cleanup(); reject(Object.assign(new Error("Recovery application stop acknowledgement failed"), { code: "RECOVERY_APP_CLEANUP_INCOMPLETE" })); };
    const cleanup = () => { clearTimeout(timeout); child.off("message", onMessage); child.off("exit", onExit); child.off("error", onError); };
    cancel = cleanup;
    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", onError);
  });
  return Object.freeze({ promise, cancel: () => cancel() });
}

function waitForChildExit(child, timeoutMs) {
  return new Promise((accept, reject) => {
    const timeout = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, timeoutMs);
    const onExit = (code) => { cleanup(); accept(code); };
    const onError = () => { cleanup(); reject(new Error("process error")); };
    const cleanup = () => { clearTimeout(timeout); child.off("exit", onExit); child.off("error", onError); };
    child.once("exit", onExit);
    child.once("error", onError);
  });
}

function attemptEmergencyKill(child) {
  if (child.exitCode !== null) return;
  try { child.kill(); } catch { /* cleanup failure remains visible */ }
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

export async function startLocalRecoveryApp({
  localStatus,
  session,
  runtimeAuthority,
  repoRoot = process.cwd(),
  sourceEnvironment = process.env,
  allocatePort = probeAvailableLocalPort,
  forkProcess = fork,
  materializeSource = materializeRecoveryAppSource,
  mountDependencies = mountLocalRecoveryAppDependencies,
  unmountDependencies = unmountLocalRecoveryAppDependencies,
  verifyVolumeTopology = verifyPhysicalLocalRecoveryNextVolumeTopology,
  platform = process.platform,
  pathApi,
  execute = runCommand,
  probeClosed = probeClosedLocalPort,
  timeoutMs = 120_000,
} = {}) {
  const workspace = await prepareLocalRecoveryAppWorkspace({ session, repoRoot });
  await materializeSource({ workspace, runtimeAuthority, environment: sourceEnvironment, execute });
  let declaredPackageNames = Object.freeze([]);
  if (isVerifiedRecoveryAppRuntimeAuthority(runtimeAuthority)) {
    accessVerifiedRecoveryAppRuntimeAuthority(runtimeAuthority, (value) => { declaredPackageNames = value.declaredPackageNames; });
  }
  if (typeof mountDependencies !== "function" || typeof unmountDependencies !== "function") {
    fail("RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "Recovery application dependency lifecycle is invalid");
  }
  const dependencyMount = await mountDependencies({ workspace });
  let child;
  let port;
  let state;
  try {
    let paths;
    accessLocalRecoveryAppWorkspace(workspace, (value) => { paths = value; });
    await verifyVolumeTopology({ repoRoot: paths.repoRoot, projectDir: paths.projectDir, platform, pathApi });
    port = await allocatePort("recovery-application");
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) fail("RECOVERY_APP_PORT_INVALID", "Recovery application port is invalid");
    await verifyLocalRecoveryAppDistDirBoundary(workspace);
    const environment = buildLocalRecoveryAppEnvironment({ localStatus, workspace, sourceEnvironment });
    let runtime;
    accessLocalSupabaseStatus(localStatus, (value) => { runtime = value; });
    const worker = fileURLToPath(new URL("./local-recovery-app-worker.mjs", import.meta.url));
    child = forkProcess(worker, [], { cwd: repoRoot, env: environment, windowsHide: true, silent: true, serialization: "json" });
    const redactions = [runtime.API_URL, runtime.ANON_KEY, paths.repoRoot, paths.runtimeRoot, paths.distDir, paths.tempDir];
    const admittedDeclaredPackageNames = new Set(declaredPackageNames);
    state = { events: [], eventBytes: 0, diagnosticSequence: 0, unexpectedExit: false, stopping: false };
    child.stdout?.on("data", (chunk) => { appendDiagnosticEvent(state, chunk, redactions, admittedDeclaredPackageNames); });
    child.stderr?.on("data", (chunk) => { appendDiagnosticEvent(state, chunk, redactions, admittedDeclaredPackageNames); });
    child.on("exit", () => { if (!state.stopping) state.unexpectedExit = true; });
    const ready = waitForChild(child, new Set(["ready"]), timeoutMs, "RECOVERY_APP_START_FAILED");
    child.send({ type: "start", host: HOST, port, projectDir: paths.projectDir });
    await ready;
    const handle = Object.freeze({ status: "RUNNING", locality: "LOCAL_LOOPBACK", cacheBoundary: "RECOVERY_SESSION_ONLY", toJSON: () => ({ status: "RUNNING", locality: "LOCAL_LOOPBACK", cacheBoundary: "RECOVERY_SESSION_ONLY" }) });
    appDetails.set(handle, {
      child,
      port,
      origin: `http://${HOST}:${port}`,
      supabaseOrigin: new URL(runtime.API_URL).origin,
      state,
      workspace,
      dependencyMount,
      unmountDependencies,
      declaredPackageNames: admittedDeclaredPackageNames,
    });
    return handle;
  } catch (error) {
    let processCleanupError;
    if (child && Number.isSafeInteger(port)) {
      if (state) state.stopping = true;
      try { await cleanupFailedStart(child, port, timeoutMs, probeClosed); } catch (cleanupError) { processCleanupError = cleanupError; }
    }
    try { await unmountDependencies(dependencyMount); }
    catch (unmountError) {
      if (unmountError?.code === "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED") throw unmountError;
      fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency mount survived failed startup");
    }
    if (processCleanupError) throw processCleanupError;
    throw error;
  }
}

export function accessLocalRecoveryApp(handle, callback) {
  const details = appDetails.get(handle);
  if (!details || typeof callback !== "function") fail("RECOVERY_APP_HANDLE_INVALID", "Running recovery application handle is required");
  if (details.state.unexpectedExit) fail("RECOVERY_APP_PROCESS_FAILED", "Recovery application process exited unexpectedly");
  return callback(Object.freeze({ origin: details.origin, supabaseOrigin: details.supabaseOrigin, port: details.port }));
}

export function classifyLocalRecoveryAppRuntimeDiagnostic(handle) {
  const details = appDetails.get(handle);
  if (!details) fail("RECOVERY_APP_HANDLE_INVALID", "Running recovery application handle is required");
  return classifyRuntimeDiagnostic(details.state.events).diagnostic;
}

export function createLocalRecoveryAppDiagnosticCheckpoint(handle) {
  const details = appDetails.get(handle);
  if (!details) fail("RECOVERY_APP_HANDLE_INVALID", "Running recovery application handle is required");
  const checkpoint = Object.freeze({ status: "CHECKPOINTED", toJSON: () => ({ status: "CHECKPOINTED" }) });
  diagnosticCheckpointDetails.set(checkpoint, Object.freeze({ app: handle, sequence: details.state.diagnosticSequence }));
  return checkpoint;
}

function diagnosticBoundary(handle, checkpoint) {
  const details = appDetails.get(handle);
  const boundary = diagnosticCheckpointDetails.get(checkpoint);
  if (!details || !boundary || boundary.app !== handle) {
    fail("RECOVERY_APP_DIAGNOSTIC_CHECKPOINT_INVALID", "Recovery application diagnostic checkpoint is invalid");
  }
  return { details, boundary };
}

export async function settleLocalRecoveryAppDiagnostics(handle, checkpoint, {
  quietMs = DIAGNOSTIC_QUIET_MS,
  maxMs = DIAGNOSTIC_MAX_SETTLE_MS,
  now = Date.now,
  wait = (delay) => new Promise((accept) => setTimeout(accept, delay)),
} = {}) {
  if (!Number.isSafeInteger(quietMs) || quietMs < 1 || !Number.isSafeInteger(maxMs) || maxMs < quietMs
    || typeof now !== "function" || typeof wait !== "function") {
    fail("RECOVERY_APP_DIAGNOSTIC_CHECKPOINT_INVALID", "Recovery application diagnostic settling contract is invalid");
  }
  const { details } = diagnosticBoundary(handle, checkpoint);
  const startedAt = now();
  let observedSequence = details.state.diagnosticSequence;
  while (true) {
    const elapsed = Math.max(0, now() - startedAt);
    if (elapsed >= maxMs) return Object.freeze({ status: "SETTLED" });
    await wait(Math.min(quietMs, maxMs - elapsed));
    diagnosticBoundary(handle, checkpoint);
    if (details.state.diagnosticSequence === observedSequence) return Object.freeze({ status: "SETTLED" });
    observedSequence = details.state.diagnosticSequence;
  }
}

export function classifyLocalRecoveryAppRuntimeDiagnosticSince(handle, checkpoint) {
  const { details, boundary } = diagnosticBoundary(handle, checkpoint);
  const events = details.state.events.filter((event) => event.sequence > boundary.sequence);
  return classifyRuntimeDiagnostic(events);
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
  let processCleanupError;
  try {
    details.state.stopping = true;
    if (details.child.exitCode !== null) fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Recovery application exited before the governed shutdown protocol");
    const terminal = createShutdownTerminalWait(details.child, timeoutMs);
    try { details.child.send({ type: "stop" }); }
    catch {
      terminal.cancel();
      attemptEmergencyKill(details.child);
      fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Recovery application stop request failed");
    }
    let acknowledgement;
    try { acknowledgement = await terminal.promise; }
    catch { attemptEmergencyKill(details.child); fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Recovery application stop acknowledgement did not complete"); }

    let exitCode = details.child.exitCode;
    if (exitCode === null) {
      try { exitCode = await waitForChildExit(details.child, timeoutMs); }
      catch { attemptEmergencyKill(details.child); fail("RECOVERY_APP_SHUTDOWN_EXIT_FAILED", "Recovery application process did not exit after acknowledgement"); }
    }
    const exitFailed = exitCode !== 0 && acknowledgement.status !== "FAILED";

    let portClosed = false;
    try { portClosed = await probeClosed({ port: details.port, host: HOST }); } catch { portClosed = false; }
    if (portClosed !== true) fail("RECOVERY_APP_SHUTDOWN_PORT_OPEN", "Recovery application port remained open after process exit");
    if (acknowledgement.status === "FAILED") fail(acknowledgement.code, "Recovery application graceful close failed");
    if (exitFailed) fail("RECOVERY_APP_SHUTDOWN_EXIT_FAILED", "Recovery application process exited unsuccessfully after acknowledgement");
  } catch (error) { processCleanupError = error; }
  try { await details.unmountDependencies(details.dependencyMount); }
  catch (error) {
    if (error?.code === "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED") throw error;
    fail("RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED", "Recovery application dependency unmount failed");
  }
  appDetails.delete(handle);
  if (processCleanupError) throw processCleanupError;
  return Object.freeze({ status: "PASS", applicationCleanup: "PASS" });
}
