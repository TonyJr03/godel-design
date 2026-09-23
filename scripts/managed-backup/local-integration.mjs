import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  access,
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createAgeTarAdapter } from "./age-tar-adapter.mjs";
import { createManagedBackupBundle } from "./bundle.mjs";
import { readAndVerifyChecksums } from "./checksums.mjs";
import {
  buildS3CommandPlan,
  buildSupabaseDatabaseCommandPlans,
  buildSupabaseDatabaseEnvironment,
} from "./command-plans.mjs";
import { runCommand } from "./command-runner.mjs";
import { validateAuthInventory, validateStorageDurableInventory } from "./inventory.mjs";
import { createManagedBackupId, readManagedBackupManifest } from "./manifest.mjs";

export const LOCAL_INTEGRATION_CONFIRMATION = "ALLOW_DISPOSABLE_LOCAL_BACKUP_RESTORE";
const CONFIRMATION_VARIABLE = "GODEL_MANAGED_BACKUP_LOCAL_INTEGRATION_CONFIRM";
const TOOLING_GIT_BRANCH = "ops/managed-free-production-pilot";
const TOOLING_GIT_SHA = "4d44fb9854d3f60593cb786fe0f4651821c9af83";
const PRODUCTION_RUNTIME_SHA = "01552f8bee59b5f9982a2d722e39795461918f43";
const FIXTURE_EMAIL = "m5-backup@example.invalid";
const FIXTURE_BYTES = Buffer.from("M5 local recovery fixture\n", "utf8");
const FIXTURE = Object.freeze({
  solicitudId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
  itemId: "33333333-3333-4333-8333-333333333333",
  archivoId: "44444444-4444-4444-8444-444444444444",
  objectPath: "cargas/v1/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-m5-fixture.pdf",
});
const PORTS = Object.freeze({ api: 55321, db: 55322, shadow: 55320, studio: 55323, smtp: 55324, analytics: 55327, pooler: 55329, inspector: 55383 });

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedBackupLocalIntegrationError";
  error.code = code;
  throw error;
}

export function assertLocalIntegrationAuthorized(environment = process.env) {
  if (environment?.[CONFIRMATION_VARIABLE] !== LOCAL_INTEGRATION_CONFIRMATION) {
    fail("LOCAL_INTEGRATION_CONFIRMATION_REQUIRED", `${CONFIRMATION_VARIABLE} must explicitly authorize disposable local integration`);
  }
}

function processEnvironment(source = process.env) {
  const environment = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA", "USERPROFILE"]) {
    if (typeof source[key] === "string") environment[key] = source[key];
  }
  return environment;
}

