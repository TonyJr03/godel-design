import { execFile as execFileCallback } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { appendFile, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { BASE, TARGET, REHEARSAL_PREFIX, allowlistedEnvironment, assertCleanupProject, composeEnvironment, createCleanupContract, createFixtureContract, createGatewayPortContract, createIsolationOverride, imagesFromCompose, inspectImages, listProductionContainers, materializeSnapshot, resolveExactTag, resolveJq, resolveShell, safeGeneration, safeProductionFingerprint, servicesFromSource, validateEffectiveCompose, writeSyntheticRuntimeEnv } from "./supabase-update-rehearsal.mjs";

const execFile = promisify(execFileCallback);
const ACKNOWLEDGEMENT = "--execute-isolated-historical-rehearsal";
const REPOSITORY = "https://github.com/supabase/supabase.git";
const READY_TIMEOUT_MS = 60_000;
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SECRET_GENERATION_STATUS_SCRIPT = join(REPOSITORY_ROOT, "scripts", "operations", "manage-secret-generations.mjs");
const EVIDENCE_DIRECTORY = join(tmpdir(), "godel-sh044c-evidence");
const TIMEOUTS = Object.freeze({ LOCAL_READ: 30_000, COMPOSE_CONFIG: 60_000, NETWORK_GIT: 180_000, COMPOSE_MUTATION: 180_000, FIXTURE_COMMAND: 60_000, REAL_UPDATE: 600_000 });
const INTERNAL_JOURNAL = Symbol("sh044cIncidentJournal");
const REQUIRED_FIXTURE_SERVICES = Object.freeze({ BASE: ["db", "auth", "rest", "storage", "kong"], TARGET: ["db", "auth", "rest", "storage", "api-gw"] });
const REQUIRED_SERVICE_TIMEOUT_MS = 120_000;

function fail(code) { throw new Error(code); }
function safeError(value) { return String(value?.message ?? value).replace(/[A-Za-z]:\\[^\s:]+/g, "<path>").replace(/(?:Bearer|apikey|authorization)[=: ]+[^\s,]+/gi, "<credential>").replace(/[\r\n]+/g, " ").slice(0, 180); }
function syntheticHex(bytes = 12) { return randomBytes(bytes).toString("hex"); }
function syntheticPassword() { return randomBytes(24).toString("base64url"); }
function runtimePath(workspace) { return join(workspace, "runtime"); }
function gatewayUrl(port) { return `http://127.0.0.1:${port}`; }
function serviceRoleHeaders(credentials, contentType = "application/json") { return { apikey: credentials.serviceRoleKey, authorization: `Bearer ${credentials.serviceRoleKey}`, "content-type": contentType }; }
function timeoutClass(command, args = []) {
  if (command === "git") return "NETWORK_GIT";
  if (String(args[0] ?? "").endsWith("update.sh")) return "REAL_UPDATE";
  if (command === "docker" && args[0] === "compose" && args.includes("config")) return "COMPOSE_CONFIG";
  if (command === "docker" && args[0] === "compose" && (args.includes("up") || args.includes("down"))) return "COMPOSE_MUTATION";
  if (command === "docker" && args[0] === "compose" && args.includes("exec")) return "FIXTURE_COMMAND";
  return "LOCAL_READ";
}
function isTimeout(error) { return error?.code === "ETIMEDOUT" || error?.killed === true || /timed?\s*out/i.test(String(error?.message ?? "")); }
export function createBoundedRunner(run = execFile) {
  return async (command, args, options = {}) => {
    const phase = timeoutClass(command, args);
    try { return await run(command, args, { ...options, timeout: options.timeout ?? TIMEOUTS[phase] }); }
    catch (error) { if (isTimeout(error)) fail(`SUBPROCESS_TIMEOUT:${phase}`); throw error; }
  };
}
function safeCheckpointDetail(detail) {
  if (detail === undefined) return undefined;
  const text = typeof detail === "string" ? detail : JSON.stringify(detail);
  if (/ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|POSTGRES_PASSWORD|Bearer\s|access_token|refresh_token|apikey[=:]|[A-Za-z]:\\/i.test(text)) return "REDACTED";
  return detail;
}
export async function createCheckpointEmitter({ generation, sink = (line) => process.stderr.write(`${line}\n`) } = {}) {
  const journal = join(EVIDENCE_DIRECTORY, `${generation}.jsonl`);
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  return {
    journal,
    async emit(phase, status, detail) {
      const event = { phase, status, ...(safeCheckpointDetail(detail) === undefined ? {} : { detail: safeCheckpointDetail(detail) }) };
      const line = `SH044C_CHECKPOINT ${JSON.stringify(event)}`;
      sink(line); await appendFile(journal, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
    },
  };
}

function attachInternalJournal(result, { generation, journal }) {
  Object.defineProperty(result, INTERNAL_JOURNAL, { enumerable: false, value: { generation, journal } });
  return result;
}

export function getInternalJournal(result) { return result?.[INTERNAL_JOURNAL]; }

function assertExactJournal({ generation, journal }) {
  if (!/^[a-f0-9]{12}$/.test(generation)) fail("INCIDENT_JOURNAL_GENERATION_INVALID");
  const expected = join(EVIDENCE_DIRECTORY, `${generation}.jsonl`);
  if (resolve(journal) !== resolve(expected) || resolve(dirname(journal)) !== resolve(EVIDENCE_DIRECTORY)) fail("INCIDENT_JOURNAL_PATH_INVALID");
}

export async function removeSuccessJournal({ generation, journal }) {
  assertExactJournal({ generation, journal });
  await rm(journal, { force: true });
}

export async function writeFinalJson(result, stdout = process.stdout) {
  const payload = `${JSON.stringify(result, null, 2)}\n`;
  await new Promise((resolveWrite, rejectWrite) => {
    try { stdout.write(payload, (error) => error ? rejectWrite(error) : resolveWrite()); }
    catch (error) { rejectWrite(error); }
  });
}

export async function finalizeExecutorOutput({ result, write = writeFinalJson, remove = removeSuccessJournal, acknowledge = (line) => process.stderr.write(`${line}\n`) }) {
  try { await write(result); }
  catch { return { finalOutput: "FINAL_OUTPUT_FAILED", journalCleanup: "RETAINED" }; }
  if (!["EXECUTION_PASS", "PRE_RUNTIME_PASS", "BASE_FIXTURE_PROBE_PASS"].includes(result.executorResult)) return { finalOutput: "WRITTEN", journalCleanup: "RETAINED" };
  const journal = getInternalJournal(result);
  if (!journal) return { finalOutput: "WRITTEN", journalCleanup: "RETAINED" };
  try {
    await remove(journal);
    acknowledge('SH044C_JOURNAL_CLEANUP {"status":"REMOVED"}');
    return { finalOutput: "WRITTEN", journalCleanup: "REMOVED" };
  } catch {
    acknowledge('SH044C_JOURNAL_CLEANUP {"status":"RETAINED"}');
    return { finalOutput: "WRITTEN", journalCleanup: "RETAINED" };
  }
}
export function anonymousGatewayHeaders(credentials) {
  if (!credentials?.anonKey) fail("HEALTH_ANON_KEY_MISSING");
  return { apikey: credentials.anonKey };
}

export function createSecretGenerationStatusInvocation({ environment = process.env } = {}) {
  return {
    command: process.execPath,
    args: [SECRET_GENERATION_STATUS_SCRIPT, "status"],
    cwd: REPOSITORY_ROOT,
    env: allowlistedEnvironment({ environment }),
    windowsHide: true,
  };
}

export function parseUpdateSummary(output) {
  const text = `${output?.stdout ?? ""}\n${output?.stderr ?? ""}`;
  if (!/Update applied\. Summary:/i.test(text)) fail("UPDATE_SUMMARY_UNRECOGNIZED");
  const conflicts = /^\s*CONFLICTS:\s*(\d+)\s*$/im.exec(text);
  const mergeFailures = /^\s*merge failures:\s*(\d+)\s*$/im.exec(text);
  if (!conflicts || !mergeFailures) fail("UPDATE_SUMMARY_UNRECOGNIZED");
  const summary = { conflicts: Number(conflicts[1]), mergeFailures: Number(mergeFailures[1]) };
  if (summary.conflicts !== 0 || summary.mergeFailures !== 0) fail("UPDATE_CONFLICT_OR_MERGE_FAILURE");
  return summary;
}

export function parseExecutorArguments(args) {
  const options = { acknowledged: false, preRuntimeProbe: false, baseFixtureProbe: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === ACKNOWLEDGEMENT) { options.acknowledged = true; continue; }
    if (argument === "--pre-runtime-probe") { options.preRuntimeProbe = true; continue; }
    if (argument === "--execute-isolated-base-fixture-probe") { options.baseFixtureProbe = true; continue; }
    if (["--jq", "--sh", "--port"].includes(argument) && args[index + 1]) {
      const key = argument === "--jq" ? "jqBin" : argument === "--sh" ? "shBin" : "port";
      options[key] = argument === "--port" ? Number(args[index + 1]) : args[index + 1];
      index += 1;
      continue;
    }
    fail("USAGE: npm run ops:supabase:update:rehearsal:execute -- --execute-isolated-historical-rehearsal --jq <verified-path> [--port <safe-port>] [--sh <path>]");
  }
  if ([options.acknowledged, options.preRuntimeProbe, options.baseFixtureProbe].filter(Boolean).length > 1) fail("USAGE: execution acknowledgement, --pre-runtime-probe, and --execute-isolated-base-fixture-probe are mutually exclusive");
  return options;
}

export function createRuntimeComposeInvocation({ composePath, overridePath, envFile, project, workspace, action }) {
  assertCleanupProject(project);
  const common = ["compose", "--env-file", envFile, "-p", project, "-f", composePath, "-f", overridePath];
  const args = action === "start"
    ? [...common, "up", "--detach", "--no-build", "--pull", "never", "--remove-orphans"]
    : action === "stop"
      ? [...common, "down", "--remove-orphans"]
      : action === "cleanup"
        ? [...common, "down", "--volumes", "--remove-orphans"]
        : fail("RUNTIME_COMPOSE_ACTION_INVALID");
  return { command: "docker", args, cwd: workspace, env: { ...composeEnvironment(), COMPOSE_DISABLE_ENV_FILE: "1", COMPOSE_PROJECT_NAME: project } };
}

export function createExecutionComposeConfigInvocation({ composePath, overridePath, envFile, project, workspace }) {
  assertCleanupProject(project);
  return { command: "docker", args: ["compose", "--env-file", envFile, "-p", project, "-f", composePath, "-f", overridePath, "config", "--format", "json"], cwd: workspace, env: { ...composeEnvironment(), COMPOSE_DISABLE_ENV_FILE: "1", COMPOSE_PROJECT_NAME: project } };
}

export function createRealUpdateInvocation({ runtime, jq, shell, repository = REPOSITORY }) {
  return { command: shell.path, args: [join(runtime, "update.sh"), "--from", BASE.tag, "--to", TARGET.tag, "--yes"], cwd: runtime, env: { ...allowlistedEnvironment({ jqDirectory: jq.directory, shellDirectory: shell.directory }), SUPABASE_REPO_URL: repository } };
}

export function createInternalKongProbeInvocation({ composePath, overridePath, envFile, project, workspace }) {
  assertCleanupProject(project);
  const probe = "fetch('http://kong:8000/auth/v1/health',{headers:{apikey:process.env.SUPABASE_ANON_KEY}}).then((response)=>{process.exitCode=response.ok?0:1}).catch(()=>{process.exitCode=1})";
  return { command: "docker", args: ["compose", "--env-file", envFile, "-p", project, "-f", composePath, "-f", overridePath, "exec", "-T", "studio", "node", "-e", probe], cwd: workspace, env: { ...composeEnvironment(), COMPOSE_DISABLE_ENV_FILE: "1", COMPOSE_PROJECT_NAME: project } };
}

export function createProjectResidueAuditInvocations(project) {
  assertCleanupProject(project);
  const label = `com.docker.compose.project=${project}`;
  return [
    { kind: "containers", command: "docker", args: ["ps", "-aq", "--filter", `label=${label}`] },
    { kind: "networks", command: "docker", args: ["network", "ls", "-q", "--filter", `label=${label}`] },
    { kind: "volumes", command: "docker", args: ["volume", "ls", "-q", "--filter", `label=${label}`] },
  ];
}

async function auditProjectResidue({ project, run }) {
  const audit = {};
  for (const invocation of createProjectResidueAuditInvocations(project)) {
    const output = await run(invocation.command, invocation.args, { env: composeEnvironment(), windowsHide: true });
    audit[invocation.kind] = String(output.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  return audit;
}

function residueCount(residue) { return Object.values(residue).reduce((total, entries) => total + entries.length, 0); }

export async function fallbackProjectCleanup({ project, services, run }) {
  assertCleanupProject(project);
  const expected = new Set(services.map((service) => `${project}-${service}`));
  const label = `com.docker.compose.project=${project}`;
  const containers = await run("docker", ["ps", "-a", "--format", "{{.Names}}", "--filter", `label=${label}`], { env: composeEnvironment(), windowsHide: true });
  const names = String(containers.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (names.some((name) => !expected.has(name))) fail("CLEANUP_RESIDUE_IDENTITY_REJECTED");
  if (names.length) await run("docker", ["rm", "-f", ...names], { env: composeEnvironment(), windowsHide: true });
  const expectedNetworks = new Set([`${project}_default`]);
  const networks = await run("docker", ["network", "ls", "--format", "{{.Name}}", "--filter", `label=${label}`], { env: composeEnvironment(), windowsHide: true });
  const networkNames = String(networks.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (networkNames.some((name) => !expectedNetworks.has(name))) fail("CLEANUP_RESIDUE_IDENTITY_REJECTED");
  if (networkNames.length) await run("docker", ["network", "rm", ...networkNames], { env: composeEnvironment(), windowsHide: true });
  const expectedVolumes = new Set([`${project}-db-config`, `${project}-deno-cache`]);
  const volumes = await run("docker", ["volume", "ls", "--format", "{{.Name}}", "--filter", `label=${label}`], { env: composeEnvironment(), windowsHide: true });
  const volumeNames = String(volumes.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (volumeNames.some((name) => !expectedVolumes.has(name))) fail("CLEANUP_RESIDUE_IDENTITY_REJECTED");
  if (volumeNames.length) await run("docker", ["volume", "rm", ...volumeNames], { env: composeEnvironment(), windowsHide: true });
}

export function assertRuntimeGatewayIdentity({ phase, records, project }) {
  assertCleanupProject(project);
  const services = new Map(records.map((record) => [record.service, record]));
  const present = (service, image) => services.get(service)?.project === project && services.get(service)?.image === image && services.get(service)?.state === "running";
  const absent = (service) => !services.has(service);
  const valid = phase === "BASE"
    ? present("kong", "kong/kong:3.9.3") && absent("api-gw")
    : phase === "TARGET"
      ? present("api-gw", "envoyproxy/envoy:v1.39.0") && absent("kong")
      : false;
  if (!valid) fail(`RUNTIME_${phase}_GATEWAY_IDENTITY_INVALID`);
  return phase === "BASE" ? "KONG_3_9_3" : "ENVOY_1_39_0";
}

async function inspectRuntimeGateway({ project, run }) {
  assertCleanupProject(project);
  const output = await run("docker", ["ps", "--format", "{{.Label \"com.docker.compose.project\"}}|{{.Label \"com.docker.compose.service\"}}|{{.Image}}|{{.State}}", "--filter", `label=com.docker.compose.project=${project}`], { env: composeEnvironment(), windowsHide: true });
  return String(output.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [recordProject, service, image, state] = line.split("|");
    return { project: recordProject, service, image, state };
  });
}

export function requiredFixtureServices(phase) {
  const required = REQUIRED_FIXTURE_SERVICES[phase];
  if (!required) fail("RUNTIME_PHASE_INVALID");
  return required;
}

export function assertFixtureDependencyHealthchecks({ model, phase }) {
  for (const service of requiredFixtureServices(phase)) if (!model?.services?.[service]?.healthcheck) fail(`FIXTURE_DEPENDENCY_HEALTHCHECK_MISSING:${service}`);
  return "PASS";
}

export async function readProjectServiceHealth({ project, run = execFile }) {
  assertCleanupProject(project);
  const output = await run("docker", ["ps", "-a", "--format", "{{.Label \"com.docker.compose.service\"}}|{{.State}}|{{.HealthStatus}}|{{.Image}}", "--filter", `label=com.docker.compose.project=${project}`], { env: composeEnvironment(), windowsHide: true });
  return String(output.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [service, state, health, image] = line.split("|"); return { service, state, health: health || "NONE", image };
  });
}

export async function waitForRequiredServicesHealthy({ phase, project, run = execFile, readServices = readProjectServiceHealth, sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)), timeoutMs = REQUIRED_SERVICE_TIMEOUT_MS }) {
  const required = requiredFixtureServices(phase), deadline = Date.now() + timeoutMs;
  while (true) {
    const records = await readServices({ project, run }), byService = new Map(records.map((record) => [record.service, record]));
    for (const service of required) {
      const record = byService.get(service);
      if (!record) fail(`RUNTIME_REQUIRED_SERVICE_MISSING:${service}`);
      if (record.state !== "running" || record.health === "unhealthy" || record.health === "NONE") fail(`RUNTIME_REQUIRED_SERVICE_UNHEALTHY:${service}`);
    }
    if (required.every((service) => byService.get(service).health === "healthy")) return "PASS";
    if (Date.now() >= deadline) fail("RUNTIME_REQUIRED_SERVICES_TIMEOUT");
    await sleep(1_000);
  }
}

export function compareFixtureFingerprints(base, target) {
  const database = base?.database?.rowDigest === target?.database?.rowDigest;
  const storage = base?.storage?.size === target?.storage?.size && base?.storage?.sha256 === target?.storage?.sha256;
  const auth = base?.auth?.userIdentifier === target?.auth?.userIdentifier && target?.auth?.session === "PASS";
  const gateway = target?.gateway?.loopback === "PASS" && target?.gateway?.internalKong === "PASS";
  return { database, storage, auth, gateway, status: database && storage && auth && gateway ? "PASS" : "FAIL" };
}

export async function probePortAvailable(port) {
  createGatewayPortContract(port);
  return new Promise((resolveProbe) => {
    const server = net.createServer();
    const finish = (available) => server.close(() => resolveProbe(available));
    server.once("error", () => resolveProbe(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => finish(true));
  });
}

async function renderExecutionCompose(invocation, run) {
  const output = await run(invocation.command, invocation.args, { cwd: invocation.cwd, env: invocation.env, windowsHide: true });
  return JSON.parse(output.stdout);
}

export async function waitForGateway({ port, credentials, fetchImpl = fetch, sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)), timeoutMs = READY_TIMEOUT_MS }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`${gatewayUrl(port)}/auth/v1/health`, { headers: anonymousGatewayHeaders(credentials), signal: AbortSignal.timeout(5_000) });
      if (response.ok) return "PASS";
    } catch { /* bounded retry */ }
    await sleep(1_000);
  }
  fail("RUNTIME_READINESS_TIMEOUT");
}

