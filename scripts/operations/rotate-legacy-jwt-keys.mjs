#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
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
const REASON = "legacy-jwt-rotation";
const SUPABASE_NAMES = Object.freeze(["JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY", "JWT_KEYS", "JWT_JWKS"]);
const LIFETIME_SECONDS = 5 * 365 * 24 * 60 * 60;

function fail(code) { throw new Error(code); }

function parseEnvironment(buffer) {
  const result = new Map();
  for (const raw of buffer.toString("utf8").split(/\r?\n/)) {
    const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    if (result.has(match[1])) fail("DUPLICATE_ENVIRONMENT_VARIABLE");
    result.set(match[1], match[2]);
  }
  return result;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) fail("INVALID_LEGACY_JWT_CONTRACT");
  return value;
}

function base64Json(value) {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); } catch { fail("INVALID_LEGACY_JWT_CONTRACT"); }
}

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertLegacyToken(value, jwtSecret, expectedRole) {
  const parts = value.split(".");
  if (parts.length !== 3 || !parts.every(Boolean)) fail("INVALID_LEGACY_JWT_CONTRACT");
  const header = base64Json(parts[0]);
  const payload = base64Json(parts[1]);
  if (header.alg !== "HS256" || header.typ !== "JWT" || Object.hasOwn(header, "kid")) fail("INVALID_LEGACY_JWT_CONTRACT");
  if (payload.role !== expectedRole || payload.iss !== "supabase" || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= payload.iat) fail("INVALID_LEGACY_JWT_CONTRACT");
  const signature = createHmac("sha256", jwtSecret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (!safeEqual(signature, parts[2])) fail("INVALID_LEGACY_JWT_CONTRACT");
}

function parseJson(value) {
  try { return JSON.parse(value); } catch { fail("INVALID_LEGACY_JWT_KEYSET"); }
}

function assertEcPair(privateKey, publicKey) {
  if (!privateKey || !publicKey || privateKey.kty !== "EC" || publicKey.kty !== "EC" || privateKey.alg !== "ES256" || publicKey.alg !== "ES256" || typeof privateKey.d !== "string" || !privateKey.d || Object.hasOwn(publicKey, "d")) fail("INVALID_LEGACY_JWT_KEYSET");
  for (const name of ["kid", "crv", "x", "y", "alg"]) if (typeof privateKey[name] !== "string" || !privateKey[name] || privateKey[name] !== publicKey[name]) fail("INVALID_LEGACY_JWT_KEYSET");
}

function findExactKeys(keys, code) {
  if (!Array.isArray(keys) || keys.length !== 2) fail(code);
  const ec = keys.filter((key) => key?.kty === "EC" && key.alg === "ES256");
  const oct = keys.filter((key) => key?.kty === "oct" && key.alg === "HS256");
  if (ec.length !== 1 || oct.length !== 1) fail(code);
  return { ec: ec[0], oct: oct[0] };
}

function assertOctKey(key, jwtSecret) {
  if (!key || key.kty !== "oct" || key.alg !== "HS256" || Object.hasOwn(key, "kid") || typeof key.k !== "string" || !safeEqual(key.k, Buffer.from(jwtSecret).toString("base64url"))) fail("INVALID_LEGACY_JWT_KEYSET");
}

export function validateLegacyJwtSnapshot(snapshot) {
  const values = parseEnvironment(snapshot);
  const jwtSecret = required(values, "JWT_SECRET");
  assertLegacyToken(required(values, "ANON_KEY"), jwtSecret, "anon");
  assertLegacyToken(required(values, "SERVICE_ROLE_KEY"), jwtSecret, "service_role");
  const privateKeys = findExactKeys(parseJson(required(values, "JWT_KEYS")), "INVALID_LEGACY_JWT_KEYSET");
  const publicSet = parseJson(required(values, "JWT_JWKS"));
  if (!publicSet || typeof publicSet !== "object" || Array.isArray(publicSet)) fail("INVALID_LEGACY_JWT_KEYSET");
  const publicKeys = findExactKeys(publicSet.keys, "INVALID_LEGACY_JWT_KEYSET");
  assertEcPair(privateKeys.ec, publicKeys.ec);
  assertOctKey(privateKeys.oct, jwtSecret);
  assertOctKey(publicKeys.oct, jwtSecret);
  return { values, jwtSecret, privateEc: privateKeys.ec, publicEc: publicKeys.ec };
}

export function signLegacyJwt({ jwtSecret, role, now = Math.floor(Date.now() / 1000) }) {
  if (typeof jwtSecret !== "string" || !jwtSecret || !["anon", "service_role"].includes(role) || !Number.isInteger(now)) fail("INVALID_LEGACY_JWT_INPUT");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role, iss: "supabase", iat: now, exp: now + LIFETIME_SECONDS })).toString("base64url");
  return `${header}.${payload}.${createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url")}`;
}

