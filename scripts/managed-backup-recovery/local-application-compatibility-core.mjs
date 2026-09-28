import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "../managed-backup/command-runner.mjs";
import { admitRepoLocalSupabaseCli } from "../managed-backup/production-execution.mjs";
import { resolveLocalApplicationRecoveryParent, verifyLocalRecoveryAppVolumeTopology } from "./application-runtime-topology.mjs";
import { verifyRecoveryAppRuntimeAuthority } from "./app-runtime-authority.mjs";
import { buildRecoveryGitEnvironment } from "./git-environment.mjs";
import { RECOVERY_APP_CLEANUP_FAILURE_CODES, startLocalRecoveryApp, stopLocalRecoveryApp } from "./local-recovery-app.mjs";
import { PRODUCTION_RUNTIME_SHA } from "./local-target-drill.mjs";
import { cleanupRecoverySession, createRecoverySession } from "./recovery-contract.mjs";
import {
  probeLocalRecoveryAppLive,
  probeLocalRecoveryAppReady,
  probeLocalRecoveryTargetAuthHealth,
  runRecoveryApplicationCompatibilityBrowserSmoke,
} from "./recovery-application-validation.mjs";
import { assertRecoveryToolingAuthority, resolveRecoveryToolingAuthority } from "./recovery-tooling-authority.mjs";
import { admitDockerDbDiscovery } from "./target-commands.mjs";
import { runTargetBaselineGate } from "./target-baseline.mjs";
import { createGovernedTargetCleanupAdapter, createGovernedTargetExecutor, executeGovernedTargetPlan } from "./target-executor.mjs";
import { cleanupManagedRecoveryTarget, prepareManagedRecoveryTarget, provePreparedRecoveryTargetIsolation } from "./target-restore.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

export const LOCAL_APPLICATION_CONFIRMATION = "ALLOW_DISPOSABLE_LOCAL_RECOVERY_APPLICATION_COMPATIBILITY";
export const LOCAL_APPLICATION_CONFIRM_ENV = "GODEL_MANAGED_RECOVERY_APP_LOCAL_CONFIRM";
export const LOCAL_APPLICATION_TOOLING_SHA_ENV = "GODEL_MANAGED_RECOVERY_APP_LOCAL_TOOLING_SHA";
export const LOCAL_APPLICATION_BRANCH = "ops/managed-free-production-pilot";