export async function fetchFixtureJson({ operation, fetchImpl, url, options }) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) fail(`FIXTURE_HTTP_${operation}_${response.status}`);
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

function normalizeProductionRecord(line) {
  const [name, image, restart = "0", health = "UNKNOWN", networks = "", composeProject = "", composeService = ""] = line.split("|");
  return { name, image, restart: Number(restart), health, networks: networks.split(",").filter(Boolean).sort(), composeProject, composeService };
}
function productionRecordKey(record) { return `${record.composeProject}|${record.composeService}|${record.name}`; }
export function compareProductionFingerprints(before, after) {
  const previous = new Map((before?.containers ?? []).map((record) => [productionRecordKey(record), record]));
  const current = new Map((after?.containers ?? []).map((record) => [productionRecordKey(record), record]));
  const differences = [];
  for (const [key, record] of previous) {
    const next = current.get(key);
    const identity = { composeProject: record.composeProject, composeService: record.composeService, name: record.name };
    if (!next) { differences.push({ type: "CONTAINER_REMOVED", ...identity }); continue; }
    for (const field of ["image", "restart", "health", "networks"]) if (JSON.stringify(record[field]) !== JSON.stringify(next[field])) differences.push({ type: `${field === "restart" ? "RESTART_COUNT" : field.toUpperCase()}_CHANGED`, ...identity, before: record[field], after: next[field] });
  }
  for (const [key, record] of current) if (!previous.has(key)) differences.push({ type: "CONTAINER_ADDED", composeProject: record.composeProject, composeService: record.composeService, name: record.name });
  if (before?.d5 !== after?.d5) differences.push({ type: "D5_STATUS_CHANGED", before: before?.d5, after: after?.d5 });
  if (before?.godel !== after?.godel) differences.push({ type: "GODEL_HEALTH_CHANGED", before: before?.godel, after: after?.godel });
  return { status: differences.length ? "PRODUCTION_FINGERPRINT_MISMATCH" : "UNCHANGED", differences };
}

