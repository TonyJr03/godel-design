import assert from "node:assert/strict";
import test from "node:test";

import { admitDockerDbDiscovery, buildTargetCommandPlans, buildTargetPsqlPlan, proveTargetIsolation, resolveTargetDbContainer } from "./target-commands.mjs";
import { buildManagedRestoreSql, buildMutableTablePlan, sanitizeEphemeralAuthState } from "./restore-planning.mjs";
import { admitManagedDataSql } from "./sql-admission.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

const PROJECT = "godel-m53-restore-abcdef123456";
const ROOT = "C:\\repo";
const WORKDIR = "C:\\recovery\\session\\target";
const target = { projectId: PROJECT, workdir: WORKDIR, runtimeSha: "e".repeat(40) };

function db(overrides = {}) {
  return {
    name: `supabase_db_${PROJECT}`,
    image: "public.ecr.aws/supabase/postgres:17",
    state: "running",
    health: "healthy",
    labels: { "com.supabase.cli.project": PROJECT, "com.docker.compose.service": "db" },
    ...overrides,
  };
}

function localStatus(overrides = {}) {
  return admitLocalSupabaseStatus(JSON.stringify({
    API_URL: "http://127.0.0.1:61001", DB_URL: "postgresql://postgres:local@127.0.0.1:61002/postgres",
    ANON_KEY: "anon", SERVICE_ROLE_KEY: "service", STORAGE_S3_URL: "http://localhost:61001/storage/v1/s3",
    S3_PROTOCOL_ACCESS_KEY_ID: "access", S3_PROTOCOL_ACCESS_KEY_SECRET: "secret", S3_PROTOCOL_REGION: "local", ...overrides,
  }));
}

function dockerLine({ project = PROJECT, name = `supabase_db_${PROJECT}`, image = "public.ecr.aws/supabase/postgres:17", state = "running", status = "Up 10 seconds (healthy)", service = "db" } = {}) {
  return JSON.stringify({ ID: "0123456789ab", Image: image, Command: "postgres", CreatedAt: "2026-09-25 00:00:00 +0000 UTC", RunningFor: "10 seconds", Ports: "", Status: status, Size: "0B", Names: name, Labels: `com.docker.compose.service=${service},com.supabase.cli.project=${project}`, Mounts: "", Networks: "bridge", State: state });
}

test("target command plans use repo-local CLI, explicit cwd and local operations without linked or secret argv", () => {
  const plans = buildTargetCommandPlans({ repoRoot: ROOT, target, environment: { PATH: "C:\\bin", SUPABASE_ACCESS_TOKEN: "must-not-pass" } });
  for (const plan of Object.values(plans)) {
    assert.equal(plan.cwd, WORKDIR);
    assert.ok(!plan.args.includes("--linked"));
    assert.ok(!plan.args.join(" ").includes("must-not-pass"));
    assert.equal(plan.allowedEnvironment.SUPABASE_TELEMETRY_DISABLED, "1");
  }
  assert.equal(plans.start.executable, process.execPath);
  assert.match(plans.start.args[0], /node_modules[\\/]supabase[\\/]dist[\\/]supabase\.js$/);
  assert.deepEqual(plans.stop.args.slice(-4), ["--project-id", PROJECT, "--no-backup", "--yes"]);
});

