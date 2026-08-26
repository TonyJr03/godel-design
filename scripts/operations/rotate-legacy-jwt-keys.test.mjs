import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  activateLegacyJwtKeys,
  composeDbPsqlArgs,
  createComposeLegacyJwtDbAdapter,
  prepareLegacyJwtKeys,
  renderLegacyJwtCliFailure,
  renderLegacyJwtCliResult,
  rollbackLegacyJwtKeys,
  runProcessWithStdin,
  signLegacyJwt,
  validateLegacyJwtSnapshot,
} from "./rotate-legacy-jwt-keys.mjs";
import { bootstrapSecretGeneration, generationMutationLockPath, getCurrentSecretGeneration } from "./secret-generation.mjs";

const SOURCE_SECRET = "synthetic-current-jwt-secret";

function environment(secret = SOURCE_SECRET) {
  const privateEc = { kty: "EC", kid: "synthetic-ec-kid", use: "sig", key_ops: ["sign", "verify"], alg: "ES256", crv: "P-256", x: "synthetic-x", y: "synthetic-y", d: "synthetic-d" };
  const publicEc = { kty: "EC", kid: "synthetic-ec-kid", use: "sig", key_ops: ["verify"], alg: "ES256", crv: "P-256", x: "synthetic-x", y: "synthetic-y" };
  const oct = { kty: "oct", k: Buffer.from(secret).toString("base64url"), alg: "HS256" };
  return `JWT_SECRET=${secret}\nANON_KEY=${signLegacyJwt({ jwtSecret: secret, role: "anon", now: 1000 })}\nSERVICE_ROLE_KEY=${signLegacyJwt({ jwtSecret: secret, role: "service_role", now: 1000 })}\nJWT_KEYS=${JSON.stringify([privateEc, oct])}\nJWT_JWKS=${JSON.stringify({ keys: [publicEc, oct] })}\nANON_KEY_ASYMMETRIC=asymmetric-anon\nSERVICE_ROLE_KEY_ASYMMETRIC=asymmetric-service\nOTHER=retained\n`;
}

