import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import test from "node:test";

import { BASE, TARGET, createIsolationOverride, validateEffectiveCompose } from "./supabase-update-rehearsal.mjs";
import { anonymousGatewayHeaders, assertFixtureDependencyHealthchecks, assertRuntimeGatewayIdentity, captureProductionFingerprint, compareFixtureFingerprints, compareProductionFingerprints, createBoundedRunner, createExecutionComposeConfigInvocation, createFixtures, createInternalKongProbeInvocation, createProjectResidueAuditInvocations, createRealUpdateInvocation, createRuntimeComposeInvocation, createSecretGenerationStatusInvocation, discoverProductionScope, executeHistoricalRehearsal, fallbackProjectCleanup, fetchFixtureJson, finalizeExecutorOutput, getInternalJournal, parseExecutorArguments, parseUpdateSummary, readProjectServiceHealth, removeSuccessJournal, validateFixtures, waitForGateway, waitForRequiredServicesHealthy, writeFinalJson } from "./supabase-update-rehearsal-execute.mjs";

const project = "godel-sh044c-rehearsal-test123";
const credentials = { anonKey: "synthetic-anon", serviceRoleKey: "synthetic-service-role" };
const fixture = { database: { status: "PASS", rowIdentifier: "row-1", rowDigest: "a".repeat(64) }, auth: { user: "PASS", userIdentifier: "user-1", session: "PASS" }, storage: { status: "PASS", size: 12, sha256: "b".repeat(64) }, gateway: { loopback: "PASS", internalKong: "PASS" } };
const cleanResidue = { containers: [], networks: [], volumes: [] };
const nominalSummary = "Update applied. Summary:\nupdated:          4\nnew:              1\nmerged (clean):   2\nCONFLICTS:        0\nmerge failures:   0\nremoved upstream: 0\nenv keys added:   0\n";

function composeModel({ target = false, workspace = "C:\\temp" } = {}) {
  const gateway = target ? "api-gw" : "kong";
  return {
    services: Object.fromEntries(["db", "auth", "rest", "storage", gateway].map((name) => [name, {
      image: name === "kong" ? "kong/kong:3.9.3" : name === "api-gw" ? "envoyproxy/envoy:v1.39.0" : "supabase/postgres:17.6.1.136",
      healthcheck: { test: ["CMD", "true"] },
      container_name: `${project}-${name}`,
      ports: name === gateway ? [{ host_ip: "127.0.0.1", published: "18080", target: 8000 }] : [],
      networks: name === "api-gw" ? { default: { aliases: ["api-gw", "kong"] } } : { default: {} },
      volumes: name === "db" ? [{ type: "bind", source: workspace, target: "/var/lib/postgresql/data" }] : [],
    }])),
    networks: { default: {} },
  };
}

async function materialize({ destination, tag }) {
  const target = tag === TARGET.tag;
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, "docker-compose.yml"), target
    ? "services:\n  db:\n    image: supabase/postgres:17.6.1.136\n  api-gw:\n    image: envoyproxy/envoy:v1.39.0\n"
    : "services:\n  db:\n    image: supabase/postgres:17.6.1.136\n  kong:\n    image: kong/kong:3.9.3\n");
  await writeFile(join(destination, ".env.example"), "JWT_SECRET=\nPOSTGRES_PASSWORD=\nANON_KEY=\nSERVICE_ROLE_KEY=\n");
  await writeFile(join(destination, "update.sh"), "#!/bin/sh\n");
}

function executorOptions(overrides = {}) {
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (args.some((arg) => String(arg).endsWith("update.sh"))) {
      const runtime = dirname(args[0]);
      await writeFile(join(runtime, "docker-compose.yml"), "services:\n  db:\n    image: supabase/postgres:17.6.1.136\n  api-gw:\n    image: envoyproxy/envoy:v1.39.0\n");
      await writeFile(join(runtime, ".supabase-version"), `ref=${TARGET.tag}\n`);
      await mkdir(join(runtime, "backups"), { recursive: true });
      await writeFile(join(runtime, "backups", "pre-update-test.tgz"), "synthetic");
      return { stdout: nominalSummary };
    }
    return { stdout: "" };
  };
  let runtimePhase = "BASE";
  return {
    acknowledged: true, jqBin: process.execPath, generation: "test123", run, materializeSnapshot: materialize,
    resolveExactTag: async ({ tag, expectedCommit }) => ({ tag, commit: expectedCommit }),
    resolveJq: async () => ({ status: "JQ_AVAILABLE", path: process.execPath, directory: dirname(process.execPath) }),
    resolveShell: async () => ({ status: "SH_AVAILABLE", path: process.execPath, directory: dirname(process.execPath) }),
    portProbe: async () => true,
    renderCompose: async (invocation) => composeModel({ target: invocation.args.some((arg) => String(arg).includes("target")), workspace: invocation.cwd }),
    listProductionContainers: async () => [], inspectImages: async () => ({ status: "ALL_IMAGES_PRESENT", missing: [], present: [] }),
    productionFingerprint: async () => ({ containers: [], d5: "CURRENT_MATCH", godel: "LIVE_READY" }), waitForRequiredServices: async () => "PASS", waitForRuntime: async () => "PASS",
    inspectRuntimeGateway: async () => runtimePhase === "BASE" ? [{ project, service: "kong", image: "kong/kong:3.9.3", state: "running" }] : [{ project, service: "api-gw", image: "envoyproxy/envoy:v1.39.0", state: "running" }],
    createFixtures: async () => fixture, validateFixtures: async () => fixture, auditProjectResidue: async () => cleanResidue, fallbackProjectCleanup: async () => {}, checkpointSink: () => {}, createCheckpointEmitter: async () => ({ journal: join(tmpdir(), "sh044c-test-journal"), emit: async () => {} }),
    __calls: calls, __setRuntimePhase: (phase) => { runtimePhase = phase; }, ...overrides,
  };
}

