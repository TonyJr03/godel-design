#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
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
const DASHBOARD_PASSWORD = "DASHBOARD_PASSWORD";

function fail(code) { throw new Error(code); }

function environmentValue(source, name) {
  let value = null;
  for (const line of source.toString("utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || match[1] !== name) continue;
    if (value !== null) fail("DUPLICATE_ENVIRONMENT_VARIABLE");
    value = match[2];
  }
  if (value === null) fail("MISSING_ENVIRONMENT_VARIABLE");
  return value;
}

function dashboardOnlyDifference(current, target) {
  const strip = (buffer) => applyAllowlistedEnvironmentChanges(buffer.toString("utf8"), { [DASHBOARD_PASSWORD]: "__DASHBOARD_ONLY__" }, [DASHBOARD_PASSWORD]);
  return strip(current) === strip(target);
}

function repositoryCommit(root) {
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (dirty) fail("REPOSITORY_MUST_BE_CLEAN");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("INVALID_REPOSITORY_COMMIT");
  return commit;
}

async function publishDashboardGeneration({ root, protectedRoot, source, supabaseSnapshot, godelSnapshot }) {
  const generationId = randomUUID();
  const generations = join(protectedRoot, "external-secrets", "generations");
  const target = join(generations, generationId);
  const staging = join(generations, `.staging-${randomUUID()}`);
  await mkdir(staging, { mode: 0o700 });
  try {
    const metadata = {
      format: EXTERNAL_SECRET_GENERATION_FORMAT,
      schemaVersion: EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION,
      generationId,
      createdAt: new Date().toISOString(),
      repositoryCommit: repositoryCommit(root),
      reason: "dashboard-rotation",
      sourceGenerationId: source.generationId,
      files: EXTERNAL_SECRET_SNAPSHOT_FILES,
    };
    await writeFile(join(staging, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(join(staging, "supabase.env"), supabaseSnapshot, { mode: 0o600, flag: "wx" });
    await writeFile(join(staging, "godel.env"), godelSnapshot, { mode: 0o600, flag: "wx" });
    await rename(staging, target);
    return { generationId, target };
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function rotateDashboardPassword({ root = ROOT, protectedRoot, supabaseEnvPath, godelEnvPath, apply = false, hooks = {} }) {
  const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true });
  if (current.state === "UNINITIALIZED") {
    if (apply) fail("SECRET_GENERATION_REGISTRY_UNINITIALIZED");
    return { state: "DRY_RUN_BOOTSTRAP_REQUIRED" };
  }
  if (!current.match) fail("EXTERNAL_SECRET_GENERATION_MISMATCH");
  if (!apply) return { state: "DRY_RUN", sourceGenerationId: current.generationId };
  const lock = await acquireGenerationMutationLock({ protectedRoot, operation: "dashboard-rotation", generationId: current.generationId });
  let liveUpdated = false;
  let pointerCommitted = false;
  let releaseLock = true;
  try {
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId: current.generationId, supabaseEnvPath, godelEnvPath });
    const password = randomBytes(32).toString("base64url");
    const nextSupabase = Buffer.from(applyAllowlistedEnvironmentChanges(current.generation.supabaseSnapshot.toString("utf8"), { [DASHBOARD_PASSWORD]: password }, [DASHBOARD_PASSWORD]), "utf8");
    const target = await publishDashboardGeneration({ root, protectedRoot, source: current.generation, supabaseSnapshot: nextSupabase, godelSnapshot: current.generation.godelSnapshot });
    await hooks.afterTargetPublished?.(target);
    await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: { [DASHBOARD_PASSWORD]: password }, allowedNames: [DASHBOARD_PASSWORD] });
    liveUpdated = true;
    if (!(await readFile(supabaseEnvPath)).equals(nextSupabase)) fail("DASHBOARD_ENV_WRITE_MISMATCH");
    if (!(await readFile(godelEnvPath)).equals(current.generation.godelSnapshot)) fail("GODEL_ENV_WRITE_MISMATCH");
    await hooks.beforePointerCommit?.(target);
    await replaceCurrentGenerationPointer({ protectedRoot, generationId: target.generationId, expectedGenerationId: current.generationId });
    pointerCommitted = true;
    await hooks.afterPointerCommit?.(target);
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId: target.generationId, supabaseEnvPath, godelEnvPath });
    return { state: "ROTATED", generationId: target.generationId };
  } catch (error) {
    if (pointerCommitted) {
      releaseLock = false;
      throw new Error("DASHBOARD_ROTATION_COMMITTED_UNVERIFIED", { cause: error });
    }
    try {
      await hooks.beforeCompensation?.();
      if (liveUpdated) {
        const sourcePassword = environmentValue(current.generation.supabaseSnapshot, DASHBOARD_PASSWORD);
        await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: { [DASHBOARD_PASSWORD]: sourcePassword }, allowedNames: [DASHBOARD_PASSWORD] });
      }
      await assertActiveSecretGenerationMatches({ protectedRoot, generationId: current.generationId, supabaseEnvPath, godelEnvPath });
    } catch (compensationError) {
      releaseLock = false;
      throw new Error("DASHBOARD_ROTATION_COMPENSATION_FAILED", { cause: compensationError });
    }
    throw error;
  } finally {
    if (releaseLock) await releaseGenerationMutationLock(lock);
  }
}

