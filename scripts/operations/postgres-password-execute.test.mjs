import assert from "node:assert/strict";
import test from "node:test";

import { buildPostgresPasswordRotationCandidate } from "./postgres-password-rotation.mjs";
import {
  executePostgresPasswordRotation,
  parsePostgresPasswordExecuteCli,
  renderPostgresPasswordExecutionResult,
} from "./postgres-password-execute.mjs";

const sourceGenerationId = "123e4567-e89b-42d3-a456-426614174000";
const targetGenerationId = "223e4567-e89b-42d3-a456-426614174000";
const sourcePassword = "a".repeat(32);
const targetPassword = "b".repeat(64);

function generations() {
  const sourceSupabaseSnapshot = Buffer.from(`POSTGRES_PASSWORD=${sourcePassword}\nSERVICE_ROLE_KEY=SYNTHETIC_SOURCE_SECRET\nPOOLER_TENANT_ID=tenant\nJWT_SECRET=retained\n`);
  const sourceGodelSnapshot = Buffer.from("SUPABASE_SECRET_KEY=retained\n");
  const candidate = buildPostgresPasswordRotationCandidate({ sourceSupabaseSnapshot, sourceGodelSnapshot, targetPassword });
  return {
    source: { generationId: sourceGenerationId, supabaseSnapshot: sourceSupabaseSnapshot, godelSnapshot: sourceGodelSnapshot },
    target: { generationId: targetGenerationId, metadata: { reason: "postgres-password-rotation", sourceGenerationId }, supabaseSnapshot: candidate.supabaseSnapshot, godelSnapshot: candidate.godelSnapshot },
  };
}

function harness({ initialLock = { state: "ABSENT" }, cutover = { state: "COMPLETE", stage: "COMPLETE" }, rollback = { state: "ROLLBACK_COMPLETE", stage: "ROLLBACK_COMPLETE" }, resume = { state: "ROLLBACK_COMPLETE", stage: "ROLLBACK_COMPLETE" }, publicRecovery = true, acceptance = "ACCEPTED", openThrows = false, running = true, stopped = false, releaseThrows = false, acquireThrows = false } = {}) {
  const events = [];
  const refs = generations();
  let lock = initialLock;
  let lockReads = 0;
  let nginxRunning = running;
  const runtime = {
    readOperationLockState: async () => lock.state === "ABSENT" ? "ABSENT" : lock.state === "PRESENT" && lock.operation === "postgres-password-rotation" && lock.generationId === targetGenerationId ? "PRESENT" : "UNKNOWN",
    releaseLock: async () => { events.push("release"); lock = { state: "ABSENT" }; if (releaseThrows) throw new Error("SYNTHETIC_SECRET_DO_NOT_PRINT"); return true; },
    openMaintenance: async () => { events.push("open"); nginxRunning = true; if (openThrows) throw new Error("SYNTHETIC_SECRET_DO_NOT_PRINT"); return true; },
    verifyNginxRunning: async () => nginxRunning,
    verifyNginxStopped: async () => stopped,
  };
  for (const name of ["rotateDatabaseRoles", "restoreDatabaseRoles", "updateSupavisorManager", "restoreSupavisorManager", "writeEnvironment", "restoreEnvironment", "replacePointer", "recreateDatabase", "recreateConsumer", "closeMaintenance"]) runtime[name] = async () => { throw new Error(`MUTATION_CALLED:${name}`); };
  const dependencies = {
    readSecretGeneration: async ({ generationId }) => generationId === sourceGenerationId ? refs.source : refs.target,
    readGenerationMutationLock: async () => { lockReads += 1; return lock; },
    acquireGenerationMutationLock: async (value) => { events.push({ acquire: value }); if (acquireThrows) { lock = { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }; throw new Error("SYNTHETIC_SECRET_DO_NOT_PRINT"); } lock = { state: "PRESENT", operation: value.operation, generationId: value.generationId }; return lock; },
    createHooks: () => ({ verifyPublicRecovery: async ({ generationId }) => { events.push(`public:${generationId}`); return publicRecovery; }, classifyTargetCoreAcceptance: async () => acceptance, classifyTargetAcceptance: async () => acceptance }),
    createRuntime: () => runtime,
    orchestrateCutover: async () => { events.push("cutover"); if (cutover instanceof Error) throw cutover; return cutover; },
    orchestrateRollback: async () => { events.push("rollback"); return rollback; },
    resumeRollback: async () => { events.push("resume"); return resume; },
  };
  return { events, dependencies, runtime, get lock() { return lock; }, get lockReads() { return lockReads; } };
}

async function execute(unit, command, extra = {}) {
  return executePostgresPasswordRotation({ command, sourceGenerationId, targetGenerationId, backup: command === "cutover" ? "synthetic-backup" : undefined, apply: true, dependencies: unit.dependencies, ...extra });
}