function onlyAllowed(before, after) {
  const source = parseEnvironment(before);
  const target = parseEnvironment(after);
  const names = new Set([...source.keys(), ...target.keys()]);
  for (const name of names) if (source.get(name) !== target.get(name) && !SUPABASE_NAMES.includes(name)) return false;
  return SUPABASE_NAMES.every((name) => source.has(name) && target.has(name) && source.get(name) !== target.get(name));
}

function repositoryCommit(root) {
  const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (dirty) fail("REPOSITORY_MUST_BE_CLEAN");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", windowsHide: true }).trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("INVALID_REPOSITORY_COMMIT");
  return commit;
}

function candidateSnapshot(sourceSnapshot) {
  const source = validateLegacyJwtSnapshot(sourceSnapshot);
  const jwtSecret = randomBytes(32).toString("base64");
  const oct = { kty: "oct", k: Buffer.from(jwtSecret).toString("base64url"), alg: "HS256" };
  const jwks = parseJson(required(source.values, "JWT_JWKS"));
  const replacements = {
    JWT_SECRET: jwtSecret,
    ANON_KEY: signLegacyJwt({ jwtSecret, role: "anon" }),
    SERVICE_ROLE_KEY: signLegacyJwt({ jwtSecret, role: "service_role" }),
    JWT_KEYS: JSON.stringify([source.privateEc, oct]),
    JWT_JWKS: JSON.stringify({ ...jwks, keys: [source.publicEc, oct] }),
  };
  const snapshot = Buffer.from(applyAllowlistedEnvironmentChanges(sourceSnapshot.toString("utf8"), replacements, SUPABASE_NAMES));
  const candidate = validateLegacyJwtSnapshot(snapshot);
  if (!onlyAllowed(sourceSnapshot, snapshot) || JSON.stringify(candidate.privateEc) !== JSON.stringify(source.privateEc) || JSON.stringify(candidate.publicEc) !== JSON.stringify(source.publicEc)) fail("LEGACY_JWT_CANDIDATE_INVALID");
  return snapshot;
}