export async function discoverProductionScope({ run = execFile } = {}) {
  const names = (await run("docker", ["ps", "--format", "{{.Names}}"], { env: composeEnvironment(), windowsHide: true })).stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  const records = [];
  for (const name of names) {
    const output = await run("docker", ["inspect", "--format", "{{.Name}}|{{.Config.Image}}|{{.RestartCount}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}|{{range $key, $value := .NetworkSettings.Networks}}{{$key}},{{end}}|{{index .Config.Labels \"com.docker.compose.project\"}}|{{index .Config.Labels \"com.docker.compose.service\"}}", name], { env: composeEnvironment(), windowsHide: true });
    records.push(normalizeProductionRecord(output.stdout.trim()));
  }
  const supabase = records.filter((record) => record.composeProject === "supabase");
  const candidates = [...new Set(records.filter((record) => record.networks.includes("godel-supabase-api") && record.composeProject && record.composeProject !== "supabase").map((record) => record.composeProject))];
  if (!supabase.length) fail("PRODUCTION_SCOPE_SUPABASE_MISSING");
  if (candidates.length !== 1) fail("PRODUCTION_SCOPE_AMBIGUOUS");
  const godelProject = candidates[0];
  const godel = records.filter((record) => record.composeProject === godelProject);
  if (!godel.length) fail("PRODUCTION_SCOPE_GODEL_MISSING");
  const containers = [...supabase, ...godel].sort((left, right) => productionRecordKey(left).localeCompare(productionRecordKey(right)));
  return { supabaseProject: "supabase", godelProject, supabaseContainerCount: supabase.length, godelContainerCount: godel.length, containers };
}

