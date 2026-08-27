import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  EXTERNAL_SECRET_GENERATION_FORMAT,
  EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION,
  EXTERNAL_SECRET_SNAPSHOT_FILES,
  acquireGenerationMutationLock,
  assertNoGenerationMutationLock,
  getCurrentSecretGeneration,
  isCanonicalGenerationId,
  publishSecretGeneration,
  readSecretGeneration,
  releaseGenerationMutationLock,
  replaceCurrentGenerationPointer,
  writeAllowlistedEnvironmentFile,
} from "./secret-generation.mjs";
import { EC_ROTATION_VARIABLES, buildEcRotationPlan, validateEcRotationStage, validateEcRotationTransition, validateGen4Source } from "./ec-signing-key-rotation.mjs";

const PLAN_FORMAT = "godel-ec-signing-key-rotation-plan";
const PLAN_SCHEMA_VERSION = 1;
const REASON = "ec-signing-key-rotation";
const STAGES = Object.freeze(["GEN5", "GEN6", "GEN7"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMIT = /^[0-9a-f]{40}$/;

function fail(code) { throw new Error(code); }
function exactKeys(value, expected, code) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== expected.length || Object.keys(value).some((key) => !expected.includes(key))) fail(code); }
function values(snapshot) { const result = new Map(); for (const line of Buffer.from(snapshot).toString("utf8").split(/\r?\n/)) { const index = line.indexOf("="); if (index < 1) continue; const name = line.slice(0, index); if (result.has(name)) fail("DUPLICATE_ENVIRONMENT_VARIABLE"); result.set(name, line.slice(index + 1)); } return result; }
function required(map, name) { const value = map.get(name); if (!value) fail("INVALID_EC_ROTATION_SNAPSHOT"); return value; }
function changedNames(before, after) { const source = values(before), target = values(after), names = new Set([...source.keys(), ...target.keys()]); return [...names].filter((name) => source.get(name) !== target.get(name)).sort(); }
function cleanCommit(root) { if (execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true }).trim()) fail("REPOSITORY_MUST_BE_CLEAN"); const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim(); if (!COMMIT.test(commit)) fail("INVALID_REPOSITORY_COMMIT"); return commit; }
function planPaths(protectedRoot, planId) { if (!isCanonicalGenerationId(planId)) fail("INVALID_EC_ROTATION_PLAN_ID"); const external = resolve(protectedRoot, "external-secrets"), plans = join(external, "ec-rotation-plans"), directory = join(plans, planId); if (relative(plans, directory).startsWith("..")) fail("INVALID_EC_ROTATION_PLAN_PATH"); return { external, plans, directory, manifest: join(directory, "plan.json") }; }
async function stat(path) { try { return await lstat(path); } catch (error) { if (error?.code === "ENOENT") return null; throw error; } }
async function directory(path, code, missing = false) { const item = await stat(path); if (!item) { if (missing) return false; fail(`${code}_MISSING`); } if (item.isSymbolicLink()) fail(`${code}_SYMLINK`); if (!item.isDirectory()) fail(`${code}_NOT_DIRECTORY`); return true; }
async function regular(path, code) { const item = await stat(path); if (!item) fail(`${code}_MISSING`); if (item.isSymbolicLink()) fail(`${code}_SYMLINK`); if (!item.isFile()) fail(`${code}_NOT_REGULAR`); }
async function safeMkdir(path) { const item = await stat(path); if (item) { if (item.isSymbolicLink()) fail("EC_ROTATION_PLAN_DIRECTORY_SYMLINK"); if (!item.isDirectory()) fail("EC_ROTATION_PLAN_DIRECTORY_NOT_DIRECTORY"); await chmod(path, 0o700); return; } await mkdir(path, { mode: 0o700, recursive: false }); }
async function writeExclusive(path, data) { const handle = await open(path, "wx", 0o600); try { await handle.writeFile(data); } finally { await handle.close(); } }
function validateManifest(value, requestedPlanId = null) { exactKeys(value, ["createdAt", "format", "planId", "repositoryCommit", "schemaVersion", "sourceGenerationId", "stages"], "INVALID_EC_ROTATION_PLAN_MANIFEST"); if (value.format !== PLAN_FORMAT || value.schemaVersion !== PLAN_SCHEMA_VERSION || !isCanonicalGenerationId(value.planId) || (requestedPlanId && value.planId !== requestedPlanId) || !isCanonicalGenerationId(value.sourceGenerationId) || typeof value.createdAt !== "string" || Number.isNaN(Date.parse(value.createdAt)) || !COMMIT.test(value.repositoryCommit)) fail("INVALID_EC_ROTATION_PLAN_MANIFEST"); exactKeys(value.stages, STAGES, "INVALID_EC_ROTATION_PLAN_MANIFEST"); const generationIds = [value.sourceGenerationId, ...STAGES.map((stage) => value.stages[stage])]; if (new Set(generationIds).size !== generationIds.length || STAGES.some((stage) => !isCanonicalGenerationId(value.stages[stage]))) fail("INVALID_EC_ROTATION_PLAN_MANIFEST"); return value; }

