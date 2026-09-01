import { execFile as execFileCallback } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
export const BASE = Object.freeze({ tag: "self-hosted/v0.7.2", commit: "549db119c44c25167461812041ba198bde2b31a4" });
export const TARGET = Object.freeze({ tag: "self-hosted/v0.8.0", commit: "241bb11c0627f2981746d37033f57dbfa81d29b0" });
const PREFIX = "godel-sh044c-rehearsal-";
const GATEWAY_PORT = 18080;
const REQUIRED_SECRETS = ["POSTGRES_PASSWORD", "JWT_SECRET", "ANON_KEY", "SERVICE_ROLE_KEY", "DASHBOARD_PASSWORD", "SECRET_KEY_BASE", "REALTIME_DB_ENC_KEY", "VAULT_ENC_KEY", "PG_META_CRYPTO_KEY", "LOGFLARE_PUBLIC_ACCESS_TOKEN", "LOGFLARE_PRIVATE_ACCESS_TOKEN", "S3_PROTOCOL_ACCESS_KEY_ID", "S3_PROTOCOL_ACCESS_KEY_SECRET", "POOLER_TENANT_ID"];

function safeError(value) { return String(value?.message ?? value).replace(/[\r\n]+/g, " ").slice(0, 160); }
function safeToolError(error) { return String(error?.stderr ?? error?.stdout ?? error?.message ?? error).replace(/[A-Za-z]:\\[^\s:]+/g, "<path>").replace(/[\r\n]+/g, " ").slice(0, 240); }
function fail(code) { throw new Error(code); }
function b64(value) { return Buffer.from(value).toString("base64url"); }
function randomSecret() { return randomBytes(32).toString("base64url"); }
function isInside(root, path) { const check = relative(resolve(root), resolve(path)); return check === "" || (!check.startsWith("..") && !isAbsolute(check)); }
function safeGeneration() { return randomBytes(6).toString("hex"); }

export function createHs256Jwt(secret, role, now = Math.floor(Date.now() / 1000)) {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64(JSON.stringify({ role, iss: "supabase", iat: now, exp: now + (5 * 365 * 24 * 60 * 60) }));
  return `${header}.${payload}.${createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url")}`;
}

