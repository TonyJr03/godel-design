import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { ManagedBackupCommandError, runCommand } from "../managed-backup/command-runner.mjs";
import { admitRepoLocalSupabaseCli } from "../managed-backup/production-execution.mjs";
import { cleanupRecoverySession, createRecoverySession } from "./recovery-contract.mjs";
import { buildRecoveryGitEnvironment } from "./git-environment.mjs";
import { assertRecoveryToolingAuthority, resolveRecoveryToolingAuthority } from "./recovery-tooling-authority.mjs";
import { admitDockerDbDiscovery } from "./target-commands.mjs";
import { buildTargetBaselineQueryPlans, parseTargetBaselineOutputs, TARGET_BASELINE_QUERY_NAMES } from "./target-baseline.mjs";
import { createGovernedTargetCleanupAdapter, createGovernedTargetExecutor, executeGovernedTargetPlan } from "./target-executor.mjs";
import { cleanupManagedRecoveryTarget, prepareManagedRecoveryTarget, provePreparedRecoveryTargetIsolation } from "./target-restore.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

export const LOCAL_TARGET_CONFIRMATION = "ALLOW_DISPOSABLE_LOCAL_RECOVERY_TARGET";
export const LOCAL_TARGET_BRANCH = "ops/managed-free-production-pilot";
export const PRODUCTION_RUNTIME_SHA = "01552f8bee59b5f9982a2d722e39795461918f43";
export const TOOLING_SHA_ENV = "GODEL_MANAGED_RECOVERY_LOCAL_TARGET_TOOLING_SHA";

const CONFIRMATION_ENV = "GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM";
const PRODUCTION_CONFIRMATIONS = Object.freeze([
  "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM",
  "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
  "GODEL_MANAGED_R2_PRODUCTION_LOCK_CONFIRM",
]);
const SHA = /^[a-f0-9]{40}$/;

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryLocalTargetDrillError";
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

export function assertLocalTargetConfirmation(environment = {}) {
  if (environment[CONFIRMATION_ENV] !== LOCAL_TARGET_CONFIRMATION) fail("LOCAL_RECOVERY_CONFIRMATION_REQUIRED", "Exact disposable local recovery target confirmation is required");
  if (PRODUCTION_CONFIRMATIONS.some((name) => typeof environment[name] === "string" && environment[name].length > 0)) fail("LOCAL_RECOVERY_PRODUCTION_CONFIRMATION_FORBIDDEN", "Production confirmations are forbidden for the local target drill");
}

export async function resolveLocalTargetGitAuthority({ repoRoot, environment = process.env, execute = runCommand } = {}) {
  return resolveRecoveryToolingAuthority({ repoRoot, environment, execute });
}

export function assertLocalTargetGitAuthority(authority, expectedHead) {
  return assertRecoveryToolingAuthority({ authority, expectedBranch: LOCAL_TARGET_BRANCH, expectedHead });
}

function dockerVersion(output) {
  const value = String(output ?? "").trim();
  if (!/^\d+(?:\.\d+){1,3}[^\s/]*\/\d+(?:\.\d+){1,3}[^\s/]*$/.test(value)) fail("LOCAL_RECOVERY_DOCKER_REQUIRED", "Docker client and server are required for the local target drill");
  return value;
}