const SHA = /^[a-f0-9]{40}$/;
const INCOMPATIBLE_CONFIRMATIONS = Object.freeze([
  "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
  "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM",
  "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM",
]);
const PHASES = new Set([
  "PREFLIGHT", "SESSION", "TARGET_PREPARE", "TARGET_START", "TARGET_BASELINE", "TARGET_AUTH_HEALTH", "APP_RUNTIME_AUTHORITY", "APP_START",
  "APP_HEALTH", "APP_LIVE", "APP_READY",
  "BROWSER_LOGIN_SURFACE", "BROWSER_ANONYMOUS", "BROWSER_CLEANUP", "APP_CLEANUP", "TARGET_CLEANUP", "SESSION_CLEANUP",
]);
const PUBLIC_FAILURE_CODES = new Set([
  "LOCAL_RECOVERY_APP_CONFIRMATION_REQUIRED", "LOCAL_RECOVERY_APP_TOOLING_SHA_REQUIRED", "LOCAL_RECOVERY_APP_INCOMPATIBLE_CONFIRMATION",
  "WRONG_TOOLING_BRANCH", "WRONG_TOOLING_HEAD", "DIRTY_TOOLING_WORKTREE", "RECOVERY_RUNTIME_COMMIT_UNAVAILABLE",
  "LOCAL_RECOVERY_SUPABASE_CLI_REQUIRED", "LOCAL_RECOVERY_DOCKER_REQUIRED", "LOCAL_RECOVERY_DOCKER_AUTHORITY_REQUIRED", "RECOVERY_PARENT_INVALID", "RECOVERY_PARENT_UNSAFE",
  "RECOVERY_SESSION_ID_INVALID", "RECOVERY_SESSION_EXISTS", "RECOVERY_SESSION_PATH_INVALID", "RECOVERY_TARGET_ISOLATION_FAILED",
  "LOCAL_RECOVERY_BASELINE_OUTPUT_INVALID", "LOCAL_RECOVERY_MIGRATION_OUTPUT_INVALID", "LOCAL_RECOVERY_SCHEMA_OUTPUT_INVALID",
  "LOCAL_RECOVERY_EXTENSION_OUTPUT_INVALID", "RECOVERY_TARGET_BUCKET_INVALID", "RECOVERY_REPLICATION_ROLE_NOT_ORIGIN",
  "RECOVERY_TARGET_CATALOG_REQUIRED_TABLE_MISSING", "RECOVERY_APP_RUNTIME_AUTHORITY_INVALID", "RECOVERY_APP_RUNTIME_AUTHORITY_UNAVAILABLE",
  "RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH", "RECOVERY_APP_PACKAGE_MANIFEST_INVALID", "RECOVERY_APP_RUNTIME_AUTHORITY_REQUIRED",
  "RECOVERY_APP_WORKSPACE_INVALID", "RECOVERY_APP_DIST_DIR_UNSUPPORTED", "RECOVERY_APP_SOURCE_MATERIALIZATION_FAILED", "RECOVERY_APP_PORT_INVALID",
  "RECOVERY_TARGET_AUTH_HEALTH_FAILED", "RECOVERY_APP_START_FAILED", "RECOVERY_APP_PROCESS_FAILED", "RECOVERY_APP_HEALTH_FAILED",
  "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH", "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH",
  "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH",
  "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED",
  "RECOVERY_APP_LIVE_REQUEST_FAILED", "RECOVERY_APP_LIVE_RESPONSE_INVALID", "RECOVERY_APP_LIVE_REDIRECTED", "RECOVERY_APP_LIVE_NOT_FOUND",
  "RECOVERY_APP_LIVE_HTTP_REJECTED", "RECOVERY_APP_LIVE_SERVER_ERROR", "RECOVERY_APP_LIVE_BODY_INVALID", "RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED",
  "RECOVERY_APP_LIVE_MODULE_PROJECT_ALIAS_FAILED", "RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED", "RECOVERY_APP_LIVE_MODULE_NEXT_INTERNAL_FAILED",
  "RECOVERY_APP_LIVE_MODULE_DECLARED_PACKAGE_FAILED", "RECOVERY_APP_LIVE_MODULE_OTHER_BARE_PACKAGE_FAILED", "RECOVERY_APP_LIVE_MODULE_NODE_BUILTIN_FAILED",
  "RECOVERY_APP_LIVE_MODULE_ABSOLUTE_PATH_FAILED", "RECOVERY_APP_LIVE_MODULE_REDACTED_PATH_FAILED", "RECOVERY_APP_LIVE_MODULE_LOADER_REQUEST_FAILED",
  "RECOVERY_APP_LIVE_MODULE_UNPARSED_FAILED", "RECOVERY_APP_LIVE_MODULE_MIXED_FAILED", "RECOVERY_APP_LIVE_MODULE_UNKNOWN_FAILED",
  "RECOVERY_APP_LIVE_COMPILE_FAILED", "RECOVERY_APP_LIVE_RUNTIME_FAILED", "RECOVERY_APP_READY_REQUEST_FAILED", "RECOVERY_APP_READY_RESPONSE_INVALID",
  "RECOVERY_APP_READY_REDIRECTED", "RECOVERY_APP_READY_NOT_FOUND", "RECOVERY_APP_READY_HTTP_REJECTED", "RECOVERY_APP_READY_SERVER_ERROR",
  "RECOVERY_APP_READY_BODY_INVALID", "RECOVERY_APP_READY_MODULE_RESOLUTION_FAILED", "RECOVERY_APP_READY_COMPILE_FAILED", "RECOVERY_APP_READY_RUNTIME_FAILED",
  "RECOVERY_APP_READY_MODULE_PROJECT_ALIAS_FAILED", "RECOVERY_APP_READY_MODULE_RELATIVE_IMPORT_FAILED", "RECOVERY_APP_READY_MODULE_NEXT_INTERNAL_FAILED",
  "RECOVERY_APP_READY_MODULE_DECLARED_PACKAGE_FAILED", "RECOVERY_APP_READY_MODULE_OTHER_BARE_PACKAGE_FAILED", "RECOVERY_APP_READY_MODULE_NODE_BUILTIN_FAILED",
  "RECOVERY_APP_READY_MODULE_ABSOLUTE_PATH_FAILED", "RECOVERY_APP_READY_MODULE_REDACTED_PATH_FAILED", "RECOVERY_APP_READY_MODULE_LOADER_REQUEST_FAILED",
  "RECOVERY_APP_READY_MODULE_UNPARSED_FAILED", "RECOVERY_APP_READY_MODULE_MIXED_FAILED", "RECOVERY_APP_READY_MODULE_UNKNOWN_FAILED",
  "RECOVERY_APP_DIAGNOSTIC_CHECKPOINT_INVALID",
  "RECOVERY_APP_BROWSER_INVALID",
  "RECOVERY_APP_LOGIN_SURFACE_FAILED", "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED", "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN",
  "RECOVERY_BROWSER_CLEANUP_INCOMPLETE", "RECOVERY_APP_CLEANUP_INCOMPLETE", "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED",
  "RECOVERY_APP_SHUTDOWN_EXIT_FAILED", "RECOVERY_APP_SHUTDOWN_PORT_OPEN", "RECOVERY_TARGET_CLEANUP_INCOMPLETE", "RECOVERY_CLEANUP_INCOMPLETE",
]);

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryLocalApplicationCompatibilityError";
  error.code = code;
  throw error;
}