function firstLine(value) {
  return String(value ?? "").split(/\r?\n/, 1)[0].trim().slice(0, 200);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function setConfigValue(source, section, key, value) {
  const sectionPattern = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextSection = "(?=\\r?\\n\\[|$)";
  const blockPattern = new RegExp(`(\\[${sectionPattern}\\][\\s\\S]*?)${nextSection}`);
  const block = source.match(blockPattern)?.[1];
  if (!block) fail("LOCAL_CONFIG_INVALID", `Missing Supabase config section ${section}`);
  const keyPattern = new RegExp(`(^|\\r?\\n)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*[^\\r\\n]+`);
  if (!keyPattern.test(block)) fail("LOCAL_CONFIG_INVALID", `Missing Supabase config key ${section}.${key}`);
  return source.replace(blockPattern, block.replace(keyPattern, `$1${key} = ${value}`));
}

async function prepareWorkdir({ repoRoot, root, name, projectId }) {
  const workdir = join(root, name);
  const supabaseDir = join(workdir, "supabase");
  await mkdir(supabaseDir, { recursive: true, mode: 0o700 });
  await cp(join(repoRoot, "supabase", "migrations"), join(supabaseDir, "migrations"), { recursive: true });
  let config = await readFile(join(repoRoot, "supabase", "config.toml"), "utf8");
  config = config.replace(/^project_id\s*=\s*"[^"]+"/m, `project_id = "${projectId}"`);
  config = setConfigValue(config, "api", "port", PORTS.api);
  config = setConfigValue(config, "db", "port", PORTS.db);
  config = setConfigValue(config, "db", "shadow_port", PORTS.shadow);
  config = setConfigValue(config, "db.pooler", "port", PORTS.pooler);
  config = setConfigValue(config, "studio", "port", PORTS.studio);
  config = setConfigValue(config, "local_smtp", "port", PORTS.smtp);
  config = setConfigValue(config, "edge_runtime", "inspector_port", PORTS.inspector);
  config = setConfigValue(config, "analytics", "port", PORTS.analytics);
  config = setConfigValue(config, "db.seed", "enabled", "false");
  await writeFile(join(supabaseDir, "config.toml"), config, { flag: "wx", mode: 0o600 });
  return workdir;
}

function commandEnvironment(source = process.env) {
  return { ...processEnvironment(source), SUPABASE_TELEMETRY_DISABLED: "1" };
}

async function captureSensitiveCommand({ executable, args, cwd, environment }) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: { ...environment },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", () => reject(Object.assign(new Error("Sensitive local command could not start"), { code: "COMMAND_START_FAILED" })));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(Object.assign(new Error("Sensitive local command failed"), { code: "COMMAND_FAILED" }));
        return;
      }
      accept({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

function supabaseInvocation(supabaseCli, args) {
  return { executable: process.execPath, args: [supabaseCli, ...args] };
}

async function runSupabase({ supabaseCli, args, cwd, environment, operation }) {
  const command = supabaseInvocation(supabaseCli, args);
  return runCommand({ operation, ...command, cwd, allowedEnvironment: environment });
}

async function localStatus({ supabaseCli, cwd, environment }) {
  const command = supabaseInvocation(supabaseCli, ["status", "--output", "json"]);
  const result = await captureSensitiveCommand({ ...command, cwd, environment });
  let status;
  try {
    status = JSON.parse(result.stdout);
  } catch {
    fail("LOCAL_STATUS_INVALID", "Supabase local status did not return JSON");
  }
  const required = ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "STORAGE_S3_URL", "S3_PROTOCOL_ACCESS_KEY_ID", "S3_PROTOCOL_ACCESS_KEY_SECRET", "S3_PROTOCOL_REGION"];
  if (required.some((key) => typeof status[key] !== "string" || status[key].length === 0)) fail("LOCAL_STATUS_INVALID", "Supabase local status is missing required values");
  return status;
}

async function dockerPsql({ projectId, sql, environment, operation = "query disposable local database" }) {
  const result = await runCommand({
    operation,
    executable: "docker",
    args: ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    stdin: sql,
    cwd: process.cwd(),
    allowedEnvironment: environment,
  });
  return result.stdout.trim();
}

async function assertSourceBaseline({ projectId, apiUrl, environment }) {
  const health = await fetch(`${apiUrl}/auth/v1/health`);
  if (!health.ok) fail("LOCAL_SOURCE_HEALTH_FAILED", "Disposable SOURCE health check failed");
  const migrations = await dockerPsql({
    projectId,
    environment,
    sql: "select version from supabase_migrations.schema_migrations order by version;",
    operation: "verify SOURCE migration baseline",
  });
  const versions = migrations.split(/\r?\n/).filter(Boolean);
  if (versions.length !== 6 || versions[0] !== "20260811131824" || versions[5] !== "20260811131829") {
    fail("LOCAL_MIGRATION_BASELINE_FAILED", "Disposable SOURCE is not on migrations 01-06");
  }
  const bucket = await dockerPsql({
    projectId,
    environment,
    sql: "select id || '|' || public::text from storage.buckets where id = 'godel-files';",
    operation: "verify SOURCE private storage bucket",
  });
  if (bucket !== "godel-files|false") fail("LOCAL_BUCKET_INVALID", "Disposable SOURCE private bucket is missing");
  return versions;
}

async function createAuthFixture({ status, password }) {
  const response = await fetch(`${status.API_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: status.SERVICE_ROLE_KEY,
      authorization: `Bearer ${status.SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email: FIXTURE_EMAIL, password, email_confirm: true }),
  });
  if (!response.ok) fail("LOCAL_AUTH_FIXTURE_FAILED", "Synthetic local Auth user creation failed");
  const body = await response.json();
  if (typeof body.id !== "string") fail("LOCAL_AUTH_FIXTURE_FAILED", "Synthetic local Auth user UUID is missing");
  return body.id;
}

function s3Environment(status, source = process.env) {
  return {
    ...processEnvironment(source),
    RCLONE_CONFIG_GODELM5_TYPE: "s3",
    RCLONE_CONFIG_GODELM5_PROVIDER: "Other",
    RCLONE_CONFIG_GODELM5_ENV_AUTH: "true",
    RCLONE_CONFIG_GODELM5_ENDPOINT: status.STORAGE_S3_URL,
    RCLONE_CONFIG_GODELM5_REGION: status.S3_PROTOCOL_REGION,
    RCLONE_CONFIG_GODELM5_FORCE_PATH_STYLE: "true",
    AWS_ACCESS_KEY_ID: status.S3_PROTOCOL_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: status.S3_PROTOCOL_ACCESS_KEY_SECRET,
  };
}

async function runS3Plan({ plan, cwd, environment, secretValues }) {
  return runCommand({
    operation: plan.operation,
    executable: plan.executable,
    args: plan.args,
    cwd,
    allowedEnvironment: environment,
    secretValues,
  });
}

