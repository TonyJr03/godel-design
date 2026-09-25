import { isAbsolute, relative, resolve, sep } from "node:path";

import { accessManagedRestoreSql } from "./restore-planning.mjs";
import { accessPostRestoreValidationSql } from "./restore-validation.mjs";
import { REQUIRED_TARGET_EXTENSIONS } from "./sql-audit.mjs";
import { isAdmittedLocalSupabaseStatus } from "./target-runtime-status.mjs";

const containerAuthorities = new WeakMap();
const PROJECT_ID_PATTERN = /^godel-m53-restore-[a-f0-9]{12}$/;
const FORBIDDEN_ENV = /(SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD|PROJECT_REF)|POSTGRES_PASSWORD|DATABASE_URL|R2_|AWS_|AGE_SECRET)/i;
const REQUIRED_TARGET_EXTENSION = REQUIRED_TARGET_EXTENSIONS[0];
export const LOCAL_TARGET_EXCLUDED_SERVICES = Object.freeze([
  "edge-runtime",
  "imgproxy",
  "logflare",
  "mailpit",
  "postgres-meta",
  "realtime",
  "studio",
  "supavisor",
  "vector",
]);
const GOVERNED_QUERIES = Object.freeze({
  migrationHistory: "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;",
  replicationRole: "SHOW session_replication_role;",
  targetCatalog: "SELECT table_schema || '.' || table_name FROM information_schema.tables WHERE table_schema IN ('public','private','auth','storage') ORDER BY 1;",
  requiredSchemas: "SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('public','private','auth','storage') ORDER BY 1;",
  requiredExtensions: `SELECT extname FROM pg_extension WHERE extname = '${REQUIRED_TARGET_EXTENSION}' ORDER BY extname;`,
  storageBucket: "SELECT id, public FROM storage.buckets WHERE id = 'godel-files';",
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryTargetCommandError";
  error.code = code;
  throw error;
}

function contained(parent, child) {
  const value = relative(resolve(parent), resolve(child));
  return value === "" || (value !== ".." && !value.startsWith(`..${sep}`) && !isAbsolute(value));
}

function expectedDbContainerName(projectId) {
  if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId)) fail("RECOVERY_TARGET_CONTAINER_INVALID", "Recovery target project ID is invalid");
  return `supabase_db_${projectId}`;
}

function allowedEnvironment(source = process.env) {
  const result = { SUPABASE_TELEMETRY_DISABLED: "1" };
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE"]) {
    if (typeof source?.[key] === "string") result[key] = source[key];
  }
  if (Object.keys(result).some((key) => FORBIDDEN_ENV.test(key))) fail("RECOVERY_TARGET_ENVIRONMENT_UNSAFE", "Target command environment is unsafe");
  return Object.freeze(result);
}

function plan(operation, executable, args, cwd, environment, stdin, { preserveOutput = false, maxOutputBytes } = {}) {
  if (args.includes("--linked") || args.some((value) => /(?:https?:\/\/|postgres(?:ql)?:\/\/)/i.test(value))) fail("RECOVERY_TARGET_COMMAND_UNSAFE", "Linked or remote target command is forbidden");
  const value = { operation, executable, args: Object.freeze(args), cwd, allowedEnvironment: environment };
  if (stdin !== undefined) value.stdin = stdin;
  if (preserveOutput) value.preserveOutput = true;
  if (maxOutputBytes !== undefined) value.maxOutputBytes = maxOutputBytes;
  return Object.freeze(value);
}