async function publishManifest({ protectedRoot, manifest }) {
  const paths = planPaths(protectedRoot, manifest.planId);
  await directory(paths.external, "EXTERNAL_SECRETS_DIRECTORY");
  await safeMkdir(paths.plans);
  if (await stat(paths.directory)) fail("UNEXPECTED_EXISTING_EC_ROTATION_PLAN");
  const staging = join(paths.plans, `.staging-${randomUUID()}`);
  try { await mkdir(staging, { mode: 0o700 }); await writeExclusive(join(staging, "plan.json"), `${JSON.stringify(manifest, null, 2)}\n`); await rename(staging, paths.directory); } catch (error) { await rm(staging, { recursive: true, force: true }).catch(() => {}); throw error; }
}

async function readManifest({ protectedRoot, planId }) { const paths = planPaths(protectedRoot, planId); await directory(paths.external, "EXTERNAL_SECRETS_DIRECTORY"); await directory(paths.plans, "EC_ROTATION_PLANS_DIRECTORY"); await directory(paths.directory, "EC_ROTATION_PLAN_DIRECTORY"); await regular(paths.manifest, "EC_ROTATION_PLAN_MANIFEST"); try { return validateManifest(JSON.parse(await readFile(paths.manifest, "utf8")), planId); } catch (error) { if (error?.message === "INVALID_EC_ROTATION_PLAN_MANIFEST") throw error; fail("INVALID_EC_ROTATION_PLAN_MANIFEST"); } }
function metadata(id, sourceGenerationId, repositoryCommit) { return { format: EXTERNAL_SECRET_GENERATION_FORMAT, schemaVersion: EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION, generationId: id, createdAt: new Date().toISOString(), repositoryCommit, reason: REASON, sourceGenerationId, files: EXTERNAL_SECRET_SNAPSHOT_FILES }; }
function snapshots(plan) { return { GEN5: plan.gen5Snapshot, GEN6: plan.gen6Snapshot, GEN7: plan.gen7Snapshot }; }
function newKid(snapshot) { const key = JSON.parse(values(snapshot).get("JWT_KEYS")).find((entry) => entry?.kty === "EC" && Object.hasOwn(entry, "d")); if (!key?.kid) fail("INVALID_EC_ROTATION_SNAPSHOT"); return key.kid; }
function validateChain(source, stages, ids, repositoryCommit = null) { const oldKid = validateGen4Source(source.supabaseSnapshot).oldKid, newKeyId = newKid(stages.GEN6.supabaseSnapshot); if (!source.godelSnapshot.equals(stages.GEN5.godelSnapshot) || !source.godelSnapshot.equals(stages.GEN6.godelSnapshot) || !source.godelSnapshot.equals(stages.GEN7.godelSnapshot)) fail("EC_ROTATION_GODEL_SNAPSHOT_MISMATCH"); validateEcRotationStage(stages.GEN5.supabaseSnapshot, { stage: "GEN5", oldKid, newKid: newKeyId }); validateEcRotationStage(stages.GEN6.supabaseSnapshot, { stage: "GEN6", oldKid, newKid: newKeyId }); validateEcRotationStage(stages.GEN7.supabaseSnapshot, { stage: "GEN7", oldKid, newKid: newKeyId }); validateEcRotationTransition({ fromSnapshot: source.supabaseSnapshot, toSnapshot: stages.GEN5.supabaseSnapshot, fromStage: "GEN4", toStage: "GEN5", oldKid, newKid: newKeyId }); validateEcRotationTransition({ fromSnapshot: stages.GEN5.supabaseSnapshot, toSnapshot: stages.GEN6.supabaseSnapshot, fromStage: "GEN5", toStage: "GEN6", oldKid, newKid: newKeyId }); validateEcRotationTransition({ fromSnapshot: stages.GEN6.supabaseSnapshot, toSnapshot: stages.GEN7.supabaseSnapshot, fromStage: "GEN6", toStage: "GEN7", oldKid, newKid: newKeyId }); if (ids && (stages.GEN5.metadata.reason !== REASON || stages.GEN6.metadata.reason !== REASON || stages.GEN7.metadata.reason !== REASON || stages.GEN5.metadata.sourceGenerationId !== ids.source || stages.GEN6.metadata.sourceGenerationId !== ids.GEN5 || stages.GEN7.metadata.sourceGenerationId !== ids.GEN6)) fail("INVALID_EC_ROTATION_GENERATION_CHAIN"); if (repositoryCommit && STAGES.some((stage) => stages[stage].metadata.repositoryCommit !== repositoryCommit)) fail("EC_ROTATION_PLAN_REPOSITORY_COMMIT_MISMATCH"); }