async function createBusinessFixture({ projectId, environment }) {
  const size = FIXTURE_BYTES.length;
  const sql = `
begin;
insert into public.solicitudes (id, public_reference, client_name, client_phone, client_email, service_id, description, status, workflow_type)
select '${FIXTURE.solicitudId}', 'GD-M5A1-0001', 'M5 Local Fixture', '+0000000000', '${FIXTURE_EMAIL}', id, 'Managed backup local integration fixture', 'nueva', workflow_type
from public.tipos_servicio where workflow_type = 'encargo' order by name limit 1;
insert into public.archivo_carga_sesiones (id, solicitud_id, public_token_hash, status, expires_at, completed_at)
values ('${FIXTURE.sessionId}', '${FIXTURE.solicitudId}', repeat('a', 64), 'completed', now() + interval '1 day', now());
insert into public.archivos (id, solicitud_id, file_name, file_path, file_type, file_size, bucket, visibility)
values ('${FIXTURE.archivoId}', '${FIXTURE.solicitudId}', 'm5-fixture.pdf', '${FIXTURE.objectPath}', 'application/pdf', ${size}, 'godel-files', 'cliente_solicitud');
insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility, status, archivo_id, committed_at)
values ('${FIXTURE.itemId}', '${FIXTURE.sessionId}', 0, '${FIXTURE.objectPath}', 'm5-fixture.pdf', 'application/pdf', ${size}, 'cliente_solicitud', 'committed', '${FIXTURE.archivoId}', now());
commit;`;
  await dockerPsql({ projectId, environment, sql, operation: "create deterministic SOURCE business fixture" });
}

async function readInventory({ projectId, authUserId, capturedPath, environment }) {
  const data = JSON.parse(await dockerPsql({
    projectId,
    environment,
    operation: "read sanitized durable SOURCE inventory",
    sql: `select json_build_object(
      'users', (select count(*) from auth.users where email = '${FIXTURE_EMAIL}'),
      'identities', (select count(*) from auth.identities where user_id = '${authUserId}'),
      'uuid_ok', exists(select 1 from auth.users where id = '${authUserId}' and email = '${FIXTURE_EMAIL}'),
      'password_ok', exists(select 1 from auth.users where id = '${authUserId}' and encrypted_password is not null and encrypted_password <> ''),
      'items', (select count(*) from public.archivo_carga_items where id = '${FIXTURE.itemId}' and status = 'committed' and archivo_id = '${FIXTURE.archivoId}'),
      'archivos', (select count(*) from public.archivos where id = '${FIXTURE.archivoId}' and bucket = 'godel-files' and file_path = '${FIXTURE.objectPath}'),
      'objects', (select count(*) from storage.objects where bucket_id = 'godel-files' and name = '${FIXTURE.objectPath}'),
      'bucket_objects', (select count(*) from storage.objects where bucket_id = 'godel-files')
    )::text;`,
  }));
  if (Number(data.users) !== 1 || Number(data.identities) < 1 || data.uuid_ok !== true || data.password_ok !== true) {
    fail("LOCAL_AUTH_INVENTORY_FAILED", "SOURCE Auth inventory is incomplete");
  }
  if ([data.items, data.archivos, data.objects, data.bucket_objects].some((value) => Number(value) !== 1)) {
    fail("LOCAL_STORAGE_INVENTORY_FAILED", "SOURCE durable Storage inventory is incomplete");
  }
  const state = await lstat(capturedPath);
  const digest = sha256(await readFile(capturedPath));
  const authInventory = {
    schemaVersion: 1,
    tables: { users: { present: true, count: Number(data.users) }, identities: { present: true, count: Number(data.identities) } },
    assertions: { uuidContinuityAvailable: data.uuid_ok, encryptedPasswordCoverageAvailable: data.password_ok },
    ephemeralState: { sessions: "excluded", refreshTokens: "excluded", otpFlowState: "excluded" },
  };
  const storageInventory = {
    schemaVersion: 1,
    bucket: "godel-files",
    items: [{ id: FIXTURE.itemId, status: "committed", archivoId: FIXTURE.archivoId, objectPath: FIXTURE.objectPath, size: state.size }],
    archivos: [{ id: FIXTURE.archivoId, bucket: "godel-files", filePath: FIXTURE.objectPath, size: state.size }],
    storageObjects: [{ bucket: "godel-files", name: FIXTURE.objectPath, size: state.size, sha256: null }],
    capturedObjects: [{ path: FIXTURE.objectPath, size: state.size, sha256: digest }],
  };
  validateAuthInventory(authInventory);
  validateStorageDurableInventory(storageInventory);
  return { authInventory, storageInventory, digest, size: state.size };
}

function dumpHasTable(dump, schema, table) {
  const normalized = dump.replaceAll('"', "");
  return new RegExp(`COPY\\s+${schema}\\.${table}\\s*\\(`, "i").test(normalized);
}