export function buildTargetCommandPlans({ repoRoot, target, environment = process.env } = {}) {
  if (!target || typeof target.projectId !== "string" || !PROJECT_ID_PATTERN.test(target.projectId) || typeof target.workdir !== "string") fail("RECOVERY_TARGET_INVALID", "Prepared target is invalid");
  const cli = resolve(repoRoot, "node_modules", "supabase", "dist", "supabase.js");
  if (!contained(resolve(repoRoot), cli)) fail("RECOVERY_TARGET_CLI_INVALID", "Supabase CLI must be repository-local");
  const env = allowedEnvironment(environment);
  const invoke = (operation, args) => plan(operation, process.execPath, [cli, ...args], target.workdir, env);
  const projectLabel = `label=com.supabase.cli.project=${target.projectId}`;
  return Object.freeze({
    start: invoke("start disposable recovery target", ["start", "--exclude", LOCAL_TARGET_EXCLUDED_SERVICES.join(","), "--yes"]),
    status: plan("read disposable recovery target status", process.execPath, [cli, "status", "--output", "json"], target.workdir, env, undefined, { preserveOutput: true, maxOutputBytes: 512 * 1024 }),
    discoverDb: plan("resolve disposable recovery database container", "docker", ["ps", "-a", "--filter", projectLabel, "--format", "{{json .}}"], target.workdir, env, undefined, { preserveOutput: true, maxOutputBytes: 512 * 1024 }),
    stop: invoke("stop exact disposable recovery target", ["stop", "--project-id", target.projectId, "--no-backup", "--yes"]),
    verifyCleanupContainers: plan("verify disposable target containers absent", "docker", ["ps", "-a", "--filter", projectLabel, "--format", "{{.ID}}"], target.workdir, env),
    verifyCleanupVolumes: plan("verify disposable target volumes absent", "docker", ["volume", "ls", "--filter", projectLabel, "--format", "{{.Name}}"], target.workdir, env),
    verifyCleanupNetworks: plan("verify disposable target networks absent", "docker", ["network", "ls", "--filter", projectLabel, "--format", "{{.ID}}"], target.workdir, env),
  });
}

export function resolveTargetDbContainer({ projectId, containers } = {}) {
  const expectedName = expectedDbContainerName(projectId);
  if (!Array.isArray(containers)) fail("RECOVERY_TARGET_CONTAINER_INVALID", "Docker metadata is invalid");
  for (const item of containers) {
    if (!item || typeof item !== "object" || item.labels?.["com.supabase.cli.project"] !== projectId) fail("RECOVERY_TARGET_FOREIGN_CONTAINER", "Docker discovery returned a foreign container");
  }
  const databases = containers.filter((item) => item.name === expectedName);
  if (databases.length === 0) fail("RECOVERY_TARGET_DB_CONTAINER_MISSING", "Disposable database container is missing");
  if (databases.length > 1) fail("RECOVERY_TARGET_DB_CONTAINER_AMBIGUOUS", "More than one disposable database container matched");
  const db = databases[0];
  const optionalServices = [db.labels?.["com.docker.compose.service"], db.labels?.["com.supabase.cli.service"]].filter((value) => value !== undefined);
  if (
    db.labels?.["com.docker.compose.project"] !== projectId
    || optionalServices.some((value) => value !== "db")
    || typeof db.image !== "string"
    || !/^(?:public\.ecr\.aws\/)?supabase\/postgres:[A-Za-z0-9._-]+$/.test(db.image)
  ) {
    fail("RECOVERY_TARGET_DB_CONTAINER_INVALID", "Disposable database container metadata is invalid");
  }
  if (db.state !== "running" || !new Set(["healthy", "none"]).has(db.health)) fail("RECOVERY_TARGET_DB_CONTAINER_NOT_READY", "Disposable database container is not ready");
  const authority = Object.freeze({ status: "VERIFIED", projectId });
  containerAuthorities.set(authority, Object.freeze({ name: db.name }));
  return authority;
}

function parseDockerLabels(value) {
  if (typeof value !== "string" || value.length === 0) fail("RECOVERY_TARGET_DOCKER_OUTPUT_INVALID", "Docker discovery labels are invalid");
  const labels = {};
  for (const entry of value.split(",")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) fail("RECOVERY_TARGET_DOCKER_OUTPUT_INVALID", "Docker discovery labels are invalid");
    const key = entry.slice(0, separator);
    const labelValue = entry.slice(separator + 1);
    if (Object.hasOwn(labels, key)) fail("RECOVERY_TARGET_DOCKER_OUTPUT_INVALID", "Docker discovery labels are invalid");
    labels[key] = labelValue;
  }
  return Object.freeze(labels);
}