async function publish({ root, protectedRoot, source, supabaseSnapshot, godelSnapshot }) {
  const generationId = randomUUID();
  const generations = join(protectedRoot, "external-secrets", "generations");
  const target = join(generations, generationId);
  const staging = join(generations, `.staging-${randomUUID()}`);
  await mkdir(staging, { mode: 0o700, recursive: false });
  try {
    const metadata = { format: EXTERNAL_SECRET_GENERATION_FORMAT, schemaVersion: EXTERNAL_SECRET_GENERATION_SCHEMA_VERSION, generationId, createdAt: new Date().toISOString(), repositoryCommit: repositoryCommit(root), reason: REASON, sourceGenerationId: source.generationId, files: EXTERNAL_SECRET_SNAPSHOT_FILES };
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

async function readGeneration({ protectedRoot, generationId }) {
  await assertReferencedSecretGenerationExists({ protectedRoot, generationId });
  const base = join(protectedRoot, "external-secrets", "generations", generationId);
  const metadata = JSON.parse(await readFile(join(base, "metadata.json"), "utf8"));
  const supabaseSnapshot = await readFile(join(base, "supabase.env"));
  const godelSnapshot = await readFile(join(base, "godel.env"));
  validateLegacyJwtSnapshot(supabaseSnapshot);
  return { generationId, metadata, supabaseSnapshot, godelSnapshot };
}

function assertDirectRelation(current, target) {
  if (!current.generation.godelSnapshot.equals(target.godelSnapshot) || !onlyAllowed(current.generation.supabaseSnapshot, target.supabaseSnapshot)) fail("LEGACY_JWT_UNRELATED_DIFFERENCE");
  const forward = target.metadata.reason === REASON && target.metadata.sourceGenerationId === current.generationId;
  const rollback = current.generation.metadata.reason === REASON && current.generation.metadata.sourceGenerationId === target.generationId;
  if (!forward && !rollback) fail("LEGACY_JWT_GENERATION_NOT_DIRECTLY_RELATED");
}

function sqlQuote(value) { return `'${value.replaceAll("'", "''")}'`; }

export function composeDbPsqlArgs({ supabaseEnvPath = resolve(ROOT, "infra/supabase/.env") } = {}) {
  return ["compose", "--env-file", supabaseEnvPath, "-f", "docker-compose.yml", "-f", "../supabase-godel.override.yml", "exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-tAq", "-f", "-"];
}

export function runProcessWithStdin({ command, args, cwd, input, spawnImpl = spawn }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawnImpl(command, args, { cwd, shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", () => {});
    child.once("error", () => reject(new Error("LEGACY_JWT_DB_ADAPTER_FAILED")));
    child.once("close", (code) => code === 0 ? resolvePromise(stdout) : reject(new Error("LEGACY_JWT_DB_ADAPTER_FAILED")));
    child.stdin.end(input);
  });
}

export function createComposeLegacyJwtDbAdapter({ root = ROOT, supabaseEnvPath = resolve(ROOT, "infra/supabase/.env"), run = runProcessWithStdin } = {}) {
  const execute = async (sql) => run({ command: "docker", args: composeDbPsqlArgs({ supabaseEnvPath }), cwd: resolve(root, "infra/supabase"), input: sql });
  const matches = async (jwtSecret) => (await execute(`SELECT CASE WHEN current_setting('app.settings.jwt_secret', true) = ${sqlQuote(jwtSecret)} THEN 'MATCH' ELSE 'MISMATCH' END;\n`)).trim() === "MATCH";
  return {
    matches,
    async set(jwtSecret) { await execute(`ALTER DATABASE postgres SET "app.settings.jwt_secret" TO ${sqlQuote(jwtSecret)};\n`); },
    async verify(jwtSecret) { return matches(jwtSecret); },
  };
}

async function currentLegacy({ protectedRoot, supabaseEnvPath, godelEnvPath }) {
  const current = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: true });
  if (current.state === "UNINITIALIZED") fail("SECRET_GENERATION_REGISTRY_UNINITIALIZED");
  if (!current.match) fail("EXTERNAL_SECRET_GENERATION_MISMATCH");
  validateLegacyJwtSnapshot(current.generation.supabaseSnapshot);
  return current;
}

export async function prepareLegacyJwtKeys({ root = ROOT, protectedRoot, supabaseEnvPath, godelEnvPath, apply = false, hooks = {} }) {
  const current = await currentLegacy({ protectedRoot, supabaseEnvPath, godelEnvPath });
  repositoryCommit(root);
  if (!apply) return { state: "DRY_RUN", sourceGenerationId: current.generationId };
  const lock = await acquireGenerationMutationLock({ protectedRoot, operation: "legacy-jwt-prepare", generationId: current.generationId });
  let release = true;
  let candidate = null;
  try {
    const rechecked = await currentLegacy({ protectedRoot, supabaseEnvPath, godelEnvPath });
    if (rechecked.generationId !== current.generationId) fail("EXTERNAL_SECRET_GENERATION_NOT_ACTIVE");
    const supabaseSnapshot = candidateSnapshot(current.generation.supabaseSnapshot);
    candidate = await publish({ root, protectedRoot, source: current.generation, supabaseSnapshot, godelSnapshot: current.generation.godelSnapshot });
    await hooks.afterPublish?.();
    const validated = await readGeneration({ protectedRoot, generationId: candidate.generationId });
    if (!validated.godelSnapshot.equals(current.generation.godelSnapshot) || !onlyAllowed(current.generation.supabaseSnapshot, validated.supabaseSnapshot)) fail("LEGACY_JWT_CANDIDATE_INVALID");
    return { state: "PREPARED", generationId: candidate.generationId };
  } catch (error) {
    if (candidate) {
      const active = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false }).catch(() => null);
      if (active?.generationId === current.generationId) await rm(candidate.target, { recursive: true, force: true }).catch(() => {});
      else release = false;
    }
    throw error;
  } finally { if (release) await releaseGenerationMutationLock(lock); }
}