test("no acknowledgement and missing jq fail before any Docker mutation", async () => {
  let calls = 0;
  assert.equal((await executeHistoricalRehearsal({ run: async () => { calls += 1; } })).executorResult, "ACKNOWLEDGEMENT_REQUIRED");
  assert.equal((await executeHistoricalRehearsal({ acknowledged: true, run: async () => { calls += 1; } })).executorResult, "JQ_PATH_REQUIRED");
  assert.equal(calls, 0);
});

test("argument parser requires the exact acknowledgement", () => {
  assert.equal(parseExecutorArguments(["--execute-isolated-historical-rehearsal", "--jq", "jq.exe", "--port", "18081"]).acknowledged, true);
  assert.equal(parseExecutorArguments(["--pre-runtime-probe", "--jq", "jq.exe"]).preRuntimeProbe, true);
  assert.equal(parseExecutorArguments(["--execute-isolated-base-fixture-probe", "--jq", "jq.exe"]).baseFixtureProbe, true);
  assert.throws(() => parseExecutorArguments(["--pre-runtime-probe", "--execute-isolated-historical-rehearsal", "--jq", "jq.exe"]), /mutually exclusive/);
  assert.throws(() => parseExecutorArguments(["--execute"]), /USAGE/);
});

test("required fixture health gates wait for storage and fail closed for unhealthy dependencies", async () => {
  const healthy = (service, health = "healthy") => ({ service, state: "running", health, image: `${service}:test` });
  let reads = 0, sleeps = 0;
  const readServices = async () => { reads += 1; return ["db", "auth", "rest", "kong"].map((service) => healthy(service)).concat(healthy("storage", reads === 1 ? "starting" : "healthy")); };
  assert.equal(await waitForRequiredServicesHealthy({ phase: "BASE", project, readServices, sleep: async () => { sleeps += 1; }, timeoutMs: 100 }), "PASS");
  assert.equal(sleeps, 1);
  await assert.rejects(() => waitForRequiredServicesHealthy({ phase: "BASE", project, readServices: async () => ["db", "auth", "rest", "kong"].map((service) => healthy(service)).concat(healthy("storage", "unhealthy")), sleep: async () => {} }), /RUNTIME_REQUIRED_SERVICE_UNHEALTHY:storage/);
});

test("project health inventory uses docker ps all and Docker HealthStatus without inspect-only access", async () => {
  const calls = [];
  const records = await readProjectServiceHealth({ project, run: async (command, args, options) => {
    calls.push({ command, args, options });
    return { stdout: "db|running|healthy|postgres:test\nauth|running|starting|auth:test\nstorage|running|unhealthy|storage:test\nrest|exited||rest:test\nkong|running|healthy|kong:test\n" };
  } });
  assert.deepEqual(records, [
    { service: "db", state: "running", health: "healthy", image: "postgres:test" },
    { service: "auth", state: "running", health: "starting", image: "auth:test" },
    { service: "storage", state: "running", health: "unhealthy", image: "storage:test" },
    { service: "rest", state: "exited", health: "NONE", image: "rest:test" },
    { service: "kong", state: "running", health: "healthy", image: "kong:test" },
  ]);
  const [call] = calls; const format = call.args[call.args.indexOf("--format") + 1];
  assert.equal(call.command, "docker"); assert.equal(call.args.includes("ps"), true); assert.equal(call.args.includes("-a"), true); assert.equal(call.args.includes(`label=com.docker.compose.project=${project}`), true);
  assert.match(format, /\.HealthStatus/); assert.match(format, /\.State/); assert.match(format, /\.Image/); assert.match(format, /com\.docker\.compose\.service/); assert.doesNotMatch(format, /\.State\.Health/);
});

test("auth starting blocks fixtures until healthy and exited storage fails closed", async () => {
  const healthy = (service, health = "healthy", state = "running") => ({ service, state, health, image: `${service}:test` });
  let reads = 0;
  assert.equal(await waitForRequiredServicesHealthy({ phase: "BASE", project, readServices: async () => { reads += 1; return ["db", "rest", "storage", "kong"].map((service) => healthy(service)).concat(healthy("auth", reads === 1 ? "starting" : "healthy")); }, sleep: async () => {} }), "PASS");
  assert.equal(reads, 2);
  await assert.rejects(() => waitForRequiredServicesHealthy({ phase: "BASE", project, readServices: async () => ["db", "auth", "rest", "kong"].map((service) => healthy(service)).concat(healthy("storage", "NONE", "exited")), sleep: async () => {} }), /RUNTIME_REQUIRED_SERVICE_UNHEALTHY:storage/);
});

test("fixture dependency healthcheck contract and endpoint-aware errors are fail closed", async () => {
  assert.equal(assertFixtureDependencyHealthchecks({ model: composeModel(), phase: "BASE" }), "PASS");
  const missing = composeModel(); delete missing.services.storage.healthcheck;
  assert.throws(() => assertFixtureDependencyHealthchecks({ model: missing, phase: "BASE" }), /FIXTURE_DEPENDENCY_HEALTHCHECK_MISSING:storage/);
  for (const operation of ["AUTH_ADMIN_CREATE", "STORAGE_BUCKET_CREATE", "STORAGE_OBJECT_UPLOAD"]) await assert.rejects(() => fetchFixtureJson({ operation, fetchImpl: async () => new Response("ignored", { status: 502 }), url: "http://example.invalid", options: {} }), new RegExp(`FIXTURE_HTTP_${operation}_502`));
});