export async function captureProductionFingerprint({ run = execFile, fetchImpl = fetch, project } = {}) {
  if (project) assertCleanupProject(project);
  const scope = await discoverProductionScope({ run });
  const d5Invocation = createSecretGenerationStatusInvocation();
  const d5Output = await run(d5Invocation.command, d5Invocation.args, { cwd: d5Invocation.cwd, env: d5Invocation.env, windowsHide: d5Invocation.windowsHide });
  const health = await Promise.all(["live", "ready"].map(async (kind) => (await fetchImpl(`http://127.0.0.1:8080/api/health/${kind}`, { signal: AbortSignal.timeout(10_000) })).ok));
  if (!/\bMATCH\s+PASS\b/.test(`${d5Output.stdout ?? ""}\n${d5Output.stderr ?? ""}`) || health.some((ok) => !ok)) fail("PRODUCTION_FINGERPRINT_UNAVAILABLE");
  return { ...scope, d5: "CURRENT_MATCH", godel: "LIVE_READY" };
}

function safeFixtureFingerprint(value) {
  return {
    database: { status: value.database.status, rowIdentifier: value.database.rowIdentifier, rowDigest: value.database.rowDigest },
    auth: { user: value.auth.user, userIdentifier: value.auth.userIdentifier, session: value.auth.session },
    storage: { status: value.storage.status, size: value.storage.size, sha256: value.storage.sha256 },
    gateway: { loopback: value.gateway.loopback, internalKong: value.gateway.internalKong },
  };
}

