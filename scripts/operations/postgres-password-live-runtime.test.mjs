import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import test from "node:test";

import { POSTGRES_ROTATED_ROLES } from "./postgres-password-rotation.mjs";
import { createPostgresPasswordLiveRuntime } from "./postgres-password-live-runtime.mjs";

const sourceGenerationId = "123e4567-e89b-12d3-a456-426614174000";
const targetGenerationId = "223e4567-e89b-12d3-a456-426614174000";
const sourcePassword = "a".repeat(32);
const targetPassword = "b".repeat(64);
const serviceRoleKey = "SYNTHETIC_SERVICE_ROLE_DO_NOT_PRINT";
const tenantId = "SYNTHETIC_TENANT_DO_NOT_PRINT";
const services = ["db", "supavisor", "meta", "auth", "rest", "realtime", "storage", "functions", "studio"];

function snapshot(password) {
  return Buffer.from(`POSTGRES_PASSWORD=${password}\nSERVICE_ROLE_KEY=${serviceRoleKey}\nPOOLER_TENANT_ID=${tenantId}\n`);
}

function serviceEnvironment(service, password = targetPassword) {
  const url = `postgres://manager:${password}@db:5432/postgres`;
  const values = {
    db: [`POSTGRES_PASSWORD=${password}`, `PGPASSWORD=${password}`],
    supavisor: [`POSTGRES_PASSWORD=${password}`, `DATABASE_URL=${url}`],
    meta: [`PG_META_DB_PASSWORD=${password}`],
    auth: [`GOTRUE_DB_DATABASE_URL=${url}`],
    rest: [`PGRST_DB_URI=${url}`],
    realtime: [`DB_PASSWORD=${password}`],
    storage: [`DATABASE_URL=${url}`],
    functions: [`SUPABASE_DB_URL=${url}`],
    studio: [`POSTGRES_PASSWORD=${password}`],
  };
  return values[service];
}

function harness({ lock = { state: "PRESENT", operation: "postgres-password-rotation", generationId: targetGenerationId }, environments = Object.fromEntries(services.map((service) => [service, serviceEnvironment(service)])), failure = null, root = "synthetic-root", missingGodelIdentity = false, managedLookup = {}, sourcePasswordValue = sourcePassword, targetPasswordValue = targetPassword } = {}) {
  const calls = [];
  let nginxRunning = true;
  const ids = new Map([...services, "api-gw", "imgproxy", "godel-app", "godel-nginx"].map((service, index) => [service, `${(index + 1).toString(16)}`.repeat(64)]));
  const byId = new Map([...ids].map(([service, id]) => [id, service]));
  const generation = (generationId) => ({ generationId, supabaseSnapshot: snapshot(generationId === sourceGenerationId ? sourcePasswordValue : targetPasswordValue) });
  const pointerCalls = [];
  const secretGeneration = {
    readSecretGeneration: async ({ generationId }) => generation(generationId),
    assertReferencedSecretGenerationMatches: async () => targetGenerationId,
    writeAllowlistedEnvironmentFile: async (value) => { calls.push({ environmentWrite: value }); },
    replaceCurrentGenerationPointer: async (value) => { pointerCalls.push(value); },
    getCurrentSecretGeneration: async () => ({ state: "INITIALIZED", generationId: targetGenerationId }),
    readGenerationMutationLock: async () => lock,
    generationMutationLockPath: () => "synthetic-lock-path",
    releaseGenerationMutationLock: async (path) => { calls.push({ release: path }); },
  };
  const processRunner = async (call) => {
    calls.push(call);
    if (failure) throw new Error(failure);
    const args = call.args;
    if (args.includes("stop") && args.at(-1) === "nginx") return (nginxRunning = false, { stdout: "" });
    if (args.includes("start") && args.at(-1) === "nginx") return (nginxRunning = true, { stdout: "" });
    if (args.includes("ps") && args.includes("-q")) {
      const requested = args.at(-1);
      const service = requested === "app" ? "godel-app" : requested === "nginx" ? "godel-nginx" : requested;
      if (missingGodelIdentity && service === "godel-nginx") return { stdout: "" };
      if (Object.hasOwn(managedLookup, service)) return { stdout: managedLookup[service] };
      return { stdout: ids.get(service) ?? "" };
    }
    if (args[0] === "inspect" && args.some((item) => item.includes(".Config.Env"))) return { stdout: JSON.stringify(environments[byId.get(args.at(-1))]) };
    if (args[0] === "inspect" && args.some((item) => item.includes(".State"))) {
      const service = byId.get(args.at(-1));
      return { stdout: JSON.stringify(service === "godel-nginx" && !nginxRunning ? { Running: false } : { Running: true, Health: { Status: "healthy" } }) };
    }
    if (args.includes("curl")) return { stdout: "204" };
    if (args.join(" ").includes("SELECT current_user")) return { stdout: args.at(-1) };
    if (args.join(" ").includes("SELECT 1")) return { stdout: "1" };
    return { stdout: "" };
  };
  const runtime = createPostgresPasswordLiveRuntime({
    protectedRoot: "synthetic-protected",
    supabaseEnvPath: "synthetic-supabase.env",
    godelEnvPath: "synthetic-godel.env",
    sourceGenerationId,
    targetGenerationId,
    processRunner,
    root,
    secretGeneration,
  });
  return { runtime, calls, ids, secretGeneration, pointerCalls };
}

