#!/usr/bin/env node
import { resolve } from "node:path";

import {
  acquireGenerationMutationLock,
  isCanonicalGenerationId,
  readGenerationMutationLock,
  readSecretGeneration,
} from "./secret-generation.mjs";
import { validatePostgresPasswordRotationCandidate } from "./postgres-password-rotation.mjs";
import { createPostgresPasswordLiveRuntime } from "./postgres-password-live-runtime.mjs";
import { createPostgresPasswordOperationHooks, POSTGRES_PASSWORD_TARGET_ACCEPTANCE } from "./postgres-password-operation-evidence.mjs";
import { orchestratePostgresPasswordCutover } from "./postgres-password-runtime.mjs";
import { orchestratePostgresPasswordRollback, resumePostgresPasswordRollback } from "./postgres-password-rollback.mjs";

const ROOT = process.cwd();
const OPERATION = "postgres-password-rotation";
const COMMANDS = new Set(["cutover", "rollback", "rollback-resume", "target-finalize"]);

function fail(code) { throw new Error(code); }
function safeCode(error, fallback = "POSTGRES_PASSWORD_EXECUTION_FAILED") { return error?.message?.startsWith("POSTGRES_PASSWORD_EXECUTION_") ? error.message : fallback; }
function exactLock(lock, targetGenerationId) { return lock?.state === "PRESENT" && lock.operation === OPERATION && lock.generationId === targetGenerationId; }
function safeResult(value, command, sourceGenerationId, targetGenerationId, extra = {}) {
  return Object.freeze({
    state: typeof value?.state === "string" ? value.state : "POSTGRES_PASSWORD_EXECUTION_STATE_UNVERIFIED",
    ...(typeof value?.code === "string" ? { code: value.code } : {}),
    ...(typeof value?.stage === "string" ? { stage: value.stage } : {}),
    ...(Array.isArray(value?.services) ? { services: Object.freeze([...value.services]) } : {}),
    command, sourceGenerationId, targetGenerationId, ...extra,
  });
}

async function loadRelation({ protectedRoot, sourceGenerationId, targetGenerationId, readGeneration }) {
  if (!isCanonicalGenerationId(sourceGenerationId) || !isCanonicalGenerationId(targetGenerationId) || sourceGenerationId === targetGenerationId) fail("POSTGRES_PASSWORD_EXECUTION_GENERATION_INVALID");
  let source; let target;
  try { [source, target] = await Promise.all([readGeneration({ protectedRoot, generationId: sourceGenerationId }), readGeneration({ protectedRoot, generationId: targetGenerationId })]); }
  catch { fail("POSTGRES_PASSWORD_EXECUTION_GENERATION_UNVERIFIED"); }
  try {
    if (target?.metadata?.reason !== OPERATION || target.metadata.sourceGenerationId !== sourceGenerationId) fail("POSTGRES_PASSWORD_EXECUTION_GENERATION_RELATION_INVALID");
    validatePostgresPasswordRotationCandidate({ sourceSupabaseSnapshot: source.supabaseSnapshot, candidateSupabaseSnapshot: target.supabaseSnapshot, sourceGodelSnapshot: source.godelSnapshot, candidateGodelSnapshot: target.godelSnapshot });
  } catch { fail("POSTGRES_PASSWORD_EXECUTION_GENERATION_RELATION_INVALID"); }
  return { source, target };
}

async function retainedLock({ protectedRoot, targetGenerationId, readLock, code = "POSTGRES_PASSWORD_EXECUTION_LOCK_INVALID" }) {
  let lock;
  try { lock = await readLock({ protectedRoot }); } catch { fail("POSTGRES_PASSWORD_EXECUTION_LOCK_UNVERIFIED"); }
  if (!exactLock(lock, targetGenerationId)) fail(code);
  return lock;
}

async function publicResult({ hooks, generationId }) {
  try { return await hooks.verifyPublicRecovery({ generationId }) === true; } catch { return false; }
}

async function finalLockState(runtime) {
  try {
    const state = await runtime.readOperationLockState();
    return state === "PRESENT" || state === "ABSENT" ? state : "UNKNOWN";
  } catch { return "UNKNOWN"; }
}