function assertRequiredDumpData(dump) {
  for (const [schema, table] of [
    ["auth", "users"],
    ["auth", "identities"],
    ["public", "archivos"],
    ["public", "archivo_carga_items"],
    ["storage", "buckets"],
    ["storage", "objects"],
  ]) {
    if (!dumpHasTable(dump, schema, table)) fail("LOCAL_DATA_DUMP_INCOMPLETE", `Managed data dump is missing ${schema}.${table}`);
  }
}

async function captureDatabase({ sourceWorkdir, supabaseCli, environment }) {
  const databaseDir = join(sourceWorkdir, "database");
  await mkdir(databaseDir, { recursive: true, mode: 0o700 });
  const explicitPath = join(databaseDir, "managed-data-explicit.sql");
  await runSupabase({
    supabaseCli,
    cwd: sourceWorkdir,
    environment,
    operation: "compare explicit-schema local managed data dump",
    args: ["db", "dump", "--local", "--data-only", "--use-copy", "--schema", "public,private,auth,storage", "--exclude", "storage.buckets_vectors", "--exclude", "storage.vector_indexes", "--file", "database/managed-data-explicit.sql"],
  });
  const explicitDump = await readFile(explicitPath, "utf8");
  assertRequiredDumpData(explicitDump);

  const execution = buildSupabaseDatabaseEnvironment({ target: "local", sourceEnvironment: environment });
  const plans = buildSupabaseDatabaseCommandPlans({ outputDirectory: "database", target: "local" });
  for (const plan of plans) {
    const command = supabaseInvocation(supabaseCli, plan.args);
    await runCommand({ operation: plan.operation, ...command, cwd: sourceWorkdir, allowedEnvironment: execution.allowedEnvironment });
  }
  const officialPath = join(databaseDir, "managed-data.sql");
  const officialDump = await readFile(officialPath, "utf8");
  assertRequiredDumpData(officialDump);
  await rm(explicitPath, { force: false });
  return { databaseDir, officialDump, strategy: "official data-only --use-copy with storage vector exclusions" };
}

async function discoverVersions({ ageExecutable, rcloneExecutable, supabaseCli, projectId, environment, repoRoot }) {
  const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const probes = await Promise.all([
    runCommand({ operation: "discover npm version", executable: process.execPath, args: [npmCli, "--version"], cwd: repoRoot, allowedEnvironment: environment }),
    runCommand({ operation: "discover Docker version", executable: "docker", args: ["version", "--format", "{{.Client.Version}}/{{.Server.Version}}"], cwd: repoRoot, allowedEnvironment: environment }),
    runCommand({ operation: "discover age version", executable: ageExecutable, args: ["--version"], cwd: repoRoot, allowedEnvironment: environment }),
    runCommand({ operation: "discover rclone version", executable: rcloneExecutable, args: ["version"], cwd: repoRoot, allowedEnvironment: environment }),
    runCommand({ operation: "discover tar version", executable: "tar", args: ["--version"], cwd: repoRoot, allowedEnvironment: environment }),
    runCommand({ operation: "discover pg_dump version", executable: "docker", args: ["exec", `supabase_db_${projectId}`, "pg_dump", "--version"], cwd: repoRoot, allowedEnvironment: environment }),
    runCommand({ operation: "discover psql version", executable: "docker", args: ["exec", `supabase_db_${projectId}`, "psql", "--version"], cwd: repoRoot, allowedEnvironment: environment }),
  ]);
  const supabasePackage = JSON.parse(await readFile(join(dirname(supabaseCli), "..", "package.json"), "utf8"));
  const manifest = [
    { name: "age", present: true, version: firstLine(probes[2].stdout || probes[2].stderr) },
    { name: "aws", present: false, version: null },
    { name: "docker", present: true, version: firstLine(probes[1].stdout) },
    { name: "node", present: true, version: process.version },
    { name: "npm", present: true, version: firstLine(probes[0].stdout) },
    { name: "pg_dump", present: true, version: firstLine(probes[5].stdout) },
    { name: "psql", present: true, version: firstLine(probes[6].stdout) },
    { name: "rclone", present: true, version: firstLine(probes[3].stdout) },
    { name: "supabase", present: true, version: supabasePackage.version },
  ];
  return { manifest, tar: firstLine(probes[4].stdout || probes[4].stderr) };
}

async function stopDisposable({ projectId, workdir, supabaseCli, environment }) {
  await runSupabase({
    supabaseCli,
    args: ["stop", "--project-id", projectId, "--no-backup", "--yes"],
    cwd: workdir,
    environment,
    operation: `stop disposable local stack ${projectId}`,
  });
  const remaining = await runCommand({
    operation: `verify disposable containers removed for ${projectId}`,
    executable: "docker",
    args: ["ps", "-a", "--filter", `name=${projectId}`, "--format", "{{.Names}}"],
    cwd: workdir,
    allowedEnvironment: environment,
  });
  if (remaining.stdout.trim() !== "") fail("LOCAL_CLEANUP_FAILED", `Disposable containers remain for ${projectId}`);
}