function publicText(value) {
  return JSON.stringify(value);
}

test("database role mutation confines the password to psql stdin and uses the canonical local trust factory", async () => {
  const { runtime, calls } = harness();
  assert.equal(await runtime.rotateDatabaseRoles({ generationId: targetGenerationId, roles: [...POSTGRES_ROTATED_ROLES] }), true);
  const call = calls.find((item) => item.args?.includes("psql"));
  assert.ok(call);
  assert.match(call.input, /ALTER ROLE supabase_admin/);
  assert.match(call.input, new RegExp(targetPassword));
  assert.doesNotMatch(call.args.join("\n"), new RegExp(targetPassword));
  assert.equal(call.environment, undefined);
  assert.doesNotMatch(publicText(call), /SYNTHETIC_SERVICE_ROLE|SYNTHETIC_TENANT/);
  await assert.rejects(() => runtime.rotateDatabaseRoles({ generationId: targetGenerationId, roles: ["postgres"] }), /POSTGRES_LIVE_RUNTIME_ROLES_INVALID/);
});

test("legacy source restoration permits 32 hexadecimal characters across database, Supavisor, environment, and hygiene", async () => {
  const environments = Object.fromEntries(services.map((service) => [service, serviceEnvironment(service, sourcePassword)]));
  const { runtime, calls } = harness({ environments });
  const roles = [...POSTGRES_ROTATED_ROLES];
  assert.equal(await runtime.restoreDatabaseRoles({ generationId: sourceGenerationId, roles }), true);
  assert.equal(await runtime.verifyDatabaseAuthentication({ generationId: sourceGenerationId, roles }), true);
  assert.equal(await runtime.restoreSupavisorManager({ generationId: sourceGenerationId }), true);
  assert.equal(await runtime.verifySupavisorManager({ generationId: sourceGenerationId }), true);
  assert.equal(await runtime.restoreEnvironment({ generationId: sourceGenerationId, allowedNames: ["POSTGRES_PASSWORD"] }), true);
  for (const service of services) {
    assert.deepEqual(await runtime.verifyRuntimeSecretHygiene({ service, generationId: sourceGenerationId }), { sourceMatch: true, targetAbsent: true });
  }
  const mutation = calls.find((item) => item.args?.includes("psql"));
  assert.match(mutation.input, new RegExp(sourcePassword));
  const dbProbes = calls.filter((item) => item.args?.join(" ").includes("SELECT current_user"));
  assert.equal(dbProbes.length, 7);
  for (const probe of dbProbes) assert.equal(probe.input, `${sourcePassword}\n`);
  const curl = calls.find((item) => item.args?.includes("curl"));
  assert.match(curl.input, new RegExp(sourcePassword));
  assert.deepEqual(calls.find((item) => item.environmentWrite)?.environmentWrite.replacements, { POSTGRES_PASSWORD: sourcePassword });
});

