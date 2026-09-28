import assert from "node:assert/strict";
import test from "node:test";

import {
  LOCAL_APPLICATION_BRANCH,
  LOCAL_APPLICATION_CONFIRMATION,
  LOCAL_APPLICATION_CONFIRM_ENV,
  LOCAL_APPLICATION_TOOLING_SHA_ENV,
  preflightLocalApplicationCompatibility,
  runLocalRecoveryApplicationCompatibility,
} from "./local-application-compatibility-core.mjs";
import { PRODUCTION_RUNTIME_SHA } from "./local-target-drill.mjs";

const TOOLING_SHA = "0b8ab995221c7fedde28f5567831810e13085eaf";

function environment(overrides = {}) {
  return { [LOCAL_APPLICATION_CONFIRM_ENV]: LOCAL_APPLICATION_CONFIRMATION, [LOCAL_APPLICATION_TOOLING_SHA_ENV]: TOOLING_SHA, ...overrides };
}

function preflightExecutor({ branch = LOCAL_APPLICATION_BRANCH, head = TOOLING_SHA, clean = true, runtimeAvailable = true } = {}, calls = []) {
  return async (plan) => {
    calls.push(plan);
    if (plan.executable === "docker" && plan.args[0] === "version") return { stdout: "26.1.4/26.1.4\n", stderr: "" };
    if (plan.executable === "docker" && plan.args[0] === "context") return { stdout: "npipe:////./pipe/docker_engine\n", stderr: "" };
    if (plan.args[0] === "branch") return { stdout: `${branch}\n`, stderr: "" };
    if (plan.args[0] === "rev-parse") return { stdout: `${head}\n`, stderr: "" };
    if (plan.args[0] === "status") return { stdout: clean ? "" : " M governed-file\n", stderr: "" };
    if (plan.args[0] === "cat-file") {
      if (!runtimeAvailable) throw new Error("synthetic unavailable runtime");
      assert.equal(plan.args[2], `${PRODUCTION_RUNTIME_SHA}^{commit}`);
      return { stdout: "", stderr: "" };
    }
    throw new Error("unexpected synthetic preflight command");
  };
}

test("preflight requires exact confirmation and tooling SHA before commands", async () => {
  let calls = 0;
  const execute = async () => { calls += 1; };
  await assert.rejects(preflightLocalApplicationCompatibility({ environment: {}, execute, admitSupabaseCli: async () => { calls += 1; } }), { code: "LOCAL_RECOVERY_APP_CONFIRMATION_REQUIRED" });
  await assert.rejects(preflightLocalApplicationCompatibility({ environment: environment({ [LOCAL_APPLICATION_TOOLING_SHA_ENV]: "wrong" }), execute, admitSupabaseCli: async () => { calls += 1; } }), { code: "LOCAL_RECOVERY_APP_TOOLING_SHA_REQUIRED" });
  assert.equal(calls, 0);
});