async function finalizePreflightFailure({ result, command, sourceGenerationId, targetGenerationId, protectedRoot, readLock, hooks, runtime }) {
  if (!await publicResult({ hooks, generationId: sourceGenerationId })) return safeResult(result, command, sourceGenerationId, targetGenerationId, { lock: "RETAINED" });
  try { await retainedLock({ protectedRoot, targetGenerationId, readLock }); } catch { return safeResult({ ...result, state: "PREFLIGHT_FAILED_LOCK_STATE_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId); }
  try { await runtime.releaseLock(); } catch {}
  const state = await finalLockState(runtime);
  if (state === "ABSENT") return safeResult(result, command, sourceGenerationId, targetGenerationId, { lock: "LOCK_RELEASED" });
  if (state === "PRESENT") return safeResult({ ...result, state: "PREFLIGHT_FAILED_LOCK_RETAINED" }, command, sourceGenerationId, targetGenerationId);
  return safeResult({ ...result, state: "PREFLIGHT_FAILED_LOCK_STATE_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
}

async function finalizeAcceptedTarget({ command, sourceGenerationId, targetGenerationId, protectedRoot, readLock, hooks, runtime }) {
  await retainedLock({ protectedRoot, targetGenerationId, readLock });
  const accepted = await hooks.classifyTargetCoreAcceptance();
  if (accepted !== POSTGRES_PASSWORD_TARGET_ACCEPTANCE.ACCEPTED) return safeResult({ state: accepted === POSTGRES_PASSWORD_TARGET_ACCEPTANCE.NOT_ACCEPTED ? "TARGET_ACCEPTED_NOT_ACCEPTED" : "TARGET_ACCEPTED_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
  let running = false;
  try { running = await runtime.verifyNginxRunning() === true; } catch {}
  if (!running) {
    let stopped = false;
    try { stopped = await runtime.verifyNginxStopped() === true; } catch {}
    if (!stopped) return safeResult({ state: "TARGET_ACCEPTED_MAINTENANCE_STATE_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
    try { await runtime.openMaintenance(); } catch {}
    try { running = await runtime.verifyNginxRunning() === true; } catch { running = false; }
    if (!running) {
      try { stopped = await runtime.verifyNginxStopped() === true; } catch { stopped = false; }
      return safeResult({ state: stopped ? "TARGET_ACCEPTED_MAINTENANCE_CLOSED" : "TARGET_ACCEPTED_MAINTENANCE_STATE_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
    }
  }
  try { await runtime.releaseLock(); } catch {}
  const state = await finalLockState(runtime);
  if (state === "PRESENT") return safeResult({ state: "TARGET_ACCEPTED_LOCK_RETAINED" }, command, sourceGenerationId, targetGenerationId);
  if (state !== "ABSENT") return safeResult({ state: "TARGET_ACCEPTED_LOCK_STATE_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
  return safeResult({ state: await publicResult({ hooks, generationId: targetGenerationId }) ? "COMPLETE" : "COMPLETE_PUBLIC_RECOVERY_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
}

export async function executePostgresPasswordRotation({
  command,
  sourceGenerationId,
  targetGenerationId,
  backup,
  apply = false,
  root = ROOT,
  protectedRoot = resolve(root, "protected-recovery-material/selfhosted"),
  supabaseEnvPath = resolve(root, "infra/supabase/.env"),
  godelEnvPath = resolve(root, "compose.env.local"),
  dependencies = {},
} = {}) {
  if (!COMMANDS.has(command)) fail("POSTGRES_PASSWORD_EXECUTION_COMMAND_INVALID");
  if (command === "cutover" && (typeof backup !== "string" || !backup)) fail("POSTGRES_PASSWORD_EXECUTION_BACKUP_REQUIRED");
  const readGeneration = dependencies.readSecretGeneration ?? readSecretGeneration;
  const relation = await loadRelation({ protectedRoot, sourceGenerationId, targetGenerationId, readGeneration });
  if (!apply) return Object.freeze({ state: "DRY_RUN", command, sourceGenerationId, targetGenerationId });

  const readLock = dependencies.readGenerationMutationLock ?? readGenerationMutationLock;
  const acquireLock = dependencies.acquireGenerationMutationLock ?? acquireGenerationMutationLock;
  let runtime;
  const hooks = (dependencies.createHooks ?? createPostgresPasswordOperationHooks)({ sourceGenerationId, targetGenerationId, backup: typeof backup === "string" ? { path: backup } : backup, protectedRoot, supabaseEnvPath, godelEnvPath, root, getRuntime: () => runtime, ...(dependencies.hookOptions ?? {}) });
  runtime = (dependencies.createRuntime ?? createPostgresPasswordLiveRuntime)({ sourceGenerationId, targetGenerationId, protectedRoot, supabaseEnvPath, godelEnvPath, root, hooks });

  if (command === "target-finalize") return finalizeAcceptedTarget({ command, sourceGenerationId, targetGenerationId, protectedRoot, readLock, hooks, runtime });
  if (command === "rollback" || command === "rollback-resume") {
    await retainedLock({ protectedRoot, targetGenerationId, readLock });
    const execute = command === "rollback" ? (dependencies.orchestrateRollback ?? orchestratePostgresPasswordRollback) : (dependencies.resumeRollback ?? resumePostgresPasswordRollback);
    let result;
    try { result = await execute({ source: relation.source, target: relation.target, runtime }); } catch { return safeResult({ state: "POSTGRES_PASSWORD_EXECUTION_STATE_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId); }
    if (result?.state === "ROLLBACK_COMPLETE" && !await publicResult({ hooks, generationId: sourceGenerationId })) return safeResult({ state: "ROLLBACK_COMPLETE_PUBLIC_RECOVERY_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
    return safeResult(result, command, sourceGenerationId, targetGenerationId);
  }

  let before;
  try { before = await readLock({ protectedRoot }); } catch { fail("POSTGRES_PASSWORD_EXECUTION_LOCK_UNVERIFIED"); }
  if (before?.state !== "ABSENT") fail("POSTGRES_PASSWORD_EXECUTION_LOCK_PRECHECK_FAILED");
  try { await acquireLock({ protectedRoot, operation: OPERATION, generationId: targetGenerationId }); }
  catch { try { await readLock({ protectedRoot }); } catch {} fail("POSTGRES_PASSWORD_EXECUTION_LOCK_ACQUISITION_UNVERIFIED"); }
  await retainedLock({ protectedRoot, targetGenerationId, readLock, code: "POSTGRES_PASSWORD_EXECUTION_LOCK_ACQUISITION_UNVERIFIED" });
  let result;
  try { result = await (dependencies.orchestrateCutover ?? orchestratePostgresPasswordCutover)({ source: relation.source, target: relation.target, runtime }); }
  catch { return safeResult({ state: "POSTGRES_PASSWORD_EXECUTION_STATE_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId); }
  if (result?.state === "PREFLIGHT_FAILED") return finalizePreflightFailure({ result, command, sourceGenerationId, targetGenerationId, protectedRoot, readLock, hooks, runtime });
  if (result?.state === "COMPLETE" && !await publicResult({ hooks, generationId: targetGenerationId })) return safeResult({ state: "COMPLETE_PUBLIC_RECOVERY_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
  if (result?.state === "FAILED_SOURCE_RESTORED" && !await publicResult({ hooks, generationId: sourceGenerationId })) return safeResult({ state: "FAILED_SOURCE_RESTORED_PUBLIC_RECOVERY_UNVERIFIED" }, command, sourceGenerationId, targetGenerationId);
  return safeResult(result, command, sourceGenerationId, targetGenerationId);
}

export function parsePostgresPasswordExecuteCli(args, root = ROOT) {
  const command = args.shift();
  if (!COMMANDS.has(command)) fail("POSTGRES_PASSWORD_EXECUTION_COMMAND_INVALID");
  const value = { root, protectedRoot: resolve(root, "protected-recovery-material/selfhosted"), supabaseEnvPath: resolve(root, "infra/supabase/.env"), godelEnvPath: resolve(root, "compose.env.local"), apply: false };
  while (args.length) {
    const argument = args.shift(); const next = () => { const item = args.shift(); if (!item || item.startsWith("--")) fail("POSTGRES_PASSWORD_EXECUTION_ARGUMENT_INVALID"); return item; };
    if (argument === "--apply") { if (value.apply) fail("POSTGRES_PASSWORD_EXECUTION_ARGUMENT_INVALID"); value.apply = true; }
    else if (argument === "--source" && !value.sourceGenerationId) value.sourceGenerationId = next();
    else if (argument === "--target" && !value.targetGenerationId) value.targetGenerationId = next();
    else if (argument === "--backup" && command === "cutover" && !value.backup) value.backup = next();
    else fail("POSTGRES_PASSWORD_EXECUTION_ARGUMENT_INVALID");
  }
  if (!value.sourceGenerationId || !value.targetGenerationId || (command === "cutover" && !value.backup)) fail("POSTGRES_PASSWORD_EXECUTION_ARGUMENT_INVALID");
  return { command, value };
}

export function renderPostgresPasswordExecutionResult(result) {
  return `${result.state}\nCOMMAND ${result.command}\nSOURCE ${result.sourceGenerationId}\nTARGET ${result.targetGenerationId}\n${result.code ? `CODE ${result.code}\n` : ""}`;
}

if (import.meta.main) {
  try { const { command, value } = parsePostgresPasswordExecuteCli(process.argv.slice(2)); process.stdout.write(renderPostgresPasswordExecutionResult(await executePostgresPasswordRotation({ command, ...value }))); }
  catch (error) { process.stderr.write(`FAIL ${safeCode(error)}\n`); process.exitCode = 1; }
}