test("production scope is exact, excludes unrelated Docker, and fails closed when ambiguous", async () => {
  const records = {
    "supabase-db": "/supabase-db|supabase/postgres:17|0|healthy|supabase_default,|supabase|db",
    "supabase-envoy": "/supabase-envoy|envoyproxy/envoy:v1.39.0|0|healthy|supabase_default,godel-supabase-api,|supabase|api-gw",
    "godel-app": "/godel-app|godel:current|0|healthy|godel-supabase-api,|godel-production|app",
    "godel-nginx": "/godel-nginx|nginx:local|0|healthy|godel-runtime_stack,godel-supabase-api,|godel-production|nginx",
    unrelated: "/unrelated|redis:7|4|healthy|other_default,|unrelated-dev|cache",
  };
  const run = async (command, args) => command === "docker" && args[0] === "ps" ? { stdout: `${Object.keys(records).join("\n")}\n` } : { stdout: `${records[args.at(-1)]}\n` };
  const scope = await discoverProductionScope({ run });
  assert.deepEqual([scope.supabaseProject, scope.godelProject], ["supabase", "godel-production"]);
  assert.equal(scope.containers.some((record) => record.composeProject === "unrelated-dev"), false);
  const unchanged = compareProductionFingerprints(scope, { ...scope, containers: scope.containers.map((record) => record.composeProject === "unrelated-dev" ? { ...record, restart: 99 } : record) });
  assert.equal(unchanged.status, "UNCHANGED");
  const changed = compareProductionFingerprints(scope, { ...scope, containers: scope.containers.map((record) => record.composeProject === "supabase" && record.composeService === "db" ? { ...record, restart: 1 } : record) });
  assert.equal(changed.status, "PRODUCTION_FINGERPRINT_MISMATCH"); assert.equal(changed.differences[0].type, "RESTART_COUNT_CHANGED");
  const ambiguous = { ...records, "godel-worker": "/godel-worker|worker:1|0|healthy|godel-supabase-api,|godel-other|worker" };
  await assert.rejects(() => discoverProductionScope({ run: async (command, args) => command === "docker" && args[0] === "ps" ? { stdout: `${Object.keys(ambiguous).join("\n")}\n` } : { stdout: `${ambiguous[args.at(-1)]}\n` } }), /PRODUCTION_SCOPE_AMBIGUOUS/);
});

test("bounded subprocesses classify timeout without leaking command detail", async () => {
  const bounded = createBoundedRunner(async () => { const error = new Error("timed out"); error.code = "ETIMEDOUT"; throw error; });
  await assert.rejects(() => bounded("git", ["fetch"]), /SUBPROCESS_TIMEOUT:NETWORK_GIT/);
});

test("secret-generation status uses direct Node from the repository root with an allowlisted environment", () => {
  const environment = { PATH: "C:\\Windows\\System32", SystemRoot: "C:\\Windows", WINDIR: "C:\\Windows", ComSpec: "C:\\Windows\\System32\\cmd.exe", PATHEXT: ".EXE", TEMP: "C:\\Temp", TMP: "C:\\Temp", USERPROFILE: "C:\\Users\\test", JWT_SECRET: "sentinel", POSTGRES_PASSWORD: "sentinel", SERVICE_ROLE_KEY: "sentinel", ANON_KEY: "sentinel", GODEL_REHEARSAL_SENTINEL: "sentinel" };
  const invocation = createSecretGenerationStatusInvocation({ environment });
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[1], "status"); assert.equal(isAbsolute(invocation.args[0]), true);
  assert.match(invocation.args[0].replace(/\\/g, "/"), /scripts\/operations\/manage-secret-generations\.mjs$/);
  assert.equal(invocation.cwd, resolve(".")); assert.equal("shell" in invocation, false);
  assert.doesNotMatch(invocation.command, /\.(cmd|bat)$/i); assert.doesNotMatch(invocation.args.join(" "), /npm|cmd\.exe|powershell/i);
  for (const name of ["JWT_SECRET", "POSTGRES_PASSWORD", "SERVICE_ROLE_KEY", "ANON_KEY", "GODEL_REHEARSAL_SENTINEL"]) assert.equal(name in invocation.env, false);
});

test("production fingerprint invokes direct Node status and requires MATCH PASS", async () => {
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "docker" && args[0] === "ps") return { stdout: "supabase-db\ngodel-app\nunrelated\n" };
    if (command === "docker" && args[0] === "inspect") {
      const name = args.at(-1);
      const lines = { "supabase-db": "/supabase-db|supabase/postgres:17|0|healthy|supabase_default,godel-supabase-api,|supabase|db", "godel-app": "/godel-app|godel:current|0|healthy|godel-supabase-api,|godel-production|app", unrelated: "/unrelated|redis:7|9|healthy|other_default,|unrelated-dev|cache" };
      return { stdout: `${lines[name]}\n` };
    }
    if (command === process.execPath) return { stdout: "D5 status\nMATCH PASS\n" };
    throw new Error("UNEXPECTED_SUBPROCESS");
  };
  const fingerprint = await captureProductionFingerprint({ run, fetchImpl: async () => new Response("", { status: 200 }) });
  assert.equal(fingerprint.d5, "CURRENT_MATCH"); assert.equal(fingerprint.godel, "LIVE_READY");
  assert.equal(fingerprint.supabaseProject, "supabase"); assert.equal(fingerprint.godelProject, "godel-production"); assert.equal(fingerprint.containers.some((record) => record.composeProject === "unrelated-dev"), false);
  const status = calls.find((call) => call.command === process.execPath && call.args[1] === "status");
  assert.ok(status); assert.match(status.args[0].replace(/\\/g, "/"), /scripts\/operations\/manage-secret-generations\.mjs$/);
  assert.equal(status.options.cwd, resolve(".")); assert.doesNotMatch(calls.map((call) => call.command).join(" "), /npm(\.cmd)?/i);
  await assert.rejects(() => captureProductionFingerprint({ run: async (command, args) => command === "docker" ? { stdout: args[0] === "ps" ? "" : "" } : { stdout: "MISMATCH" }, fetchImpl: async () => new Response("", { status: 200 }) }), /PRODUCTION_SCOPE_SUPABASE_MISSING/);
});

