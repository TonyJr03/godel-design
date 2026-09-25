import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { ManagedBackupCommandError } from "../managed-backup/command-runner.mjs";
import { MANAGED_BASELINE_MIGRATIONS } from "./runtime-authority.mjs";
import { buildTargetCommandPlans } from "./target-commands.mjs";
import {
  LOCAL_TARGET_BRANCH,
  LOCAL_TARGET_CONFIRMATION,
  PRODUCTION_RUNTIME_SHA,
  TOOLING_SHA_ENV,
  createGovernedLocalTargetExecutor,
  executeGovernedLocalTargetPlan,
  preflightLocalTargetDrill,
  runLocalTargetCompatibilityDrill,
  sanitizeLocalTargetDrillFailure,
} from "./local-target-drill.mjs";

const TOOLING_SHA = "e52237fb405d6c43a6c3cd5add9507d3c68dc381";
const PROJECT = "godel-m53-restore-abcdef123456";
const WORKDIR = "C:\\recovery\\session\\target";
const VERSIONS = MANAGED_BASELINE_MIGRATIONS.map((name) => name.slice(0, 14));
const TABLES = ["auth.identities", "auth.schema_migrations", "auth.users", "public.perfiles", "storage.buckets", "storage.migrations", "storage.objects"];

function environment(overrides = {}) {
  return { GODEL_MANAGED_RECOVERY_LOCAL_TARGET_CONFIRM: LOCAL_TARGET_CONFIRMATION, [TOOLING_SHA_ENV]: TOOLING_SHA, ...overrides };
}

function preflightExecutor({ branch = LOCAL_TARGET_BRANCH, head = TOOLING_SHA, clean = true, runtimeAvailable = true } = {}, calls = []) {
  return async (plan) => {
    calls.push(plan);
    if (plan.executable === "docker") return { stdout: "26.1.4/26.1.4\n", stderr: "" };
    if (plan.args[0] === "branch") return { stdout: `${branch}\n`, stderr: "" };
    if (plan.args[0] === "rev-parse") return { stdout: `${head}\n`, stderr: "" };
    if (plan.args[0] === "status") return { stdout: clean ? "" : " M governed-file\n", stderr: "" };
    if (plan.args[0] === "cat-file") {
      if (!runtimeAvailable) throw new Error("synthetic unavailable commit");
      assert.equal(plan.args[2], `${PRODUCTION_RUNTIME_SHA}^{commit}`);
      return { stdout: "", stderr: "" };
    }
    throw new Error("unexpected preflight command");
  };
}

test("confirmation is required before Git, CLI admission, session, or Docker work", async () => {
  let calls = 0;
  await assert.rejects(preflightLocalTargetDrill({ environment: {}, repoRoot: process.cwd(), execute: async () => { calls += 1; }, admitSupabaseCli: async () => { calls += 1; } }), { code: "LOCAL_RECOVERY_CONFIRMATION_REQUIRED" });
  assert.equal(calls, 0);
  await assert.rejects(runLocalTargetCompatibilityDrill({ environment: {}, dependencies: { preflight: async () => { calls += 1; }, createSession: async () => { calls += 1; } } }), { code: "LOCAL_RECOVERY_CONFIRMATION_REQUIRED" });
  assert.equal(calls, 0);
});