test("a 32-character target fails before any process invocation", async () => {
  const { runtime, calls } = harness({ targetPasswordValue: "c".repeat(32) });
  const roles = [...POSTGRES_ROTATED_ROLES];
  await assert.rejects(() => runtime.rotateDatabaseRoles({ generationId: targetGenerationId, roles }), /POSTGRES_LIVE_RUNTIME_GENERATION_INVALID/);
  await assert.rejects(() => runtime.verifyDatabaseAuthentication({ generationId: targetGenerationId, roles }), /POSTGRES_LIVE_RUNTIME_GENERATION_INVALID/);
  await assert.rejects(() => runtime.updateSupavisorManager({ generationId: targetGenerationId }), /POSTGRES_LIVE_RUNTIME_GENERATION_INVALID/);
  assert.equal(calls.length, 0);
});

test("direct authentication probes require exactly seven returned roles and use TCP only inside db", async () => {
  const { runtime, calls } = harness();
  assert.equal(await runtime.verifyDatabaseAuthentication({ generationId: targetGenerationId, roles: [...POSTGRES_ROTATED_ROLES] }), true);
  const probes = calls.filter((item) => item.args?.join(" ").includes("SELECT current_user"));
  assert.equal(probes.length, 7);
  for (const probe of probes) {
    assert.equal(probe.input, `${targetPassword}\n`);
    assert.match(probe.args.join(" "), /-h 127\.0\.0\.1/);
    assert.doesNotMatch(probe.args.join("\n"), new RegExp(targetPassword));
  }
  const broken = harness();
  broken.runtime = createPostgresPasswordLiveRuntime({
    protectedRoot: "p", supabaseEnvPath: "s", godelEnvPath: "g", sourceGenerationId, targetGenerationId,
    secretGeneration: broken.secretGeneration,
    processRunner: async (call) => ({ stdout: call.args?.join(" ").includes("SELECT current_user") ? "wrong-role" : "" }),
  });
  await assert.rejects(() => broken.runtime.verifyDatabaseAuthentication({ generationId: targetGenerationId, roles: [...POSTGRES_ROTATED_ROLES] }), /POSTGRES_LIVE_RUNTIME_DATABASE_AUTH_FAILED/);
});

test("Supavisor update and pool verification keep password, token, and tenant only in stdin", async () => {
  const { runtime, calls } = harness();
  assert.equal(await runtime.updateSupavisorManager({ generationId: targetGenerationId }), true);
  assert.equal(await runtime.verifySupavisorManager({ generationId: targetGenerationId }), true);
  const curl = calls.find((item) => item.args?.includes("curl"));
  assert.match(curl.input, new RegExp(targetPassword));
  assert.match(curl.input, new RegExp(serviceRoleKey));
  assert.match(curl.input, new RegExp(tenantId));
  assert.doesNotMatch(curl.args.join("\n"), /SYNTHETIC_|bbbb/);
  const probes = calls.filter((item) => item.args?.join(" ").includes("SELECT 1"));
  assert.deepEqual(probes.map((item) => Number(item.args.at(-1))), [5432, 6543]);
  for (const probe of probes) {
    assert.match(probe.input, new RegExp(targetPassword));
    assert.match(probe.input, new RegExp(`pgbouncer\\.${tenantId}`));
    assert.doesNotMatch(probe.args.join("\n"), /SYNTHETIC_|bbbb/);
  }
  const failed = harness({ failure: `${targetPassword}:${serviceRoleKey}:${tenantId}` });
  await assert.rejects(() => failed.runtime.updateSupavisorManager({ generationId: targetGenerationId }), (error) => !/bbbb|SYNTHETIC_/.test(error.message) && error.message === "POSTGRES_LIVE_RUNTIME_SUPAVISOR_UPDATE_FAILED");
});