test("preflight admits exact Git, runtime, repo-local CLI, and local Docker authority", async () => {
  const calls = [];
  const result = await preflightLocalApplicationCompatibility({
    environment: environment({ PATH: "C:\\tools", DOCKER_HOST: "tcp://remote.invalid", DOCKER_CONTEXT: "remote-context" }),
    repoRoot: process.cwd(),
    execute: preflightExecutor({}, calls),
    admitSupabaseCli: async () => ({ version: "2.109.1" }),
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.gitAuthority.head, TOOLING_SHA);
  assert.equal(result.runtimeCommit, "AVAILABLE");
  assert.equal(result.docker, "CLIENT_SERVER_AVAILABLE");
  assert.equal(result.dockerAuthority, "LOCAL_ENGINE");
  const docker = calls.find((plan) => plan.executable === "docker" && plan.args[0] === "version");
  assert.deepEqual(docker.args, ["version", "--format", "{{.Client.Version}}/{{.Server.Version}}"]);
  assert.ok(calls.filter((plan) => plan.executable === "docker").every((plan) => plan.allowedEnvironment.DOCKER_HOST === undefined && plan.allowedEnvironment.DOCKER_CONTEXT === undefined));
});

test("preflight rejects wrong HEAD, dirty authority, unavailable runtime, Docker failure, and incompatible confirmations", async () => {
  for (const [options, code] of [
    [{ head: "f".repeat(40) }, "WRONG_TOOLING_HEAD"],
    [{ clean: false }, "DIRTY_TOOLING_WORKTREE"],
    [{ runtimeAvailable: false }, "RECOVERY_RUNTIME_COMMIT_UNAVAILABLE"],
  ]) await assert.rejects(preflightLocalApplicationCompatibility({ environment: environment(), execute: preflightExecutor(options), admitSupabaseCli: async () => ({ version: "2.109.1" }) }), { code });
  const dockerExecutor = preflightExecutor();
  await assert.rejects(preflightLocalApplicationCompatibility({ environment: environment(), execute: async (plan) => {
    if (plan.executable === "docker") throw new Error("daemon unavailable");
    return dockerExecutor(plan);
  }, admitSupabaseCli: async () => ({ version: "2.109.1" }) }), { code: "LOCAL_RECOVERY_DOCKER_REQUIRED" });
  const remoteDockerExecutor = preflightExecutor();
  await assert.rejects(preflightLocalApplicationCompatibility({ environment: environment(), execute: async (plan) => {
    if (plan.executable === "docker" && plan.args[0] === "context") return { stdout: "ssh://remote.invalid\n", stderr: "" };
    return remoteDockerExecutor(plan);
  }, admitSupabaseCli: async () => ({ version: "2.109.1" }) }), { code: "LOCAL_RECOVERY_DOCKER_AUTHORITY_REQUIRED" });
  for (const name of [
    "GODEL_MANAGED_PRODUCTION_BACKUP_CONFIRM", "GODEL_MANAGED_PRODUCTION_BACKUP_WRITER_FREEZE_CONFIRM",
    "GODEL_MANAGED_MUTATING_PRODUCTION_CONFIRM", "GODEL_MANAGED_MUTATING_TEMPLATE_PRODUCTION_CONFIRM", "GODEL_MANAGED_RECOVERY_DRILL_CONFIRM",
  ]) await assert.rejects(preflightLocalApplicationCompatibility({ environment: environment({ [name]: "present" }), execute: async () => { throw new Error("must not execute"); } }), { code: "LOCAL_RECOVERY_APP_INCOMPATIBLE_CONFIRMATION" });
});

function harnessFixture(behavior = {}) {
  const events = [];
  const session = { parent: "synthetic-parent", root: "session-root", evidence: "session-evidence", target: "session-target" };
  const commandPlans = { start: { operation: "start" }, status: { operation: "status" }, discoverDb: { operation: "discover" } };
  const prepared = { status: "PREPARED", target: { projectId: "opaque-project", workdir: "opaque-target" }, authority: { status: "VERIFIED" }, commandPlans };
  const localStatus = { status: "ADMITTED" };
  const application = { status: "RUNNING" };
  const dependencies = {
    preflight: async () => {
      events.push("preflight");
      if (behavior.failure === "dirty") throw Object.assign(new Error("secret dirty path"), { code: "DIRTY_TOOLING_WORKTREE" });
      return { status: "PASS", gitAuthority: { head: TOOLING_SHA } };
    },
    sessionBoundaries: () => ({ parent: "synthetic-parent", backupOutputRoot: "synthetic-backup" }),
    createSession: async () => { events.push("session"); return session; },
    verifyVolumeTopology: async () => {
      events.push("volume-topology");
      if (behavior.failure === "volume-topology") throw Object.assign(new Error("private drive and path"), { code: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH" });
      return { status: "VERIFIED" };
    },
    prepareTarget: async () => { events.push("target-prepare"); return prepared; },
    createTargetExecutor: () => ({ status: "READY" }),
    executeTargetPlan: async (_executor, plan) => {
      events.push(plan.operation);
      if (plan === commandPlans.start && behavior.failure === "target-start") throw Object.assign(new Error("secret target start"), { code: "LOCAL_RECOVERY_COMMAND_FAILED" });
      if (plan === commandPlans.status) return { stdout: "synthetic-status" };
      if (plan === commandPlans.discoverDb) return { stdout: "synthetic-docker" };
      return { stdout: "" };
    },
    admitStatus: () => localStatus,
    admitDocker: () => ({ status: "VERIFIED" }),
    proveIsolation: () => behavior.failure === "isolation"
      ? { LOCAL_ONLY: false, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: PRODUCTION_RUNTIME_SHA }
      : { LOCAL_ONLY: true, LINKED_PRODUCTION: false, DISPOSABLE: true, BASELINE_AUTHORITY: PRODUCTION_RUNTIME_SHA },
    runBaselineGate: async () => { events.push("baseline"); return { status: "PASS", baseline: { status: "PASS", migrationCount: 6 } }; },
    probeTargetAuthHealth: async () => {
      events.push("target-auth-health");
      if (behavior.failure === "target-auth-health") throw Object.assign(new Error("secret local auth endpoint"), { code: "RECOVERY_TARGET_AUTH_HEALTH_FAILED" });
      return { targetAuthHealth: "PASS" };
    },
    verifyAppRuntimeAuthority: async (options) => {
      events.push("app-authority");
      assert.equal(options.runtimeSha, PRODUCTION_RUNTIME_SHA);
      assert.equal(options.toolingSha, TOOLING_SHA);
      if (behavior.failure === "runtime-authority") throw Object.assign(new Error("secret authority mismatch"), { code: "RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH" });
      return { applicationRuntimeAuthority: "VERIFIED" };
    },
    startApp: async (options) => {
      events.push("app-start");
      assert.equal(options.localStatus, localStatus);
      assert.equal(options.session, session);
      if (behavior.failure === "app-start") throw Object.assign(new Error("secret app start"), { code: "RECOVERY_APP_START_FAILED" });
      if (behavior.appStartCode) throw Object.assign(new Error("secret dependency path"), { code: behavior.appStartCode });
      return application;
    },
    probeAppLive: async (...args) => {
      events.push("app-live");
      assert.equal(args.length, 1);
      if (behavior.liveCode) throw Object.assign(new Error("secret live"), { code: behavior.liveCode });
      return { applicationLive: "PASS" };
    },
    probeAppReady: async (...args) => {
      events.push("app-ready");
      assert.equal(args.length, 1);
      if (behavior.readyCode) throw Object.assign(new Error("secret ready"), { code: behavior.readyCode });
      return { applicationReady: "PASS" };
    },
    runBrowserSmoke: async ({ app, localStatus: status, onPhase }) => {
      events.push("browser");
      assert.equal(app, application);
      assert.equal(status, localStatus);
      onPhase("BROWSER_LOGIN_SURFACE");
      if (behavior.failure === "login-surface") throw Object.assign(new Error("secret selector"), { code: "RECOVERY_APP_LOGIN_SURFACE_FAILED" });
      onPhase("BROWSER_ANONYMOUS");
      if (behavior.failure === "anonymous") throw Object.assign(new Error("secret dashboard"), { code: "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED" });
      if (behavior.failure === "remote") throw Object.assign(new Error("https://secret.invalid"), { code: "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN" });
      if (behavior.failure === "browser-cleanup") { onPhase("BROWSER_CLEANUP"); throw Object.assign(new Error("secret browser"), { code: "RECOVERY_BROWSER_CLEANUP_INCOMPLETE" }); }
      return { loginSurface: "PASS", anonymousInternalAccess: "REJECTED", browserRemoteIsolation: "VERIFIED", browserCleanup: "PASS" };
    },
    stopApp: async () => {
      events.push("app-cleanup");
      if (behavior.appCleanupFailure || behavior.failure === "app-cleanup" || behavior.appCleanupCode) {
        throw Object.assign(new Error("secret app cleanup"), behavior.appCleanupCode ? { code: behavior.appCleanupCode } : {});
      }
    },
    createCleanupAdapter: () => ({ status: "READY" }),
    cleanupTarget: async () => { events.push("target-cleanup"); if (behavior.targetCleanupFailure || behavior.failure === "target-cleanup") throw new Error("secret target cleanup"); },
    cleanupSession: async () => { events.push("session-cleanup"); if (behavior.sessionCleanupFailure || behavior.failure === "session-cleanup") throw new Error("secret session cleanup"); },
  };
  return { dependencies, events };
}

const EXPECTED_PASS = {
  status: "PASS", operation: "real-local-recovery-application-compatibility", runtimeAuthority: "VERIFIED", targetIsolation: "VERIFIED",
  baselineMigrationCount: 6, targetAuthHealth: "PASS", applicationRuntimeAuthority: "VERIFIED", applicationStart: "PASS", applicationLive: "PASS", applicationReady: "PASS",
  applicationLocalSupabaseReadiness: "VERIFIED", loginSurface: "PASS", anonymousInternalAccess: "REJECTED", browserRemoteIsolation: "VERIFIED",
  browserCleanup: "PASS", applicationCleanup: "PASS", targetCleanup: "PASS", sessionCleanup: "PASS", realTargetStarts: 1,
  restoreSqlExecutions: 0, realR2Reads: 0, realAgeDecrypts: 0, productionMutations: 0,
};

test("synthetic harness returns the exact sanitized PASS evidence and cleanup order", async () => {
  const fixture = harnessFixture();
  const result = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: fixture.dependencies });
  assert.deepEqual(result, EXPECTED_PASS);
  const governedOrder = ["baseline", "target-auth-health", "app-authority", "app-start", "app-live", "app-ready", "browser"];
  for (let index = 1; index < governedOrder.length; index += 1) {
    assert.ok(fixture.events.indexOf(governedOrder[index - 1]) < fixture.events.indexOf(governedOrder[index]));
  }
  assert.deepEqual(fixture.events.slice(-3), ["app-cleanup", "target-cleanup", "session-cleanup"]);
  assert.ok(!fixture.events.some((event) => /restore|r2|age|production/i.test(event)));
});

test("local session volume topology fails before target preparation with sanitized zero activity", async () => {
  const fixture = harnessFixture({ failure: "volume-topology" });
  const result = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: fixture.dependencies });
  assert.deepEqual(result, {
    status: "FAIL",
    code: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH",
    phase: "SESSION",
    message: "Real local recovery application compatibility failed safely",
    realTargetStarts: 0,
    restoreSqlExecutions: 0,
    realR2Reads: 0,
    realAgeDecrypts: 0,
    productionMutations: 0,
  });
  assert.ok(fixture.events.includes("session"));
  assert.ok(fixture.events.includes("session-cleanup"));
  assert.ok(!fixture.events.includes("target-prepare"));
  assert.doesNotMatch(JSON.stringify(result), /drive|path|synthetic-parent/i);
});

