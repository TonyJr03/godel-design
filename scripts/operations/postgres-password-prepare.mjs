#!/usr/bin/env node
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { resolve } from "node:path";

import {
  EXTERNAL_SECRET_GENERATION_FORMAT,
  EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION,
  EXTERNAL_SECRET_SNAPSHOT_FILES,
  acquireGenerationMutationLock,
  assertActiveSecretGenerationMatches,
  getCurrentSecretGeneration,
  publishSecretGeneration,
  readGenerationMutationLock,
  readSecretGeneration,
  releaseGenerationMutationLock,
} from "./secret-generation.mjs";
import {
  buildPostgresPasswordRotationCandidate,
  generatePostgresPassword,
  validatePostgresPasswordRotationCandidate,
  validateRestorablePostgresPassword,
} from "./postgres-password-rotation.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const PREPARE_OPERATION = "postgres-password-prepare";
const PREPARE_REASON = "postgres-password-rotation";
const TARGET_POLICY = "D5_64_ONLY";
const COMMIT = /^[a-f0-9]{40}$/;

function fail(code) {
  throw new Error(code);
}

function safeCode(error, fallback = "POSTGRES_PASSWORD_PREPARE_FAILED") {
  return typeof error?.message === "string" && /^[A-Z0-9_]+$/.test(error.message) ? error.message : fallback;
}

function environmentPassword(snapshot) {
  let password = null;
  for (const line of Buffer.from(snapshot).toString("utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || match[1] !== "POSTGRES_PASSWORD") continue;
    if (password !== null) fail("POSTGRES_PASSWORD_PREPARE_SOURCE_INVALID");
    const raw = match[2].trim();
    password = raw.length >= 2 && ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'"))) ? raw.slice(1, -1) : raw;
  }
  if (password === null) fail("POSTGRES_PASSWORD_PREPARE_SOURCE_INVALID");
  try { return validateRestorablePostgresPassword(password); } catch { fail("POSTGRES_PASSWORD_PREPARE_SOURCE_INVALID"); }
}

async function repositoryCommit(root) {
  try {
    const status = await execFileAsync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true, shell: false });
    if (status.stdout.trim()) fail("POSTGRES_PASSWORD_PREPARE_REPOSITORY_DIRTY");
    const revision = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true, shell: false });
    const commit = revision.stdout.trim();
    if (!COMMIT.test(commit)) fail("POSTGRES_PASSWORD_PREPARE_REPOSITORY_COMMIT_INVALID");
    return commit;
  } catch (error) {
    if (error?.message === "POSTGRES_PASSWORD_PREPARE_REPOSITORY_DIRTY" || error?.message === "POSTGRES_PASSWORD_PREPARE_REPOSITORY_COMMIT_INVALID") throw error;
    fail("POSTGRES_PASSWORD_PREPARE_REPOSITORY_UNREADABLE");
  }
}

async function currentSource({ protectedRoot, supabaseEnvPath, godelEnvPath, getCurrent = getCurrentSecretGeneration }) {
  let current;
  try {
    current = await getCurrent({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true });
  } catch {
    fail("POSTGRES_PASSWORD_PREPARE_SOURCE_UNVERIFIED");
  }
  if (current?.state !== "INITIALIZED" || current.match !== true || typeof current.generationId !== "string" || !current.generation) {
    fail("POSTGRES_PASSWORD_PREPARE_SOURCE_UNVERIFIED");
  }
  environmentPassword(current.generation.supabaseSnapshot);
  return current;
}

function exactMetadata(metadata, expected) {
  const keys = ["format", "schemaVersion", "generationId", "createdAt", "repositoryCommit", "reason", "sourceGenerationId", "files"];
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || Object.keys(metadata).length !== keys.length || keys.some((key) => !Object.hasOwn(metadata, key))) {
    fail("POSTGRES_PASSWORD_PREPARE_READBACK_INVALID");
  }
  if (metadata.format !== expected.format || metadata.schemaVersion !== expected.schemaVersion || metadata.generationId !== expected.generationId || metadata.createdAt !== expected.createdAt || metadata.repositoryCommit !== expected.repositoryCommit || metadata.reason !== expected.reason || metadata.sourceGenerationId !== expected.sourceGenerationId || !Number.isFinite(Date.parse(metadata.createdAt)) || JSON.stringify(metadata.files) !== JSON.stringify(expected.files)) {
    fail("POSTGRES_PASSWORD_PREPARE_READBACK_INVALID");
  }
}