export async function preflightLocalTargetDrill({ environment = process.env, repoRoot = process.cwd(), execute = runCommand, admitSupabaseCli = admitRepoLocalSupabaseCli } = {}) {
  assertLocalTargetConfirmation(environment);
  const expectedHead = environment[TOOLING_SHA_ENV];
  if (!SHA.test(expectedHead ?? "")) fail("LOCAL_RECOVERY_TOOLING_SHA_REQUIRED", "Exact local recovery tooling SHA authority is required");
  const authority = assertLocalTargetGitAuthority(await resolveLocalTargetGitAuthority({ repoRoot, environment, execute }), expectedHead);
  try {
    await execute({ operation: "verify Production runtime commit for local recovery", executable: "git", args: ["cat-file", "-e", `${PRODUCTION_RUNTIME_SHA}^{commit}`], cwd: repoRoot, allowedEnvironment: buildRecoveryGitEnvironment({ sourceEnvironment: environment, repoRoot }) });
  } catch {
    fail("RECOVERY_RUNTIME_COMMIT_UNAVAILABLE", "Production runtime commit is unavailable locally");
  }
  const supabase = await admitSupabaseCli({ repoRoot });
  let docker;
  try {
    docker = dockerVersion((await execute({ operation: "verify Docker client and server for local recovery", executable: "docker", args: ["version", "--format", "{{.Client.Version}}/{{.Server.Version}}"], cwd: repoRoot, allowedEnvironment: platformEnvironment(environment) })).stdout);
  } catch (error) {
    if (error?.code === "LOCAL_RECOVERY_DOCKER_REQUIRED") throw error;
    fail("LOCAL_RECOVERY_DOCKER_REQUIRED", "Docker client and server are required for the local target drill");
  }
  return Object.freeze({ status: "PASS", gitAuthority: authority.clean ? "VERIFIED" : "INVALID", runtimeCommit: "AVAILABLE", supabaseCli: supabase.version, docker: docker.split("/").length === 2 ? "CLIENT_SERVER_AVAILABLE" : "INVALID" });
}

export function createGovernedLocalTargetExecutor({ prepared, execute = runCommand } = {}) {
  return createGovernedTargetExecutor({ prepared, execute });
}

export async function executeGovernedLocalTargetPlan(executor, commandPlan) {
  return executeGovernedTargetPlan(executor, commandPlan);
}

export function buildLocalTargetBaselineQueryPlans({ executor, containerAuthority, environment = process.env } = {}) {
  return buildTargetBaselineQueryPlans({ executor, containerAuthority, environment });
}

export function parseLocalTargetBaselineOutputs({ authority, outputs } = {}) {
  return parseTargetBaselineOutputs({ authority, outputs });
}

function sessionBoundaries() {
  return Object.freeze({ parent: join(tmpdir(), "godel-managed-recovery-local-target-sessions"), backupOutputRoot: join(tmpdir(), "godel-managed-backup-output-boundary") });
}

export function sanitizeLocalTargetDrillFailure(error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{3,100}$/.test(error.code) ? error.code : "LOCAL_RECOVERY_TARGET_DRILL_FAILED";
  const result = { status: "FAIL", code, message: "Local recovery target compatibility drill failed safely" };
  if (error instanceof ManagedBackupCommandError && typeof error.operation === "string" && /^[A-Za-z0-9 :_-]{1,120}$/.test(error.operation)) result.operation = error.operation;
  if (error instanceof ManagedBackupCommandError && Number.isSafeInteger(error.exitCode)) result.exitCode = error.exitCode;
  return Object.freeze(result);
}