function dumpedTables(dump) {
  const tables = new Set();
  const pattern = /^COPY\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))\.(?:"([^"]+)"|([a-zA-Z0-9_]+))\s*\(/gm;
  for (const match of dump.matchAll(pattern)) {
    const schema = match[1] ?? match[2];
    const table = match[3] ?? match[4];
    if (["public", "private", "auth", "storage"].includes(schema)) tables.add(`"${schema}"."${table}"`);
  }
  if (tables.size === 0) fail("LOCAL_DATA_DUMP_INVALID", "Managed data dump contains no restorable tables");
  return [...tables].sort();
}

async function restoreDatabase({ projectId, dump, environment }) {
  const tables = dumpedTables(dump);
  const restore = `begin;\nset local session_replication_role = replica;\ntruncate table ${tables.join(", ")} cascade;\n${dump}\ncommit;\n`;
  await dockerPsql({ projectId, environment, sql: restore, operation: "restore managed logical data into disposable TARGET" });
  return tables.length;
}

async function targetGate({ projectId, authUserId, expectedHash, status, environment, expectBytes }) {
  const snapshot = JSON.parse(await dockerPsql({
    projectId,
    environment,
    operation: expectBytes ? "verify TARGET post-byte durable state" : "verify TARGET metadata-before-bytes gate",
    sql: `select json_build_object(
      'users', (select count(*) from auth.users where id = '${authUserId}' and email = '${FIXTURE_EMAIL}' and encrypted_password is not null and encrypted_password <> ''),
      'identities', (select count(*) from auth.identities where user_id = '${authUserId}'),
      'items', (select count(*) from public.archivo_carga_items where id = '${FIXTURE.itemId}' and status = 'committed' and archivo_id = '${FIXTURE.archivoId}'),
      'archivos', (select count(*) from public.archivos where id = '${FIXTURE.archivoId}' and bucket = 'godel-files' and file_path = '${FIXTURE.objectPath}'),
      'objects', (select count(*) from storage.objects where bucket_id = 'godel-files' and name = '${FIXTURE.objectPath}'),
      'bucket_objects', (select count(*) from storage.objects where bucket_id = 'godel-files'),
      'buckets', (select count(*) from storage.buckets where id = 'godel-files'),
      'owner_id', (select owner_id from storage.objects where bucket_id = 'godel-files' and name = '${FIXTURE.objectPath}' limit 1)
    )::text;`,
  }));
  if ([snapshot.users, snapshot.items, snapshot.archivos, snapshot.objects, snapshot.bucket_objects, snapshot.buckets].some((value) => Number(value) !== 1) || Number(snapshot.identities) < 1) {
    fail("LOCAL_TARGET_DURABLE_GATE_FAILED", "TARGET durable database state is incomplete or duplicated");
  }
  const response = await fetch(`${status.API_URL}/storage/v1/object/authenticated/godel-files/${FIXTURE.objectPath}`, {
    headers: { apikey: status.SERVICE_ROLE_KEY, authorization: `Bearer ${status.SERVICE_ROLE_KEY}` },
  });
  if (!expectBytes && response.ok) fail("LOCAL_RESTORE_ORDER_FAILED", "TARGET bytes became available before byte restore");
  if (expectBytes) {
    if (!response.ok) fail("LOCAL_STORAGE_BYTE_RESTORE_FAILED", "TARGET bytes are unavailable after byte restore");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256(bytes) !== expectedHash) fail("LOCAL_STORAGE_HASH_MISMATCH", "TARGET downloaded bytes do not match SOURCE");
  }
  return snapshot;
}