async function currentGen4(value) { const current = await getCurrentSecretGeneration({ ...value, compareLive: true }); if (current.state === "UNINITIALIZED") fail("SECRET_GENERATION_REGISTRY_UNINITIALIZED"); if (!current.match) fail("EXTERNAL_SECRET_GENERATION_MISMATCH"); validateGen4Source(current.generation.supabaseSnapshot); return current; }

export async function prepareEcSigningKeyRotation({ root, protectedRoot, supabaseEnvPath, godelEnvPath, apply = false, hooks = {} }) {
  await assertNoGenerationMutationLock({ protectedRoot }); const source = await currentGen4({ protectedRoot, supabaseEnvPath, godelEnvPath }); const preflightCommit = cleanCommit(root); if (!apply) { buildEcRotationPlan(source.generation.supabaseSnapshot); return { state: "DRY_RUN", sourceGenerationId: source.generationId }; }
  const lock = await acquireGenerationMutationLock({ protectedRoot, operation: "ec-signing-key-prepare", generationId: source.generationId }); const ids = { source: source.generationId, GEN5: randomUUID(), GEN6: randomUUID(), GEN7: randomUUID() }; const planId = randomUUID(); let committed = false, release = true, published = [];
  try {
    await hooks.afterLockAcquired?.(); const underLock = await currentGen4({ protectedRoot, supabaseEnvPath, godelEnvPath }); if (underLock.generationId !== source.generationId) fail("EXTERNAL_SECRET_GENERATION_NOT_ACTIVE"); const repositoryCommit = cleanCommit(root); if (repositoryCommit !== preflightCommit) fail("REPOSITORY_CHANGED_DURING_EC_ROTATION_PREPARE"); const model = buildEcRotationPlan(underLock.generation.supabaseSnapshot); const stageSnapshots = snapshots(model);
    for (const stage of STAGES) { const sourceId = stage === "GEN5" ? ids.source : ids[stage === "GEN6" ? "GEN5" : "GEN6"]; await publishSecretGeneration({ protectedRoot, generationId: ids[stage], metadata: metadata(ids[stage], sourceId, repositoryCommit), supabaseSnapshot: stageSnapshots[stage], godelSnapshot: underLock.generation.godelSnapshot }); published.push(ids[stage]); }
    const persisted = Object.fromEntries(await Promise.all(STAGES.map(async (stage) => [stage, await readSecretGeneration({ protectedRoot, generationId: ids[stage] })]))); validateChain(underLock.generation, persisted, ids, repositoryCommit); await hooks.beforePlanManifest?.();
    const manifest = { format: PLAN_FORMAT, schemaVersion: PLAN_SCHEMA_VERSION, planId, createdAt: new Date().toISOString(), repositoryCommit, sourceGenerationId: ids.source, stages: { GEN5: ids.GEN5, GEN6: ids.GEN6, GEN7: ids.GEN7 } }; await publishManifest({ protectedRoot, manifest }); committed = true; await hooks.afterPlanManifest?.();
    const active = await currentGen4({ protectedRoot, supabaseEnvPath, godelEnvPath }); if (active.generationId !== ids.source) fail("EC_ROTATION_PLAN_COMMITTED_UNVERIFIED"); return { state: "PREPARED", planId, stages: manifest.stages, sourceGenerationId: ids.source };
  } catch (error) {
    if (committed) { release = false; throw new Error("EC_ROTATION_PLAN_COMMITTED_UNVERIFIED", { cause: error }); }
    if (published.length) try { for (const generationId of [...published].reverse()) { const path = join(resolve(protectedRoot, "external-secrets", "generations"), generationId); await hooks.removePublishedGeneration?.({ generationId, path }); await rm(path, { recursive: true, force: true }); if (await stat(path)) fail("EC_ROTATION_PLAN_CLEANUP_FAILED"); } const active = await currentGen4({ protectedRoot, supabaseEnvPath, godelEnvPath }); if (active.generationId !== source.generationId || await stat(planPaths(protectedRoot, planId).manifest)) fail("EC_ROTATION_PLAN_CLEANUP_FAILED"); } catch { release = false; throw new Error("EC_ROTATION_PLAN_CLEANUP_FAILED"); }
    throw error;
  } finally { if (release) await releaseGenerationMutationLock(lock); }
}