export function readJwtClaims(token) { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")); }
export function verifyHs256Jwt(token, secret, role) {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return false;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  const claims = readJwtClaims(token);
  return expected === signature && claims.role === role && claims.iss === "supabase" && Number.isInteger(claims.iat) && Number.isInteger(claims.exp) && claims.exp > claims.iat;
}

export function createSyntheticSecrets() {
  const secrets = {
    POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
    JWT_SECRET: randomBytes(32).toString("hex"),
    DASHBOARD_PASSWORD: randomSecret(),
    SECRET_KEY_BASE: randomBytes(48).toString("base64"),
    REALTIME_DB_ENC_KEY: randomBytes(8).toString("hex"),
    VAULT_ENC_KEY: randomBytes(16).toString("hex"),
    PG_META_CRYPTO_KEY: randomBytes(24).toString("base64"),
    LOGFLARE_PUBLIC_ACCESS_TOKEN: randomSecret(),
    LOGFLARE_PRIVATE_ACCESS_TOKEN: randomSecret(),
    S3_PROTOCOL_ACCESS_KEY_ID: randomBytes(16).toString("hex"),
    S3_PROTOCOL_ACCESS_KEY_SECRET: randomBytes(32).toString("hex"),
    POOLER_TENANT_ID: `rehearsal_${randomBytes(8).toString("hex")}`,
  };
  secrets.ANON_KEY = createHs256Jwt(secrets.JWT_SECRET, "anon");
  secrets.SERVICE_ROLE_KEY = createHs256Jwt(secrets.JWT_SECRET, "service_role");
  return secrets;
}

function approvedEnvironmentValue(environment, name, platform = process.platform) {
  if (platform !== "win32") return environment[name];
  const actualName = Object.keys(environment).find((key) => key.toUpperCase() === name.toUpperCase());
  return actualName ? environment[actualName] : undefined;
}

export function allowlistedEnvironment({ jqDirectory, shellDirectory, environment = process.env, platform = process.platform } = {}) {
  const allowed = ["PATH", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"];
  if (platform === "win32") allowed.push("USERPROFILE", "HOME");
  else allowed.push("HOME");
  const result = Object.fromEntries(allowed.map((key) => [key, approvedEnvironmentValue(environment, key, platform)]).filter(([, value]) => value));
  const approvedDirectories = [...new Set([jqDirectory, shellDirectory].filter(Boolean))];
  if (approvedDirectories.length) result.PATH = [...approvedDirectories, result.PATH].filter(Boolean).join(delimiter);
  return result;
}

export function composeEnvironment({ environment = process.env, platform = process.platform } = {}) {
  const result = allowlistedEnvironment({ environment, platform });
  if (platform === "win32") for (const name of ["ProgramFiles", "ProgramW6432"]) {
    const value = approvedEnvironmentValue(environment, name, platform);
    if (value) result[name] = value;
  }
  return result;
}

async function executable(path) { try { await access(path); return true; } catch { return false; } }
async function resolveExecutable(name, pathValue = process.env.PATH ?? "") {
  if (name.includes("/") || name.includes("\\")) return (await executable(name)) ? resolve(name) : null;
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const entry of pathValue.split(delimiter).filter(Boolean)) for (const suffix of suffixes) {
    const candidate = join(entry, `${name}${suffix}`);
    if (await executable(candidate)) return candidate;
  }
  return null;
}

export async function resolveJq({ jqBin, environment = process.env, run = execFile } = {}) {
  const requested = jqBin ?? environment.GODEL_JQ_BIN ?? "jq";
  const path = await resolveExecutable(requested, environment.PATH);
  if (!path) return { status: "JQ_MISSING" };
  try {
    await run(path, ["-e", "--arg", "key", "target", 'type == "object" and ([keys[]] | length) > 0 and (.[$key] // "fallback") == "value" and ([.items[]?] | length) == 2'], { input: '{"target":"value","items":[1,2]}' });
    return { status: "JQ_AVAILABLE", path, directory: dirname(path) };
  } catch { return { status: "JQ_INCOMPATIBLE" }; }
}

export async function resolveShell({ shBin, environment = process.env } = {}) {
  const requested = shBin ?? environment.GODEL_GIT_SH;
  const path = requested
    ? await resolveExecutable(requested, environment.PATH)
    : await resolveExecutable("sh", environment.PATH)
      ?? await resolveExecutable("sh.exe", environment.PATH)
      ?? await resolveExecutable(join(environment.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "sh.exe"), environment.PATH);
  return path ? { status: "SH_AVAILABLE", path, directory: dirname(path) } : { status: "SH_MISSING" };
}

async function git(cwd, args, run = execFile) { return (await run("git", args, { cwd, windowsHide: true })).stdout.trim(); }
export async function resolveExactTag({ repository, tag, expectedCommit, run = execFile }) {
  const ref = `refs/tags/${tag}`;
  let output;
  try { output = await run("git", ["ls-remote", repository, ref, `${ref}^{}`], { windowsHide: true }); } catch { fail("OFFICIAL_TAG_UNRESOLVED"); }
  const entries = output.stdout.trim().split(/\r?\n/).filter(Boolean).map((line) => line.split(/\s+/));
  const peeled = entries.find(([, name]) => name === `${ref}^{}`)?.[0] ?? entries.find(([, name]) => name === ref)?.[0];
  if (!peeled || !/^[0-9a-f]{40}$/i.test(peeled) || peeled !== expectedCommit) fail("OFFICIAL_TAG_IDENTITY_MISMATCH");
  return { tag, commit: peeled };
}

export function createSparseSnapshotCommands({ repository, tag }) {
  return [
    ["init", "--quiet"],
    ["remote", "add", "origin", repository],
    ["sparse-checkout", "set", "--no-cone", "docker/"],
    ["fetch", "--quiet", "--depth=1", "--filter=blob:none", "origin", `refs/tags/${tag}:refs/tags/${tag}`],
  ];
}
async function materializeSnapshot({ repository, tag, expectedCommit, destination, run = execFile }) {
  const checkout = join(dirname(destination), `${basename(destination)}-git`);
  try {
    await mkdir(checkout, { recursive: true });
    for (const args of createSparseSnapshotCommands({ repository, tag })) await run("git", args, { cwd: checkout, windowsHide: true });
    const commit = await git(checkout, ["rev-parse", `refs/tags/${tag}^{commit}`], run);
    if (expectedCommit && commit !== expectedCommit) fail("MATERIALIZED_TAG_IDENTITY_MISMATCH");
    await run("git", ["checkout", "--quiet", "--detach", commit], { cwd: checkout, windowsHide: true });
    await cp(join(checkout, "docker"), destination, { recursive: true });
  } finally { await rm(checkout, { recursive: true, force: true }); }
}

function parseExample(example, values) {
  return example.split(/\r?\n/).map((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    return match && Object.hasOwn(values, match[1]) ? `${match[1]}=${values[match[1]]}` : line;
  }).join("\n");
}

export async function writeSyntheticRuntimeEnv({ examplePath, destination, port = GATEWAY_PORT }) {
  const secrets = createSyntheticSecrets();
  const loopback = `http://127.0.0.1:${port}`;
  const values = { ...secrets, ENABLE_EMAIL_AUTOCONFIRM: "true", SITE_URL: loopback, API_EXTERNAL_URL: `${loopback}/auth/v1`, SUPABASE_PUBLIC_URL: loopback, ADDITIONAL_REDIRECT_URLS: loopback, SMTP_ADMIN_EMAIL: "rehearsal@example.invalid", SMTP_HOST: "rehearsal-mail.invalid", SMTP_PORT: "2500", SMTP_USER: "rehearsal", SMTP_PASS: randomSecret(), SMTP_SENDER_NAME: "rehearsal", JWT_KEYS: "[]", JWT_JWKS: '{"keys":[]}' };
  const content = parseExample(await readFile(examplePath, "utf8"), values);
  await writeFile(destination, content.endsWith("\n") ? content : `${content}\n`, { mode: 0o600 });
  return { secretNames: Object.keys(secrets).sort(), port };
}

export function createIsolationOverride({ project, services, gatewayService, port = GATEWAY_PORT }) {
  if (!project.startsWith(PREFIX) || !services.includes(gatewayService)) fail("REHEARSAL_OVERRIDE_INVALID");
  const lines = [`name: ${project}`, "services:"];
  for (const service of services) {
    lines.push(`  ${service}:`, `    container_name: ${project}-${service.replace(/[^a-z0-9]/gi, "-")}`);
    if (service === gatewayService) lines.push("    ports: !override", `      - "127.0.0.1:${port}:8000"`);
    else lines.push("    ports: !override []");
  }
  lines.push("volumes:", `  db-config:`, `    name: ${project}-db-config`, `  deno-cache:`, `    name: ${project}-deno-cache`, "");
  return lines.join("\n");
}

function normalizedPort(port) { return typeof port === "string" ? { published: port } : port ?? {}; }
function serviceVolumes(service) { return Array.isArray(service.volumes) ? service.volumes : []; }
export function validateEffectiveCompose({ model, workspace, project, productionContainers = [] }) {
  const services = model?.services;
  if (!services || typeof services !== "object") fail("COMPOSE_MODEL_INVALID");
  const gateway = Object.hasOwn(services, "kong") ? "kong" : Object.hasOwn(services, "api-gw") ? "api-gw" : null;
  if (!gateway || (gateway === "kong" && Object.hasOwn(services, "api-gw"))) fail("GATEWAY_SERVICE_INVALID");
  for (const [name, service] of Object.entries(services)) {
    if (!service.container_name?.startsWith(`${project}-`) || productionContainers.includes(service.container_name)) fail("CONTAINER_ISOLATION_INVALID");
    for (const entry of serviceVolumes(service)) {
      const volume = typeof entry === "string" ? { type: entry.includes(":") ? "volume" : "", source: entry.split(":")[0] } : entry;
      if (volume.type === "bind") {
        if (!volume.source || !isInside(workspace, volume.source)) fail("BIND_ISOLATION_INVALID");
      } else if (volume.type === "volume") {
        const declared = model.volumes?.[volume.source] ?? {};
        const effectiveName = declared.name ?? volume.source;
        if (!effectiveName?.startsWith(`${project}-`) || volume.external || declared.external) fail("VOLUME_ISOLATION_INVALID");
      }
    }
    for (const raw of service.ports ?? []) {
      const port = normalizedPort(raw);
      if (name !== gateway || port.published === undefined || port.target !== 8000 || !["127.0.0.1", "::1"].includes(port.host_ip)) fail("PORT_ISOLATION_INVALID");
    }
  }
  const networks = model.networks ?? {};
  if (Object.values(networks).some((network) => network?.external)) fail("NETWORK_ISOLATION_INVALID");
  const gatewayPorts = services[gateway].ports ?? [];
  if (gatewayPorts.length !== 1) fail("GATEWAY_PORT_INVALID");
  if (gateway === "api-gw" && !(services["api-gw"].networks?.default?.aliases ?? []).includes("kong")) fail("TARGET_KONG_ALIAS_MISSING");
  return { gateway, status: "PASS", dbHostPort: "CLOSED", supavisorHostPort: "CLOSED", gatewayHostPort: "LOOPBACK_ONLY", productionExternalNetwork: "NONE", filesystemIsolation: "PASS", volumeIsolation: "PASS", targetKongAlias: gateway === "api-gw" ? "PASS" : "NOT_APPLICABLE" };
}

export function createComposeInvocation({ composePath, overridePath, project, workspace }) {
  return { command: "docker", args: ["compose", "-p", project, "-f", composePath, "-f", overridePath, "config", "--no-interpolate", "--no-env-resolution", "--format", "json"], cwd: workspace, env: { ...composeEnvironment(), COMPOSE_DISABLE_ENV_FILE: "1", COMPOSE_PROJECT_NAME: project } };
}
export async function renderEffectiveCompose(invocation, run = execFile) {
  try { const output = await run(invocation.command, invocation.args, { cwd: invocation.cwd, env: invocation.env, windowsHide: true }); return { ok: true, model: JSON.parse(output.stdout) }; } catch (error) { return { ok: false, error: safeToolError(error) }; }
}
export async function inspectImages(images, run = execFile) {
  const missing = [];
  for (const image of [...new Set(images)].sort()) try { await run("docker", ["image", "inspect", image], { env: composeEnvironment(), windowsHide: true }); } catch { missing.push(image); }
  return { status: missing.length ? "MISSING_IMAGES" : "ALL_IMAGES_PRESENT", missing, present: images.filter((image) => !missing.includes(image)) };
}
export function imagesFromCompose(model) { return Object.values(model.services ?? {}).map((service) => service.image).filter((image) => typeof image === "string"); }
export async function listProductionContainers(run = execFile) {
  try {
    const output = await run("docker", ["ps", "--format", "{{.Names}}"], { env: composeEnvironment(), windowsHide: true });
    return output.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch { fail("PRODUCTION_CONTAINER_INVENTORY_UNAVAILABLE"); }
}

export function createFixtureContract() {
  return { database: { table: "public.sh044c_fixture", evidence: ["rowDigest"] }, auth: { evidence: ["userIdentifier"] }, storage: { evidence: ["size", "sha256"] }, gateway: { target: "loopback-only", evidence: ["status"] } };
}
export function safeProductionFingerprint({ containers = [], d5 = "NOT_CHECKED", godel = "NOT_CHECKED" } = {}) {
  return { containers: containers.map((line) => { const [name, image, restart = "0", health = "UNKNOWN", networks = ""] = line.split("|"); return { name, image, restart: Number(restart), health, networks: networks.split(",").filter(Boolean) }; }), d5, godel };
}
export function assertCleanupProject(project) { if (!/^godel-sh044c-rehearsal-[a-z0-9]+$/.test(project)) fail("CLEANUP_PROJECT_REJECTED"); return project; }
export function createCleanupContract({ project, workspace }) { assertCleanupProject(project); if (!isInside(tmpdir(), workspace)) fail("CLEANUP_WORKSPACE_REJECTED"); return { project, workspace, status: "PREPARED_NOT_EXECUTED" }; }
export function createGatewayPortContract(port = GATEWAY_PORT) { if (!Number.isInteger(port) || port < 1024 || port === 8080) fail("GATEWAY_PORT_CONTRACT_INVALID"); return { port, binding: "127.0.0.1", availability: "CHECK_REQUIRED_BEFORE_C2" }; }

function servicesFromCompose(model) { return Object.keys(model.services ?? {}); }
function servicesFromSource(source) {
  const start = source.search(/^services:\s*$/m);
  if (start < 0) return [];
  const following = source.slice(start).split(/\r?\n/).slice(1);
  const end = following.findIndex((line) => /^[^\s#][^:\n]*:\s*$/.test(line));
  const servicesSection = following.slice(0, end < 0 ? undefined : end).join("\n");
  return [...servicesSection.matchAll(/^  ([a-z0-9-]+):\s*$/gmi)].map((match) => match[1]);
}
export function createDryRunInvocation({ runtime, jq, shell, repository }) {
  return { command: shell.path, args: [join(runtime, "update.sh"), "--dry-run", "--from", BASE.tag, "--to", TARGET.tag], cwd: runtime, env: { ...allowlistedEnvironment({ jqDirectory: jq.directory, shellDirectory: shell.directory }), SUPABASE_REPO_URL: repository } };
}
function classifyDryRun(output) {
  const text = `${output.stdout ?? ""}\n${output.stderr ?? ""}`;
  if (/0\.6\.0|0\.7\.0/.test(text) || !/0\.8\.0/.test(text)) return "GATE_UNEXPECTED";
  return "HISTORICAL_DRY_RUN_PASS";
}

export async function createRehearsalPlan(options = {}) {
  const repository = options.repository ?? "https://github.com/supabase/supabase.git";
  const generation = options.generation ?? safeGeneration();
  const project = `${PREFIX}${generation}`;
  const workspace = await mkdtemp(join(tmpdir(), `${project}-`));
  const evidence = { plannerResult: "ERROR", toolingStatus: "ERROR", executionReadiness: "BLOCKED", project, base: BASE, target: TARGET, fixtureContract: createFixtureContract(), gatewayPort: createGatewayPortContract(), workspaceCleaned: false };
  try {
    evidence.baseIdentity = await resolveExactTag({ repository, tag: BASE.tag, expectedCommit: BASE.commit, run: options.run ?? execFile });
    evidence.targetIdentity = await resolveExactTag({ repository, tag: TARGET.tag, expectedCommit: TARGET.commit, run: options.run ?? execFile });
    const productionContainers = await (options.listProductionContainers ?? listProductionContainers)(options.run ?? execFile);
    const snapshots = [{ label: "base", reference: BASE }, { label: "target", reference: TARGET }];
    const renders = {};
    const validations = {};
    for (const snapshot of snapshots) {
      const destination = join(workspace, snapshot.label);
      await (options.materializeSnapshot ?? materializeSnapshot)({ repository, tag: snapshot.reference.tag, expectedCommit: snapshot.reference.commit, destination, run: options.run ?? execFile });
      const composePath = join(destination, "docker-compose.yml");
      // Service inventory is intentionally read from source YAML, avoiding a production override and only naming declared services.
      const source = await readFile(composePath, "utf8");
      const services = servicesFromSource(source);
      const gateway = snapshot.label === "base" ? "kong" : "api-gw";
      if (!services.includes(gateway)) fail("SNAPSHOT_GATEWAY_MISSING");
      const runtime = join(workspace, "runtime", snapshot.label);
      await mkdir(runtime, { recursive: true });
      await cp(destination, runtime, { recursive: true });
      await writeSyntheticRuntimeEnv({ examplePath: join(destination, ".env.example"), destination: join(runtime, ".env") });
      const overridePath = join(workspace, `${snapshot.label}.override.yml`);
      await writeFile(overridePath, createIsolationOverride({ project, services, gatewayService: gateway }));
      const render = await (options.renderCompose ?? renderEffectiveCompose)(createComposeInvocation({ composePath: join(runtime, "docker-compose.yml"), overridePath, project, workspace }), options.run ?? execFile);
      if (!render.ok) fail(`EFFECTIVE_COMPOSE_RENDER_FAILED:${render.error ?? "UNKNOWN"}`);
      renders[snapshot.label] = render.model;
      validations[snapshot.label] = validateEffectiveCompose({ model: render.model, workspace, project, productionContainers });
    }
    evidence.baseCompose = "PASS"; evidence.targetCompose = "PASS"; evidence.composeValidation = validations;
    evidence.images = { base: await (options.inspectImages ?? inspectImages)(imagesFromCompose(renders.base), options.run ?? execFile), target: await (options.inspectImages ?? inspectImages)(imagesFromCompose(renders.target), options.run ?? execFile) };
    evidence.kongImage = evidence.images.base.missing.includes("kong/kong:3.9.3") ? "MISSING" : "PRESENT";
    evidence.cleanup = createCleanupContract({ project, workspace });
    const jq = await (options.resolveJq ?? resolveJq)({ jqBin: options.jqBin, run: options.run ?? execFile });
    const shell = await (options.resolveShell ?? resolveShell)({ shBin: options.shBin });
    evidence.jq = { status: jq.status };
    evidence.shell = { status: shell.status };
    const blockers = [
      ...[...new Set([...evidence.images.base.missing, ...evidence.images.target.missing])].sort().map((image) => `IMAGE_MISSING:${image}`),
      ...(jq.status === "JQ_AVAILABLE" ? [] : [jq.status]),
      ...(shell.status === "SH_AVAILABLE" ? [] : [shell.status]),
    ];
    evidence.blockers = blockers;
    evidence.toolingStatus = "TOOLING_READY";
    if (blockers.length) { evidence.dryRun = "NOT_RUN_PREREQUISITES"; evidence.executionReadiness = "BLOCKED_PREREQUISITES"; evidence.plannerResult = "EXECUTION_BLOCKED_PREREQUISITES"; return evidence; }
    const runtime = join(workspace, "runtime", "base");
    const invocation = createDryRunInvocation({ runtime, jq, shell, repository });
    evidence.dryRunInvocation = { args: invocation.args.slice(1), environment: Object.keys(invocation.env).sort() };
    const dryRun = await (options.runDryRun ?? execFile)(invocation.command, invocation.args, { cwd: invocation.cwd, env: invocation.env, windowsHide: true });
    evidence.dryRun = classifyDryRun(dryRun);
    evidence.toolingStatus = "TOOLING_READY";
    evidence.executionReadiness = evidence.dryRun === "HISTORICAL_DRY_RUN_PASS" ? "READY" : "BLOCKED";
    evidence.plannerResult = evidence.dryRun === "HISTORICAL_DRY_RUN_PASS" ? "TOOLING_READY" : "BLOCKED";
    return evidence;
  } catch (error) {
    evidence.blockedBy = safeError(error);
    evidence.plannerResult = /IDENTITY|UNRESOLVED|COMPOSE|ISOLATION|PORT|NETWORK|BIND|VOLUME|GATEWAY|SNAPSHOT/.test(evidence.blockedBy) ? "BLOCKED" : "ERROR";
    return evidence;
  }
  finally { await rm(workspace, { recursive: true, force: true }); evidence.workspaceCleaned = true; }
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!["--jq", "--sh"].includes(args[index]) || !args[index + 1]) fail("USAGE: npm run ops:supabase:update:rehearsal:plan [-- --jq <path>] [--sh <path>]");
    options[args[index] === "--jq" ? "jqBin" : "shBin"] = args[index + 1];
  }
  return options;
}
async function main() {
  const result = await createRehearsalPlan(parseArguments(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = ["TOOLING_READY", "EXECUTION_BLOCKED_PREREQUISITES"].includes(result.plannerResult) ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => { console.error(JSON.stringify({ plannerResult: "ERROR", blockedBy: safeError(error) })); process.exitCode = 1; });
}