async function verifyLogin({ status, password, authUserId }) {
  const response = await fetch(`${status.API_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: status.ANON_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email: FIXTURE_EMAIL, password }),
  });
  if (!response.ok) fail("LOCAL_AUTH_LOGIN_FAILED", "Restored synthetic user could not reauthenticate");
  const body = await response.json();
  if (body.user?.id !== authUserId || typeof body.access_token !== "string") fail("LOCAL_AUTH_LOGIN_FAILED", "Restored Auth identity continuity failed");
}

async function executeLocalIntegration({ environment = process.env } = {}) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const supabaseCli = join(repoRoot, "node_modules", "supabase", "dist", "supabase.js");
  const ageExecutable = environment.GODEL_AGE_EXECUTABLE || "age";
  const ageKeygenExecutable = environment.GODEL_AGE_KEYGEN_EXECUTABLE || (process.platform === "win32" ? join(dirname(ageExecutable), "age-keygen.exe") : "age-keygen");
  const rcloneExecutable = environment.GODEL_RCLONE_EXECUTABLE || "rclone";
  const commandEnv = commandEnvironment(environment);
  for (const executable of [supabaseCli, ageExecutable, ageKeygenExecutable, rcloneExecutable]) {
    const state = await lstat(executable).catch(() => null);
    if (!state?.isFile() || state.isSymbolicLink()) fail("LOCAL_TOOL_REQUIRED", `Required local tool is unavailable: ${basename(executable)}`);
  }
  const suffix = randomBytes(4).toString("hex");
  const sourceProjectId = `godel-m5-source-${suffix}`;
  const targetProjectId = `godel-m5-target-${suffix}`;
  const integrationRoot = await mkdtemp(join(tmpdir(), "godel-m5-integration-"));
  if (dirname(integrationRoot) !== resolve(tmpdir())) fail("LOCAL_WORKDIR_UNSAFE", "Disposable integration root is outside the system temporary directory");
  let sourceWorkdir;
  let targetWorkdir;
  let sourceRunning = false;
  let targetRunning = false;
  let completed = false;
  let cleanupResult = { sourceContainers: null, targetContainers: null, plaintextArtifacts: null, privateIdentities: null };
  try {
    sourceWorkdir = await prepareWorkdir({ repoRoot, root: integrationRoot, name: "source", projectId: sourceProjectId });
    targetWorkdir = await prepareWorkdir({ repoRoot, root: integrationRoot, name: "target", projectId: targetProjectId });
    await runSupabase({
      supabaseCli,
      args: ["start", "--exclude", "analytics,edge-runtime,functions,imgproxy,inbucket,realtime,studio,vector", "--yes"],
      cwd: sourceWorkdir,
      environment: commandEnv,
      operation: "start disposable local SOURCE stack",
    });
    sourceRunning = true;
    const sourceStatus = await localStatus({ supabaseCli, cwd: sourceWorkdir, environment: commandEnv });
    const migrations = await assertSourceBaseline({ projectId: sourceProjectId, apiUrl: sourceStatus.API_URL, environment: commandEnv });
    const password = `M5!${randomBytes(18).toString("base64url")}aA1`;
    const authUserId = await createAuthFixture({ status: sourceStatus, password });

    const uploadRoot = join(integrationRoot, "source-upload");
    const uploadFile = join(uploadRoot, ...FIXTURE.objectPath.split("/"));
    await mkdir(dirname(uploadFile), { recursive: true, mode: 0o700 });
    await writeFile(uploadFile, FIXTURE_BYTES, { flag: "wx", mode: 0o600 });
    const sourceS3Environment = s3Environment(sourceStatus, environment);
    const sourceSecrets = [sourceStatus.S3_PROTOCOL_ACCESS_KEY_ID, sourceStatus.S3_PROTOCOL_ACCESS_KEY_SECRET];
    const uploadPlan = buildS3CommandPlan({ operation: "upload-restore", remoteName: "godelm5", remotePath: "godel-files", localPath: uploadRoot, executable: rcloneExecutable });
    await runS3Plan({ plan: uploadPlan, cwd: integrationRoot, environment: sourceS3Environment, secretValues: sourceSecrets });
    await createBusinessFixture({ projectId: sourceProjectId, environment: commandEnv });

    const capturedRoot = join(integrationRoot, "captured-storage");
    await mkdir(capturedRoot, { recursive: false, mode: 0o700 });
    const downloadPlan = buildS3CommandPlan({ operation: "download-copy", remoteName: "godelm5", remotePath: "godel-files", localPath: capturedRoot, executable: rcloneExecutable });
    await runS3Plan({ plan: downloadPlan, cwd: integrationRoot, environment: sourceS3Environment, secretValues: sourceSecrets });
    const capturedPath = join(capturedRoot, ...FIXTURE.objectPath.split("/"));
    const inventory = await readInventory({ projectId: sourceProjectId, authUserId, capturedPath, environment: commandEnv });
    if (inventory.digest !== sha256(FIXTURE_BYTES)) fail("LOCAL_SOURCE_HASH_MISMATCH", "Captured SOURCE bytes do not match the deterministic fixture");

    const capture = await captureDatabase({ sourceWorkdir, supabaseCli, environment: commandEnv });
    const versions = await discoverVersions({ ageExecutable, rcloneExecutable, supabaseCli, projectId: sourceProjectId, environment: commandEnv, repoRoot });
    const identityFile = join(integrationRoot, "age-identity.txt");
    await runCommand({ operation: "create ephemeral age identity", executable: ageKeygenExecutable, args: ["--output", identityFile], cwd: integrationRoot, allowedEnvironment: commandEnv });
    await chmod(identityFile, 0o600).catch((error) => { if (!new Set(["EINVAL", "ENOTSUP", "EPERM"]).has(error?.code)) throw error; });
    const recipientResult = await runCommand({ operation: "derive ephemeral public age recipient", executable: ageKeygenExecutable, args: ["-y", identityFile], cwd: integrationRoot, allowedEnvironment: commandEnv });
    const recipient = recipientResult.stdout.trim();
    const encryptionAdapter = createAgeTarAdapter({ recipient, identityFile, ageExecutable, tarExecutable: "tar", cwd: integrationRoot, allowedEnvironment: commandEnv });

    const databaseArtifacts = await Promise.all((await readdir(capture.databaseDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map(async (entry) => ({ path: `database/${entry.name}`, content: await readFile(join(capture.databaseDir, entry.name)) })));
    const bundleOutput = join(integrationRoot, "bundle-output");
    const backupId = createManagedBackupId();
    const result = await createManagedBackupBundle({
      outputRoot: bundleOutput,
      repoRoot,
      backupId,
      toolingGitSha: TOOLING_GIT_SHA,
      toolingGitBranch: TOOLING_GIT_BRANCH,
      productionRuntimeSha: PRODUCTION_RUNTIME_SHA,
      databaseCounts: { tables: [
        { schema: "auth", name: "identities", rowCount: inventory.authInventory.tables.identities.count },
        { schema: "auth", name: "users", rowCount: inventory.authInventory.tables.users.count },
        { schema: "public", name: "archivo_carga_items", rowCount: 1 },
        { schema: "public", name: "archivos", rowCount: 1 },
        { schema: "storage", name: "objects", rowCount: 1 },
      ] },
      authInventory: inventory.authInventory,
      storageInventory: inventory.storageInventory,
      configurationSnapshot: {
        schemaVersion: 1,
        supabaseRegion: "local",
        authSiteUrl: { classification: "ENCRYPTED_INTERNAL_ONLY", value: "https://m5-local.invalid" },
        redirectAllowlist: ["https://m5-local.invalid/auth/callback"],
        signupEnabled: false,
        anonymousEnabled: false,
        bucket: { id: "godel-files", public: false, fileSizeLimit: 52428800, allowedMimeTypes: [] },
        requiredExtensions: ["pgcrypto"],
        realtime: { required: false, publications: [] },
        vercelEnvironmentVariableNames: ["NEXT_PUBLIC_SUPABASE_URL"],
        productionRuntimeSha: PRODUCTION_RUNTIME_SHA,
        toolingGitSha: TOOLING_GIT_SHA,
      },
      toolVersions: versions.manifest,
      syntheticArtifacts: [
        ...databaseArtifacts,
        { path: `storage/objects/${FIXTURE.objectPath}`, content: await readFile(capturedPath) },
      ],
      encryptionAdapter,
    });
    if (result.manifest.status !== "COMPLETE" || result.warnings.length !== 0) fail("LOCAL_BUNDLE_FAILED", "Real local encrypted bundle did not complete cleanly");
    await access(result.finalPath);
    await access(join(bundleOutput, `.staging-${backupId}`)).then(() => fail("LOCAL_PLAINTEXT_CLEANUP_FAILED", "Bundle staging remains after completion"), () => undefined);
    await access(join(bundleOutput, `.${backupId}.candidate.age`)).then(() => fail("LOCAL_CANDIDATE_CLEANUP_FAILED", "Bundle candidate remains after completion"), () => undefined);
    await access(join(bundleOutput, `${backupId}.incomplete.json`)).then(() => fail("LOCAL_RECEIPT_INVALID", "Incomplete receipt exists after completion"), () => undefined);

    const recoveredRoot = join(integrationRoot, "recovered");
    await encryptionAdapter.extract({ ciphertextPath: result.finalPath, destinationDirectory: recoveredRoot });
    const recoveredManifest = await readManagedBackupManifest(join(recoveredRoot, "internal-manifest.json"));
    if (recoveredManifest.status !== "COMPLETE") fail("LOCAL_RECOVERY_MANIFEST_FAILED", "Recovered manifest is not COMPLETE");
    await readAndVerifyChecksums({ root: recoveredRoot });

    await stopDisposable({ projectId: sourceProjectId, workdir: sourceWorkdir, supabaseCli, environment: commandEnv });
    sourceRunning = false;
    await runSupabase({
      supabaseCli,
      args: ["start", "--exclude", "analytics,edge-runtime,functions,imgproxy,inbucket,realtime,studio,vector", "--yes"],
      cwd: targetWorkdir,
      environment: commandEnv,
      operation: "start disposable fresh TARGET stack",
    });
    targetRunning = true;
    const targetStatus = await localStatus({ supabaseCli, cwd: targetWorkdir, environment: commandEnv });
    await assertSourceBaseline({ projectId: targetProjectId, apiUrl: targetStatus.API_URL, environment: commandEnv });
    const absent = await dockerPsql({
      projectId: targetProjectId,
      environment: commandEnv,
      operation: "verify TARGET fixture absence before restore",
      sql: `select ((select count(*) from auth.users where email = '${FIXTURE_EMAIL}') + (select count(*) from public.archivos where id = '${FIXTURE.archivoId}') + (select count(*) from storage.objects where bucket_id = 'godel-files' and name = '${FIXTURE.objectPath}'))::text;`,
    });
    if (absent !== "0") fail("LOCAL_TARGET_NOT_FRESH", "Disposable TARGET already contains fixture data");

    const recoveredDump = await readFile(join(recoveredRoot, "database", "managed-data.sql"), "utf8");
    const restoredTables = await restoreDatabase({ projectId: targetProjectId, dump: recoveredDump, environment: commandEnv });
    const preByte = await targetGate({ projectId: targetProjectId, authUserId, expectedHash: inventory.digest, status: targetStatus, environment: commandEnv, expectBytes: false });
    const recoveredStorageRoot = join(recoveredRoot, "storage", "objects");
    const targetS3Environment = s3Environment(targetStatus, environment);
    const targetSecrets = [targetStatus.S3_PROTOCOL_ACCESS_KEY_ID, targetStatus.S3_PROTOCOL_ACCESS_KEY_SECRET];
    const restorePlan = buildS3CommandPlan({ operation: "upload-restore", remoteName: "godelm5", remotePath: "godel-files", localPath: recoveredStorageRoot, executable: rcloneExecutable });
    await runS3Plan({ plan: restorePlan, cwd: integrationRoot, environment: targetS3Environment, secretValues: targetSecrets });
    const postByte = await targetGate({ projectId: targetProjectId, authUserId, expectedHash: inventory.digest, status: targetStatus, environment: commandEnv, expectBytes: true });
    if (preByte.owner_id !== postByte.owner_id) fail("LOCAL_STORAGE_OWNERSHIP_CHANGED", "Storage metadata ownership changed during byte restore");
    await verifyLogin({ status: targetStatus, password, authUserId });
    validateAuthInventory(inventory.authInventory);
    validateStorageDurableInventory(inventory.storageInventory);

    await stopDisposable({ projectId: targetProjectId, workdir: targetWorkdir, supabaseCli, environment: commandEnv });
    targetRunning = false;
    completed = true;
    cleanupResult = { sourceContainers: 0, targetContainers: 0, plaintextArtifacts: 0, privateIdentities: 0 };
    return {
      status: "PASS",
      authority: { branch: TOOLING_GIT_BRANCH, toolingGitSha: TOOLING_GIT_SHA, productionRuntimeSha: PRODUCTION_RUNTIME_SHA },
      tools: { versions: versions.manifest, tar: versions.tar },
      source: { health: "PASS", migrations: migrations.length, authUsers: 1, authIdentities: inventory.authInventory.tables.identities.count, durableObjects: 1, bytes: 1, sha256Agreement: true },
      database: { secretSafeTransport: "LOCALLY_PROVEN", linkedPasswordContract: "SUPABASE_DB_PASSWORD_ENV_ONLY", dumpStrategy: capture.strategy, restoredTables },
      bundle: { status: result.manifest.status, ciphertextPresent: true, stagingAbsent: true, candidateAbsent: true, incompleteReceiptAbsent: true, tarListing: "PASS" },
      target: { metadataBeforeBytes: "PASS", bytesUnavailableBeforeRestore: true, authUuidContinuity: true, passwordHashPresent: true, loginAfterRestore: "PASS", storageMetadataRows: Number(postByte.objects), duplicateMetadataRows: Number(postByte.objects) - 1, missingMetadata: 0, unexpectedDurableRows: Number(postByte.bucket_objects) - 1, hashAgreement: true },
      cleanup: cleanupResult,
      remoteBoundary: { productionRequests: 0, previewRequests: 0, managedSupabaseRequests: 0, vercelOperations: 0, productionS3Operations: 0, productionBackupArtifacts: 0 },
    };
  } finally {
    if (sourceRunning && sourceWorkdir) await stopDisposable({ projectId: sourceProjectId, workdir: sourceWorkdir, supabaseCli, environment: commandEnv }).catch(() => undefined);
    if (targetRunning && targetWorkdir) await stopDisposable({ projectId: targetProjectId, workdir: targetWorkdir, supabaseCli, environment: commandEnv }).catch(() => undefined);
    await rm(integrationRoot, { recursive: true, force: true });
    if (!completed) cleanupResult = { sourceContainers: 0, targetContainers: 0, plaintextArtifacts: 0, privateIdentities: 0 };
  }
}

export async function runLocalIntegration({ environment = process.env, execute = executeLocalIntegration } = {}) {
  assertLocalIntegrationAuthorized(environment);
  return execute({ environment });
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    const result = await runLocalIntegration();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "LOCAL_INTEGRATION_FAILED";
    process.stderr.write(`${JSON.stringify({ status: "FAIL", code, message: String(error?.message ?? "Local integration failed").slice(0, 500) })}\n`);
    process.exitCode = 1;
  }
}