test("structured update summary requires recognized numeric zero values", () => {
  assert.deepEqual(parseUpdateSummary({ stdout: nominalSummary }), { conflicts: 0, mergeFailures: 0 });
  assert.throws(() => parseUpdateSummary({ stdout: "Update applied. Summary:\nCONFLICTS: 1\nmerge failures: 0" }), /UPDATE_CONFLICT_OR_MERGE_FAILURE/);
  assert.throws(() => parseUpdateSummary({ stdout: "Update applied. Summary:\nCONFLICTS: 0\nmerge failures: 1" }), /UPDATE_CONFLICT_OR_MERGE_FAILURE/);
  assert.throws(() => parseUpdateSummary({ stdout: "update applied" }), /UPDATE_SUMMARY_UNRECOGNIZED/);
});

test("base and target overrides are version-specific and preserve isolation", () => {
  const base = createIsolationOverride({ project, services: ["db", "kong"], gatewayService: "kong" });
  const target = createIsolationOverride({ project, services: ["db", "api-gw"], gatewayService: "api-gw" });
  assert.match(base, /kong/); assert.doesNotMatch(base, /api-gw/); assert.match(target, /api-gw/);
  assert.equal(validateEffectiveCompose({ model: composeModel({ workspace: "C:\\temp" }), workspace: "C:\\temp", project }).dbHostPort, "CLOSED");
});

test("runtime Compose commands are project-scoped, explicit-env, no-build and no-pull", () => {
  const base = { composePath: "C:\\temp\\docker-compose.yml", overridePath: "C:\\temp\\base.override.yml", envFile: "C:\\temp\\.env", project, workspace: "C:\\temp" };
  const start = createRuntimeComposeInvocation({ ...base, action: "start" });
  assert.equal(start.args.includes("--no-build"), true); assert.deepEqual(start.args.slice(start.args.indexOf("--pull"), start.args.indexOf("--pull") + 2), ["--pull", "never"]);
  assert.equal(createRuntimeComposeInvocation({ ...base, action: "stop" }).args.includes("--volumes"), false);
  assert.equal(createRuntimeComposeInvocation({ ...base, action: "cleanup" }).args.includes("--volumes"), true);
  assert.equal(createExecutionComposeConfigInvocation(base).args.includes("--env-file"), true);
});

test("internal Kong probe runs in studio with the anonymous key from its environment", () => {
  const internal = createInternalKongProbeInvocation({ composePath: "x", overridePath: "y", envFile: "z", project, workspace: "C:\\temp" });
  assert.equal(internal.args.includes("studio"), true); assert.equal(internal.args.includes("node"), true);
  assert.match(internal.args.at(-1), /process\.env\.SUPABASE_ANON_KEY/); assert.match(internal.args.at(-1), /apikey/);
  assert.match(internal.args.at(-1), /response\.ok/);
  assert.doesNotMatch(internal.args.join(" "), /synthetic-anon/);
});

test("host-side readiness health uses only the anonymous apikey header", async () => {
  const calls = [];
  const protectedGateway = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response("", { status: options.headers?.apikey === credentials.anonKey ? 200 : 401 });
  };
  assert.equal((await protectedGateway("http://127.0.0.1:18080/auth/v1/health", {})).status, 401);
  const result = await waitForGateway({
    port: 18080,
    credentials,
    fetchImpl: protectedGateway,
    sleep: async () => {},
    timeoutMs: 100,
  });
  assert.equal(result, "PASS");
  assert.equal(calls.length > 1, true);
  assert.equal(calls.slice(1).every((call) => call.options.headers?.apikey === credentials.anonKey), true);
  assert.equal(calls.every((call) => !String(call.url).includes("apikey=")), true);
  assert.deepEqual(anonymousGatewayHeaders(credentials), { apikey: credentials.anonKey });
});

test("real update is frozen and non-dry", () => {
  const update = createRealUpdateInvocation({ runtime: "C:\\temp", jq: { directory: "C:\\jq" }, shell: { path: "C:\\git\\sh.exe", directory: "C:\\git" } });
  assert.deepEqual(update.args.slice(-5), ["--from", BASE.tag, "--to", TARGET.tag, "--yes"]); assert.equal(update.args.includes("--dry-run"), false);
});

test("Auth Admin write and read send apikey and authorization, without fabricated identifiers", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).includes("/auth/v1/health")) return new Response("", { status: options.headers?.apikey === credentials.anonKey ? 200 : 401 });
    if (String(url).includes("admin/users") && options.method === "POST") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (String(url).includes("object/") && !options.method) return new Response("fixture:test", { status: 200 });
    return new Response("{}", { status: 200 });
  };
  const compose = { composePath: "x", overridePath: "y", envFile: "z", env: {}, project, workspace: "C:\\temp" };
  const created = await createFixtures({ compose, runtime: "C:\\temp", port: 18080, project, workspace: "C:\\temp", credentials, generation: "test", run: async () => ({ stdout: "" }), fetchImpl });
  const adminCreate = calls.find((call) => String(call.url).includes("admin/users") && call.options.method === "POST");
  assert.equal(adminCreate.options.headers.apikey, credentials.serviceRoleKey); assert.equal(adminCreate.options.headers.authorization, `Bearer ${credentials.serviceRoleKey}`);
  await validateFixtures({ base: created.fingerprint, context: created.privateContext, compose, port: 18080, project, workspace: "C:\\temp", credentials, run: async () => ({ stdout: created.privateContext.rowValue }), fetchImpl });
  const adminRead = calls.find((call) => String(call.url).includes(`/admin/users/${created.privateContext.userIdentifier}`));
  assert.equal(adminRead.options.headers.apikey, credentials.serviceRoleKey); assert.equal(adminRead.options.headers.authorization, `Bearer ${credentials.serviceRoleKey}`);
  const healthCalls = calls.filter((call) => String(call.url).includes("/auth/v1/health"));
  assert.equal(healthCalls.length, 2); assert.equal(healthCalls.every((call) => call.options.headers?.apikey === credentials.anonKey), true);
  assert.equal(healthCalls.every((call) => !String(call.url).includes("apikey=")), true);
  await assert.rejects(() => createFixtures({ compose, runtime: "C:\\temp", port: 18080, project, workspace: "C:\\temp", credentials, generation: "test", run: async () => ({ stdout: "" }), fetchImpl: async () => new Response("{}", { status: 200 }) }), /AUTH_USER_IDENTIFIER_MISSING/);
});