function platformEnvironment(source = {}) {
  const output = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE"]) {
    if (typeof source[key] === "string") output[key] = source[key];
  }
  return Object.freeze(output);
}

function admitDockerVersion(output) {
  const value = String(output ?? "").trim();
  if (!/^\d+(?:\.\d+){1,3}[^\s/]*\/\d+(?:\.\d+){1,3}[^\s/]*$/.test(value)) {
    fail("LOCAL_RECOVERY_DOCKER_REQUIRED", "Docker client and server are required for local recovery application compatibility");
  }
  return "CLIENT_SERVER_AVAILABLE";
}

function admitLocalDockerAuthority(output) {
  const endpoint = String(output ?? "").trim();
  const localEndpoints = new Set([
    "npipe:////./pipe/docker_engine",
    "npipe:////./pipe/dockerDesktopLinuxEngine",
    "unix:///var/run/docker.sock",
  ]);
  if (!localEndpoints.has(endpoint)) fail("LOCAL_RECOVERY_DOCKER_AUTHORITY_REQUIRED", "Docker authority must resolve to the local engine");
  return "LOCAL_ENGINE";
}

export function assertLocalApplicationCompatibilityConfirmation(environment = {}) {
  if (environment[LOCAL_APPLICATION_CONFIRM_ENV] !== LOCAL_APPLICATION_CONFIRMATION) {
    fail("LOCAL_RECOVERY_APP_CONFIRMATION_REQUIRED", "Exact disposable local recovery application compatibility confirmation is required");
  }
  if (!SHA.test(environment[LOCAL_APPLICATION_TOOLING_SHA_ENV] ?? "")) {
    fail("LOCAL_RECOVERY_APP_TOOLING_SHA_REQUIRED", "Exact local recovery application tooling SHA authority is required");
  }
  if (INCOMPATIBLE_CONFIRMATIONS.some((name) => typeof environment[name] === "string" && environment[name].length > 0)) {
    fail("LOCAL_RECOVERY_APP_INCOMPATIBLE_CONFIRMATION", "Incompatible Production or restore confirmation is present");
  }
}