export async function readEcSigningKeyRotationPlan({ protectedRoot, planId }) { const manifest = await readManifest({ protectedRoot, planId }); const source = await readSecretGeneration({ protectedRoot, generationId: manifest.sourceGenerationId }); const stages = Object.fromEntries(await Promise.all(STAGES.map(async (stage) => [stage, await readSecretGeneration({ protectedRoot, generationId: manifest.stages[stage] })]))); validateChain(source, stages, { source: manifest.sourceGenerationId, ...manifest.stages }, manifest.repositoryCommit); return { manifest, source, stages }; }
function stageFor(plan, generationId) { if (generationId === plan.manifest.sourceGenerationId) return "GEN4"; return ["GEN5", "GEN6", "GEN7"].find((stage) => plan.manifest.stages[stage] === generationId) ?? null; }
function relation(kind, from, to) { const allowed = kind === "activate" ? { GEN4: "GEN5", GEN5: "GEN6", GEN6: "GEN7" } : { GEN5: "GEN4", GEN6: "GEN5", GEN7: "GEN6" }; if (allowed[from] !== to) fail("UNSAFE_EC_ROTATION_STAGE_TRANSITION"); }
function generationFor(plan, stage) { return stage === "GEN4" ? plan.source : plan.stages[stage]; }
function assertExactStageDifference(fromStage, toStage, from, to) { const expected = { "GEN4:GEN5": ["JWT_JWKS", "JWT_KEYS"], "GEN5:GEN6": ["ANON_KEY_ASYMMETRIC", "JWT_KEYS", "SERVICE_ROLE_KEY_ASYMMETRIC"], "GEN6:GEN7": ["JWT_JWKS", "JWT_KEYS"], "GEN5:GEN4": ["JWT_JWKS", "JWT_KEYS"], "GEN6:GEN5": ["ANON_KEY_ASYMMETRIC", "JWT_KEYS", "SERVICE_ROLE_KEY_ASYMMETRIC"], "GEN7:GEN6": ["JWT_JWKS", "JWT_KEYS"] }[`${fromStage}:${toStage}`]; if (!expected || JSON.stringify(changedNames(from.supabaseSnapshot, to.supabaseSnapshot)) !== JSON.stringify(expected)) fail("INVALID_EC_ROTATION_STAGE_WRITE_SCOPE"); }