test("fixture checkpoints are granular and a storage failure stops later BASE evidence", async () => {
  const checkpoint = async (phase) => checkpoints.push(phase);
  const compose = { composePath: "x", overridePath: "y", envFile: "z", env: {}, project, workspace: "C:\\temp" };
  const checkpoints = [];
  const fetchImpl = async (url, options = {}) => {
    if (String(url).includes("admin/users") && options.method === "POST") return new Response(JSON.stringify({ id: "user-1" }), { status: 200 });
    if (String(url).includes("auth/v1/health")) return new Response("", { status: 200 });
    return new Response("{}", { status: 200 });
  };
  await createFixtures({ compose, runtime: "C:\\temp", port: 18080, project, workspace: "C:\\temp", credentials, generation: "test", run: async () => ({ stdout: "" }), fetchImpl, checkpoint });
  assert.deepEqual(checkpoints, ["BASE_FIXTURE_DATABASE_PASS", "BASE_FIXTURE_AUTH_ADMIN_PASS", "BASE_FIXTURE_AUTH_SESSION_PASS", "BASE_FIXTURE_STORAGE_BUCKET_PASS", "BASE_FIXTURE_STORAGE_OBJECT_PASS", "BASE_FIXTURE_GATEWAY_PASS", "BASE_FIXTURE_INTERNAL_KONG_PASS"]);
  const failed = [];
  await assert.rejects(() => createFixtures({ compose, runtime: "C:\\temp", port: 18080, project, workspace: "C:\\temp", credentials, generation: "test", run: async () => ({ stdout: "" }), fetchImpl: async (url, options = {}) => String(url).includes("storage/v1/bucket") ? new Response("", { status: 502 }) : String(url).includes("admin/users") && options.method === "POST" ? new Response(JSON.stringify({ id: "user-1" }), { status: 200 }) : new Response("{}", { status: 200 }), checkpoint: async (phase) => failed.push(phase) }), /FIXTURE_HTTP_STORAGE_BUCKET_CREATE_502/);
  assert.equal(failed.includes("BASE_FIXTURE_STORAGE_OBJECT_PASS"), false); assert.equal(failed.includes("BASE_FIXTURE_GATEWAY_PASS"), false);
});

test("identity, prerequisite, pre-mutation target render and image failures prevent base startup", async () => {
  for (const overrides of [{ resolveExactTag: async () => { throw new Error("OFFICIAL_TAG_IDENTITY_MISMATCH"); } }, { resolveJq: async () => ({ status: "JQ_MISSING" }) }, { portProbe: async () => false }, { renderCompose: async () => { throw new Error("TARGET_PREVALIDATION_FAILED"); } }, { inspectImages: async () => ({ status: "IMAGE_MISSING", missing: ["kong/kong:3.9.3"] }) }]) {
    const options = executorOptions(overrides); const result = await executeHistoricalRehearsal(options);
    assert.equal(result.executorResult, "FAIL"); assert.equal(options.__calls.some((call) => call.args.includes("up")), false);
  }
});

test("conflict, unrecognized summary and target render failure prohibit target startup", async () => {
  for (const updateOutput of ["Update applied. Summary:\nCONFLICTS: 1\nmerge failures: 0", "Update applied. Summary:\nCONFLICTS: 0\nmerge failures: 1", "update applied"]) {
    const options = executorOptions();
    options.run = async (command, args, details) => { options.__calls.push({ command, args, options: details }); if (args.some((arg) => String(arg).endsWith("update.sh"))) return { stdout: updateOutput }; return { stdout: "" }; };
    const result = await executeHistoricalRehearsal(options);
    assert.match(result.blockedBy, /UPDATE_(CONFLICT_OR_MERGE_FAILURE|SUMMARY_UNRECOGNIZED)/); assert.equal(options.__calls.filter((call) => call.args.includes("up")).length, 1);
  }
  const badTarget = executorOptions({ renderCompose: async (invocation) => invocation.args.some((arg) => String(arg).includes("target-preflight")) ? composeModel({ target: true, workspace: invocation.cwd }) : invocation.args.some((arg) => String(arg).includes("target.override")) ? { ...composeModel({ target: true, workspace: invocation.cwd }), networks: { production: { external: true } } } : composeModel({ workspace: invocation.cwd }) });
  const result = await executeHistoricalRehearsal(badTarget);
  assert.match(result.blockedBy, /NETWORK_ISOLATION_INVALID/); assert.equal(badTarget.__calls.filter((call) => call.args.includes("up")).length, 1);
  const cleanup = badTarget.__calls.find((call) => call.args.includes("down") && call.args.includes("--volumes"));
  assert.equal(cleanup.args.some((arg) => String(arg).includes("base-source") && String(arg).includes("docker-compose.yml")), true);
  assert.equal(cleanup.args.some((arg) => String(arg).includes("base.override.yml")), true);
  assert.equal(cleanup.args.some((arg) => String(arg).includes("target.override.yml")), false);
});