test("synthetic harness covers target, authority, app, health, and browser failures without retries", async () => {
  const moduleCodes = [
    "PROJECT_ALIAS", "RELATIVE_IMPORT", "NEXT_INTERNAL", "DECLARED_PACKAGE", "OTHER_BARE_PACKAGE", "NODE_BUILTIN",
    "ABSOLUTE_PATH", "REDACTED_PATH", "LOADER_REQUEST", "UNPARSED", "MIXED", "UNKNOWN",
  ].map((category) => `MODULE_${category}_FAILED`);
  const liveCodes = ["REQUEST_FAILED", "REDIRECTED", "NOT_FOUND", "HTTP_REJECTED", "SERVER_ERROR", "BODY_INVALID", "MODULE_RESOLUTION_FAILED", ...moduleCodes, "COMPILE_FAILED", "RUNTIME_FAILED"].map((suffix) => `RECOVERY_APP_LIVE_${suffix}`);
  const readyCodes = ["REQUEST_FAILED", "REDIRECTED", "NOT_FOUND", "HTTP_REJECTED", "SERVER_ERROR", "BODY_INVALID", "MODULE_RESOLUTION_FAILED", ...moduleCodes, "COMPILE_FAILED", "RUNTIME_FAILED"].map((suffix) => `RECOVERY_APP_READY_${suffix}`);
  for (const [behavior, code, phase] of [
    [{ failure: "isolation" }, "RECOVERY_TARGET_ISOLATION_FAILED", "TARGET_BASELINE"],
    [{ failure: "target-auth-health" }, "RECOVERY_TARGET_AUTH_HEALTH_FAILED", "TARGET_AUTH_HEALTH"],
    [{ failure: "runtime-authority" }, "RECOVERY_APP_RUNTIME_AUTHORITY_MISMATCH", "APP_RUNTIME_AUTHORITY"],
    [{ failure: "app-start" }, "RECOVERY_APP_START_FAILED", "APP_START"],
    [{ appStartCode: "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID" }, "RECOVERY_APP_DEPENDENCY_AUTHORITY_INVALID", "APP_START"],
    [{ appStartCode: "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID" }, "RECOVERY_APP_DEPENDENCY_MOUNT_INVALID", "APP_START"],
    [{ appStartCode: "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH" }, "RECOVERY_APP_DIST_DIR_RUNTIME_MISMATCH", "APP_START"],
    [{ appStartCode: "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH" }, "RECOVERY_APP_GENERATED_TYPES_DISTDIR_MISMATCH", "APP_START"],
    [{ appStartCode: "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH" }, "RECOVERY_APP_VOLUME_TOPOLOGY_MISMATCH", "APP_START"],
    ...liveCodes.map((code) => [{ liveCode: code }, code, "APP_LIVE"]),
    ...readyCodes.map((code) => [{ readyCode: code }, code, "APP_READY"]),
    [{ failure: "login-surface" }, "RECOVERY_APP_LOGIN_SURFACE_FAILED", "BROWSER_LOGIN_SURFACE"],
    [{ failure: "anonymous" }, "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED", "BROWSER_ANONYMOUS"],
    [{ failure: "remote" }, "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN", "BROWSER_ANONYMOUS"],
    [{ failure: "browser-cleanup" }, "RECOVERY_BROWSER_CLEANUP_INCOMPLETE", "BROWSER_CLEANUP"],
  ]) {
    const fixture = harnessFixture(behavior);
    const result = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: fixture.dependencies });
    assert.equal(result.status, "FAIL", code);
    assert.equal(result.code, code);
    assert.equal(result.phase, phase, code);
    assert.equal(result.restoreSqlExecutions, 0);
    assert.equal(result.realR2Reads, 0);
    assert.equal(result.realAgeDecrypts, 0);
    assert.equal(result.productionMutations, 0);
    assert.ok(!JSON.stringify(result).includes("secret"));
    assert.ok(fixture.events.filter((event) => event === "target-prepare").length <= 1);
    if (behavior.failure === "target-auth-health") {
      assert.ok(!fixture.events.includes("app-start"));
      assert.ok(fixture.events.includes("target-cleanup"));
      assert.ok(fixture.events.includes("session-cleanup"));
    }
    if (behavior.liveCode || behavior.readyCode) {
      assert.ok(!fixture.events.includes("browser"));
      assert.ok(fixture.events.includes("app-cleanup"));
      assert.ok(fixture.events.includes("target-cleanup"));
      assert.ok(fixture.events.includes("session-cleanup"));
    }
  }
});