async function switchLegacy({ root = ROOT, protectedRoot, supabaseEnvPath, godelEnvPath, generationId, apply, operation, dbAdapter = createComposeLegacyJwtDbAdapter({ root, supabaseEnvPath }), hooks = {} }) {
  if (!isCanonicalGenerationId(generationId)) fail("INVALID_EXTERNAL_SECRET_GENERATION_ID");
  const current = await currentLegacy({ protectedRoot, supabaseEnvPath, godelEnvPath });
  const target = await readGeneration({ protectedRoot, generationId });
  assertDirectRelation(current, target);
  const sourceSecret = validateLegacyJwtSnapshot(current.generation.supabaseSnapshot).jwtSecret;
  if (!(await dbAdapter.matches(sourceSecret))) fail("LEGACY_JWT_SOURCE_DB_MISMATCH");
  if (!apply) return { state: "DRY_RUN", generationId };
  const lock = await acquireGenerationMutationLock({ protectedRoot, operation, generationId });
  const sourceGenerationId = current.generationId;
  const sourceSnapshot = current.generation.supabaseSnapshot;
  const sourceSecretForCompensation = sourceSecret;
  let envMutationAttempted = false;
  let dbMutationAttempted = false;
  let dbUpdated = false;
  let committed = false;
  let release = true;
  try {
    const underLock = await currentLegacy({ protectedRoot, supabaseEnvPath, godelEnvPath });
    const targetUnderLock = await readGeneration({ protectedRoot, generationId });
    assertDirectRelation(underLock, targetUnderLock);
    const currentSecret = validateLegacyJwtSnapshot(underLock.generation.supabaseSnapshot).jwtSecret;
    const targetSecret = validateLegacyJwtSnapshot(targetUnderLock.supabaseSnapshot).jwtSecret;
    if (!(await dbAdapter.matches(currentSecret))) fail("LEGACY_JWT_SOURCE_DB_RECHECK_MISMATCH");
    const targetValues = parseEnvironment(targetUnderLock.supabaseSnapshot);
    envMutationAttempted = true;
    await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: Object.fromEntries(SUPABASE_NAMES.map((name) => [name, required(targetValues, name)])), allowedNames: SUPABASE_NAMES });
    await hooks.afterEnvUpdate?.();
    if (!(await readFile(supabaseEnvPath)).equals(targetUnderLock.supabaseSnapshot) || !(await readFile(godelEnvPath)).equals(targetUnderLock.godelSnapshot)) fail("LEGACY_JWT_ROTATION_ENV_WRITE_MISMATCH");
    dbMutationAttempted = true;
    try { await dbAdapter.set(targetSecret); }
    catch (error) { throw new Error("LEGACY_JWT_TARGET_DB_SET_FAILED", { cause: error }); }
    dbUpdated = true;
    await hooks.afterDbUpdate?.();
    if (!dbUpdated || !(await dbAdapter.verify(targetSecret))) fail("LEGACY_JWT_TARGET_DB_VERIFY_MISMATCH");
    await hooks.beforePointerCommit?.();
    await replaceCurrentGenerationPointer({ protectedRoot, generationId, expectedGenerationId: underLock.generationId });
    committed = true;
    await hooks.afterPointerCommit?.();
    await assertActiveSecretGenerationMatches({ protectedRoot, generationId, supabaseEnvPath, godelEnvPath });
    if (!(await dbAdapter.verify(targetSecret))) fail("LEGACY_JWT_DB_SETTING_MISMATCH");
    return { state: operation === "legacy-jwt-activate" ? "ACTIVATED" : "ROLLED_BACK", generationId };
  } catch (error) {
    if (committed) { release = false; throw new Error("LEGACY_JWT_ROTATION_COMMITTED_UNVERIFIED", { cause: error }); }
    try {
      const active = await getCurrentSecretGeneration({ protectedRoot, supabaseEnvPath, godelEnvPath, compareLive: false });
      if (active.generationId !== sourceGenerationId) fail("EXTERNAL_SECRET_GENERATION_NOT_ACTIVE");
      const sourceValues = parseEnvironment(sourceSnapshot);
      if (dbMutationAttempted) {
        await dbAdapter.set(sourceSecretForCompensation);
        if (!(await dbAdapter.verify(sourceSecretForCompensation))) fail("LEGACY_JWT_DB_SETTING_MISMATCH");
      }
      if (envMutationAttempted) {
        const liveSupabaseSnapshot = await readFile(supabaseEnvPath);
        if (!liveSupabaseSnapshot.equals(sourceSnapshot)) {
          await writeAllowlistedEnvironmentFile({ path: supabaseEnvPath, replacements: Object.fromEntries(SUPABASE_NAMES.map((name) => [name, required(sourceValues, name)])), allowedNames: SUPABASE_NAMES });
        }
      }
      await hooks.beforeCompensation?.();
      await assertActiveSecretGenerationMatches({ protectedRoot, generationId: sourceGenerationId, supabaseEnvPath, godelEnvPath });
      if (!(await dbAdapter.verify(sourceSecretForCompensation))) fail("LEGACY_JWT_DB_SETTING_MISMATCH");
    } catch { release = false; throw new Error("LEGACY_JWT_ROTATION_COMPENSATION_FAILED"); }
    throw error;
  } finally { if (release) await releaseGenerationMutationLock(lock); }
}