export async function createFixtures({ compose, runtime, port, project, workspace, credentials, generation, run, fetchImpl, checkpoint }) {
  const rowIdentifier = syntheticHex(8);
  const rowValue = `fixture-${generation}-${rowIdentifier}`;
  const rowDigest = createHash("sha256").update(rowValue).digest("hex");
  const password = syntheticPassword();
  const email = `sh044c-${generation}@example.invalid`;
  const bucket = `sh044c-${generation}`;
  const objectName = "fixture.txt";
  const object = Buffer.from(`fixture:${generation}`, "utf8");
  const storageDigest = createHash("sha256").update(object).digest("hex");
  const composeBase = ["compose", "--env-file", compose.envFile, "-p", project, "-f", compose.composePath, "-f", compose.overridePath];
  await run("docker", [...composeBase, "exec", "-T", "db", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `create table if not exists public.sh044c_fixture (id text primary key, value text not null); insert into public.sh044c_fixture (id, value) values ('${rowIdentifier}', '${rowValue}') on conflict (id) do update set value = excluded.value;`], { cwd: workspace, env: compose.env, windowsHide: true });
  await checkpoint?.("BASE_FIXTURE_DATABASE_PASS", "PASS");
  const root = gatewayUrl(port);
  const user = await fetchFixtureJson({ operation: "AUTH_ADMIN_CREATE", fetchImpl, url: `${root}/auth/v1/admin/users`, options: { method: "POST", headers: serviceRoleHeaders(credentials), body: JSON.stringify({ email, password, email_confirm: true }) } });
  const userIdentifier = typeof user.id === "string" ? user.id : typeof user.user?.id === "string" ? user.user.id : null;
  if (!userIdentifier) fail("AUTH_USER_IDENTIFIER_MISSING");
  await checkpoint?.("BASE_FIXTURE_AUTH_ADMIN_PASS", "PASS");
  await fetchFixtureJson({ operation: "AUTH_PASSWORD_SESSION", fetchImpl, url: `${root}/auth/v1/token?grant_type=password`, options: { method: "POST", headers: { apikey: credentials.anonKey, "content-type": "application/json" }, body: JSON.stringify({ email, password }) } });
  await checkpoint?.("BASE_FIXTURE_AUTH_SESSION_PASS", "PASS");
  await fetchFixtureJson({ operation: "STORAGE_BUCKET_CREATE", fetchImpl, url: `${root}/storage/v1/bucket`, options: { method: "POST", headers: serviceRoleHeaders(credentials), body: JSON.stringify({ id: bucket, name: bucket, public: false }) } });
  await checkpoint?.("BASE_FIXTURE_STORAGE_BUCKET_PASS", "PASS");
  await fetchFixtureJson({ operation: "STORAGE_OBJECT_UPLOAD", fetchImpl, url: `${root}/storage/v1/object/${bucket}/${objectName}`, options: { method: "POST", headers: serviceRoleHeaders(credentials, "text/plain"), body: object } });
  await checkpoint?.("BASE_FIXTURE_STORAGE_OBJECT_PASS", "PASS");
  const gateway = await fetchImpl(`${root}/auth/v1/health`, { headers: anonymousGatewayHeaders(credentials), signal: AbortSignal.timeout(10_000) });
  if (!gateway.ok) fail("GATEWAY_LOOPBACK_FAILED");
  await checkpoint?.("BASE_FIXTURE_GATEWAY_PASS", "PASS");
  await run("docker", createInternalKongProbeInvocation(compose).args, { cwd: workspace, env: compose.env, windowsHide: true });
  await checkpoint?.("BASE_FIXTURE_INTERNAL_KONG_PASS", "PASS");
  return { fingerprint: safeFixtureFingerprint({ database: { status: "PASS", rowIdentifier, rowDigest }, auth: { user: "PASS", userIdentifier, session: "PASS" }, storage: { status: "PASS", size: object.length, sha256: storageDigest }, gateway: { loopback: "PASS", internalKong: "PASS" } }), privateContext: { rowIdentifier, rowValue, email, password, bucket, objectName, userIdentifier } };
}

export async function validateFixtures({ base, context, compose, port, workspace, project, credentials, run, fetchImpl, checkpoint }) {
  if (!context) fail("FIXTURE_CONTEXT_MISSING");
  const root = gatewayUrl(port);
  const composeBase = ["compose", "--env-file", compose.envFile, "-p", project, "-f", compose.composePath, "-f", compose.overridePath];
  const database = await run("docker", [...composeBase, "exec", "-T", "db", "psql", "-U", "postgres", "-d", "postgres", "-tA", "-c", `select value from public.sh044c_fixture where id = '${context.rowIdentifier}';`], { cwd: workspace, env: compose.env, windowsHide: true });
  if (database.stdout.trim() !== context.rowValue) fail("DATABASE_FIXTURE_CHANGED");
  await checkpoint?.("TARGET_FIXTURE_DATABASE_PASS", "PASS");
  await fetchFixtureJson({ operation: "AUTH_ADMIN_READ", fetchImpl, url: `${root}/auth/v1/admin/users/${context.userIdentifier}`, options: { headers: serviceRoleHeaders(credentials) } });
  await checkpoint?.("TARGET_FIXTURE_AUTH_ADMIN_PASS", "PASS");
  await fetchFixtureJson({ operation: "AUTH_PASSWORD_SESSION", fetchImpl, url: `${root}/auth/v1/token?grant_type=password`, options: { method: "POST", headers: { apikey: credentials.anonKey, "content-type": "application/json" }, body: JSON.stringify({ email: context.email, password: context.password }) } });
  await checkpoint?.("TARGET_FIXTURE_AUTH_SESSION_PASS", "PASS");
  const objectResponse = await fetchImpl(`${root}/storage/v1/object/${context.bucket}/${context.objectName}`, { headers: serviceRoleHeaders(credentials), signal: AbortSignal.timeout(10_000) });
  if (!objectResponse.ok) fail(`FIXTURE_HTTP_STORAGE_OBJECT_READ_${objectResponse.status}`);
  const object = Buffer.from(await objectResponse.arrayBuffer());
  const storage = { status: "PASS", size: object.length, sha256: createHash("sha256").update(object).digest("hex") };
  await checkpoint?.("TARGET_FIXTURE_STORAGE_OBJECT_PASS", "PASS");
  const gateway = await fetchImpl(`${root}/auth/v1/health`, { headers: anonymousGatewayHeaders(credentials), signal: AbortSignal.timeout(10_000) });
  if (!gateway.ok) fail("TARGET_GATEWAY_LOOPBACK_FAILED");
  await checkpoint?.("TARGET_FIXTURE_GATEWAY_PASS", "PASS");
  await run("docker", createInternalKongProbeInvocation(compose).args, { cwd: workspace, env: compose.env, windowsHide: true });
  await checkpoint?.("TARGET_FIXTURE_INTERNAL_KONG_PASS", "PASS");
  return safeFixtureFingerprint({ database: base.database, auth: { ...base.auth, session: "PASS" }, storage, gateway: { loopback: "PASS", internalKong: "PASS" } });
}

function assertUpdateOutput(output) { return parseUpdateSummary(output); }