test("preflight admits exact Git/runtime/CLI/Docker authority without age, rclone, identity, R2, or Production", async () => {
  const calls = [];
  const repoRoot = process.cwd();
  const result = await preflightLocalTargetDrill({
    environment: environment({
      PATH: "C:\\tools",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "safe.directory",
      GIT_CONFIG_VALUE_0: "*",
      GIT_CONFIG_GLOBAL: "C:\\untrusted\\global.config",
      GODEL_MANAGED_RECOVERY_IDENTITY_FILE: "ignored",
      R2_SECRET_ACCESS_KEY: "ignored",
    }), repoRoot, execute: preflightExecutor({}, calls),
    admitSupabaseCli: async () => ({ version: "2.109.1" }),
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.runtimeCommit, "AVAILABLE");
  assert.deepEqual([...new Set(calls.map(({ executable }) => executable))].sort(), ["docker", "git"]);
  assert.ok(calls.every((plan) => !/age|rclone|production/i.test(plan.executable)));
  const expectedGitEnvironment = {
    PATH: "C:\\tools",
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "safe.directory",
    GIT_CONFIG_VALUE_0: "",
    GIT_CONFIG_KEY_1: "safe.directory",
    GIT_CONFIG_VALUE_1: resolve(repoRoot),
  };
  const gitCalls = calls.filter(({ executable }) => executable === "git");
  assert.deepEqual(gitCalls.map(({ args }) => args[0]).sort(), ["branch", "cat-file", "rev-parse", "status"]);
  assert.ok(gitCalls.every(({ allowedEnvironment }) => Object.isFrozen(allowedEnvironment)));
  for (const { allowedEnvironment } of gitCalls) assert.deepEqual(allowedEnvironment, expectedGitEnvironment);
});

test("preflight rejects wrong branch, wrong HEAD, dirty worktree, unavailable runtime, and Production confirmations", async () => {
  for (const [options, code] of [
    [{ branch: "wrong" }, "WRONG_TOOLING_BRANCH"],
    [{ head: "f".repeat(40) }, "WRONG_TOOLING_HEAD"],
    [{ clean: false }, "DIRTY_TOOLING_WORKTREE"],
    [{ runtimeAvailable: false }, "RECOVERY_RUNTIME_COMMIT_UNAVAILABLE"],
  ]) await assert.rejects(preflightLocalTargetDrill({ environment: environment(), repoRoot: process.cwd(), execute: preflightExecutor(options), admitSupabaseCli: async () => ({ version: "2.109.1" }) }), { code });
  await assert.rejects(preflightLocalTargetDrill({ environment: environment({ GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM: "present" }), repoRoot: process.cwd(), execute: preflightExecutor(), admitSupabaseCli: async () => ({ version: "2.109.1" }) }), { code: "LOCAL_RECOVERY_PRODUCTION_CONFIRMATION_FORBIDDEN" });
});

function rawStatus() {
  return JSON.stringify({
    API_URL: "http://127.0.0.1:61001", DB_URL: "postgresql://postgres:db-secret@127.0.0.1:61002/postgres",
    ANON_KEY: "anon-secret", SERVICE_ROLE_KEY: "role-secret", STORAGE_S3_URL: "http://localhost:61001/storage/v1/s3",
    S3_PROTOCOL_ACCESS_KEY_ID: "access-secret", S3_PROTOCOL_ACCESS_KEY_SECRET: "s3-secret", S3_PROTOCOL_REGION: "local",
  });
}

function rawDocker() {
  return `${JSON.stringify({ ID: "0123456789ab", Image: "public.ecr.aws/supabase/postgres:17", Names: `supabase_db_${PROJECT}`, State: "running", Status: "Up 10 seconds (healthy)", Labels: `com.supabase.cli.project=${PROJECT},com.docker.compose.project=${PROJECT}` })}\n`;
}

function harnessFixture(outputOverrides = {}, behavior = {}) {
  const session = { target: WORKDIR };
  const target = { projectId: PROJECT, workdir: WORKDIR, runtimeSha: PRODUCTION_RUNTIME_SHA };
  const commandPlans = buildTargetCommandPlans({ repoRoot: "C:\\repo", target, environment: {} });
  const authority = Object.freeze({ status: "VERIFIED", runtimeSha: PRODUCTION_RUNTIME_SHA, evidence: Object.freeze({ migrationCount: 6, versions: Object.freeze(VERSIONS) }) });
  const prepared = Object.freeze({ status: "PREPARED", target, authority, commandPlans });
  const outputs = {
    migrationHistory: `${VERSIONS.join("\n")}\n`, requiredSchemas: "auth\nprivate\npublic\nstorage\n", requiredExtensions: "pgcrypto\n",
    storageBucket: "godel-files|f\n", targetCatalog: `${TABLES.join("\n")}\n`, replicationRole: "origin\n", ...outputOverrides,
  };
  const events = [];
  const execute = async (plan) => {
    events.push(plan.operation);
    if (plan === commandPlans.start) {
      if (behavior.startFailure) throw Object.assign(new Error("synthetic start failure with secret"), { code: "COMMAND_FAILED" });
      return { stdout: "", stderr: "" };
    }
    if (plan === commandPlans.status) return { stdout: rawStatus(), stderr: "" };
    if (plan === commandPlans.discoverDb) return { stdout: rawDocker(), stderr: "" };
    if (plan === commandPlans.stop) return { stdout: "", stderr: "" };
    const cleanupChecks = new Map([
      [commandPlans.verifyCleanupContainers, ["containers", "synthetic-container-id"]],
      [commandPlans.verifyCleanupVolumes, ["volumes", "synthetic-volume-name"]],
      [commandPlans.verifyCleanupNetworks, ["networks", "synthetic-network-id"]],
    ]);
    if (cleanupChecks.has(plan)) {
      const [kind, residue] = cleanupChecks.get(plan);
      if (behavior.cleanupCommandFailure === kind) throw new ManagedBackupCommandError({ operation: plan.operation, exitCode: 1, stderrSummary: `${kind} secret failure` });
      return { stdout: behavior.cleanupResidue === kind ? `${residue}\n` : "", stderr: "" };
    }
    const queryName = plan.operation.split(": ").at(-1);
    if (Object.hasOwn(outputs, queryName)) return { stdout: outputs[queryName], stderr: "" };
    throw new Error("ungoverned synthetic command");
  };
  const dependencies = {
    preflight: async () => { events.push("preflight"); return { status: "PASS" }; },
    createSession: async () => { events.push("create-session"); return session; },
    prepareTarget: async () => { events.push("prepare-target"); return prepared; },
    execute,
    proveIsolation: (input) => {
      events.push("prove-isolation");
      assert.equal(input.localStatus.status, "ADMITTED");
      return { LOCAL_ONLY: true, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: PRODUCTION_RUNTIME_SHA };
    },
    cleanupTarget: async ({ target: cleanupTarget, adapter }) => {
      events.push("cleanup-target");
      if (behavior.targetCleanupFailure) throw new Error("synthetic target cleanup failure");
      await adapter.stop({ projectId: cleanupTarget.projectId, workdir: cleanupTarget.workdir });
      const owned = await adapter.listOwnedResources({ projectId: cleanupTarget.projectId });
      if (owned.length !== 0) throw Object.assign(new Error("synthetic owned resource residue"), { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" });
      return { status: "PASS" };
    },
    cleanupSession: async () => {
      events.push("cleanup-session");
      if (behavior.sessionCleanupFailure) throw new Error("synthetic session cleanup failure");
      return { status: "PASS" };
    },
  };
  return { prepared, dependencies, events };
}

async function runFixture(outputOverrides, behavior) {
  const fixture = harnessFixture(outputOverrides, behavior);
  const operation = runLocalTargetCompatibilityDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: fixture.dependencies });
  return { fixture, operation };
}

test("synthetic harness starts once, admits raw status/Docker, proves isolation before six read-only DB gates, and cleans", async () => {
  const { fixture, operation } = await runFixture();
  const result = await operation;
  assert.deepEqual(result, {
    status: "PASS", operation: "real-local-target-compatibility", runtimeAuthority: "VERIFIED", targetIsolation: "VERIFIED", baselineMigrationCount: 6,
    schemasVerified: true, requiredExtensionsVerified: true, privateBucketVerified: true, targetCatalogVerified: true, replicationRole: "origin",
    realTargetStarts: 1, targetMutations: 0, sqlMutations: 0, remoteActivity: 0, targetCleanup: "PASS",
  });
  assert.equal(fixture.events.filter((event) => event === "start disposable recovery target").length, 1);
  assert.ok(fixture.events.indexOf("prove-isolation") < fixture.events.indexOf("query disposable recovery database: migrationHistory"));
  assert.deepEqual(fixture.events.slice(-6), [
    "cleanup-target",
    "stop exact disposable recovery target",
    "verify disposable target containers absent",
    "verify disposable target volumes absent",
    "verify disposable target networks absent",
    "cleanup-session",
  ]);
  const text = JSON.stringify(result);
  for (const forbidden of [PROJECT, "0123456789ab", "61001", "db-secret", WORKDIR, PRODUCTION_RUNTIME_SHA]) assert.ok(!text.includes(forbidden));
  assert.ok(fixture.events.every((event) => !/restore admitted|\brclone\b|\bage\b|\bR2\b|Production mutation/i.test(event)));
});

test("governed executor rejects arbitrary and restore-like command plans", async () => {
  const { prepared } = harnessFixture();
  const executor = createGovernedLocalTargetExecutor({ prepared, execute: async () => ({ stdout: "" }) });
  await assert.rejects(executeGovernedLocalTargetPlan(executor, { executable: "docker", args: ["exec"], stdin: "TRUNCATE TABLE public.perfiles;" }), { code: "LOCAL_RECOVERY_COMMAND_NOT_GOVERNED" });
  assert.ok(prepared.commandPlans.start.args.includes("--yes"));
  assert.ok(prepared.commandPlans.start.args.includes("--exclude"));
  assert.ok(!prepared.commandPlans.start.args.includes("--linked"));
});

test("baseline gates reject migration, schema, public bucket, replication, and required-table mismatches and still clean", async () => {
  const cases = [
    [{ migrationHistory: `${VERSIONS.slice(0, 5).join("\n")}\n` }, "RECOVERY_TARGET_BASELINE_MISMATCH"],
    [{ requiredSchemas: "auth\npublic\nstorage\n" }, "RECOVERY_TARGET_SCHEMA_MISSING"],
    [{ storageBucket: "godel-files|t\n" }, "RECOVERY_TARGET_BUCKET_INVALID"],
    [{ replicationRole: "replica\n" }, "RECOVERY_REPLICATION_ROLE_NOT_ORIGIN"],
    [{ targetCatalog: `${TABLES.filter((item) => item !== "auth.identities").join("\n")}\n` }, "RECOVERY_TARGET_CATALOG_REQUIRED_TABLE_MISSING"],
  ];
  for (const [outputs, code] of cases) {
    const { fixture, operation } = await runFixture(outputs);
    await assert.rejects(operation, { code });
    assert.ok(fixture.events.includes("cleanup-target"));
    assert.equal(fixture.events.at(-1), "cleanup-session");
  }
});

test("required extension evidence accepts only pgcrypto, distinguishes absence, and always cleans", async () => {
  const present = await runFixture({ requiredExtensions: "pgcrypto\n" });
  assert.equal((await present.operation).requiredExtensionsVerified, true);
  assert.equal(present.fixture.events.at(-1), "cleanup-session");

  for (const [requiredExtensions, code] of [
    ["", "RECOVERY_TARGET_EXTENSION_MISSING"],
    ["uuid-ossp\n", "LOCAL_RECOVERY_EXTENSION_OUTPUT_INVALID"],
    ["postgis\n", "LOCAL_RECOVERY_EXTENSION_OUTPUT_INVALID"],
    ["pgcrypto\nuuid-ossp\n", "LOCAL_RECOVERY_EXTENSION_OUTPUT_INVALID"],
  ]) {
    const item = await runFixture({ requiredExtensions });
    await assert.rejects(item.operation, { code });
    assert.ok(item.fixture.events.includes("cleanup-target"));
    assert.equal(item.fixture.events.at(-1), "cleanup-session");
  }
});

test("the orchestrator requires every exact isolation assertion before DB gates", async () => {
  const fixture = harnessFixture();
  fixture.dependencies.proveIsolation = () => ({ LOCAL_ONLY: true, LINKED_PRODUCTION: true, DISPOSABLE: true, BASELINE_AUTHORITY: PRODUCTION_RUNTIME_SHA });
  await assert.rejects(
    runLocalTargetCompatibilityDrill({ environment: environment(), repoRoot: "C:\\repo", dependencies: fixture.dependencies }),
    { code: "RECOVERY_TARGET_ISOLATION_FAILED" },
  );
  assert.ok(!fixture.events.some((event) => event.startsWith("query disposable recovery database:")));
  assert.ok(fixture.events.includes("cleanup-target"));
  assert.equal(fixture.events.at(-1), "cleanup-session");
});

test("start and baseline failures trigger cleanup; target/session cleanup failures override PASS", async () => {
  let item = await runFixture({}, { startFailure: true });
  await assert.rejects(item.operation, { code: "COMMAND_FAILED" });
  assert.ok(item.fixture.events.includes("cleanup-target"));
  assert.equal(item.fixture.events.at(-1), "cleanup-session");

  item = await runFixture({}, { targetCleanupFailure: true });
  await assert.rejects(item.operation, { code: "RECOVERY_TARGET_CLEANUP_INCOMPLETE" });
  assert.equal(item.fixture.events.at(-1), "cleanup-session");

  item = await runFixture({}, { sessionCleanupFailure: true });
  await assert.rejects(item.operation, { code: "RECOVERY_CLEANUP_INCOMPLETE" });
});

test("cleanup requires zero project-scoped containers, volumes, and networks", async () => {
  for (const kind of ["containers", "volumes", "networks"]) {
    const item = await runFixture({}, { cleanupResidue: kind });
    let failure;
    try { await item.operation; } catch (error) { failure = error; }
    assert.equal(failure?.code, "RECOVERY_TARGET_CLEANUP_INCOMPLETE");
    const serialized = JSON.stringify(sanitizeLocalTargetDrillFailure(failure));
    for (const forbidden of ["synthetic-container-id", "synthetic-volume-name", "synthetic-network-id", PROJECT, "61001", WORKDIR]) assert.ok(!serialized.includes(forbidden));
    assert.equal(item.fixture.events.at(-1), "cleanup-session");
  }
});

test("failure of any project-scoped Docker cleanup query fails closed", async () => {
  for (const kind of ["containers", "volumes", "networks"]) {
    const item = await runFixture({}, { cleanupCommandFailure: kind });
    let failure;
    try { await item.operation; } catch (error) { failure = error; }
    assert.equal(failure?.code, "RECOVERY_TARGET_CLEANUP_INCOMPLETE");
    const serialized = JSON.stringify(sanitizeLocalTargetDrillFailure(failure));
    for (const forbidden of [kind, "secret failure", PROJECT, "61001", WORKDIR]) assert.ok(!serialized.includes(forbidden));
    assert.equal(item.fixture.events.at(-1), "cleanup-session");
  }
});

test("failure evidence is fixed and only authentic command failures may add sanitized operation/exit code", () => {
  const generic = sanitizeLocalTargetDrillFailure(Object.assign(new Error("secret https://production.invalid"), { code: "RECOVERY_TARGET_SCHEMA_MISSING", operation: "spoofed", exitCode: 7 }));
  assert.deepEqual(generic, { status: "FAIL", code: "RECOVERY_TARGET_SCHEMA_MISSING", message: "Local recovery target compatibility drill failed safely" });
  const command = sanitizeLocalTargetDrillFailure(new ManagedBackupCommandError({ operation: "start disposable recovery target", exitCode: 1, stderrSummary: "raw secret" }));
  assert.deepEqual(command, { status: "FAIL", code: "COMMAND_FAILED", message: "Local recovery target compatibility drill failed safely", operation: "start disposable recovery target", exitCode: 1 });
});