export async function runLocalTargetCompatibilityDrill({ environment = process.env, repoRoot = process.cwd(), dependencies = {} } = {}) {
  assertLocalTargetConfirmation(environment);
  const preflight = dependencies.preflight ?? preflightLocalTargetDrill;
  await preflight({ environment, repoRoot, execute: dependencies.execute ?? runCommand, admitSupabaseCli: dependencies.admitSupabaseCli ?? admitRepoLocalSupabaseCli });
  const boundaries = dependencies.sessionBoundaries ?? sessionBoundaries;
  const createSession = dependencies.createSession ?? createRecoverySession;
  const cleanupSession = dependencies.cleanupSession ?? cleanupRecoverySession;
  const prepareTarget = dependencies.prepareTarget ?? prepareManagedRecoveryTarget;
  const cleanupTarget = dependencies.cleanupTarget ?? cleanupManagedRecoveryTarget;
  let session;
  let prepared;
  let executor;
  let startAttempted = false;
  let primaryError;
  let result;
  let targetCleanupError;
  let sessionCleanupError;
  try {
    const locations = boundaries({ repoRoot });
    session = await createSession({ parent: locations.parent, backupOutputRoot: locations.backupOutputRoot, repoRoot, governedRoots: locations.governedRoots ?? [] });
    prepared = await prepareTarget({
      session,
      manifest: { status: "COMPLETE", productionRuntimeSha: PRODUCTION_RUNTIME_SHA },
      repoRoot,
      environment,
      executeGit: dependencies.execute ?? runCommand,
      probePort: dependencies.probePort,
      projectId: dependencies.projectId,
    });
    executor = createGovernedLocalTargetExecutor({ prepared, execute: dependencies.execute ?? runCommand });
    startAttempted = true;
    await executeGovernedLocalTargetPlan(executor, prepared.commandPlans.start);
    const statusOutput = await executeGovernedLocalTargetPlan(executor, prepared.commandPlans.status);
    const localStatus = admitLocalSupabaseStatus(statusOutput.stdout);
    const dockerOutput = await executeGovernedLocalTargetPlan(executor, prepared.commandPlans.discoverDb);
    const containerAuthority = admitDockerDbDiscovery({ projectId: prepared.target.projectId, rawOutput: dockerOutput.stdout });
    const proveIsolation = dependencies.proveIsolation ?? provePreparedRecoveryTargetIsolation;
    const isolation = proveIsolation({ prepared, session, manifest: { productionRuntimeSha: PRODUCTION_RUNTIME_SHA }, localStatus, environment: {} });
    if (
      isolation?.LOCAL_ONLY !== true
      || isolation.LINKED_PRODUCTION !== false
      || isolation.DISPOSABLE !== true
      || isolation.BASELINE_AUTHORITY !== PRODUCTION_RUNTIME_SHA
    ) fail("RECOVERY_TARGET_ISOLATION_FAILED", "Disposable recovery target isolation could not be proven");
    const queries = buildLocalTargetBaselineQueryPlans({ executor, containerAuthority, environment });
    const outputs = {};
    for (const queryName of TARGET_BASELINE_QUERY_NAMES) outputs[queryName] = (await executeGovernedLocalTargetPlan(executor, queries[queryName])).stdout;
    const validation = parseLocalTargetBaselineOutputs({ authority: prepared.authority, outputs });
    result = {
      status: "PASS", operation: "real-local-target-compatibility", runtimeAuthority: "VERIFIED", targetIsolation: "VERIFIED",
      baselineMigrationCount: validation.baseline.migrationCount, schemasVerified: true, requiredExtensionsVerified: true, privateBucketVerified: true,
      targetCatalogVerified: validation.targetCatalogVerified, replicationRole: validation.replicationRole, realTargetStarts: 1, targetMutations: 0, sqlMutations: 0, remoteActivity: 0,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (startAttempted && prepared && executor) {
      try { await cleanupTarget({ session, target: prepared.target, adapter: createGovernedTargetCleanupAdapter(executor) }); } catch { targetCleanupError = Object.assign(new Error("Disposable recovery target cleanup did not complete"), { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" }); }
    }
    if (session) {
      try { await cleanupSession(session); } catch { sessionCleanupError = Object.assign(new Error("Recovery session cleanup did not complete"), { code: "RECOVERY_CLEANUP_INCOMPLETE" }); }
    }
  }
  if (sessionCleanupError) throw sessionCleanupError;
  if (targetCleanupError) throw targetCleanupError;
  if (primaryError) throw primaryError;
  return Object.freeze({ ...result, targetCleanup: "PASS" });
}

async function main() {
  try {
    console.log(JSON.stringify(await runLocalTargetCompatibilityDrill()));
  } catch (error) {
    console.log(JSON.stringify(sanitizeLocalTargetDrillFailure(error)));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) await main();