function mapOf(snapshot) {
  return new Map(snapshot.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
}

function fakeDb(initial, behavior = {}) {
  let setting = initial;
  let targetVerificationFailures = behavior.targetVerificationFailures ?? 0;
  let matchCalls = 0;
  const calls = [];
  return {
    calls,
    get setting() { return setting; },
    async matches(value) { calls.push(["matches", value]); matchCalls += 1; return behavior.mismatch || behavior.mismatchOnMatchCall === matchCalls ? false : setting === value; },
    async set(value) {
      calls.push(["set", value]);
      if ((behavior.preMutationTargetSetFails && value !== initial) || (behavior.failRollbackSet && value === initial && setting !== initial)) throw new Error("DB_SET_FAILED");
      setting = value;
      if (behavior.targetCommitThenThrow && value !== initial) throw new Error("DB_TARGET_SET_AMBIGUOUS");
    },
    async verify(value) {
      calls.push(["verify", value]);
      if (behavior.verifyFails) return false;
      if (value !== initial && targetVerificationFailures > 0) { targetVerificationFailures -= 1; return false; }
      return setting === value;
    },
  };
}

async function fixture() {
  const tempRoot = await mkdtemp(join(tmpdir(), "godel-legacy-jwt-"));
  const root = join(tempRoot, "repo");
  await mkdir(root);
  execFileSync("git", ["init"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
  await writeFile(join(root, ".keep"), "x\n");
  execFileSync("git", ["add", ".keep"], { cwd: root });
  execFileSync("git", ["commit", "-m", "fixture"], { cwd: root });
  const value = { root, tempRoot, protectedRoot: join(tempRoot, "protected"), supabaseEnvPath: join(tempRoot, "supabase.env"), godelEnvPath: join(tempRoot, "godel.env") };
  await writeFile(value.supabaseEnvPath, environment());
  await writeFile(value.godelEnvPath, "GODEL_OPAQUE_ONLY=retained\n");
  await bootstrapSecretGeneration({ ...value, apply: true });
  return value;
}

async function withFixture(run) {
  const value = await fixture();
  try { await run(value); } finally { await rm(value.tempRoot, { recursive: true, force: true }); }
}

test("source legacy JWT contract validates raw-string HS256", () => {
  const descriptor = validateLegacyJwtSnapshot(Buffer.from(environment()));
  assert.equal(descriptor.jwtSecret, SOURCE_SECRET);
  const token = signLegacyJwt({ jwtSecret: SOURCE_SECRET, role: "anon", now: 50 });
  const [header, payload, signature] = token.split(".");
  assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "HS256");
  assert.equal(JSON.parse(Buffer.from(payload, "base64url")).role, "anon");
  assert.equal(signature, createHmac("sha256", SOURCE_SECRET).update(`${header}.${payload}`).digest("base64url"));
});

test("prepare is isolated and changes exactly five Supabase names", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value);
  assert.equal((await prepareLegacyJwtKeys(value)).state, "DRY_RUN");
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  const base = join(value.protectedRoot, "external-secrets", "generations", prepared.generationId);
  const candidate = await readFile(join(base, "supabase.env"));
  const godel = await readFile(join(base, "godel.env"));
  assert.deepEqual(godel, source.generation.godelSnapshot);
  const before = mapOf(source.generation.supabaseSnapshot);
  const after = mapOf(candidate);
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((name) => before.get(name) !== after.get(name)).sort();
  assert.deepEqual(changed, ["ANON_KEY", "JWT_JWKS", "JWT_KEYS", "JWT_SECRET", "SERVICE_ROLE_KEY"]);
  const validated = validateLegacyJwtSnapshot(candidate);
  const sourceValidated = validateLegacyJwtSnapshot(source.generation.supabaseSnapshot);
  assert.notEqual(validated.jwtSecret, SOURCE_SECRET);
  assert.equal(JSON.stringify(validated.privateEc), JSON.stringify(sourceValidated.privateEc));
  assert.equal(JSON.stringify(validated.publicEc), JSON.stringify(sourceValidated.publicEc));
  assert.equal(mapOf(candidate).get("ANON_KEY_ASYMMETRIC"), mapOf(source.generation.supabaseSnapshot).get("ANON_KEY_ASYMMETRIC"));
  assert.equal(mapOf(candidate).get("SERVICE_ROLE_KEY_ASYMMETRIC"), mapOf(source.generation.supabaseSnapshot).get("SERVICE_ROLE_KEY_ASYMMETRIC"));
  for (const name of ["ANON_KEY", "SERVICE_ROLE_KEY"]) {
    const [header, payload, signature] = mapOf(candidate).get(name).split(".");
    assert.notEqual(signature, createHmac("sha256", SOURCE_SECRET).update(`${header}.${payload}`).digest("base64url"));
  }
}));

test("activation, rollback, and same-candidate reactivation use env then DB then pointer", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value);
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const candidate = await readFile(join(value.protectedRoot, "external-secrets", "generations", prepared.generationId, "supabase.env"));
  const candidateSecret = validateLegacyJwtSnapshot(candidate).jwtSecret;
  const db = fakeDb(SOURCE_SECRET);
  assert.equal((await activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db })).state, "ACTIVATED");
  assert.equal((await getCurrentSecretGeneration(value)).generationId, prepared.generationId);
  assert.equal(db.setting, candidateSecret);
  assert.equal((await rollbackLegacyJwtKeys({ ...value, generationId: source.generationId, apply: true, dbAdapter: db })).state, "ROLLED_BACK");
  assert.equal(db.setting, SOURCE_SECRET);
  await activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db });
  assert.equal((await getCurrentSecretGeneration(value)).generationId, prepared.generationId);
}));