async function switchStage({ root, protectedRoot, supabaseEnvPath, godelEnvPath, planId, toStage, apply = false, operation, hooks = {} }) {
  cleanCommit(root); let plan = await readEcSigningKeyRotationPlan({ protectedRoot, planId }); let current = await currentGen4OrPlan({ protectedRoot, supabaseEnvPath, godelEnvPath, plan }); let fromStage = stageFor(plan, current.generationId); if (!fromStage) fail("PLAN_NOT_CURRENTLY_ACTIVE"); relation(operation, fromStage, toStage); let target = generationFor(plan, toStage); assertExactStageDifference(fromStage, toStage, current.generation, target); if (!apply) return { state: "DRY_RUN", fromStage, toStage, planId };
  const lock = await acquireGenerationMutationLock({ protectedRoot, operation: `ec-signing-key-${operation}`, generationId: target.generationId }); let mutated = false, committed = false, release = true;
  try {
    plan = await readEcSigningKeyRotationPlan({ protectedRoot, planId }); current = await currentGen4OrPlan({ protectedRoot, supabaseEnvPath, godelEnvPath, plan }); fromStage = stageFor(plan, current.generationId); if (!fromStage) fail("PLAN_NOT_CURRENTLY_ACTIVE"); relation(operation, fromStage, toStage); target = generationFor(plan, toStage); assertExactStageDifference(fromStage, toStage, current.generation, target);
    const targetValues = values(target.supabaseSnapshot); mutated = true; await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: Object.fromEntries(EC_ROTATION_VARIABLES.map((name) => [name, required(targetValues, name)])), allowedNames: EC_ROTATION_VARIABLES }); await hooks.afterEnvUpdate?.();
    if (!(await readFile(supabaseEnvPath)).equals(target.supabaseSnapshot) || !(await readFile(godelEnvPath)).equals(target.godelSnapshot)) fail("EC_SIGNING_ROTATION_ENV_WRITE_MISMATCH"); await hooks.beforePointerCommit?.(); await replaceCurrentGenerationPointer({ protectedRoot, generationId: target.generationId, expectedGenerationId: current.generationId }); committed = true; await hooks.afterPointerCommit?.();
    const verified = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true }); if (verified.generationId !== target.generationId || !verified.match) fail("EC_SIGNING_ROTATION_COMMITTED_UNVERIFIED"); return { state: operation === "activate" ? "ACTIVATED" : "ROLLED_BACK", fromStage, toStage, planId };
  } catch (error) {
    if (committed) { release = false; throw new Error("EC_SIGNING_ROTATION_COMMITTED_UNVERIFIED", { cause: error }); }
    try { if (mutated) { const sourceValues = values(current.generation.supabaseSnapshot); await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: Object.fromEntries(EC_ROTATION_VARIABLES.map((name) => [name, required(sourceValues, name)])), allowedNames: EC_ROTATION_VARIABLES }); } const safe = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true }); if (safe.generationId !== current.generationId || !safe.match) fail("EC_SIGNING_ROTATION_COMPENSATION_FAILED"); } catch { release = false; throw new Error("EC_SIGNING_ROTATION_COMPENSATION_FAILED"); }
    throw error;
  } finally { if (release) await releaseGenerationMutationLock(lock); }
}
async function currentGen4OrPlan({ protectedRoot, supabaseEnvPath, godelEnvPath }) { const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true }); if (current.state === "UNINITIALIZED") fail("SECRET_GENERATION_REGISTRY_UNINITIALIZED"); if (!current.match) fail("EXTERNAL_SECRET_GENERATION_MISMATCH"); return current; }
export async function activateEcSigningKeyRotation(value) { return switchStage({ ...value, operation: "activate" }); }
export async function rollbackEcSigningKeyRotation(value) { return switchStage({ ...value, operation: "rollback" }); }
export async function ecSigningKeyRotationStatus({ protectedRoot, supabaseEnvPath, godelEnvPath, planId }) { const plan = await readEcSigningKeyRotationPlan({ protectedRoot, planId }); const current = await currentGen4OrPlan({ protectedRoot, supabaseEnvPath, godelEnvPath }); const stage = stageFor(plan, current.generationId); if (!stage) fail("PLAN_NOT_CURRENTLY_ACTIVE"); return { state: "STATUS", planId, stage }; }
export function renderEcSigningKeyRotationResult(result) { if (result.state === "DRY_RUN") return `DRY_RUN PASS\nFROM ${result.fromStage ?? "GEN4"}\nTO ${result.toStage ?? "PREPARE"}\n`; if (result.state === "STATUS") return `STATUS ${result.planId}\nSTAGE ${result.stage}\n`; return `${result.state} ${result.planId ?? result.sourceGenerationId}\n`; }
export function renderEcSigningKeyRotationFailure(error) { return `FAIL ${error?.message ?? "UNKNOWN"}\n`; }