test("runtime hygiene returns structural TARGET and SOURCE mismatches after valid inspection", async () => {
  const { runtime } = harness();
  for (const service of services) {
    assert.deepEqual(await runtime.verifyRuntimeSecretHygiene({ service, generationId: targetGenerationId }), { targetMatch: true, oldAbsent: true });
  }
  const targetStillSource = harness({ environments: Object.fromEntries(services.map((service) => [service, serviceEnvironment(service, sourcePassword)])) }).runtime;
  assert.deepEqual(await targetStillSource.verifyRuntimeSecretHygiene({ service: "db", generationId: targetGenerationId }), { targetMatch: false, oldAbsent: false });
  const sourceStillTarget = harness().runtime;
  assert.deepEqual(await sourceStillTarget.verifyRuntimeSecretHygiene({ service: "db", generationId: sourceGenerationId }), { sourceMatch: false, targetAbsent: false });
  const unrelated = harness({ environments: { ...Object.fromEntries(services.map((service) => [service, serviceEnvironment(service)])), db: serviceEnvironment("db", "c".repeat(64)) } }).runtime;
  assert.deepEqual(await unrelated.verifyRuntimeSecretHygiene({ service: "db", generationId: targetGenerationId }), { targetMatch: false, oldAbsent: true });
});

test("runtime hygiene rejects only invalid inspection or parsing without exposing raw environment", async () => {
  for (const [label, environments] of [
    ["missing", { ...Object.fromEntries(services.map((service) => [service, serviceEnvironment(service)])), db: [`POSTGRES_PASSWORD=${targetPassword}`] }],
    ["duplicate", { ...Object.fromEntries(services.map((service) => [service, serviceEnvironment(service)])), studio: [`POSTGRES_PASSWORD=${targetPassword}`, `POSTGRES_PASSWORD=${targetPassword}`] }],
    ["malformed-url", { ...Object.fromEntries(services.map((service) => [service, serviceEnvironment(service)])), rest: ["PGRST_DB_URI=not-a-url"] }],
  ]) {
    const { runtime: broken } = harness({ environments });
    await assert.rejects(() => broken.verifyRuntimeSecretHygiene({ service: label === "missing" ? "db" : label === "duplicate" ? "studio" : "rest", generationId: targetGenerationId }), (error) => error.message === "POSTGRES_LIVE_RUNTIME_HYGIENE_INVALID" && !/aaaa|bbbb|SYNTHETIC_/.test(error.message));
  }
});

test("operation lock release is target-bound and never performs generic deletion", async () => {
  for (const lock of [
    { state: "ABSENT" },
    { state: "PRESENT", operation: "other-operation", generationId: targetGenerationId },
    { state: "PRESENT", operation: "postgres-password-rotation", generationId: sourceGenerationId },
  ]) {
    const { runtime, calls } = harness({ lock });
    await assert.rejects(() => runtime.releaseLock(), /POSTGRES_LIVE_RUNTIME_LOCK_OWNERSHIP_INVALID/);
    assert.equal(calls.some((item) => item.release), false);
  }
  const { runtime, calls } = harness();
  assert.equal(await runtime.readOperationLockState(), "PRESENT");
  assert.equal(await runtime.releaseLock(), true);
  assert.deepEqual(calls.find((item) => item.release), { release: "synthetic-lock-path" });
  const malformed = harness();
  malformed.secretGeneration.readGenerationMutationLock = async () => { throw new Error("raw malformed lock contents"); };
  await assert.rejects(() => malformed.runtime.releaseLock(), (error) => error.message === "POSTGRES_LIVE_RUNTIME_LOCK_READ_FAILED" && !/raw/.test(error.message));
});

test("environment and pointer mutations are strictly generation-guarded and report no secret values", async () => {
  const { runtime, secretGeneration, pointerCalls } = harness();
  assert.equal(await runtime.writeEnvironment({ generationId: targetGenerationId, allowedNames: ["POSTGRES_PASSWORD"] }), true);
  assert.equal(await runtime.verifyLiveEnvironment({ generationId: targetGenerationId }), true);
  assert.equal(await runtime.replacePointer({ fromGenerationId: sourceGenerationId, toGenerationId: targetGenerationId }), true);
  assert.deepEqual(pointerCalls, [{ protectedRoot: "synthetic-protected", generationId: targetGenerationId, expectedGenerationId: sourceGenerationId }]);
  await assert.rejects(() => runtime.writeEnvironment({ generationId: targetGenerationId, allowedNames: ["POSTGRES_PASSWORD", "OTHER"] }), /POSTGRES_LIVE_RUNTIME_ENVIRONMENT_SCOPE_INVALID/);
  secretGeneration.replaceCurrentGenerationPointer = async () => { throw new Error(`${targetPassword}:${serviceRoleKey}`); };
  await assert.rejects(() => runtime.replacePointer({ fromGenerationId: sourceGenerationId, toGenerationId: targetGenerationId }), (error) => error.message === "POSTGRES_LIVE_RUNTIME_POINTER_REPLACE_FAILED" && !/bbbb|SYNTHETIC_/.test(error.message));
});