test("initial source DB mismatch blocks before mutation", async () => withFixture(async (value) => {
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const db = fakeDb(SOURCE_SECRET, { mismatch: true });
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db }), /LEGACY_JWT_SOURCE_DB_MISMATCH/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, (await getCurrentSecretGeneration({ ...value, godelEnvPath: value.godelEnvPath })).generationId);
  assert.deepEqual(await readFile(value.supabaseEnvPath), (await getCurrentSecretGeneration(value)).generation.supabaseSnapshot);
}));

test("under-lock source DB mismatch blocks before mutation", async () => withFixture(async (value) => {
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const db = fakeDb(SOURCE_SECRET, { mismatchOnMatchCall: 2 });
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db }), /LEGACY_JWT_SOURCE_DB_RECHECK_MISMATCH/);
  assert.deepEqual(await readFile(value.supabaseEnvPath), (await getCurrentSecretGeneration(value)).generation.supabaseSnapshot);
  await assert.rejects(() => readFile(generationMutationLockPath(value.protectedRoot)), /ENOENT/);
}));

test("pre-pointer DB failures compensate env and DB", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value);
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const db = fakeDb(SOURCE_SECRET);
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db, hooks: { afterDbUpdate: () => { throw new Error("INJECTED_AFTER_DB"); } } }), /INJECTED_AFTER_DB/);
  assert.equal(db.setting, SOURCE_SECRET);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot);
}));

test("ambiguous target DB commit is restored before the pointer commit", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value);
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const db = fakeDb(SOURCE_SECRET, { targetCommitThenThrow: true });
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db }), /LEGACY_JWT_TARGET_DB_SET_FAILED/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  assert.equal(db.setting, SOURCE_SECRET);
  assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot);
  await assert.rejects(() => readFile(generationMutationLockPath(value.protectedRoot)), /ENOENT/);
  assert.deepEqual(db.calls.filter(([operation, secret]) => operation === "set" && secret === SOURCE_SECRET), [["set", SOURCE_SECRET]]);
  assert.ok(db.calls.some(([operation, secret]) => operation === "verify" && secret === SOURCE_SECRET));
}));

test("pre-mutation target DB failure still restores and verifies source", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value);
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const db = fakeDb(SOURCE_SECRET, { preMutationTargetSetFails: true });
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db }), /LEGACY_JWT_TARGET_DB_SET_FAILED/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  assert.equal(db.setting, SOURCE_SECRET);
  assert.deepEqual(await readFile(value.supabaseEnvPath), source.generation.supabaseSnapshot);
  await assert.rejects(() => readFile(generationMutationLockPath(value.protectedRoot)), /ENOENT/);
  assert.deepEqual(db.calls.filter(([operation, secret]) => operation === "set" && secret === SOURCE_SECRET), [["set", SOURCE_SECRET]]);
  assert.ok(db.calls.some(([operation, secret]) => operation === "verify" && secret === SOURCE_SECRET));
}));

test("DB verification failure and pointer precommit failure compensate", async () => withFixture(async (value) => {
  const source = await getCurrentSecretGeneration(value);
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: fakeDb(SOURCE_SECRET, { targetVerificationFailures: 1 }) }), /LEGACY_JWT_TARGET_DB_VERIFY_MISMATCH/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
  const db = fakeDb(SOURCE_SECRET);
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db, hooks: { beforePointerCommit: () => { throw new Error("PRECOMMIT"); } } }), /PRECOMMIT/);
  assert.equal((await getCurrentSecretGeneration(value)).generationId, source.generationId);
}));

test("post-pointer uncertainty and failed compensation preserve the lock", async () => withFixture(async (value) => {
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const db = fakeDb(SOURCE_SECRET);
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db, hooks: { afterPointerCommit: () => { throw new Error("POSTCOMMIT"); } } }), /LEGACY_JWT_ROTATION_COMMITTED_UNVERIFIED/);
  assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));