export async function preflightLocalApplicationCompatibility({ environment = process.env, repoRoot = process.cwd(), execute = runCommand, admitSupabaseCli = admitRepoLocalSupabaseCli } = {}) {
  assertLocalApplicationCompatibilityConfirmation(environment);
  const authority = assertRecoveryToolingAuthority({
    authority: await resolveRecoveryToolingAuthority({ repoRoot, environment, execute }),
    expectedBranch: LOCAL_APPLICATION_BRANCH,
    expectedHead: environment[LOCAL_APPLICATION_TOOLING_SHA_ENV],
  });
  try {
    await execute({
      operation: "verify Production runtime commit for local recovery application compatibility",
      executable: "git",
      args: ["cat-file", "-e", `${PRODUCTION_RUNTIME_SHA}^{commit}`],
      cwd: repoRoot,
      allowedEnvironment: buildRecoveryGitEnvironment({ sourceEnvironment: environment, repoRoot }),
    });
  } catch {
    fail("RECOVERY_RUNTIME_COMMIT_UNAVAILABLE", "Production runtime commit is unavailable locally");
  }
  let supabase;
  try { supabase = await admitSupabaseCli({ repoRoot }); }
  catch { fail("LOCAL_RECOVERY_SUPABASE_CLI_REQUIRED", "Exact repo-local Supabase CLI is required"); }
  let docker;
  let dockerAuthority;
  try {
    docker = admitDockerVersion((await execute({
      operation: "verify Docker client and server for local recovery application compatibility",
      executable: "docker",
      args: ["version", "--format", "{{.Client.Version}}/{{.Server.Version}}"],
      cwd: repoRoot,
      allowedEnvironment: platformEnvironment(environment),
    })).stdout);
    dockerAuthority = admitLocalDockerAuthority((await execute({
      operation: "verify local Docker authority for recovery application compatibility",
      executable: "docker",
      args: ["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
      cwd: repoRoot,
      allowedEnvironment: platformEnvironment(environment),
    })).stdout);
  } catch (error) {
    if (error?.code === "LOCAL_RECOVERY_DOCKER_REQUIRED" || error?.code === "LOCAL_RECOVERY_DOCKER_AUTHORITY_REQUIRED") throw error;
    fail("LOCAL_RECOVERY_DOCKER_REQUIRED", "Docker client and server are required for local recovery application compatibility");
  }
  return Object.freeze({ status: "PASS", gitAuthority: authority, runtimeCommit: "AVAILABLE", supabaseCli: supabase.version, docker, dockerAuthority });
}

function sessionBoundaries({ repoRoot, platform = process.platform, systemTemp = tmpdir(), pathApi } = {}) {
  return Object.freeze({
    parent: resolveLocalApplicationRecoveryParent({ repoRoot, platform, systemTemp, pathApi }),
    backupOutputRoot: join(systemTemp, "godel-managed-backup-output-boundary"),
  });
}

function initialState() {
  return { phase: "PREFLIGHT", realTargetStarts: 0, restoreSqlExecutions: 0, realR2Reads: 0, realAgeDecrypts: 0, productionMutations: 0 };
}

export function sanitizeLocalApplicationCompatibilityFailure(error, state = initialState()) {
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return Object.freeze({
    status: "FAIL",
    code: PUBLIC_FAILURE_CODES.has(error?.code) ? error.code : "RECOVERY_APP_COMPATIBILITY_FAILED",
    phase: PHASES.has(state.phase) ? state.phase : "PREFLIGHT",
    message: "Real local recovery application compatibility failed safely",
    realTargetStarts: count(state.realTargetStarts),
    restoreSqlExecutions: count(state.restoreSqlExecutions),
    realR2Reads: count(state.realR2Reads),
    realAgeDecrypts: count(state.realAgeDecrypts),
    productionMutations: 0,
  });
}

export function sanitizeLocalApplicationCompatibilityPass(value) {
  const fixed = Object.freeze({
    status: "PASS",
    operation: "real-local-recovery-application-compatibility",
    runtimeAuthority: "VERIFIED",
    targetIsolation: "VERIFIED",
    baselineMigrationCount: 6,
    targetAuthHealth: "PASS",
    applicationRuntimeAuthority: "VERIFIED",
    applicationStart: "PASS",
    applicationLive: "PASS",
    applicationReady: "PASS",
    applicationLocalSupabaseReadiness: "VERIFIED",
    loginSurface: "PASS",
    anonymousInternalAccess: "REJECTED",
    browserRemoteIsolation: "VERIFIED",
    browserCleanup: "PASS",
    applicationCleanup: "PASS",
    targetCleanup: "PASS",
    sessionCleanup: "PASS",
    realTargetStarts: 1,
    restoreSqlExecutions: 0,
    realR2Reads: 0,
    realAgeDecrypts: 0,
    productionMutations: 0,
  });
  if (!value || Object.keys(value).length !== Object.keys(fixed).length || Object.entries(fixed).some(([key, expected]) => value[key] !== expected)) {
    fail("RECOVERY_APP_COMPATIBILITY_FAILED", "Recovery application compatibility PASS evidence is invalid");
  }
  return fixed;
}

export async function runLocalRecoveryApplicationCompatibility({ environment = process.env, repoRoot = process.cwd(), dependencies = {} } = {}) {
  const state = initialState();
  let session;
  let prepared;
  let executor;
  let application;
  let targetStartAttempted = false;
  let finalEvidence;
  let primaryError;
  let primaryPhase = "PREFLIGHT";
  let applicationCleanupError;
  let targetCleanupError;
  let sessionCleanupError;
  try {
    assertLocalApplicationCompatibilityConfirmation(environment);
    const execute = dependencies.execute ?? runCommand;
    const preflight = await (dependencies.preflight ?? preflightLocalApplicationCompatibility)({ environment, repoRoot, execute, admitSupabaseCli: dependencies.admitSupabaseCli ?? admitRepoLocalSupabaseCli });

    state.phase = "SESSION";
    const platform = dependencies.platform ?? process.platform;
    const locations = (dependencies.sessionBoundaries ?? sessionBoundaries)({ repoRoot, platform, systemTemp: dependencies.systemTemp ?? tmpdir(), pathApi: dependencies.pathApi });
    session = await (dependencies.createSession ?? createRecoverySession)({ parent: locations.parent, backupOutputRoot: locations.backupOutputRoot, repoRoot, governedRoots: locations.governedRoots ?? [] });
    await (dependencies.verifyVolumeTopology ?? verifyLocalRecoveryAppVolumeTopology)({
      repoRoot,
      applicationDir: session.parent,
      platform,
      pathApi: dependencies.pathApi,
    });

    state.phase = "TARGET_PREPARE";
    prepared = await (dependencies.prepareTarget ?? prepareManagedRecoveryTarget)({
      session,
      manifest: { status: "COMPLETE", productionRuntimeSha: PRODUCTION_RUNTIME_SHA },
      repoRoot,
      environment,
      executeGit: execute,
      probePort: dependencies.probePort,
      projectId: dependencies.projectId,
    });
    executor = (dependencies.createTargetExecutor ?? createGovernedTargetExecutor)({ prepared, execute });

    state.phase = "TARGET_START";
    targetStartAttempted = true;
    await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.start);
    state.realTargetStarts = 1;

    state.phase = "TARGET_BASELINE";
    const statusOutput = await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.status);
    const localStatus = (dependencies.admitStatus ?? admitLocalSupabaseStatus)(statusOutput.stdout);
    const dockerOutput = await (dependencies.executeTargetPlan ?? executeGovernedTargetPlan)(executor, prepared.commandPlans.discoverDb);
    const containerAuthority = (dependencies.admitDocker ?? admitDockerDbDiscovery)({ projectId: prepared.target.projectId, rawOutput: dockerOutput.stdout });
    const isolation = (dependencies.proveIsolation ?? provePreparedRecoveryTargetIsolation)({
      prepared,
      session,
      manifest: { productionRuntimeSha: PRODUCTION_RUNTIME_SHA },
      localStatus,
      environment: {},
    });
    if (isolation?.LOCAL_ONLY !== true || isolation?.LINKED_PRODUCTION !== false || isolation?.DISPOSABLE !== true || isolation?.BASELINE_AUTHORITY !== PRODUCTION_RUNTIME_SHA) {
      fail("RECOVERY_TARGET_ISOLATION_FAILED", "Disposable recovery target isolation could not be proven");
    }
    const baseline = await (dependencies.runBaselineGate ?? runTargetBaselineGate)({ executor, containerAuthority, authority: prepared.authority, environment });
    if (baseline?.status !== "PASS" || baseline?.baseline?.status !== "PASS" || baseline.baseline.migrationCount !== 6) {
      fail("LOCAL_RECOVERY_BASELINE_OUTPUT_INVALID", "Recovery target baseline evidence is invalid");
    }

    state.phase = "TARGET_AUTH_HEALTH";
    const targetAuthHealth = await (dependencies.probeTargetAuthHealth ?? probeLocalRecoveryTargetAuthHealth)(localStatus);
    if (targetAuthHealth?.targetAuthHealth !== "PASS") fail("RECOVERY_TARGET_AUTH_HEALTH_FAILED", "Recovery target Auth health gate failed");

    state.phase = "APP_RUNTIME_AUTHORITY";
    const runtimeAuthority = await (dependencies.verifyAppRuntimeAuthority ?? verifyRecoveryAppRuntimeAuthority)({
      runtimeSha: PRODUCTION_RUNTIME_SHA,
      toolingSha: preflight.gitAuthority.head,
      repoRoot,
      environment,
      execute,
    });
    if (runtimeAuthority?.applicationRuntimeAuthority !== "VERIFIED") {
      fail("RECOVERY_APP_RUNTIME_AUTHORITY_REQUIRED", "Verified recovery application runtime authority is required");
    }

    state.phase = "APP_START";
    application = await (dependencies.startApp ?? startLocalRecoveryApp)({ localStatus, session, runtimeAuthority, repoRoot, sourceEnvironment: environment, execute });

    state.phase = "APP_LIVE";
    const live = await (dependencies.probeAppLive ?? probeLocalRecoveryAppLive)(application);
    if (live?.applicationLive !== "PASS") fail("RECOVERY_APP_LIVE_BODY_INVALID", "Recovery application live response is invalid");

    state.phase = "APP_READY";
    const ready = await (dependencies.probeAppReady ?? probeLocalRecoveryAppReady)(application);
    if (ready?.applicationReady !== "PASS") fail("RECOVERY_APP_READY_BODY_INVALID", "Recovery application ready response is invalid");

    state.phase = "BROWSER_LOGIN_SURFACE";
    const browser = await (dependencies.runBrowserSmoke ?? runRecoveryApplicationCompatibilityBrowserSmoke)({
      app: application,
      localStatus,
      onPhase: (phase) => { if (PHASES.has(phase)) state.phase = phase; },
    });
    if (browser?.loginSurface !== "PASS" || browser?.anonymousInternalAccess !== "REJECTED" || browser?.browserRemoteIsolation !== "VERIFIED" || browser?.browserCleanup !== "PASS") {
      fail("RECOVERY_APP_COMPATIBILITY_FAILED", "Recovery application browser evidence is invalid");
    }

    finalEvidence = {
      status: "PASS", operation: "real-local-recovery-application-compatibility", runtimeAuthority: "VERIFIED", targetIsolation: "VERIFIED",
      baselineMigrationCount: baseline.baseline.migrationCount, targetAuthHealth: targetAuthHealth.targetAuthHealth,
      applicationRuntimeAuthority: "VERIFIED", applicationStart: "PASS",
      applicationLive: live.applicationLive, applicationReady: ready.applicationReady, applicationLocalSupabaseReadiness: "VERIFIED",
      loginSurface: browser.loginSurface, anonymousInternalAccess: browser.anonymousInternalAccess, browserRemoteIsolation: browser.browserRemoteIsolation,
      browserCleanup: browser.browserCleanup, applicationCleanup: "PENDING", targetCleanup: "PENDING", sessionCleanup: "PENDING",
      realTargetStarts: state.realTargetStarts, restoreSqlExecutions: 0, realR2Reads: 0, realAgeDecrypts: 0, productionMutations: 0,
    };
  } catch (error) {
    primaryError = error;
    primaryPhase = error?.code === "RECOVERY_APP_CLEANUP_INCOMPLETE" || RECOVERY_APP_CLEANUP_FAILURE_CODES.includes(error?.code) ? "APP_CLEANUP"
      : error?.code === "RECOVERY_BROWSER_CLEANUP_INCOMPLETE" ? "BROWSER_CLEANUP"
        : state.phase;
  } finally {
    if (application) {
      try {
        await (dependencies.stopApp ?? stopLocalRecoveryApp)(application);
        if (finalEvidence) finalEvidence.applicationCleanup = "PASS";
      } catch (error) {
        const code = RECOVERY_APP_CLEANUP_FAILURE_CODES.includes(error?.code) ? error.code : "RECOVERY_APP_CLEANUP_INCOMPLETE";
        applicationCleanupError = Object.assign(new Error("Recovery application cleanup did not complete"), { code });
      }
    }
    if (targetStartAttempted && prepared && executor) {
      try {
        await (dependencies.cleanupTarget ?? cleanupManagedRecoveryTarget)({
          session,
          target: prepared.target,
          adapter: (dependencies.createCleanupAdapter ?? createGovernedTargetCleanupAdapter)(executor),
        });
        if (finalEvidence) finalEvidence.targetCleanup = "PASS";
      } catch {
        targetCleanupError = Object.assign(new Error("Disposable recovery target cleanup did not complete"), { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" });
      }
    }
    if (session) {
      try {
        await (dependencies.cleanupSession ?? cleanupRecoverySession)(session);
        if (finalEvidence) finalEvidence.sessionCleanup = "PASS";
      } catch {
        sessionCleanupError = Object.assign(new Error("Recovery session cleanup did not complete"), { code: "RECOVERY_CLEANUP_INCOMPLETE" });
      }
    }
  }

  if (sessionCleanupError) { state.phase = "SESSION_CLEANUP"; return sanitizeLocalApplicationCompatibilityFailure(sessionCleanupError, state); }
  if (targetCleanupError) { state.phase = "TARGET_CLEANUP"; return sanitizeLocalApplicationCompatibilityFailure(targetCleanupError, state); }
  if (applicationCleanupError) { state.phase = "APP_CLEANUP"; return sanitizeLocalApplicationCompatibilityFailure(applicationCleanupError, state); }
  if (primaryError) { state.phase = primaryPhase; return sanitizeLocalApplicationCompatibilityFailure(primaryError, state); }
  return sanitizeLocalApplicationCompatibilityPass(finalEvidence);
}