async function assertExactTargetStamp(runtime) {
  const stamp = await readFile(join(runtime, ".supabase-version"), "utf8");
  if (!new RegExp(`^ref=${TARGET.tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(stamp)) fail("TARGET_STAMP_MISMATCH");
  return "TARGET_EXACT";
}

export async function executeHistoricalRehearsal(options = {}) {
  const evidence = { executorResult: "FAIL", project: null, base: BASE, target: TARGET, fixtureContract: createFixtureContract(), phases: [], executionReadiness: "NOT_CHECKED", dockerMutationAttempted: false };
  if (!options.acknowledged && !options.preRuntimeProbe && !options.baseFixtureProbe) return { ...evidence, executorResult: "ACKNOWLEDGEMENT_REQUIRED", usage: "Provide --execute-isolated-historical-rehearsal, --execute-isolated-base-fixture-probe, or --pre-runtime-probe and --jq <verified-path>; no Docker action was attempted." };
  if (!options.jqBin) return { ...evidence, executorResult: "JQ_PATH_REQUIRED", usage: "Provide --jq <verified-path>; no Docker action was attempted." };
  const run = createBoundedRunner(options.run ?? execFile);
  const repository = options.repository ?? REPOSITORY;
  const generation = options.generation ?? safeGeneration();
  const project = `${REHEARSAL_PREFIX}${generation}`;
  assertCleanupProject(project);
  const port = options.port ?? 18080;
  createGatewayPortContract(port);
  const checkpoints = await (options.createCheckpointEmitter ?? createCheckpointEmitter)({ generation, sink: options.checkpointSink });
  attachInternalJournal(evidence, { generation, journal: checkpoints.journal });
  const checkpoint = (phase, status, detail) => checkpoints.emit(phase, status, detail);
  await checkpoint("EXECUTOR_START", "PASS", { project });
  const workspace = await (options.createWorkspace ?? ((prefix) => mkdtemp(join(tmpdir(), prefix))))(`${project}-`);
  let cleanupDescriptor;
  let expectedServices = [];
  const cleanup = async () => {
    await checkpoint("CLEANUP_BEGIN", "PASS");
    if (evidence.dockerMutationAttempted) {
      let cleanupFailed = false;
      try {
        if (!cleanupDescriptor) fail("CLEANUP_DESCRIPTOR_MISSING");
        const invocation = createRuntimeComposeInvocation({ ...cleanupDescriptor, project, workspace, action: "cleanup" });
        await run(invocation.command, invocation.args, { cwd: invocation.cwd, env: invocation.env, windowsHide: true });
      } catch { cleanupFailed = true; }
      let residue = await (options.auditProjectResidue ?? auditProjectResidue)({ project, run });
      if (cleanupFailed || residueCount(residue) !== 0) {
        await (options.fallbackProjectCleanup ?? fallbackProjectCleanup)({ project, services: expectedServices, run });
        residue = await (options.auditProjectResidue ?? auditProjectResidue)({ project, run });
      }
      evidence.cleanupAudit = { containers: residue.containers.length, networks: residue.networks.length, volumes: residue.volumes.length };
      if (residueCount(residue) !== 0) fail("CLEANUP_RESIDUE_REMAINS");
    }
    await rm(workspace, { recursive: true, force: true });
    evidence.cleanup = "CLEANUP_PASS";
    await checkpoint("CLEANUP_PASS", "PASS");
  };
  evidence.project = project;
  evidence.incidentJournal = "RETAINED";
  evidence.cleanupContract = createCleanupContract({ project, workspace }).status;
  try {
    evidence.baseIdentity = await (options.resolveExactTag ?? resolveExactTag)({ repository, tag: BASE.tag, expectedCommit: BASE.commit, run });
    await checkpoint("BASE_IDENTITY", "PASS");
    evidence.targetIdentity = await (options.resolveExactTag ?? resolveExactTag)({ repository, tag: TARGET.tag, expectedCommit: TARGET.commit, run });
    await checkpoint("TARGET_IDENTITY", "PASS");
    const jq = await (options.resolveJq ?? resolveJq)({ jqBin: options.jqBin, run });
    const shell = await (options.resolveShell ?? resolveShell)({ shBin: options.shBin });
    if (jq.status !== "JQ_AVAILABLE" || shell.status !== "SH_AVAILABLE") fail(jq.status !== "JQ_AVAILABLE" ? jq.status : shell.status);
    await checkpoint("JQ_CHECK", "PASS"); await checkpoint("SHELL_CHECK", "PASS");
    if (!(await (options.portProbe ?? probePortAvailable)(port))) fail("GATEWAY_PORT_OCCUPIED");
    await checkpoint("PORT_CHECK", "PASS");
    const source = join(workspace, "base-source");
    const targetSourceDirectory = join(workspace, "target-source");
    await (options.materializeSnapshot ?? materializeSnapshot)({ repository, tag: BASE.tag, expectedCommit: BASE.commit, destination: source, run });
    await checkpoint("BASE_SNAPSHOT", "PASS");
    await (options.materializeSnapshot ?? materializeSnapshot)({ repository, tag: TARGET.tag, expectedCommit: TARGET.commit, destination: targetSourceDirectory, run });
    await checkpoint("TARGET_SNAPSHOT", "PASS");
    const composeSource = await readFile(join(source, "docker-compose.yml"), "utf8");
    const targetComposeSource = await readFile(join(targetSourceDirectory, "docker-compose.yml"), "utf8");
    const services = servicesFromSource(composeSource);
    const targetServicesFromSnapshot = servicesFromSource(targetComposeSource);
    if (!services.includes("kong") || services.includes("api-gw")) fail("BASE_SERVICE_INVENTORY_INVALID");
    if (!targetServicesFromSnapshot.includes("api-gw") || targetServicesFromSnapshot.includes("kong")) fail("TARGET_SERVICE_INVENTORY_INVALID");
    expectedServices = [...new Set([...services, ...targetServicesFromSnapshot])];
    const runtime = runtimePath(workspace);
    await cp(source, runtime, { recursive: true });
    const envFile = join(runtime, ".env");
    const environment = await writeSyntheticRuntimeEnv({ examplePath: join(source, ".env.example"), destination: envFile, port, returnCredentials: true });
    const overridePath = join(workspace, "base.override.yml");
    await writeFile(overridePath, createIsolationOverride({ project, services, gatewayService: "kong", port }));
    const targetPreflightEnv = join(workspace, "target-preflight.env");
    await writeSyntheticRuntimeEnv({ examplePath: join(targetSourceDirectory, ".env.example"), destination: targetPreflightEnv, port });
    const targetPreflightOverride = join(workspace, "target-preflight.override.yml");
    await writeFile(targetPreflightOverride, createIsolationOverride({ project, services: targetServicesFromSnapshot, gatewayService: "api-gw", port }));
    const configInvocation = createExecutionComposeConfigInvocation({ composePath: join(runtime, "docker-compose.yml"), overridePath, envFile, project, workspace });
    const baseModel = await (options.renderCompose ?? renderExecutionCompose)(configInvocation, run);
    const productionContainers = await (options.listProductionContainers ?? listProductionContainers)(run);
    evidence.baseCompose = validateEffectiveCompose({ model: baseModel, workspace, project, productionContainers });
    if (baseModel.services?.kong?.image !== "kong/kong:3.9.3") fail("BASE_GATEWAY_IMAGE_INVALID");
    assertFixtureDependencyHealthchecks({ model: baseModel, phase: "BASE" });
    await checkpoint("BASE_COMPOSE_RENDER", "PASS");
    const targetPreflightConfig = createExecutionComposeConfigInvocation({ composePath: join(targetSourceDirectory, "docker-compose.yml"), overridePath: targetPreflightOverride, envFile: targetPreflightEnv, project, workspace });
    const targetPreflightModel = await (options.renderCompose ?? renderExecutionCompose)(targetPreflightConfig, run);
    evidence.targetComposePreMutation = validateEffectiveCompose({ model: targetPreflightModel, workspace, project, productionContainers });
    if (targetPreflightModel.services?.["api-gw"]?.image !== "envoyproxy/envoy:v1.39.0") fail("TARGET_GATEWAY_IMAGE_INVALID");
    assertFixtureDependencyHealthchecks({ model: targetPreflightModel, phase: "TARGET" });
    await checkpoint("TARGET_COMPOSE_RENDER", "PASS");
    const images = await (options.inspectImages ?? inspectImages)([...new Set([...imagesFromCompose(baseModel), ...imagesFromCompose(targetPreflightModel)])], run);
    if (images.status !== "ALL_IMAGES_PRESENT") fail(`IMAGE_MISSING:${images.missing.join(",")}`);
    await checkpoint("IMAGE_PREFLIGHT", "PASS");
    evidence.preMutationRevalidation = "PASS";
    evidence.targetStructuralContract = { gateway: "api-gw", retainedKongAlias: "REQUIRED" };
    evidence.executionReadiness = "READY";
    const baseRuntimeCompose = { composePath: join(runtime, "docker-compose.yml"), overridePath, envFile, env: configInvocation.env };
    cleanupDescriptor = { composePath: join(source, "docker-compose.yml"), overridePath, envFile, env: configInvocation.env };
    evidence.productionBefore = await (options.productionFingerprint ?? captureProductionFingerprint)({ run, fetchImpl: options.fetchImpl ?? fetch, project });
    evidence.productionScope = { supabaseProject: evidence.productionBefore.supabaseProject, godelProject: evidence.productionBefore.godelProject, supabaseContainerCount: evidence.productionBefore.supabaseContainerCount, godelContainerCount: evidence.productionBefore.godelContainerCount };
    await checkpoint("PRODUCTION_SCOPE_DISCOVERY", "PASS", evidence.productionScope);
    await checkpoint("PRODUCTION_FINGERPRINT_BEFORE", "PASS");
    await checkpoint("PRE_RUNTIME_READY", "PASS");
    if (options.preRuntimeProbe) { evidence.executorResult = "PRE_RUNTIME_PASS"; await checkpoint("EXECUTOR_COMPLETE", "PASS"); return evidence; }
    const start = createRuntimeComposeInvocation({ ...baseRuntimeCompose, project, workspace, action: "start" });
    evidence.dockerMutationAttempted = true;
    await checkpoint("BASE_START_BEGIN", "PASS");
    await run(start.command, start.args, { cwd: start.cwd, env: start.env, windowsHide: true });
    await checkpoint("BASE_START_PASS", "PASS");
    await checkpoint("BASE_REQUIRED_SERVICES_BEGIN", "PASS");
    await (options.waitForRequiredServices ?? waitForRequiredServicesHealthy)({ phase: "BASE", project, run, readServices: options.readProjectServiceHealth, sleep: options.sleep });
    await checkpoint("BASE_REQUIRED_SERVICES_PASS", "PASS");
    await (options.waitForRuntime ?? waitForGateway)({ port, credentials: environment.credentials, fetchImpl: options.fetchImpl, sleep: options.sleep });
    await checkpoint("BASE_READINESS_PASS", "PASS");
    evidence.baseRuntimeGateway = assertRuntimeGatewayIdentity({ phase: "BASE", project, records: await (options.inspectRuntimeGateway ?? inspectRuntimeGateway)({ project, run }) });
    await checkpoint("BASE_GATEWAY_IDENTITY_PASS", "PASS");
    evidence.phases.push("BASE_READY");
    const baseFixtureResult = await (options.createFixtures ?? createFixtures)({ compose: { ...baseRuntimeCompose, project, workspace }, runtime, port, project, workspace, credentials: environment.credentials, generation, run, fetchImpl: options.fetchImpl ?? fetch, checkpoint });
    const baseFixtures = baseFixtureResult.fingerprint ?? baseFixtureResult;
    const fixtureContext = baseFixtureResult.privateContext;
    evidence.baseFixtureFingerprint = safeFixtureFingerprint(baseFixtures);
    await checkpoint("BASE_FIXTURES_PASS", "PASS");
    evidence.phases.push("FIXTURES_BASE_PASS");
    if (options.baseFixtureProbe) {
      evidence.productionAfter = await (options.productionFingerprint ?? captureProductionFingerprint)({ run, fetchImpl: options.fetchImpl ?? fetch, project });
      await checkpoint("PRODUCTION_FINGERPRINT_AFTER", "PASS");
      const comparison = compareProductionFingerprints(evidence.productionBefore, evidence.productionAfter);
      if (comparison.status !== "UNCHANGED") { evidence.productionDifferences = comparison.differences; fail("PRODUCTION_FINGERPRINT_MISMATCH"); }
      await checkpoint("PRODUCTION_COMPARISON_PASS", "PASS");
      evidence.executorResult = "BASE_FIXTURE_PROBE_PASS";
      await checkpoint("EXECUTOR_COMPLETE", "PASS");
      return evidence;
    }
    const stop = createRuntimeComposeInvocation({ ...baseRuntimeCompose, project, workspace, action: "stop" });
    await checkpoint("BASE_STOP_BEGIN", "PASS");
    await run(stop.command, stop.args, { cwd: stop.cwd, env: stop.env, windowsHide: true });
    await checkpoint("BASE_STOP_PASS", "PASS");
    evidence.phases.push("BASE_STOPPED");
    const backupsBefore = await readdir(join(runtime, "backups")).catch(() => []);
    const update = createRealUpdateInvocation({ runtime, jq, shell, repository });
    await checkpoint("UPDATE_BEGIN", "PASS");
    const updateOutput = await run(update.command, update.args, { cwd: update.cwd, env: update.env, windowsHide: true });
    const updateSummary = assertUpdateOutput(updateOutput);
    await assertExactTargetStamp(runtime);
    const backupsAfter = await readdir(join(runtime, "backups")).catch(() => []);
    if (backupsAfter.filter((entry) => /^pre-update-.*\.tgz$/.test(entry) && !backupsBefore.includes(entry)).length !== 1) fail("CONFIG_BACKUP_CLASSIFICATION_FAILED");
    evidence.update = { exit: "PASS", ...updateSummary, stamp: "TARGET_EXACT", configBackup: "PASS" };
    await checkpoint("UPDATE_PASS", "PASS");
    evidence.phases.push("UPDATE_PASS");
    const targetSource = await readFile(join(runtime, "docker-compose.yml"), "utf8");
    const targetServices = servicesFromSource(targetSource);
    if (!targetServices.includes("api-gw") || targetServices.includes("kong")) fail("TARGET_SERVICE_INVENTORY_INVALID");
    const targetOverride = join(workspace, "target.override.yml");
    await writeFile(targetOverride, createIsolationOverride({ project, services: targetServices, gatewayService: "api-gw", port }));
    const targetConfig = createExecutionComposeConfigInvocation({ composePath: join(runtime, "docker-compose.yml"), overridePath: targetOverride, envFile, project, workspace });
    const targetModel = await (options.renderCompose ?? renderExecutionCompose)(targetConfig, run);
    evidence.targetComposePostUpdate = validateEffectiveCompose({ model: targetModel, workspace, project, productionContainers });
    await checkpoint("TARGET_COMPOSE_PASS", "PASS");
    const targetImages = await (options.inspectImages ?? inspectImages)(imagesFromCompose(targetModel), run);
    if (targetImages.status !== "ALL_IMAGES_PRESENT") fail(`IMAGE_MISSING:${targetImages.missing.join(",")}`);
    const targetRuntimeCompose = { composePath: join(runtime, "docker-compose.yml"), overridePath: targetOverride, envFile, env: targetConfig.env };
    cleanupDescriptor = targetRuntimeCompose;
    const targetStart = createRuntimeComposeInvocation({ ...targetRuntimeCompose, project, workspace, action: "start" });
    await checkpoint("TARGET_START_BEGIN", "PASS");
    await run(targetStart.command, targetStart.args, { cwd: targetStart.cwd, env: targetStart.env, windowsHide: true });
    await checkpoint("TARGET_START_PASS", "PASS");
    await checkpoint("TARGET_REQUIRED_SERVICES_BEGIN", "PASS");
    await (options.waitForRequiredServices ?? waitForRequiredServicesHealthy)({ phase: "TARGET", project, run, readServices: options.readProjectServiceHealth, sleep: options.sleep });
    await checkpoint("TARGET_REQUIRED_SERVICES_PASS", "PASS");
    await (options.waitForRuntime ?? waitForGateway)({ port, credentials: environment.credentials, fetchImpl: options.fetchImpl, sleep: options.sleep });
    await checkpoint("TARGET_READINESS_PASS", "PASS");
    evidence.targetRuntimeGateway = assertRuntimeGatewayIdentity({ phase: "TARGET", project, records: await (options.inspectRuntimeGateway ?? inspectRuntimeGateway)({ project, run }) });
    await checkpoint("TARGET_GATEWAY_IDENTITY_PASS", "PASS");
    evidence.phases.push("TARGET_READY");
    const targetFixtures = await (options.validateFixtures ?? validateFixtures)({ base: baseFixtures, context: fixtureContext, compose: { ...targetRuntimeCompose, project, workspace }, port, workspace, project, credentials: environment.credentials, run, fetchImpl: options.fetchImpl ?? fetch, checkpoint });
    evidence.targetFixtureFingerprint = safeFixtureFingerprint(targetFixtures);
    await checkpoint("TARGET_FIXTURES_PASS", "PASS");
    const fixtures = compareFixtureFingerprints(baseFixtures, targetFixtures);
    if (fixtures.status !== "PASS") fail("POST_UPDATE_FIXTURE_MISMATCH");
    evidence.fixtureComparison = fixtures;
    evidence.phases.push("FIXTURES_TARGET_PASS");
    evidence.productionAfter = await (options.productionFingerprint ?? captureProductionFingerprint)({ run, fetchImpl: options.fetchImpl ?? fetch, project });
    await checkpoint("PRODUCTION_FINGERPRINT_AFTER", "PASS");
    const comparison = compareProductionFingerprints(evidence.productionBefore, evidence.productionAfter);
    if (comparison.status !== "UNCHANGED") { evidence.productionDifferences = comparison.differences; fail("PRODUCTION_FINGERPRINT_MISMATCH"); }
    await checkpoint("PRODUCTION_COMPARISON_PASS", "PASS");
    evidence.phases.push("PRODUCTION_UNCHANGED");
    evidence.executorResult = "EXECUTION_PASS";
    await checkpoint("EXECUTOR_COMPLETE", "PASS");
    return evidence;
  } catch (error) {
    evidence.executorResult = "FAIL";
    evidence.blockedBy = safeError(error);
    await checkpoint("EXECUTOR_ERROR", "FAIL", evidence.blockedBy);
    return evidence;
  } finally {
    try {
      await cleanup(); evidence.phases.push("CLEANUP_PASS");
      if (["EXECUTION_PASS", "PRE_RUNTIME_PASS", "BASE_FIXTURE_PROBE_PASS"].includes(evidence.executorResult)) evidence.incidentJournal = "PENDING_SUCCESS_OUTPUT_CLEANUP";
    } catch (error) { evidence.executorResult = "FAIL"; evidence.cleanup = "CLEANUP_FAIL"; evidence.blockedBy ??= safeError(error); evidence.incidentJournal = "RETAINED"; }
    try {
      await checkpoint("FINAL_RESULT_READY", evidence.executorResult, {
        executorResult: evidence.executorResult,
        cleanup: evidence.cleanup,
        executionReadiness: evidence.executionReadiness,
        dockerMutationAttempted: evidence.dockerMutationAttempted,
      });
    } catch (error) {
      evidence.executorResult = "FAIL";
      evidence.blockedBy ??= safeError(error);
      evidence.incidentJournal = "RETAINED";
    }
  }
}

async function main() {
  const result = await executeHistoricalRehearsal(parseExecutorArguments(process.argv.slice(2)));
  const output = await finalizeExecutorOutput({ result });
  process.exitCode = output.finalOutput === "WRITTEN" && ["EXECUTION_PASS", "PRE_RUNTIME_PASS", "BASE_FIXTURE_PROBE_PASS"].includes(result.executorResult) ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => { console.error(JSON.stringify({ executorResult: "FAIL", blockedBy: safeError(error) })); process.exitCode = 1; });
}
