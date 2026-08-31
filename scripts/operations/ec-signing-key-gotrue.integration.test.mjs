import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildEcRotationPlan,
  generateEphemeralEcSigningPair,
  signAsymmetricTranslationJwt,
  validateGen4Source,
} from "./ec-signing-key-rotation.mjs";

const execFileAsync = promisify(execFile);
const AUTH_IMAGE = "supabase/gotrue:v2.189.0";
const DATABASE_IMAGE = "supabase/postgres:17.6.1.136";
const PREFIX = `godel-ec-proof-${randomUUID().replaceAll("-", "")}`;
const NETWORK = `${PREFIX}-network`;
const DATABASE = `${PREFIX}-db`;
const NOW = Math.floor(Date.now() / 1000);
const SYNTHETIC_POSTGRES_PASSWORD = randomBytes(24).toString("base64url");
const SYNTHETIC_JWT_SECRET = randomBytes(32).toString("base64url");
const SYNTHETIC_EMAIL = `ec-${randomUUID()}@example.invalid`;
const SYNTHETIC_PASSWORD = randomBytes(24).toString("base64url");

function failure(label, result) {
  return new Error(`${label} failed with exit code ${result.code ?? "unknown"}`);
}

async function docker(args, { env = {}, allowFailure = false } = {}) {
  try {
    const result = await execFileAsync("docker", args, {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const result = { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
    if (allowFailure) return result;
    throw failure(`docker ${args[0]}`, result);
  }
}

function legacyJwt(secret, role) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role, iss: "supabase", iat: NOW, exp: NOW + 300 })).toString("base64url");
  return `${header}.${payload}.${createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")}`;
}

function snapshot(values) {
  return Buffer.from([...values.entries()].map(([name, value]) => `${name}=${value}`).join("\n") + "\n");
}