async function assertDormantSource({ protectedRoot, supabaseEnvPath, godelEnvPath, sourceGenerationId, getCurrent = getCurrentSecretGeneration, assertActive = assertActiveSecretGenerationMatches }) {
  try {
    const pointer = await getCurrent({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false });
    if (pointer?.state !== "INITIALIZED" || pointer.generationId !== sourceGenerationId) fail("POSTGRES_PASSWORD_PREPARE_DORMANCY_INVALID");
    await assertActive({ protectedRoot, generationId: sourceGenerationId, supabaseEnvPath, godelEnvPath });
  } catch (error) {
    if (error?.message === "POSTGRES_PASSWORD_PREPARE_DORMANCY_INVALID") throw error;
    fail("POSTGRES_PASSWORD_PREPARE_DORMANCY_INVALID");
  }
}

function isOwnedPrepareLock(lock, targetGenerationId) {
  return lock?.state === "PRESENT" && lock.operation === PREPARE_OPERATION && lock.generationId === targetGenerationId;
}

async function finalizeTargetPreparedLock({ protectedRoot, lock, targetGenerationId, hooks }) {
  const readLock = hooks.readGenerationMutationLock ?? readGenerationMutationLock;
  const releaseLock = hooks.releaseGenerationMutationLock ?? releaseGenerationMutationLock;
  let beforeRelease;
  try { beforeRelease = await readLock({ protectedRoot }); } catch { fail("POSTGRES_PASSWORD_PREPARE_LOCK_STATE_UNVERIFIED"); }
  if (!isOwnedPrepareLock(beforeRelease, targetGenerationId)) fail("POSTGRES_PASSWORD_PREPARE_LOCK_STATE_UNVERIFIED");

  let releaseAttempted = false;
  try {
    releaseAttempted = true;
    await releaseLock(lock);
  } catch {}

  let afterRelease;
  try { afterRelease = await readLock({ protectedRoot }); } catch { fail("POSTGRES_PASSWORD_PREPARE_LOCK_STATE_UNVERIFIED"); }
  if (afterRelease?.state === "ABSENT") return true;
  if (releaseAttempted && isOwnedPrepareLock(afterRelease, targetGenerationId)) fail("POSTGRES_PASSWORD_PREPARE_LOCK_RETAINED");
  fail("POSTGRES_PASSWORD_PREPARE_LOCK_STATE_UNVERIFIED");
}