test("a wrong post-update stamp prohibits target startup", async () => {
  const options = executorOptions();
  options.run = async (command, args, details) => {
    options.__calls.push({ command, args, options: details });
    if (args.some((arg) => String(arg).endsWith("update.sh"))) {
      const runtime = dirname(args[0]);
      await writeFile(join(runtime, ".supabase-version"), "ref=self-hosted/v0.7.2\n");
      return { stdout: nominalSummary };
    }
    return { stdout: "" };
  };
  const result = await executeHistoricalRehearsal(options);
  assert.match(result.blockedBy, /TARGET_STAMP_MISMATCH/);
  assert.equal(options.__calls.filter((call) => call.args.includes("up")).length, 1);
});

test("gateway identity is required before fixture operations", () => {
  assert.equal(assertRuntimeGatewayIdentity({ phase: "BASE", project, records: [{ project, service: "kong", image: "kong/kong:3.9.3", state: "running" }] }), "KONG_3_9_3");
  assert.equal(assertRuntimeGatewayIdentity({ phase: "TARGET", project, records: [{ project, service: "api-gw", image: "envoyproxy/envoy:v1.39.0", state: "running" }] }), "ENVOY_1_39_0");
  assert.throws(() => assertRuntimeGatewayIdentity({ phase: "BASE", project, records: [{ project, service: "api-gw", image: "envoyproxy/envoy:v1.39.0", state: "running" }] }), /RUNTIME_BASE_GATEWAY_IDENTITY_INVALID/);
  assert.throws(() => assertRuntimeGatewayIdentity({ phase: "TARGET", project, records: [{ project: "godel-sh044c-rehearsal-other", service: "api-gw", image: "envoyproxy/envoy:v1.39.0", state: "running" }] }), /RUNTIME_TARGET_GATEWAY_IDENTITY_INVALID/);
  assert.throws(() => assertRuntimeGatewayIdentity({ phase: "TARGET", project, records: [{ project, service: "api-gw", image: "envoyproxy/envoy:wrong", state: "running" }] }), /RUNTIME_TARGET_GATEWAY_IDENTITY_INVALID/);
  assert.throws(() => assertRuntimeGatewayIdentity({ phase: "TARGET", project, records: [{ project, service: "api-gw", image: "envoyproxy/envoy:v1.39.0", state: "running" }, { project, service: "kong", image: "kong/kong:3.9.3", state: "running" }] }), /RUNTIME_TARGET_GATEWAY_IDENTITY_INVALID/);
});

test("cleanup is attempted after a partial base start and workspace is retained when residue remains", async () => {
  let workspace;
  const options = executorOptions({ createWorkspace: async () => { workspace = await mkdtemp(join(tmpdir(), "sh044c-test-")); return workspace; }, auditProjectResidue: async () => ({ containers: ["leftover"], networks: [], volumes: [] }), fallbackProjectCleanup: async () => {} });
  options.run = async (command, args, details) => { options.__calls.push({ command, args, options: details }); if (args.includes("up")) throw new Error("PARTIAL_START_FAILURE"); return { stdout: "" }; };
  const result = await executeHistoricalRehearsal(options);
  assert.equal(result.dockerMutationAttempted, true); assert.equal(options.__calls.some((call) => call.args.includes("down") && call.args.includes("--volumes")), true); assert.equal(result.cleanup, "CLEANUP_FAIL");
  await access(workspace);
  await rm(workspace, { recursive: true, force: true });
});

test("project residue queries use the exact Compose project label", () => {
  for (const call of createProjectResidueAuditInvocations(project)) assert.equal(call.args.includes(`label=com.docker.compose.project=${project}`), true);
});

test("fallback cleanup requires both exact label ownership and expected rehearsal identities", async () => {
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args });
    if (args[0] === "ps" && args.includes("-a")) return { stdout: `${project}-db\n` };
    if (args[0] === "network" && args[1] === "ls") return { stdout: `${project}_default\n` };
    if (args[0] === "volume" && args[1] === "ls") return { stdout: `${project}-db-config\n${project}-deno-cache\n` };
    return { stdout: "" };
  };
  await fallbackProjectCleanup({ project, services: ["db", "kong", "api-gw"], run });
  for (const call of calls.filter((call) => call.args.includes("--filter"))) assert.equal(call.args.includes(`label=com.docker.compose.project=${project}`), true);
  assert.equal(calls.some((call) => call.args.includes("prune")), false);
  await assert.rejects(() => fallbackProjectCleanup({ project, services: ["db"], run: async (_command, args) => args[0] === "ps" ? { stdout: "other-project-db\n" } : { stdout: "" } }), /CLEANUP_RESIDUE_IDENTITY_REJECTED/);
});

test("fixture comparison detects changed database, storage and auth state", () => {
  assert.equal(compareFixtureFingerprints(fixture, fixture).status, "PASS");
  assert.equal(compareFixtureFingerprints(fixture, { ...fixture, database: { ...fixture.database, rowDigest: "changed" } }).database, false);
  assert.equal(compareFixtureFingerprints(fixture, { ...fixture, storage: { ...fixture.storage, sha256: "changed" } }).storage, false);
  assert.equal(compareFixtureFingerprints(fixture, { ...fixture, auth: { ...fixture.auth, session: "FAIL" } }).auth, false);
});

test("successful injected lifecycle validates both snapshots, identities, cleanup, authenticated readiness continuity, and omits secrets", async () => {
  const options = executorOptions(); const readinessCredentials = []; let waits = 0;
  options.waitForRuntime = async ({ credentials: readiness }) => { readinessCredentials.push(readiness); waits += 1; if (waits === 2) options.__setRuntimePhase("TARGET"); return "PASS"; };
  const result = await executeHistoricalRehearsal(options);
  assert.equal(result.executorResult, "EXECUTION_PASS", result.blockedBy); assert.equal(result.targetComposePreMutation.gateway, "api-gw");
  assert.equal(result.baseRuntimeGateway, "KONG_3_9_3"); assert.equal(result.targetRuntimeGateway, "ENVOY_1_39_0"); assert.deepEqual(result.cleanupAudit, { containers: 0, networks: 0, volumes: 0 });
  assert.equal(readinessCredentials.length, 2); assert.strictEqual(readinessCredentials[0], readinessCredentials[1]);
  assert.equal(typeof readinessCredentials[0].anonKey, "string");
  assert.doesNotMatch(JSON.stringify(result), new RegExp(readinessCredentials[0].anonKey, "g")); assert.doesNotMatch(JSON.stringify(result), new RegExp(readinessCredentials[0].serviceRoleKey, "g"));
  assert.doesNotMatch(JSON.stringify(result), /Bearer |JWT_SECRET|POSTGRES_PASSWORD|access_token|refresh_token/); assert.equal(options.__calls.filter((call) => call.args.includes("up")).length, 2);
});