test("Supavisor rejects non-204 responses without forwarding captured output", async () => {
  const { runtime } = harness();
  const failing = createPostgresPasswordLiveRuntime({
    protectedRoot: "p", supabaseEnvPath: "s", godelEnvPath: "g", sourceGenerationId, targetGenerationId,
    secretGeneration: harness().secretGeneration,
    processRunner: async (call) => ({ stdout: call.args?.includes("curl") ? "500 SYNTHETIC_SERVICE_ROLE_DO_NOT_PRINT" : "" }),
  });
  await assert.rejects(() => failing.updateSupavisorManager({ generationId: targetGenerationId }), (error) => error.message === "POSTGRES_LIVE_RUNTIME_SUPAVISOR_UPDATE_FAILED" && !/SYNTHETIC_/.test(error.message));
  assert.ok(runtime);
});

test("semantic service, recreate, maintenance, nginx, and hook methods use fixed factories and fail closed", async () => {
  const { runtime, calls } = harness();
  assert.match(await runtime.getServiceIdentity({ service: "db" }), /^[a-f0-9]{64}$/i);
  await runtime.recreateDatabase();
  for (const service of ["supavisor", "meta", "auth", "rest", "realtime", "storage", "functions", "studio"]) await runtime.recreateConsumer({ service });
  await runtime.closeMaintenance();
  await runtime.openMaintenance();
  await runtime.verifyNginxRunning();
  assert.equal(calls.some((item) => item.args?.join(" ").includes("--force-recreate db")), true);
  assert.equal(calls.filter((item) => item.args?.join(" ").includes("--force-recreate")).length, 9);
  assert.equal(calls.some((item) => item.args?.join(" ").includes("stop nginx")), true);
  assert.equal(calls.some((item) => item.args?.join(" ").includes("start nginx")), true);
  await assert.rejects(() => runtime.preflight({}), /POSTGRES_LIVE_RUNTIME_HOOK_REQUIRED/);
});

test("Godel identities are Compose-backed across nginx stop/start and preserve the existing container", async () => {
  const { runtime, calls } = harness();
  const before = await runtime.getServiceIdentity({ service: "godel-nginx" });
  const app = await runtime.getServiceIdentity({ service: "godel-app" });
  await runtime.closeMaintenance();
  assert.equal(await runtime.verifyNginxStopped(), true);
  const stopped = await runtime.getServiceIdentity({ service: "godel-nginx" });
  await runtime.openMaintenance();
  assert.equal(await runtime.verifyNginxRunning(), true);
  const after = await runtime.getServiceIdentity({ service: "godel-nginx" });
  assert.equal(before, stopped);
  assert.equal(stopped, after);
  assert.match(app, /^[a-f0-9]{64}$/i);
  const godelLookups = calls.filter((item) => item.args?.includes("ps") && ["nginx", "app"].includes(item.args.at(-1)));
  assert.ok(godelLookups.length >= 4);
  for (const lookup of godelLookups) {
    assert.equal(lookup.args.includes("--all"), true);
    assert.deepEqual(lookup.args.slice(0, 5), ["compose", "--env-file", "compose.env.local", "-f", "compose.yaml"]);
  }
  assert.equal(calls.some((item) => item.args?.includes("--force-recreate")), false);
});

test("missing stopped nginx container fails closed rather than being treated as stopped", async () => {
  const { runtime } = harness({ missingGodelIdentity: true });
  await assert.rejects(() => runtime.verifyNginxStopped(), /POSTGRES_LIVE_RUNTIME_SERVICE_IDENTITY_FAILED/);
});