export async function preparePostgresPasswordRotation({
  root = ROOT,
  protectedRoot,
  supabaseEnvPath,
  godelEnvPath,
  apply = false,
  hooks = {},
} = {}) {
  const commit = await repositoryCommit(root);
  const source = await currentSource({ protectedRoot, supabaseEnvPath, godelEnvPath });
  if (!apply) return Object.freeze({ state: "DRY_RUN", sourceGenerationId: source.generationId, targetPolicy: TARGET_POLICY });

  const targetGenerationId = randomUUID();
  if (targetGenerationId === source.generationId) fail("POSTGRES_PASSWORD_PREPARE_TARGET_ID_INVALID");
  let lock = null;
  let publicationAttempted = false;
  let published = false;
  try {
    lock = await acquireGenerationMutationLock({ protectedRoot, operation: PREPARE_OPERATION, generationId: targetGenerationId });
    await hooks.afterLockAcquired?.({ sourceGenerationId: source.generationId, targetGenerationId });
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId: source.generationId, supabaseEnvPath, godelEnvPath });
    const rechecked = await currentSource({ protectedRoot, supabaseEnvPath, godelEnvPath });
    if (rechecked.generationId !== source.generationId) fail("POSTGRES_PASSWORD_PREPARE_SOURCE_CHANGED");

    const targetPassword = hooks.generatePostgresPassword ? hooks.generatePostgresPassword() : generatePostgresPassword();
    const candidate = buildPostgresPasswordRotationCandidate({
      sourceSupabaseSnapshot: source.generation.supabaseSnapshot,
      sourceGodelSnapshot: source.generation.godelSnapshot,
      targetPassword,
    });
    const metadata = {
      format: EXTERNAL_SECRET_GENERATION_FORMAT,
      schemaVersion: EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION,
      generationId: targetGenerationId,
      createdAt: new Date().toISOString(),
      repositoryCommit: commit,
      reason: PREPARE_REASON,
      sourceGenerationId: source.generationId,
      files: EXTERNAL_SECRET_SNAPSHOT_FILES,
    };
    publicationAttempted = true;
    await hooks.beforePublicationAttempt?.({ sourceGenerationId: source.generationId, targetGenerationId });
    await publishSecretGeneration({
      protectedRoot,
      generationId: targetGenerationId,
      metadata,
      supabaseSnapshot: candidate.supabaseSnapshot,
      godelSnapshot: candidate.godelSnapshot,
    });
    published = true;
    await hooks.afterTargetPublished?.({ sourceGenerationId: source.generationId, targetGenerationId });
    const target = await readSecretGeneration({ protectedRoot, generationId: targetGenerationId });
    exactMetadata(target.metadata, metadata);
    validatePostgresPasswordRotationCandidate({
      sourceSupabaseSnapshot: source.generation.supabaseSnapshot,
      candidateSupabaseSnapshot: target.supabaseSnapshot,
      sourceGodelSnapshot: source.generation.godelSnapshot,
      candidateGodelSnapshot: target.godelSnapshot,
    });
    await assertDormantSource({ protectedRoot, supabaseEnvPath, godelEnvPath, sourceGenerationId: source.generationId });
  } catch (error) {
    if (publicationAttempted) {
      if (published) fail("POSTGRES_PASSWORD_PREPARE_PUBLISHED_UNVERIFIED");
      fail("POSTGRES_PASSWORD_PREPARE_STATE_UNVERIFIED");
    }
    try {
      await assertDormantSource({ protectedRoot, supabaseEnvPath, godelEnvPath, sourceGenerationId: source.generationId });
    } catch {
      fail("POSTGRES_PASSWORD_PREPARE_SOURCE_UNVERIFIED");
    }
    if (lock) {
      try { await releaseGenerationMutationLock(lock); } catch { fail("POSTGRES_PASSWORD_PREPARE_LOCK_RELEASE_FAILED"); }
    }
    fail(safeCode(error));
  }

  const targetPrepared = Object.freeze({ sourceGenerationId: source.generationId, targetGenerationId, lock });
  await finalizeTargetPreparedLock({ protectedRoot, lock: targetPrepared.lock, targetGenerationId: targetPrepared.targetGenerationId, hooks });
  return Object.freeze({ state: "PREPARED", sourceGenerationId: targetPrepared.sourceGenerationId, targetGenerationId: targetPrepared.targetGenerationId });
}

export function parsePostgresPasswordPrepareCli(args) {
  const command = args.shift();
  const value = {
    protectedRoot: resolve(ROOT, "protected-recovery-material/selfhosted"),
    supabaseEnvPath: resolve(ROOT, "infra/supabase/.env"),
    godelEnvPath: resolve(ROOT, "compose.env.local"),
    apply: false,
  };
  while (args.length) {
    const argument = args.shift();
    if (argument === "--apply") value.apply = true;
    else fail("POSTGRES_PASSWORD_PREPARE_ARGUMENT_INVALID");
  }
  if (command !== "prepare") fail("POSTGRES_PASSWORD_PREPARE_COMMAND_INVALID");
  return { command, value };
}

export function renderPostgresPasswordPrepareResult(result) {
  if (result.state === "DRY_RUN") return `DRY_RUN\nSOURCE ${result.sourceGenerationId}\n`;
  return `PREPARED\nSOURCE ${result.sourceGenerationId}\nTARGET ${result.targetGenerationId}\n`;
}

export function renderPostgresPasswordPrepareFailure(error) {
  return `FAIL ${safeCode(error)}\n`;
}

if (import.meta.main) {
  try {
    const { value } = parsePostgresPasswordPrepareCli(process.argv.slice(2));
    process.stdout.write(renderPostgresPasswordPrepareResult(await preparePostgresPasswordRotation({ root: ROOT, ...value })));
  } catch (error) {
    process.stderr.write(renderPostgresPasswordPrepareFailure(error));
    process.exitCode = 1;
  }
}