test("every command defaults to dry run without a lock, runtime, hook, or orchestrator", async () => {
  for (const command of ["cutover", "rollback", "rollback-resume", "target-finalize"]) {
    const unit = harness();
    const result = await executePostgresPasswordRotation({ command, sourceGenerationId, targetGenerationId, backup: command === "cutover" ? "synthetic-backup" : undefined, dependencies: unit.dependencies });
    assert.deepEqual(result, { state: "DRY_RUN", command, sourceGenerationId, targetGenerationId });
    assert.deepEqual(unit.events, []);
    assert.equal(unit.lockReads, 0);
  }
});

test("cutover acquires the central target lock, reads it back, and dispatches once", async () => {
  const unit = harness();
  const result = await execute(unit, "cutover");
  assert.equal(result.state, "COMPLETE");
  assert.equal(unit.events.filter((event) => typeof event === "object").length, 1);
  assert.deepEqual(unit.events.find((event) => typeof event === "object").acquire, { protectedRoot: process.cwd() + "\\protected-recovery-material\\selfhosted", operation: "postgres-password-rotation", generationId: targetGenerationId });
  assert.equal(unit.events.filter((event) => event === "cutover").length, 1);
  assert.equal(unit.lockReads, 2);
});

test("cutover lock precheck and ambiguous acquisition fail closed without cleanup", async () => {
  const held = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId } });
  await assert.rejects(() => execute(held, "cutover"), /LOCK_PRECHECK_FAILED/);
  assert.deepEqual(held.events, []);
  const ambiguous = harness({ acquireThrows: true });
  await assert.rejects(() => execute(ambiguous, "cutover"), /LOCK_ACQUISITION_UNVERIFIED/);
  assert.equal(ambiguous.events.some((event) => event === "release"), false);
});

test("only PREFLIGHT_FAILED can release an owned lock after SOURCE public recovery", async () => {
  const clean = harness({ cutover: { state: "PREFLIGHT_FAILED", code: "POSTGRES_ROTATION_PREFLIGHT_FAILED", stage: "PREFLIGHT_SOURCE" } });
  const result = await execute(clean, "cutover");
  assert.equal(result.state, "PREFLIGHT_FAILED");
  assert.equal(result.lock, "LOCK_RELEASED");
  assert.deepEqual(clean.events.filter((event) => typeof event === "string"), ["cutover", `public:${sourceGenerationId}`, "release"]);
  const retained = harness({ cutover: { state: "PREFLIGHT_FAILED", code: "POSTGRES_ROTATION_PREFLIGHT_FAILED" }, publicRecovery: false });
  assert.equal((await execute(retained, "cutover")).lock, "RETAINED");
  assert.equal(retained.events.includes("release"), false);
  const throwAfterRelease = harness({ cutover: { state: "PREFLIGHT_FAILED", code: "POSTGRES_ROTATION_PREFLIGHT_FAILED" }, releaseThrows: true });
  assert.equal((await execute(throwAfterRelease, "cutover")).lock, "LOCK_RELEASED");
  const lockRetained = harness({ cutover: { state: "PREFLIGHT_FAILED" } });
  lockRetained.runtime.releaseLock = async () => { lockRetained.events.push("release"); return true; };
  assert.equal((await execute(lockRetained, "cutover")).state, "PREFLIGHT_FAILED_LOCK_RETAINED");
  const lockUnknown = harness({ cutover: { state: "PREFLIGHT_FAILED" } });
  lockUnknown.runtime.releaseLock = async () => { lockUnknown.events.push("release"); return true; };
  lockUnknown.runtime.readOperationLockState = async () => "UNKNOWN";
  assert.equal((await execute(lockUnknown, "cutover")).state, "PREFLIGHT_FAILED_LOCK_STATE_UNVERIFIED");
});

test("post-preflight and unexpected failures retain the lock without wrapper recovery", async () => {
  const committed = harness({ cutover: { state: "COMMITTED_REQUIRES_TRACKED_ROLLBACK", code: "POSTGRES_ROTATION_COMMITTED_REQUIRES_TRACKED_ROLLBACK" } });
  assert.equal((await execute(committed, "cutover")).state, "COMMITTED_REQUIRES_TRACKED_ROLLBACK");
  assert.equal(committed.events.includes("release"), false);
  assert.equal(committed.events.includes("open"), false);
  const thrown = harness({ cutover: new Error("SYNTHETIC_SECRET_DO_NOT_PRINT") });
  assert.equal((await execute(thrown, "cutover")).state, "POSTGRES_PASSWORD_EXECUTION_STATE_UNVERIFIED");
  assert.equal(thrown.events.includes("release"), false);
});