test("base-only fixture probe runs only BASE, compares production, and cleans isolated resources", async () => {
  const options = executorOptions({ acknowledged: false, baseFixtureProbe: true });
  const result = await executeHistoricalRehearsal(options);
  assert.equal(result.executorResult, "BASE_FIXTURE_PROBE_PASS", result.blockedBy);
  assert.equal(result.dockerMutationAttempted, true); assert.equal(result.cleanup, "CLEANUP_PASS");
  assert.equal(options.__calls.filter((call) => call.args.includes("up")).length, 1);
  assert.equal(options.__calls.some((call) => call.args.some((arg) => String(arg).endsWith("update.sh"))), false);
  assert.equal(options.__calls.filter((call) => call.args.includes("down") && call.args.includes("--volumes")).length, 1);
});

test("pre-runtime probe emits safe checkpoints, retains its journal through executor return, and never mutates Docker", async () => {
  const checkpoints = [];
  const options = executorOptions({ acknowledged: false, preRuntimeProbe: true, checkpointSink: (line) => checkpoints.push(line), createCheckpointEmitter: async ({ sink }) => ({ journal: join(tmpdir(), "sh044c-pre-runtime-journal"), emit: async (phase, status, detail) => sink(`SH044C_CHECKPOINT ${JSON.stringify({ phase, status, detail })}`) }) });
  const result = await executeHistoricalRehearsal(options);
  assert.equal(result.executorResult, "PRE_RUNTIME_PASS", result.blockedBy); assert.equal(result.executionReadiness, "READY"); assert.equal(result.dockerMutationAttempted, false); assert.equal(result.cleanup, "CLEANUP_PASS"); assert.equal(result.incidentJournal, "PENDING_SUCCESS_OUTPUT_CLEANUP");
  assert.equal(options.__calls.some((call) => call.args.includes("up") || call.args.includes("down") || call.args.some((arg) => String(arg).endsWith("update.sh"))), false);
  const phases = checkpoints.join("\n");
  for (const phase of ["EXECUTOR_START", "BASE_IDENTITY", "TARGET_IDENTITY", "PRE_RUNTIME_READY", "CLEANUP_PASS", "EXECUTOR_COMPLETE", "FINAL_RESULT_READY"]) assert.match(phases, new RegExp(`"phase":"${phase}"`));
  assert.match(phases, /"phase":"FINAL_RESULT_READY","status":"PRE_RUNTIME_PASS"/);
  assert.doesNotMatch(phases, /synthetic-anon|synthetic-service-role|JWT_SECRET|POSTGRES_PASSWORD/);
});

test("successful executor return keeps its exact incident journal until final-output orchestration", async () => {
  const generation = "a1b2c3d4e5f6";
  const journal = join(tmpdir(), "godel-sh044c-evidence", `${generation}.jsonl`);
  await rm(journal, { force: true });
  const exactProject = `godel-sh044c-rehearsal-${generation}`;
  const options = executorOptions({
    acknowledged: false,
    preRuntimeProbe: true,
    generation,
    renderCompose: async (invocation) => {
      const model = composeModel({ target: invocation.args.some((arg) => String(arg).includes("target")), workspace: invocation.cwd });
      for (const service of Object.values(model.services)) service.container_name = service.container_name.replace(project, exactProject);
      return model;
    },
  });
  delete options.createCheckpointEmitter;
  const result = await executeHistoricalRehearsal(options);
  assert.equal(result.executorResult, "PRE_RUNTIME_PASS", result.blockedBy);
  assert.equal(result.incidentJournal, "PENDING_SUCCESS_OUTPUT_CLEANUP");
  assert.equal(getInternalJournal(result).journal, journal);
  await access(journal);
  const contents = await readFile(journal, "utf8");
  assert.match(contents, /"phase":"FINAL_RESULT_READY","status":"PRE_RUNTIME_PASS"/);
  const finalCheckpointLine = contents.trim().split(/\r?\n/).find((line) => JSON.parse(line).phase === "FINAL_RESULT_READY");
  const finalCheckpoint = JSON.parse(finalCheckpointLine);
  assert.deepEqual(Object.keys(finalCheckpoint.detail).sort(), ["cleanup", "dockerMutationAttempted", "executionReadiness", "executorResult"]);
  assert.doesNotMatch(contents, /synthetic-anon|synthetic-service-role|JWT_SECRET|POSTGRES_PASSWORD|Bearer|apikey/);
  await rm(journal, { force: true });
});