test("container resolution requires exactly one local DB with matching labels and healthy state", () => {
  const authority = resolveTargetDbContainer({ projectId: PROJECT, containers: [db()] });
  const query = buildTargetPsqlPlan({ containerAuthority: authority, cwd: WORKDIR, environment: {}, operation: "query", queryName: "replicationRole" });
  const admission = admitManagedDataSql("COPY public.perfiles (id) FROM stdin;\nfixture\n\\.\n");
  const mutable = buildMutableTablePlan({ admission, targetTables: ["public.perfiles"] });
  const restoreSql = buildManagedRestoreSql({ mutablePlan: mutable, sanitized: sanitizeEphemeralAuthState({ admission, mutablePlan: mutable }) });
  const restore = buildTargetPsqlPlan({ containerAuthority: authority, cwd: WORKDIR, environment: {}, operation: "restore", restoreSql });
  assert.deepEqual(query.args.slice(0, 4), ["exec", "-i", `supabase_db_${PROJECT}`, "psql"]);
  assert.ok(restore.args.includes("--single-transaction"));
  assert.ok(restore.args.includes("ON_ERROR_STOP=1"));
  assert.ok(!restore.args.some((arg) => /password|postgres(?:ql)?:\/\//i.test(arg)));
});

test("container resolution rejects foreign, ambiguous, and unhealthy DB containers", () => {
  assert.throws(() => resolveTargetDbContainer({ projectId: PROJECT, containers: [db({ labels: { "com.supabase.cli.project": "foreign", "com.docker.compose.service": "db" } })] }), { code: "RECOVERY_TARGET_FOREIGN_CONTAINER" });
  assert.throws(() => resolveTargetDbContainer({ projectId: PROJECT, containers: [db(), db()] }), { code: "RECOVERY_TARGET_DB_CONTAINER_AMBIGUOUS" });
  assert.throws(() => resolveTargetDbContainer({ projectId: PROJECT, containers: [db({ health: "unhealthy" })] }), { code: "RECOVERY_TARGET_DB_CONTAINER_NOT_READY" });
  assert.throws(() => resolveTargetDbContainer({ projectId: PROJECT, containers: [db({ image: "attacker/postgres:latest" })] }), { code: "RECOVERY_TARGET_DB_CONTAINER_INVALID" });
  assert.throws(() => buildTargetPsqlPlan({ containerAuthority: {}, cwd: WORKDIR, operation: "query", queryName: "replicationRole" }), { code: "RECOVERY_TARGET_CONTAINER_AUTHORITY_REQUIRED" });
  const authority = resolveTargetDbContainer({ projectId: PROJECT, containers: [db()] });
  assert.throws(() => buildTargetPsqlPlan({ containerAuthority: authority, cwd: WORKDIR, operation: "query", queryName: "caller-sql" }), { code: "RECOVERY_TARGET_PSQL_INPUT_REQUIRED" });
  assert.throws(() => buildTargetPsqlPlan({ containerAuthority: authority, cwd: WORKDIR, operation: "restore", restoreSql: {} }), { code: "RECOVERY_RESTORE_SQL_HANDLE_INVALID" });
});

test("raw docker ps JSON lines admit exactly the real-shaped local DB authority", () => {
  assert.equal(admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: `${dockerLine()}\n` }).status, "VERIFIED");
  assert.throws(() => admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: "{invalid" }), { code: "RECOVERY_TARGET_DOCKER_OUTPUT_INVALID" });
  assert.throws(() => admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: dockerLine({ project: "foreign" }) }), { code: "RECOVERY_TARGET_FOREIGN_CONTAINER" });
  assert.throws(() => admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: `${dockerLine()}\n${dockerLine()}` }), { code: "RECOVERY_TARGET_DB_CONTAINER_AMBIGUOUS" });
  assert.throws(() => admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: dockerLine({ service: "auth" }) }), { code: "RECOVERY_TARGET_DB_CONTAINER_AMBIGUOUS" });
  assert.throws(() => admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: JSON.stringify({ ID: "id", Image: "supabase/postgres:17", Names: `supabase_db_${PROJECT}`, State: "running", Status: "Up" }) }), { code: "RECOVERY_TARGET_DOCKER_OUTPUT_INVALID" });
  assert.throws(() => admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: dockerLine({ image: "attacker/postgres:latest" }) }), { code: "RECOVERY_TARGET_DB_CONTAINER_INVALID" });
  assert.throws(() => admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: dockerLine({ state: "exited", status: "Exited (1)" }) }), { code: "RECOVERY_TARGET_DB_CONTAINER_NOT_READY" });
  assert.throws(() => admitDockerDbDiscovery({ projectId: PROJECT, rawOutput: dockerLine({ status: "Up 10 seconds (unhealthy)" }) }), { code: "RECOVERY_TARGET_DB_CONTAINER_NOT_READY" });
});

test("target isolation proves local-only disposable authority", () => {
  const plans = buildTargetCommandPlans({ repoRoot: ROOT, target, environment: {} });
  assert.deepEqual(proveTargetIsolation({
    session: { target: WORKDIR }, target, runtimeSha: target.runtimeSha, commandPlans: plans,
    status: localStatus(),
    productionProjectRef: "production-ref", environment: {},
  }), { LOCAL_ONLY: true, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: target.runtimeSha });
});

test("target isolation fails linked evidence, foreign target, remote endpoint, or production environment", () => {
  const plans = buildTargetCommandPlans({ repoRoot: ROOT, target, environment: {} });
  const base = { session: { target: WORKDIR }, target, runtimeSha: target.runtimeSha, commandPlans: plans, status: localStatus(), productionProjectRef: "production-ref", environment: {} };
  assert.throws(() => proveTargetIsolation({ ...base, session: { target: "C:\\foreign" } }), { code: "RECOVERY_TARGET_ISOLATION_FAILED" });
  assert.throws(() => proveTargetIsolation({ ...base, status: {} }), { code: "RECOVERY_TARGET_ISOLATION_FAILED" });
  assert.throws(() => proveTargetIsolation({ ...base, environment: { SUPABASE_ACCESS_TOKEN: "x" } }), { code: "RECOVERY_TARGET_ISOLATION_FAILED" });
  const linked = { ...plans, start: { ...plans.start, args: [...plans.start.args, "--linked"] } };
  assert.throws(() => proveTargetIsolation({ ...base, commandPlans: linked }), { code: "RECOVERY_TARGET_ISOLATION_FAILED" });
});
