import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { activateLegacyJwtKeys, prepareLegacyJwtKeys, renderLegacyJwtCliFailure, rollbackLegacyJwtKeys, signLegacyJwt, validateLegacyJwtSnapshot } from "./rotate-legacy-jwt-keys.mjs";
import { bootstrapSecretGeneration, generationMutationLockPath, getCurrentSecretGeneration } from "./secret-generation.mjs";

const SOURCE_SECRET = "synthetic-current-jwt-secret";
function environment(secret = SOURCE_SECRET) {
  const privateEc = { kty: "EC", kid: "synthetic-ec-kid", alg: "ES256", crv: "P-256", x: "synthetic-x", y: "synthetic-y", d: "synthetic-d" };
  const publicEc = { kty: "EC", kid: "synthetic-ec-kid", alg: "ES256", crv: "P-256", x: "synthetic-x", y: "synthetic-y" };
  const oct = { kty: "oct", k: Buffer.from(secret).toString("base64url"), alg: "HS256" };
  return `JWT_SECRET=${secret}\nANON_KEY=${signLegacyJwt({ jwtSecret: secret, role: "anon", now: 1000 })}\nSERVICE_ROLE_KEY=${signLegacyJwt({ jwtSecret: secret, role: "service_role", now: 1000 })}\nJWT_KEYS=${JSON.stringify([privateEc, oct])}\nJWT_JWKS=${JSON.stringify({ keys: [publicEc, oct] })}\nANON_KEY_ASYMMETRIC=synthetic-asymmetric-anon\nSERVICE_ROLE_KEY_ASYMMETRIC=synthetic-asymmetric-service\nOTHER=retained\n`;
}
async function fixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-legacy-jwt-")), root = join(tempRoot, "repo"); await mkdir(root);
  execFileSync("git", ["init"], { cwd: root }); execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root }); execFileSync("git", ["config", "user.name", "Test"], { cwd: root }); await writeFile(join(root, ".keep"), "x\n"); execFileSync("git", ["add", ".keep"], { cwd: root }); execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  const value = { root, tempRoot, protectedRoot: join(tempRoot, "protected"), supabaseEnvPath: join(tempRoot, "supabase.env"), godelEnvPath: join(tempRoot, "godel.env") }; await writeFile(value.supabaseEnvPath, environment()); await writeFile(value.godelEnvPath, "GODEL_OPAQUE_ONLY=retained\n"); await bootstrapSecretGeneration({ ...value, apply: true }); return value;
}
async function withFixture(run) { const value = await fixture(); try { await run(value); } finally { await rm(value.tempRoot, { recursive: true, force: true }); } }
async function candidate(value) { return prepareLegacyJwtKeys({ ...value, apply: true }); }

test("prepare changes exactly five names and dry-run is isolated", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value); assert.equal((await prepareLegacyJwtKeys(value)).state, "DRY_RUN"); const prepared = await candidate(value); const target = await readFile(join(value.protectedRoot, "external-secrets", "generations", prepared.generationId, "supabase.env"));
  const names = (snapshot) => new Map(snapshot.toString().split(/\r?\n/).filter(Boolean).map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])); const before = names(source.generation.supabaseSnapshot), after = names(target), sourceValidated = validateLegacyJwtSnapshot(source.generation.supabaseSnapshot), targetValidated = validateLegacyJwtSnapshot(target); assert.deepEqual([...new Set([...before.keys(), ...after.keys()])].filter(name => before.get(name) !== after.get(name)).sort(), ["ANON_KEY", "JWT_JWKS", "JWT_KEYS", "JWT_SECRET", "SERVICE_ROLE_KEY"]); assert.equal(after.get("ANON_KEY_ASYMMETRIC"), before.get("ANON_KEY_ASYMMETRIC")); assert.equal(after.get("SERVICE_ROLE_KEY_ASYMMETRIC"), before.get("SERVICE_ROLE_KEY_ASYMMETRIC")); assert.deepEqual(targetValidated.privateEc, sourceValidated.privateEc); assert.deepEqual(targetValidated.publicEc, sourceValidated.publicEc);
}));