test("Supabase managed identity state uses stopped-capable Compose lookup and permits only explicit absence", async () => {
  const { runtime, calls, ids } = harness();
  assert.deepEqual(await runtime.getManagedServiceIdentityState({ service: "storage" }), { state: "PRESENT", id: ids.get("storage") });
  const lookup = calls.find((item) => item.args?.includes("ps") && item.args?.at(-1) === "storage");
  assert.deepEqual(lookup.args.slice(0, 7), ["compose", "--env-file", "infra/supabase/.env", "-f", "infra/supabase/docker-compose.yml", "-f", "infra/supabase-godel.override.yml"]);
  assert.equal(lookup.args.includes("--all"), true);

  const absent = harness({ managedLookup: { storage: "" } });
  assert.deepEqual(await absent.runtime.getManagedServiceIdentityState({ service: "storage" }), { state: "ABSENT" });
  await assert.rejects(() => absent.runtime.getServiceIdentity({ service: "storage" }), /POSTGRES_LIVE_RUNTIME_SERVICE_IDENTITY_FAILED/);
  await assert.rejects(() => absent.runtime.getManagedServiceIdentityState({ service: "api-gw" }), /POSTGRES_LIVE_RUNTIME_MANAGED_SERVICE_FORBIDDEN/);
});

test("managed identity lookup fails closed for multiple IDs and subprocess errors instead of returning ABSENT", async () => {
  const multiple = harness({ managedLookup: { storage: `${"a".repeat(64)}\n${"b".repeat(64)}\n` } });
  await assert.rejects(() => multiple.runtime.getManagedServiceIdentityState({ service: "storage" }), /POSTGRES_LIVE_RUNTIME_MANAGED_IDENTITY_INVALID/);
  const failed = harness({ failure: "raw docker failure must not escape" });
  await assert.rejects(
    () => failed.runtime.getManagedServiceIdentityState({ service: "storage" }),
    (error) => error.message === "POSTGRES_LIVE_RUNTIME_MANAGED_IDENTITY_LOOKUP_FAILED" && !/raw docker/.test(error.message),
  );
});

test("configured root reaches Supabase, Godel, and inspect process calls", async () => {
  const root = "/synthetic/repository-root";
  const { runtime, calls } = harness({ root });
  await runtime.getServiceIdentity({ service: "db" });
  await runtime.getServiceIdentity({ service: "godel-app" });
  await runtime.verifyRuntimeSecretHygiene({ service: "db", generationId: targetGenerationId });
  assert.ok(calls.some((item) => item.args?.includes("ps") && item.args?.includes("db")));
  assert.ok(calls.some((item) => item.args?.includes("ps") && item.args?.includes("app")));
  assert.ok(calls.some((item) => item.args?.[0] === "inspect"));
  for (const call of calls) assert.equal(call.cwd, root);
});

test("default secret process runner pins spawn cwd without a global cwd mutation", async () => {
  const calls = [];
  const fakeSpawn = (executable, args, options) => {
    calls.push({ executable, args, options });
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => undefined;
    queueMicrotask(() => child.emit("close", 0));
    return child;
  };
  const runtime = createPostgresPasswordLiveRuntime({
    protectedRoot: "synthetic-protected",
    supabaseEnvPath: "synthetic-supabase.env",
    godelEnvPath: "synthetic-godel.env",
    sourceGenerationId,
    targetGenerationId,
    root: "/synthetic/repository-root",
    spawnImpl: fakeSpawn,
  });
  assert.equal(await runtime.recreateDatabase(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.cwd, "/synthetic/repository-root");
  assert.equal(calls[0].options.shell, false);
  const source = await readFile(new URL("./postgres-password-live-runtime.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /process\.chdir\s*\(/);
});

test("live adapter exports semantic methods only and never starts an orchestrator at module load", async () => {
  const source = await readFile(new URL("./postgres-password-live-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /spawnImpl\(executable, args, \{/);
  assert.match(source, /shell: false/);
  assert.doesNotMatch(source, /export\s+(?:async\s+)?function\s+(?:runDocker|runCommand|execCompose)/);
  assert.doesNotMatch(source, /orchestratePostgresPassword(?:Cutover|Rollback)|resumePostgresPasswordRollback/);
});