test("compensation failure preserves the lock before pointer commit", async () => withFixture(async (value) => {
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const db = fakeDb(SOURCE_SECRET, { targetCommitThenThrow: true, failRollbackSet: true });
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, apply: true, dbAdapter: db }), /LEGACY_JWT_ROTATION_COMPENSATION_FAILED/);
  assert.ok(await readFile(generationMutationLockPath(value.protectedRoot)));
}));

test("unrelated changes and CLI renderers cannot disclose synthetic material", async () => withFixture(async (value) => {
  const prepared = await prepareLegacyJwtKeys({ ...value, apply: true });
  const base = join(value.protectedRoot, "external-secrets", "generations", prepared.generationId);
  const snapshot = await readFile(join(base, "supabase.env"), "utf8");
  await writeFile(join(base, "supabase.env"), snapshot.replace("OTHER=retained", "OTHER=changed"));
  await assert.rejects(() => activateLegacyJwtKeys({ ...value, generationId: prepared.generationId, dbAdapter: fakeDb(SOURCE_SECRET) }), /LEGACY_JWT_UNRELATED_DIFFERENCE/);
  const output = `${renderLegacyJwtCliResult({ state: "PREPARED", generationId: prepared.generationId })}${renderLegacyJwtCliFailure(new Error("INVALID_LEGACY_JWT_CONTRACT"))}`;
  assert.doesNotMatch(output, new RegExp(SOURCE_SECRET));
  assert.doesNotMatch(output, /eyJ/);
}));

test("Compose DB adapter arguments contain no secret and require stdin SQL", () => {
  const args = composeDbPsqlArgs({ supabaseEnvPath: "/safe/.env" });
  assert.deepEqual(args.slice(-11), ["exec", "-T", "db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-tAq", "-f", "-"].slice(-11));
  assert.ok(args.includes("db"));
  assert.ok(args.includes("ON_ERROR_STOP=1"));
  assert.ok(!args.some((value) => value.includes(SOURCE_SECRET)));
});

test("SQL transport uses stdin, disables shell, and safely escapes synthetic quotes", async () => {
  let invocation = null;
  const output = await runProcessWithStdin({
    command: "docker",
    args: ["compose", "exec", "db"],
    cwd: ".",
    input: "SELECT synthetic;\n",
    spawnImpl(command, args, options) {
      invocation = { command, args, options, input: null };
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end(input) { invocation.input = input; queueMicrotask(() => { child.stdout.emit("data", "MATCH\n"); child.emit("close", 0); }); } };
      return child;
    },
  });
  assert.equal(output, "MATCH\n");
  assert.equal(invocation.options.shell, false);
  assert.deepEqual(invocation.options.stdio, ["pipe", "pipe", "pipe"]);
  assert.equal(invocation.input, "SELECT synthetic;\n");

  const secret = "synthetic'\\quoted";
  const calls = [];
  const adapter = createComposeLegacyJwtDbAdapter({
    root: ".",
    supabaseEnvPath: "/safe/.env",
    run: async (call) => { calls.push(call); return call.input.startsWith("SELECT") ? "MATCH\n" : ""; },
  });
  assert.equal(await adapter.matches(secret), true);
  await adapter.set(secret);
  assert.equal(await adapter.verify(secret), true);
  for (const call of calls) assert.ok(!call.args.some((value) => value.includes(secret)));
  assert.ok(calls.every((call) => call.input.includes("synthetic''\\quoted")));
});

test("nonzero DB transport exits as a sanitized adapter failure", async () => {
  await assert.rejects(() => runProcessWithStdin({
    command: "docker",
    args: ["compose", "exec", "db"],
    cwd: ".",
    input: "SELECT synthetic;\n",
    spawnImpl() {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = { end() { queueMicrotask(() => { child.stderr.emit("data", "synthetic server detail"); child.emit("close", 1); }); } };
      return child;
    },
  }), (error) => error?.message === "LEGACY_JWT_DB_ADAPTER_FAILED" && !error.message.includes("synthetic"));
});