test("activation dry-run does not mutate env, pointer, or lock", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value), prepared = await candidate(value), before = await readFile(value.supabaseEnvPath); const result = await activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: false }); assert.equal(result.state, "DRY_RUN"); assert.deepEqual(await readFile(value.supabaseEnvPath), before); assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId); await assert.rejects(() => readFile(generationMutationLockPath(value.protectedRoot)), /ENOENT/);
}));

test("activation, rollback, and reactivation coordinate env then pointer without a DB adapter", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value), prepared = await candidate(value); assert.equal((await activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true })).state, "ACTIVATED"); assert.equal((await getCurrentSecretGeneration(value)).generationId, prepared.generationId); assert.equal((await rollbackLegacyJwtKeys({ ...value, generationId: source.generationId, apply: true })).state, "ROLLED_BACK"); assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId); await activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true }); assert.equal((await getCurrentSecretGeneration(value)).generationId, prepared.generationId);
}));

test("pre-pointer failures restore source and release the lock", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value), prepared = await candidate(value); await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { afterEnvUpdate: () => { throw new Error("INJECTED"); } } }), /INJECTED/); assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot); await assert.rejects(() => readFile(generationMutationLockPath(value.protectedRoot)), /ENOENT/);
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { beforePointerCommit: () => { throw new Error("PRECOMMIT"); } } }), /PRECOMMIT/); assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot);
}));

test("post-pointer and compensation uncertainty preserve the lock", async () => withFixture(async (value) => {
  const prepared = await candidate(value); await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { afterPointerCommit: () => { throw new Error("POSTCOMMIT"); } } }), /LEGACY_JWT_ROTATION_COMMITTED_UNVERIFIED/); assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));

test("compensation failure preserves the lock", async () => withFixture(async (value) => {
  const prepared = await candidate(value); await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, hooks: { afterEnvUpdate: () => { throw new Error("FAIL"); }, beforeCompensation: () => { throw new Error("COMPENSATION"); } } }), /LEGACY_JWT_ROTATION_COMPENSATION_FAILED/); assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));

test("unrelated snapshots and CLI errors cannot disclose synthetic secrets", async () => withFixture(async (value) => {
  const prepared = await candidate(value), path = join(value.protectedRoot, "external-secrets", "generations", prepared.generationId, "supabase.env"), snapshot = await readFile(path, "utf8"); await writeFile(path, snapshot.replace("OTHER=retained", "OTHER=changed")); await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId }), /LEGACY_JWT_UNRELATED_DIFFERENCE/); assert.doesNotMatch(renderLegacyJwtCliFailure(new Error("INVALID_LEGACY_JWT_CONTRACT")), /synthetic-current-jwt-secret/);
}));

test("self-hosted compose and init SQL retire only the secret DB setting", async () => {
  const root = resolve(import.meta.dirname, "../.."), compose = await readFile(join(root, "infra/supabase/docker-compose.yml"), "utf8"), sql = await readFile(join(root, "infra/supabase/volumes/db/jwt.sql"), "utf8"), dbBlock = compose.match(/^  db:\n([\s\S]*?)^  supavisor:/m)?.[1] ?? ""; assert.doesNotMatch(compose, /PGRST_APP_SETTINGS_JWT_SECRET/); assert.match(compose, /PGRST_JWT_SECRET: \$\{JWT_JWKS:-\$\{JWT_SECRET\}\}/); assert.match(compose, /PGRST_APP_SETTINGS_JWT_EXP/); assert.doesNotMatch(dbBlock, /^\s+JWT_SECRET:/m); assert.match(dbBlock, /^\s+JWT_EXP:/m); assert.doesNotMatch(sql, /app\.settings\.jwt_secret/); assert.match(sql, /app\.settings\.jwt_exp/); assert.ok(validateLegacyJwtSnapshot(Buffer.from(environment())).jwtSecret);
});