function dockerHealth(status) {
  if (/\(unhealthy\)/i.test(status)) return "unhealthy";
  if (/\(healthy\)/i.test(status)) return "healthy";
  return "none";
}

export function admitDockerDbDiscovery({ projectId, rawOutput } = {}) {
  if (typeof projectId !== "string" || !PROJECT_ID_PATTERN.test(projectId) || typeof rawOutput !== "string") fail("RECOVERY_TARGET_DOCKER_OUTPUT_INVALID", "Docker discovery output is invalid");
  const lines = rawOutput.split(/\r?\n/).filter((line) => line.length > 0);
  const containers = lines.map((line) => {
    let item;
    try { item = JSON.parse(line); } catch { fail("RECOVERY_TARGET_DOCKER_OUTPUT_INVALID", "Docker discovery output is not valid JSON lines"); }
    if (!item || typeof item !== "object" || Array.isArray(item)
      || ![item.ID, item.Names, item.Image, item.State, item.Status, item.Labels].every((value) => typeof value === "string" && value.length > 0)) {
      fail("RECOVERY_TARGET_DOCKER_OUTPUT_INVALID", "Docker discovery metadata is invalid");
    }
    return Object.freeze({ id: item.ID, name: item.Names, image: item.Image, state: item.State.toLowerCase(), health: dockerHealth(item.Status), labels: parseDockerLabels(item.Labels) });
  });
  return resolveTargetDbContainer({ projectId, containers });
}

export function buildTargetPsqlPlan({ containerAuthority, cwd, environment = process.env, operation = "query", queryName, validationQuery, restoreSql } = {}) {
  const container = containerAuthorities.get(containerAuthority);
  if (!container) fail("RECOVERY_TARGET_CONTAINER_AUTHORITY_REQUIRED", "Verified database container authority is required");
  if (!new Set(["query", "restore"]).has(operation)) fail("RECOVERY_TARGET_PSQL_OPERATION_INVALID", "Target psql operation is invalid");
  let stdin;
  if (operation === "restore") accessManagedRestoreSql(restoreSql, (value) => { stdin = value; });
  else if (validationQuery !== undefined) accessPostRestoreValidationSql(validationQuery, (value) => { stdin = value; });
  else stdin = GOVERNED_QUERIES[queryName];
  if (typeof stdin !== "string" || stdin.length === 0) fail("RECOVERY_TARGET_PSQL_INPUT_REQUIRED", "Governed psql stdin is required");
  const args = ["exec", "-i", container.name, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  if (operation === "restore") args.push("--single-transaction");
  else args.push("-At");
  const description = operation === "restore" ? "restore admitted managed data" : `query disposable recovery database: ${queryName ?? validationQuery?.name}`;
  return plan(description, "docker", args, cwd, allowedEnvironment(environment), stdin, operation === "query" ? { preserveOutput: true, maxOutputBytes: 512 * 1024 } : undefined);
}

export function proveTargetIsolation({ session, target, runtimeSha, commandPlans, status, productionProjectRef, environment = {} } = {}) {
  const plans = Object.values(commandPlans ?? {});
  const ok = session && target && contained(session.target, target.workdir)
    && target.runtimeSha === runtimeSha
    && target.projectId !== productionProjectRef
    && plans.length >= 5
    && plans.every((item) => item && item.cwd === target.workdir && item.args.every((arg) => arg !== "--linked" && !String(arg).includes(productionProjectRef ?? "\0")))
    && isAdmittedLocalSupabaseStatus(status)
    && status.apiEndpoint === "LOCAL_LOOPBACK"
    && status.dbHost === "LOCAL_LOOPBACK"
    && status.storageS3Endpoint === "LOCAL_LOOPBACK"
    && status.requiredServices?.api === true
    && status.requiredServices?.database === true
    && status.requiredServices?.storageS3 === true
    && Object.keys(environment).every((key) => !FORBIDDEN_ENV.test(key));
  if (!ok) fail("RECOVERY_TARGET_ISOLATION_FAILED", "Disposable recovery target isolation could not be proven");
  return Object.freeze({ LOCAL_ONLY: true, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: runtimeSha });
}