test("dependency unmount failure remains sanitized at APP_CLEANUP", async () => {
  const fixture = harnessFixture({ appCleanupCode: "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED" });
  const result = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: fixture.dependencies });
  assert.equal(result.code, "RECOVERY_APP_DEPENDENCY_UNMOUNT_FAILED");
  assert.equal(result.phase, "APP_CLEANUP");
  assert.doesNotMatch(JSON.stringify(result), /secret dependency|path/i);
});

test("cleanup failures override primary failure in session, target, application, browser order", async () => {
  const session = harnessFixture({ failure: "browser-cleanup", appCleanupFailure: true, targetCleanupFailure: true, sessionCleanupFailure: true });
  const sessionResult = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: session.dependencies });
  assert.equal(sessionResult.code, "RECOVERY_CLEANUP_INCOMPLETE");
  assert.equal(sessionResult.phase, "SESSION_CLEANUP");

  const target = harnessFixture({ failure: "browser-cleanup", appCleanupFailure: true, targetCleanupFailure: true });
  const targetResult = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: target.dependencies });
  assert.equal(targetResult.code, "RECOVERY_TARGET_CLEANUP_INCOMPLETE");
  assert.equal(targetResult.phase, "TARGET_CLEANUP");

  const app = harnessFixture({ failure: "browser-cleanup", appCleanupFailure: true });
  const appResult = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: app.dependencies });
  assert.equal(appResult.code, "RECOVERY_APP_CLEANUP_INCOMPLETE");
  assert.equal(appResult.phase, "APP_CLEANUP");
});