function parseSnapshot(source) {
  return new Map(Buffer.from(source).toString("utf8").trim().split("\n").map((line) => {
    const separator = line.indexOf("=");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function buildSyntheticGen4() {
  const pair = generateEphemeralEcSigningPair();
  const oct = { kty: "oct", k: Buffer.from(SYNTHETIC_JWT_SECRET).toString("base64url"), alg: "HS256" };
  return snapshot(new Map([
    ["JWT_SECRET", SYNTHETIC_JWT_SECRET],
    ["ANON_KEY", legacyJwt(SYNTHETIC_JWT_SECRET, "anon")],
    ["SERVICE_ROLE_KEY", legacyJwt(SYNTHETIC_JWT_SECRET, "service_role")],
    ["SUPABASE_PUBLISHABLE_KEY", "synthetic-publishable"],
    ["SUPABASE_SECRET_KEY", "synthetic-secret"],
    ["JWT_KEYS", JSON.stringify([pair.privateJwk, oct])],
    ["JWT_JWKS", JSON.stringify({ keys: [pair.publicJwk, oct] })],
    ["ANON_KEY_ASYMMETRIC", signAsymmetricTranslationJwt({ privateKey: pair.privateJwk, role: "anon", now: NOW })],
    ["SERVICE_ROLE_KEY_ASYMMETRIC", signAsymmetricTranslationJwt({ privateKey: pair.privateJwk, role: "service_role", now: NOW })],
  ]));
}

function keysFrom(source) {
  const values = parseSnapshot(source);
  return { jwtKeys: JSON.parse(values.get("JWT_KEYS")), jwtJwks: JSON.parse(values.get("JWT_JWKS")) };
}

function jwtHeader(token) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

async function waitFor(label, predicate, timeoutMs = 30_000, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`${label} did not become ready before the bounded timeout`);
}

async function containerRunning(name) {
  const result = await docker(["inspect", "--format", "{{.State.Running}}", name], { allowFailure: true });
  return result.code === 0 && result.stdout.trim() === "true";
}

async function startDatabase() {
  await docker([
    "run", "-d", "--name", DATABASE, "--network", NETWORK,
    "--env", "POSTGRES_PASSWORD", "--env", "POSTGRES_DB",
    DATABASE_IMAGE,
  ], { env: { POSTGRES_PASSWORD: SYNTHETIC_POSTGRES_PASSWORD, POSTGRES_DB: "postgres" } });
  await waitFor("isolated Postgres local process", async () => (await docker(["exec", DATABASE, "pg_isready", "-U", "postgres", "-d", "postgres"], { allowFailure: true })).code === 0);
  await waitFor("isolated Postgres network SQL", async () => {
    const result = await docker([
      "run", "--rm", "--pull=never", "--network", NETWORK, "--env", "PGPASSWORD",
      "--entrypoint", "psql", DATABASE_IMAGE,
      "-X", "-h", DATABASE, "-p", "5432", "-U", "postgres", "-d", "postgres", "-tAc", "SELECT 1",
    ], { env: { PGPASSWORD: SYNTHETIC_POSTGRES_PASSWORD }, allowFailure: true });
    return result.code === 0 && result.stdout.trim() === "1";
  }, 30_000, 1_000);
}

function authEnvironment(keyMaterial) {
  return {
    GOTRUE_DB_DATABASE_URL: `postgres://postgres:${SYNTHETIC_POSTGRES_PASSWORD}@${DATABASE}:5432/postgres?sslmode=disable`,
    GOTRUE_JWT_SECRET: SYNTHETIC_JWT_SECRET,
    GOTRUE_JWT_KEYS: keyMaterial.jwtKeys,
    GOTRUE_SITE_URL: "http://synthetic.invalid",
    API_EXTERNAL_URL: "http://synthetic.invalid",
    GOTRUE_API_EXTERNAL_URL: "http://synthetic.invalid",
  };
}

async function startAuth(name, keyMaterial) {
  const authName = `${PREFIX}-${name}`;
  await docker([
    "run", "-d", "--name", authName, "--network", NETWORK,
    "--env", "GOTRUE_DB_DRIVER", "--env", "GOTRUE_DB_DATABASE_URL", "--env", "GOTRUE_SITE_URL", "--env", "API_EXTERNAL_URL", "--env", "GOTRUE_API_EXTERNAL_URL",
    "--env", "GOTRUE_JWT_SECRET", "--env", "GOTRUE_JWT_KEYS", "--env", "GOTRUE_JWT_EXP", "--env", "GOTRUE_EXTERNAL_EMAIL_ENABLED", "--env", "GOTRUE_MAILER_AUTOCONFIRM", "--env", "GOTRUE_DISABLE_SIGNUP",
    AUTH_IMAGE,
  ], {
    env: {
      ...authEnvironment(keyMaterial),
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_JWT_EXP: "3600",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_MAILER_AUTOCONFIRM: "true",
      GOTRUE_DISABLE_SIGNUP: "false",
    },
  });
  return authName;
}

async function stopRemove(name) {
  await docker(["rm", "-f", name], { allowFailure: true });
}

async function request(authName, script, env = {}) {
  return docker(["exec", ...Object.keys(env).flatMap((name) => ["--env", name]), authName, "/bin/sh", "-c", script], { env, allowFailure: true });
}

async function health(authName) {
  await waitFor(`${authName} health`, async () => (await request(authName, "wget -qO- http://127.0.0.1:9999/health >/dev/null")).code === 0);
}

async function jwks(authName) {
  const result = await request(authName, "wget -qO- http://127.0.0.1:9999/.well-known/jwks.json");
  assert.equal(result.code, 0, "JWKS endpoint must be available");
  return JSON.parse(result.stdout);
}

async function signUp(authName) {
  const result = await request(authName, "wget -qO- --header='Content-Type: application/json' --post-data=\"{\\\"email\\\":\\\"$EMAIL\\\",\\\"password\\\":\\\"$PASSWORD\\\"}\" http://127.0.0.1:9999/signup", { EMAIL: SYNTHETIC_EMAIL, PASSWORD: SYNTHETIC_PASSWORD });
  assert.equal(result.code, 0, "synthetic signup must succeed");
  return JSON.parse(result.stdout).access_token;
}

async function signIn(authName) {
  const result = await request(authName, "wget -qO- --header='Content-Type: application/json' --post-data=\"{\\\"email\\\":\\\"$EMAIL\\\",\\\"password\\\":\\\"$PASSWORD\\\"}\" 'http://127.0.0.1:9999/token?grant_type=password'", { EMAIL: SYNTHETIC_EMAIL, PASSWORD: SYNTHETIC_PASSWORD });
  assert.equal(result.code, 0, "synthetic password sign-in must succeed");
  return JSON.parse(result.stdout).access_token;
}

async function userRequest(authName, token) {
  return request(authName, "wget -qO- --header=\"Authorization: Bearer $TOKEN\" http://127.0.0.1:9999/user", { TOKEN: token });
}

async function assertRejectedConfiguration(name, keyMaterial, expectation) {
  const authName = await startAuth(name, keyMaterial);
  await waitFor(`${name} configuration rejection`, async () => !(await containerRunning(authName)), 15_000);
  const logs = await docker(["logs", authName], { allowFailure: true });
  assert.match(`${logs.stdout}\n${logs.stderr}`.toLowerCase(), expectation);
}

async function assertNoPrefixedResources() {
  const containers = await docker(["ps", "-a", "--filter", `name=^/${PREFIX}`, "--format", "{{.Names}}"]);
  const networks = await docker(["network", "ls", "--filter", `name=^${NETWORK}$`, "--format", "{{.Name}}"]);
  assert.equal(containers.stdout.trim(), "", "cleanup must remove every proof container");
  assert.equal(networks.stdout.trim(), "", "cleanup must remove the proof network");
}

test("GoTrue v2.189.0 accepts the synthetic EC overlap sequence", { timeout: 180_000 }, async (t) => {
  const compose = await readFile(new URL("../../infra/supabase/docker-compose.yml", import.meta.url), "utf8");
  assert.match(compose, /auth:\s*[\s\S]*?image:\s*supabase\/gotrue:v2\.189\.0/);
  assert.match(compose, /image:\s*supabase\/postgres:17\.6\.1\.136/);

  const gen4 = buildSyntheticGen4();
  const plan = buildEcRotationPlan(gen4, { now: NOW });
  const oldKid = validateGen4Source(gen4).oldKid;
  const gen5 = keysFrom(plan.gen5Snapshot);
  const gen6 = keysFrom(plan.gen6Snapshot);
  const gen7 = keysFrom(plan.gen7Snapshot);
  const newKid = gen6.jwtKeys.find((key) => key.kty === "EC" && Object.hasOwn(key, "d")).kid;
  const oct = gen5.jwtKeys.find((key) => key.kty === "oct");
  const oldPrivate = gen5.jwtKeys.find((key) => key.kty === "EC" && Object.hasOwn(key, "d"));
  const newPrivate = gen6.jwtKeys.find((key) => key.kty === "EC" && Object.hasOwn(key, "d"));
  const productionRuntimeBefore = new Map(await Promise.all(["supabase-auth", "supabase-db"].map(async (name) => [name, await containerRunning(name)])));

  await docker(["network", "create", NETWORK]);
  t.after(async () => {
    for (const name of [`${PREFIX}-gen5`, `${PREFIX}-gen6`, `${PREFIX}-gen7`, `${PREFIX}-multi`, `${PREFIX}-zero`, DATABASE]) await stopRemove(name);
    await docker(["network", "rm", NETWORK], { allowFailure: true });
    await assertNoPrefixedResources();
    for (const [name, wasRunning] of productionRuntimeBefore) {
      if (wasRunning) assert.equal(await containerRunning(name), true, `${name} must remain running when it was healthy before the proof`);
    }
  });
  await startDatabase();

  const gen5Auth = await startAuth("gen5", gen5);
  await health(gen5Auth);
  const gen5Jwks = await jwks(gen5Auth);
  assert.deepEqual(gen5Jwks.keys.filter((key) => key.kty === "EC").map((key) => key.kid).sort(), [oldKid, newKid].sort());
  assert.equal(gen5Jwks.keys.some((key) => key.kty === "oct"), false);
  assert.equal(gen5Jwks.keys.some((key) => Object.hasOwn(key, "d")), false);
  const oldToken = await signUp(gen5Auth);
  assert.equal(jwtHeader(oldToken).alg, "ES256");
  assert.equal(jwtHeader(oldToken).kid, oldKid);
  await stopRemove(gen5Auth);

  const gen6Auth = await startAuth("gen6", gen6);
  await health(gen6Auth);
  const gen6Jwks = await jwks(gen6Auth);
  assert.deepEqual(gen6Jwks.keys.filter((key) => key.kty === "EC").map((key) => key.kid).sort(), [oldKid, newKid].sort());
  const newToken = await signIn(gen6Auth);
  assert.equal(jwtHeader(newToken).alg, "ES256");
  assert.equal(jwtHeader(newToken).kid, newKid);
  assert.equal((await userRequest(gen6Auth, oldToken)).code, 0, "GEN6 must accept the GEN5 token");
  assert.equal((await userRequest(gen6Auth, newToken)).code, 0, "GEN6 must accept the GEN6 token");
  await stopRemove(gen6Auth);

  const gen7Auth = await startAuth("gen7", gen7);
  await health(gen7Auth);
  const gen7Jwks = await jwks(gen7Auth);
  assert.deepEqual(gen7Jwks.keys.filter((key) => key.kty === "EC").map((key) => key.kid), [newKid]);
  assert.equal((await userRequest(gen7Auth, newToken)).code, 0, "GEN7 must accept the new token");
  const oldTokenResult = await userRequest(gen7Auth, oldToken);
  assert.notEqual(oldTokenResult.code, 0, "GEN7 must reject the old token");
  assert.equal(await containerRunning(gen7Auth), true, "old-token rejection must be an auth failure, not an availability failure");

  const badJwks = gen5.jwtJwks;
  await assertRejectedConfiguration("multi", { jwtKeys: JSON.stringify([oldPrivate, newPrivate, oct]), jwtJwks: badJwks }, /multiple.*signing|more than one.*signing|only one.*signing/);
  await assertRejectedConfiguration("zero", { jwtKeys: JSON.stringify([gen5.jwtKeys.find((key) => key.kty === "EC" && !Object.hasOwn(key, "d")), gen6.jwtKeys.find((key) => key.kty === "EC" && !Object.hasOwn(key, "d")), oct]), jwtJwks: badJwks }, /no.*signing|signing.*key/);
});
