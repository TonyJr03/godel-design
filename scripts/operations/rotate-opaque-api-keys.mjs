#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  EXTERNAL_SECRET_GENERATION_FORMAT,
  EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION,
  EXTERNAL_SECRET_SNAPSHOT_FILES,
  acquireGenerationMutationLock,
  applyAllowlistedEnvironmentChanges,
  assertActiveSecretGenerationMatches,
  assertReferencedSecretGenerationExists,
  getCurrentSecretGeneration,
  isCanonicalGenerationId,
  releaseGenerationMutationLock,
  replaceCurrentGenerationPointer,
  writeAllowlistedEnvironmentFile,
} from "./secret-generation.mjs";

const ROOT = process.cwd();
const SUPABASE_NAMES = ["SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
const GODEL_NAMES = ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];
const REASON = "opaque-api-key-rotation";
const PROJECT_REF = "supabase-self-hosted";
const PUBLISHABLE_KEY_PATTERN = /^sb_publishable_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/;
const SECRET_KEY_PATTERN = /^sb_secret_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/;

function fail(code) { throw new Error(code); }
function repositoryCommit(root) {
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (dirty) fail("REPOSITORY_MUST_BE_CLEAN");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("INVALID_REPOSITORY_COMMIT");
  return commit;
}
function values(buffer) {
  const map = new Map();
  for (const raw of buffer.toString("utf8").split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (map.has(match[1])) fail("DUPLICATE_ENVIRONMENT_VARIABLE");
    map.set(match[1], match[2]);
  }
  return map;
}
function requireValue(map, name) { const value = map.get(name); if (!value) fail("MISSING_OPAQUE_API_KEY"); return value; }
function hasValidOpaqueChecksum(value) {
  if (typeof value !== "string") return false;
  const intermediate = value.slice(0, -9), checksum = value.slice(-8);
  const expected = createHash("sha256").update(`${PROJECT_REF}|${intermediate}`).digest("base64url").slice(0, 8);
  return checksum === expected;
}
function assertOpaqueKeyRole(value, pattern) {
  if (!pattern.test(value)) fail("INVALID_OPAQUE_API_KEY_ROLE");
  if (!hasValidOpaqueChecksum(value)) fail("INVALID_OPAQUE_API_KEY_CHECKSUM");
}
function assertCrossFilePair(supabase, godel) {
  const s = values(supabase), g = values(godel);
  const publishable = requireValue(s, SUPABASE_NAMES[0]), secret = requireValue(s, SUPABASE_NAMES[1]);
  const godelPublishable = requireValue(g, GODEL_NAMES[0]), godelSecret = requireValue(g, GODEL_NAMES[1]);
  if (publishable !== godelPublishable || secret !== godelSecret) fail("OPAQUE_API_KEY_CROSS_FILE_MISMATCH");
  assertOpaqueKeyRole(publishable, PUBLISHABLE_KEY_PATTERN); assertOpaqueKeyRole(godelPublishable, PUBLISHABLE_KEY_PATTERN);
  assertOpaqueKeyRole(secret, SECRET_KEY_PATTERN); assertOpaqueKeyRole(godelSecret, SECRET_KEY_PATTERN);
}
function onlyAllowed(before, after, allowed) {
  const a = values(before), b = values(after), changed = new Set([...a.keys(), ...b.keys()]);
  for (const name of changed) if (a.get(name) !== b.get(name) && !allowed.includes(name)) return false;
  return allowed.every((name) => a.has(name) && b.has(name) && a.get(name) !== b.get(name));
}
function generate(prefix, pattern) {
  const random = randomBytes(17).toString("base64url").slice(0, 22);
  const intermediate = prefix + random;
  const value = `${intermediate}_${createHash("sha256").update(`${PROJECT_REF}|${intermediate}`).digest("base64url").slice(0, 8)}`;
  assertOpaqueKeyRole(value, pattern); return value;
}
async function publish({ root, protectedRoot, source, supabaseSnapshot, godelSnapshot }) {
  const generationId = randomUUID(), generations = join(protectedRoot, "external-secrets", "generations");
  const target = join(generations, generationId), staging = join(generations, `.staging-${randomUUID()}`);
  await mkdir(staging, { mode: 0o700 });
  try {
    const metadata = { format: EXTERNAL_SECRET_GENERATION_FORMAT, schemaVersion: EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION, generationId, createdAt: new Date().toISOString(), repositoryCommit: repositoryCommit(root), reason: REASON, sourceGenerationId: source.generationId, files: EXTERNAL_SECRET_SNAPSHOT_FILES };
    await writeFile(join(staging, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(join(staging, "supabase.env"), supabaseSnapshot, { mode: 0o600, flag: "wx" });
    await writeFile(join(staging, "godel.env"), godelSnapshot, { mode: 0o600, flag: "wx" });
    await rename(staging, target); return { generationId, target, metadata };
  } catch (error) { await rm(staging, { recursive: true, force: true }).catch(() => {}); throw error; }
}
async function generation({ protectedRoot, generationId, requireOpaqueReason = false }) {
  await assertReferencedSecretGenerationExists({ protectedRoot, generationId });
  const base = join(protectedRoot, "external-secrets", "generations", generationId);
  const metadata = JSON.parse(await readFile(join(base, "metadata.json"), "utf8"));
  const supabaseSnapshot = await readFile(join(base, "supabase.env")), godelSnapshot = await readFile(join(base, "godel.env"));
  if (requireOpaqueReason && metadata.reason !== REASON) fail("INVALID_OPAQUE_API_KEY_GENERATION_REASON");
  assertCrossFilePair(supabaseSnapshot, godelSnapshot);
  return { generationId, metadata, supabaseSnapshot, godelSnapshot };
}
function assertDirectOpaqueRelation(current, target) {
  if (!onlyAllowed(current.generation.supabaseSnapshot, target.supabaseSnapshot, SUPABASE_NAMES) || !onlyAllowed(current.generation.godelSnapshot, target.godelSnapshot, GODEL_NAMES)) fail("OPAQUE_API_KEY_UNRELATED_DIFFERENCE");
  if (!(target.metadata.sourceGenerationId === current.generationId || current.generation.metadata.sourceGenerationId === target.generationId)) fail("OPAQUE_API_KEY_GENERATION_NOT_DIRECTLY_RELATED");
}
export function isOpaqueApiKey(value) { return typeof value === "string" && (PUBLISHABLE_KEY_PATTERN.test(value) || SECRET_KEY_PATTERN.test(value)) && hasValidOpaqueChecksum(value); }
export async function prepareOpaqueApiKeys({ root = ROOT, protectedRoot, supabaseEnvPath, godelEnvPath, apply = false, hooks = {} }) {
  const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true });
  if (current.state === "UNINITIALIZED") fail("SECRET_GENERATION_REGISTRY_UNINITIALIZED"); if (!current.match) fail("EXTERNAL_SECRET_GENERATION_MISMATCH");
  assertCrossFilePair(current.generation.supabaseSnapshot, current.generation.godelSnapshot); repositoryCommit(root);
  if (!apply) return { state: "DRY_RUN", sourceGenerationId: current.generationId };
  const lock = await acquireGenerationMutationLock({ protectedRoot, operation: "opaque-api-key-prepare", generationId: current.generationId });
  let release = true, candidate = null;
  try {
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId: current.generationId, supabaseEnvPath, godelEnvPath });
    const publishable = generate("sb_publishable_", PUBLISHABLE_KEY_PATTERN), secret = generate("sb_secret_", SECRET_KEY_PATTERN);
    const supabaseSnapshot = Buffer.from(applyAllowlistedEnvironmentChanges(current.generation.supabaseSnapshot.toString("utf8"), { SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret }, SUPABASE_NAMES));
    const godelSnapshot = Buffer.from(applyAllowlistedEnvironmentChanges(current.generation.godelSnapshot.toString("utf8"), { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable, SUPABASE_SECRET_KEY: secret }, GODEL_NAMES));
    assertCrossFilePair(supabaseSnapshot, godelSnapshot); if (!onlyAllowed(current.generation.supabaseSnapshot, supabaseSnapshot, SUPABASE_NAMES) || !onlyAllowed(current.generation.godelSnapshot, godelSnapshot, GODEL_NAMES)) fail("OPAQUE_API_KEY_UNRELATED_DIFFERENCE");
    candidate = await publish({ root, protectedRoot, source: current.generation, supabaseSnapshot, godelSnapshot });
    await hooks.afterPublish?.(); await generation({ protectedRoot, generationId: candidate.generationId, requireOpaqueReason: true }); return { state: "PREPARED", generationId: candidate.generationId };
  } catch (error) {
    if (candidate) {
      const active = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false }).catch(() => null);
      if (active?.generationId === current.generationId) await rm(candidate.target, { recursive: true, force: true }).catch(() => {});
      else release = false;
    }
    if (error?.message === "INVALID_GENERATION_METADATA") release = false; throw error;
  } finally { if (release) await releaseGenerationMutationLock(lock); }
}
async function switchGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, generationId, apply, operation, requireOpaqueTarget = false, requireOpaqueCurrent = false, hooks = {} }) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true });
  if (current.state === "UNINITIALIZED") fail("SECRET_GENERATION_REGISTRY_UNINITIALIZED"); if (!current.match) fail("EXTERNAL_SECRET_GENERATION_MISMATCH");
  if (requireOpaqueCurrent && current.generation.metadata.reason !== REASON) fail("INVALID_OPAQUE_API_KEY_GENERATION_REASON");
  const target = await generation({ protectedRoot, generationId, requireOpaqueReason: requireOpaqueTarget }); assertDirectOpaqueRelation(current, target);
  if (!apply) return { state: "DRY_RUN", generationId };
  const lock = await acquireGenerationMutationLock({ protectedRoot, operation, generationId }); let supabaseUpdated = false, godelUpdated = false, committed = false, release = true;
  try {
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId: current.generationId, supabaseEnvPath, godelEnvPath });
    await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: Object.fromEntries(SUPABASE_NAMES.map((n) => [n, requireValue(values(target.supabaseSnapshot), n)])), allowedNames: SUPABASE_NAMES }); supabaseUpdated = true;
    await hooks.afterSupabaseUpdate?.();
    await writeAllowlistedEnvironmentFile({ path: godelEnvPath, replacements: Object.fromEntries(GODEL_NAMES.map((n) => [n, requireValue(values(target.godelSnapshot), n)])), allowedNames: GODEL_NAMES }); godelUpdated = true;
    await hooks.afterGodelUpdate?.();
    if (!(await readFile(supabaseEnvPath)).equals(target.supabaseSnapshot) || !(await readFile(godelEnvPath)).equals(target.godelSnapshot)) fail("OPAQUE_API_ROTATION_ENV_WRITE_MISMATCH");
    await hooks.beforePointerCommit?.(); await replaceCurrentGenerationPointer({ protectedRoot, generationId, expectedGenerationId: current.generationId }); committed = true; await hooks.afterPointerCommit?.();
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId, supabaseEnvPath, godelEnvPath }); return { state: operation === "opaque-api-key-activate" ? "ACTIVATED" : "ROLLED_BACK", generationId };
  } catch (error) {
    if (committed) { release = false; throw new Error("OPAQUE_API_ROTATION_COMMITTED_UNVERIFIED", { cause: error }); }
    try { await hooks.beforeCompensation?.(); if (supabaseUpdated) await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: Object.fromEntries(SUPABASE_NAMES.map((n) => [n, requireValue(values(current.generation.supabaseSnapshot), n)])), allowedNames: SUPABASE_NAMES }); if (godelUpdated) await writeAllowlistedEnvironmentFile({ path: godelEnvPath, replacements: Object.fromEntries(GODEL_NAMES.map((n) => [n, requireValue(values(current.generation.godelSnapshot), n)])), allowedNames: GODEL_NAMES }); await assertActiveSecretGenerationMatches({ protectedRoot, generationId: current.generationId, supabaseEnvPath, godelEnvPath }); } catch { release = false; throw new Error("OPAQUE_API_ROTATION_COMPENSATION_FAILED"); }
    throw error;
  } finally { if (release) await releaseGenerationMutationLock(lock); }
}
export async function activateOpaqueApiKeys(value) { return switchGeneration({ ...value, operation: "opaque-api-key-activate", requireOpaqueTarget: true }); }
export async function rollbackOpaqueApiKeys(value) { return switchGeneration({ ...value, operation: "opaque-api-key-rollback", requireOpaqueCurrent: true }); }
function parse(args) { const command = args.shift(), value = { protectedRoot: resolve(ROOT, "protected-recovery-material/selfhosted"), supabaseEnvPath: resolve(ROOT, "infra/supabase/.env"), godelEnvPath: resolve(ROOT, "compose.env.local"), apply: false, generationId: null }; while (args.length) { const arg = args.shift(); if (arg === "--apply") value.apply = true; else if (arg === "--to") value.generationId = args.shift(); else fail("INVALID_ARGUMENT"); } if (!["prepare", "activate", "rollback"].includes(command)) fail("INVALID_COMMAND"); if (command !== "prepare" && !value.generationId) fail("ROLLBACK_TARGET_REQUIRED"); return { command, value }; }
export function renderOpaqueApiKeyCliResult(result) { return `${result.state} ${result.generationId ?? result.sourceGenerationId}\n`; }
export function renderOpaqueApiKeyCliFailure(error) { return `FAIL ${error?.message ?? "UNKNOWN"}\n`; }
if (import.meta.main) { try { const { command, value } = parse(process.argv.slice(2)); const result = command === "prepare" ? await prepareOpaqueApiKeys({ root: ROOT, ...value }) : command === "activate" ? await activateOpaqueApiKeys(value) : await rollbackOpaqueApiKeys(value); process.stdout.write(renderOpaqueApiKeyCliResult(result)); } catch (error) { process.stderr.write(renderOpaqueApiKeyCliFailure(error)); process.exitCode = 1; } }