export async function rollbackDashboardPassword({ protectedRoot, supabaseEnvPath, godelEnvPath, generationId, apply = false, hooks = {} }) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true });
  if (current.state === "UNINITIALIZED") fail("SECRET_GENERATION_REGISTRY_UNINITIALIZED");
  if (!current.match) fail("EXTERNAL_SECRET_GENERATION_MISMATCH");
  await assertReferencedSecretGenerationExists({ protectedRoot, generationId });
  const target = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false }).then(async () => {
    const root = join(protectedRoot, "external-secrets", "generations", generationId);
    return { supabaseSnapshot: await readFile(join(root, "supabase.env")), godelSnapshot: await readFile(join(root, "godel.env")) };
  });
  if (!target.godelSnapshot.equals(current.generation.godelSnapshot)) fail("DASHBOARD_ROLLBACK_GODEL_DIFFERENCE");
  if (!dashboardOnlyDifference(current.generation.supabaseSnapshot, target.supabaseSnapshot)) fail("DASHBOARD_ROLLBACK_UNRELATED_DIFFERENCE");
  if (!apply) return { state: "DRY_RUN", generationId };
  const lock = await acquireGenerationMutationLock({ protectedRoot, operation: "dashboard-rollback", generationId });
  let pointerCommitted = false;
  let releaseLock = true;
  try {
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId: current.generationId, supabaseEnvPath, godelEnvPath });
    const password = environmentValue(target.supabaseSnapshot, DASHBOARD_PASSWORD);
    await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: { [DASHBOARD_PASSWORD]: password }, allowedNames: [DASHBOARD_PASSWORD] });
    await hooks.beforePointerCommit?.();
    await replaceCurrentGenerationPointer({ protectedRoot, generationId, expectedGenerationId: current.generationId });
    pointerCommitted = true;
    await hooks.afterPointerCommit?.();
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId, supabaseEnvPath, godelEnvPath });
    return { state: "ROLLED_BACK", generationId };
  } catch (error) {
    if (pointerCommitted) { releaseLock = false; throw new Error("DASHBOARD_ROLLBACK_COMMITTED_UNVERIFIED", { cause: error }); }
    try {
      await hooks.beforeCompensation?.();
      const originalPassword = environmentValue(current.generation.supabaseSnapshot, DASHBOARD_PASSWORD);
      await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: { [DASHBOARD_PASSWORD]: originalPassword }, allowedNames: [DASHBOARD_PASSWORD] });
      await assertActiveSecretGenerationMatches({ protectedRoot, generationId: current.generationId, supabaseEnvPath, godelEnvPath });
    } catch (compensationError) { releaseLock = false; throw new Error("DASHBOARD_ROLLBACK_COMPENSATION_FAILED", { cause: compensationError }); }
    throw error;
  } finally { if (releaseLock) await releaseGenerationMutationLock(lock); }
}

function parse(args) {
  const command = args.shift(); const value = { protectedRoot: resolve(ROOT, "protected-recovery-material/selfhosted"), supabaseEnvPath: resolve(ROOT, "infra/supabase/.env"), godelEnvPath: resolve(ROOT, "compose.env.local"), apply: false, generationId: null };
  while (args.length) { const item = args.shift(); if (item === "--apply") value.apply = true; else if (item === "--to") value.generationId = args.shift(); else throw new Error("INVALID_ARGUMENT"); }
  if (command !== "rotate" && command !== "rollback") throw new Error("INVALID_COMMAND");
  if (command === "rollback" && !value.generationId) throw new Error("ROLLBACK_TARGET_REQUIRED");
  return { command, value };
}

if (import.meta.main) {
  try {
    const { command, value } = parse(process.argv.slice(2));
    const result = command === "rotate" ? await rotateDashboardPassword({ root: ROOT, ...value }) : await rollbackDashboardPassword(value);
    process.stdout.write(`${result.state}${result.generationId ? ` ${result.generationId}` : ""}\n`);
  } catch (error) { process.stderr.write(`FAIL ${error?.message ?? "UNKNOWN"}\n`); process.exitCode = 1; }
}