test("final output is awaitable and its ordering precedes exact success-journal removal", async () => {
  const order = [];
  const checkpoints = [];
  const options = executorOptions({
    acknowledged: false,
    preRuntimeProbe: true,
    checkpointSink: (line) => { checkpoints.push(line); if (line.includes("FINAL_RESULT_READY")) order.push("FINAL_RESULT_READY"); },
    createCheckpointEmitter: async ({ sink }) => ({ journal: join(tmpdir(), "sh044c-ordering-journal"), emit: async (phase, status, detail) => sink(`SH044C_CHECKPOINT ${JSON.stringify({ phase, status, detail })}`) }),
  });
  const result = await executeHistoricalRehearsal(options);
  const completion = await finalizeExecutorOutput({
    result,
    write: async () => { order.push("WRITE_FINAL_JSON"); },
    remove: async () => { order.push("REMOVE_SUCCESS_JOURNAL"); },
    acknowledge: () => { order.push("JOURNAL_CLEANUP_ACK"); },
  });
  assert.deepEqual(order, ["FINAL_RESULT_READY", "WRITE_FINAL_JSON", "REMOVE_SUCCESS_JOURNAL", "JOURNAL_CLEANUP_ACK"]);
  assert.deepEqual(completion, { finalOutput: "WRITTEN", journalCleanup: "REMOVED" });
  assert.match(checkpoints.join("\n"), /"phase":"FINAL_RESULT_READY","status":"PRE_RUNTIME_PASS"/);
  let payload = "";
  await writeFinalJson({ executorResult: "PRE_RUNTIME_PASS" }, { write: (chunk, callback) => { payload += chunk; queueMicrotask(callback); return true; } });
  assert.equal(payload.endsWith("\n"), true); assert.deepEqual(JSON.parse(payload), { executorResult: "PRE_RUNTIME_PASS" });
});

test("final output failure retains the incident journal and skips deletion", async () => {
  const journal = join(tmpdir(), "sh044c-output-failure-journal");
  await writeFile(journal, "checkpoint\n");
  const options = executorOptions({ acknowledged: false, preRuntimeProbe: true, createCheckpointEmitter: async () => ({ journal, emit: async () => {} }) });
  const result = await executeHistoricalRehearsal(options);
  let removeAttempts = 0;
  const completion = await finalizeExecutorOutput({ result, write: async () => { throw new Error("stdout unavailable"); }, remove: async () => { removeAttempts += 1; } });
  assert.deepEqual(completion, { finalOutput: "FINAL_OUTPUT_FAILED", journalCleanup: "RETAINED" });
  assert.equal(removeAttempts, 0); await access(journal); await rm(journal, { force: true });
  assert.equal(result.dockerMutationAttempted, false);
});

test("journal delete failure is safely acknowledged without changing a successful executor result", async () => {
  const journal = join(tmpdir(), "sh044c-delete-failure-journal");
  await writeFile(journal, "checkpoint\n");
  const options = executorOptions({ acknowledged: false, preRuntimeProbe: true, createCheckpointEmitter: async () => ({ journal, emit: async () => {} }) });
  const result = await executeHistoricalRehearsal(options);
  const acknowledgements = [];
  const completion = await finalizeExecutorOutput({ result, write: async () => {}, remove: async () => { throw new Error("locked"); }, acknowledge: (line) => acknowledgements.push(line) });
  assert.deepEqual(completion, { finalOutput: "WRITTEN", journalCleanup: "RETAINED" });
  assert.equal(result.executorResult, "PRE_RUNTIME_PASS"); assert.deepEqual(acknowledgements, ['SH044C_JOURNAL_CLEANUP {"status":"RETAINED"}']);
  await access(journal); await rm(journal, { force: true });
});

test("success-journal deletion accepts only the exact generated evidence path", async () => {
  const generation = "f1e2d3c4b5a6";
  const journal = join(tmpdir(), "godel-sh044c-evidence", `${generation}.jsonl`);
  await mkdir(dirname(journal), { recursive: true }); await writeFile(journal, "checkpoint\n");
  await assert.rejects(() => removeSuccessJournal({ generation, journal: join(tmpdir(), `${generation}.jsonl`) }), /INCIDENT_JOURNAL_PATH_INVALID/);
  await access(journal); await removeSuccessJournal({ generation, journal });
  await assert.rejects(() => access(journal));
});

test("timed-out snapshot returns final JSON-compatible failure before Docker mutation", async () => {
  const checkpoints = [];
  const options = executorOptions({ preRuntimeProbe: true, acknowledged: false, checkpointSink: (line) => checkpoints.push(line), createCheckpointEmitter: async ({ sink }) => ({ journal: join(tmpdir(), "sh044c-timeout-journal"), emit: async (phase, status, detail) => sink(`SH044C_CHECKPOINT ${JSON.stringify({ phase, status, detail })}`) }), run: async () => { const error = new Error("timed out"); error.code = "ETIMEDOUT"; throw error; }, materializeSnapshot: async ({ run }) => run("git", ["fetch"]) });
  const result = await executeHistoricalRehearsal(options);
  assert.equal(result.executorResult, "FAIL"); assert.match(result.blockedBy, /SUBPROCESS_TIMEOUT:NETWORK_GIT/); assert.equal(result.dockerMutationAttempted, false); assert.equal(result.cleanup, "CLEANUP_PASS");
  assert.match(checkpoints.join("\n"), /"phase":"FINAL_RESULT_READY","status":"FAIL"/);
});

test("production fingerprint mismatch fails after the controlled target phase", async () => {
  let reads = 0;
  const options = executorOptions({ productionFingerprint: async () => ({ containers: [], d5: "CURRENT_MATCH", godel: reads++ ? "CHANGED" : "LIVE_READY" }) });
  let waits = 0;
  options.waitForRuntime = async () => { waits += 1; if (waits === 2) options.__setRuntimePhase("TARGET"); return "PASS"; };
  const result = await executeHistoricalRehearsal(options);
  assert.equal(result.executorResult, "FAIL"); assert.match(result.blockedBy, /PRODUCTION_FINGERPRINT_MISMATCH/); assert.equal(result.cleanup, "CLEANUP_PASS");
});

test("cleanup ownership is exact and never accepts a broad project", () => {
  assert.throws(() => createRuntimeComposeInvocation({ composePath: "x", overridePath: "y", envFile: "z", project: "supabase", workspace: "C:\\temp", action: "cleanup" }), /CLEANUP_PROJECT_REJECTED/);
});