test("completion and safe SOURCE restoration use public recovery without automatic rollback", async () => {
  const complete = harness();
  assert.equal((await execute(complete, "cutover")).state, "COMPLETE");
  assert.equal(complete.events.includes(`public:${targetGenerationId}`), true);
  const unverified = harness({ publicRecovery: false });
  assert.equal((await execute(unverified, "cutover")).state, "COMPLETE_PUBLIC_RECOVERY_UNVERIFIED");
  assert.equal(unverified.events.includes("rollback"), false);
  const source = harness({ cutover: { state: "FAILED_SOURCE_RESTORED" }, publicRecovery: false });
  assert.equal((await execute(source, "cutover")).state, "FAILED_SOURCE_RESTORED_PUBLIC_RECOVERY_UNVERIFIED");
});

test("rollback and resume require the retained target lock and verify SOURCE only after completion", async () => {
  for (const command of ["rollback", "rollback-resume"]) {
    const unit = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId } });
    assert.equal((await execute(unit, command)).state, "ROLLBACK_COMPLETE");
    assert.equal(unit.events.includes(command === "rollback" ? "rollback" : "resume"), true);
    assert.equal(unit.events.some((event) => typeof event === "object" && event.acquire), false);
    assert.equal(unit.events.includes(`public:${sourceGenerationId}`), true);
  }
});

test("accepted target finalization only opens maintenance and releases the owned lock", async () => {
  const unit = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, running: false, stopped: true });
  assert.equal((await execute(unit, "target-finalize")).state, "COMPLETE");
  assert.deepEqual(unit.events.filter((event) => typeof event === "string"), ["open", "release", `public:${targetGenerationId}`]);
});

test("an already-running accepted TARGET finalizes its retained lock without reopening maintenance", async () => {
  const unit = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, running: true, stopped: false });
  assert.equal((await execute(unit, "target-finalize")).state, "COMPLETE");
  assert.equal(unit.events.includes("open"), false);
  assert.deepEqual(unit.events.filter((event) => typeof event === "string"), ["release", `public:${targetGenerationId}`]);
});

test("target finalization recovers an open that mutates then throws and retains closed or invalid states", async () => {
  const throwingOpen = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, running: false, stopped: true, openThrows: true });
  assert.equal((await execute(throwingOpen, "target-finalize")).state, "COMPLETE");
  const closed = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, running: false, stopped: true, acceptance: "ACCEPTED" });
  closed.runtime.openMaintenance = async () => { throw new Error("failure"); };
  assert.equal((await execute(closed, "target-finalize")).state, "TARGET_ACCEPTED_MAINTENANCE_CLOSED");
  for (const acceptance of ["NOT_ACCEPTED", "UNVERIFIED"]) {
    const invalid = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, acceptance });
    assert.match((await execute(invalid, "target-finalize")).state, /TARGET_ACCEPTED_(NOT_ACCEPTED|UNVERIFIED)/);
    assert.equal(invalid.events.includes("open") || invalid.events.includes("release"), false);
  }
});

test("ambiguous release is finalized only by its authoritative lock readback", async () => {
  const retained = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, running: true, stopped: false });
  retained.runtime.releaseLock = async () => { retained.events.push("release"); return true; };
  assert.equal((await execute(retained, "target-finalize")).state, "TARGET_ACCEPTED_LOCK_RETAINED");
  assert.equal(retained.events.includes("open"), false);
  const unknown = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, running: true, stopped: false });
  unknown.runtime.releaseLock = async () => { unknown.events.push("release"); return true; };
  unknown.runtime.readOperationLockState = async () => "UNKNOWN";
  assert.equal((await execute(unknown, "target-finalize")).state, "TARGET_ACCEPTED_LOCK_STATE_UNVERIFIED");
  assert.equal(unknown.events.includes("open"), false);
  const threwAbsent = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, running: true, stopped: false, releaseThrows: true });
  assert.equal((await execute(threwAbsent, "target-finalize")).state, "COMPLETE");
});

test("ambiguous maintenance does not open or release the lock", async () => {
  const unit = harness({ initialLock: { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, running: false, stopped: false });
  assert.equal((await execute(unit, "target-finalize")).state, "TARGET_ACCEPTED_MAINTENANCE_STATE_UNVERIFIED");
  assert.equal(unit.events.includes("open") || unit.events.includes("release"), false);
});

test("CLI accepts only exact secret-free commands and renders no backup path", () => {
  const parsed = parsePostgresPasswordExecuteCli(["cutover", "--source", sourceGenerationId, "--target", targetGenerationId, "--backup", "sensitive-path", "--apply"], "synthetic-root");
  assert.equal(parsed.command, "cutover");
  assert.equal(parsed.value.apply, true);
  assert.throws(() => parsePostgresPasswordExecuteCli(["cutover", "--source", sourceGenerationId, "--target", targetGenerationId, "--password", "no"], "root"), /ARGUMENT_INVALID/);
  assert.doesNotMatch(renderPostgresPasswordExecutionResult({ state: "DRY_RUN", command: "cutover", sourceGenerationId, targetGenerationId }), /sensitive-path|POSTGRES_PASSWORD/);
});