export async function activateLegacyJwtKeys(value) { return switchLegacy({ ...value, operation: "legacy-jwt-activate" }); }
export async function rollbackLegacyJwtKeys(value) { return switchLegacy({ ...value, operation: "legacy-jwt-rollback" }); }

function parseCli(args) {
  const command = args.shift();
  const value = { protectedRoot: resolve(ROOT, "protected-recovery-material/selfhosted"), supabaseEnvPath: resolve(ROOT, "infra/supabase/.env"), godelEnvPath: resolve(ROOT, "compose.env.local"), apply: false, generationId: null };
  while (args.length) { const argument = args.shift(); if (argument === "--apply") value.apply = true; else if (argument === "--to") value.generationId = args.shift(); else fail("INVALID_ARGUMENT"); }
  if (!['prepare', 'activate', 'rollback'].includes(command)) fail("INVALID_COMMAND");
  if (command !== "prepare" && !value.generationId) fail("ROTATION_TARGET_REQUIRED");
  return { command, value };
}

export function renderLegacyJwtCliResult(result) { return `${result.state} ${result.generationId ?? result.sourceGenerationId}\n`; }
export function renderLegacyJwtCliFailure(error) { return `FAIL ${error?.message ?? "UNKNOWN"}\n`; }

if (import.meta.main) {
  try {
    const { command, value } = parseCli(process.argv.slice(2));
    const result = command === "prepare" ? await prepareLegacyJwtKeys({ root: ROOT, ...value }) : command === "activate" ? await activateLegacyJwtKeys({ root: ROOT, ...value }) : await rollbackLegacyJwtKeys({ root: ROOT, ...value });
    process.stdout.write(renderLegacyJwtCliResult(result));
  } catch (error) { process.stderr.write(renderLegacyJwtCliFailure(error)); process.exitCode = 1; }
}