test("fixed application shutdown failures remain sanitized in APP_CLEANUP", async () => {
  for (const code of [
    "RECOVERY_APP_SHUTDOWN_CLOSE_FAILED",
    "RECOVERY_APP_SHUTDOWN_EXIT_FAILED",
    "RECOVERY_APP_SHUTDOWN_PORT_OPEN",
  ]) {
    const fixture = harnessFixture({ appCleanupCode: code });
    const result = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: fixture.dependencies });
    assert.equal(result.status, "FAIL");
    assert.equal(result.code, code);
    assert.equal(result.phase, "APP_CLEANUP");
    assert.doesNotMatch(JSON.stringify(result), /secret app cleanup/i);
    assert.deepEqual(fixture.events.slice(-3), ["app-cleanup", "target-cleanup", "session-cleanup"]);
  }
});

test("wrong confirmation fails before session creation and FAIL evidence redacts arbitrary errors", async () => {
  let resources = 0;
  const missing = await runLocalRecoveryApplicationCompatibility({ environment: {}, dependencies: { preflight: async () => { resources += 1; }, createSession: async () => { resources += 1; } } });
  assert.equal(missing.code, "LOCAL_RECOVERY_APP_CONFIRMATION_REQUIRED");
  assert.equal(resources, 0);

  const fixture = harnessFixture({ failure: "dirty" });
  const result = await runLocalRecoveryApplicationCompatibility({ environment: environment(), dependencies: fixture.dependencies });
  assert.deepEqual(result, {
    status: "FAIL", code: "DIRTY_TOOLING_WORKTREE", phase: "PREFLIGHT", message: "Real local recovery application compatibility failed safely",
    realTargetStarts: 0, restoreSqlExecutions: 0, realR2Reads: 0, realAgeDecrypts: 0, productionMutations: 0,
  });
  assert.ok(!JSON.stringify(result).includes("path"));
});
