import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startLocalRecoveryApp, stopLocalRecoveryApp } from "./local-recovery-app.mjs";
import {
  assertRecoveryBrowserRequestAllowed,
  buildRecoveryBrowserNetworkPolicy,
  probeLocalRecoveryAppHealth,
  probeLocalRecoveryAppLive,
  probeLocalRecoveryAppReady,
  probeLocalRecoveryTargetAuthHealth,
  runRecoveryApplicationBrowserSmoke,
  runRecoveryApplicationCompatibilityBrowserSmoke,
  verifyRlsGrantBaselineAuthority,
} from "./recovery-application-validation.mjs";
import { admitLocalSupabaseStatus } from "./target-runtime-status.mjs";

function status() {
  return admitLocalSupabaseStatus(JSON.stringify({
    API_URL: "http://127.0.0.1:64321", DB_URL: "postgresql://postgres:secret@127.0.0.1:64322/postgres", ANON_KEY: "local-anon",
    SERVICE_ROLE_KEY: "local-role", STORAGE_S3_URL: "http://127.0.0.1:64321/storage/v1/s3", S3_PROTOCOL_ACCESS_KEY_ID: "access",
    S3_PROTOCOL_ACCESS_KEY_SECRET: "storage-secret", S3_PROTOCOL_REGION: "local",
  }));
}

class Child extends EventEmitter {
  constructor() { super(); this.stdout = new EventEmitter(); this.stderr = new EventEmitter(); this.exitCode = null; }
  send(message) { queueMicrotask(() => { if (message.type === "start") this.emit("message", { type: "ready" }); else { this.exitCode = 0; this.emit("message", { type: "stopped" }); } }); }
  kill() { this.exitCode = 1; }
}

async function appFixture() {
  const root = await mkdtemp(join(tmpdir(), "godel-app-validation-"));
  const evidence = join(root, "evidence");
  await mkdir(evidence);
  const localStatus = status();
  const dependencyMount = Object.freeze({ status: "MOUNTED" });
  const child = new Child();
  const app = await startLocalRecoveryApp({
    localStatus, session: { root, evidence }, repoRoot: process.cwd(), allocatePort: async () => 65431,
    materializeSource: async () => ({ status: "MATERIALIZED" }),
    mountDependencies: async () => dependencyMount,
    verifyVolumeTopology: async () => Object.freeze({ status: "VERIFIED" }),
    unmountDependencies: async (handle) => { assert.strictEqual(handle, dependencyMount); return { status: "UNMOUNTED" }; },
    forkProcess: () => child, timeoutMs: 1000,
  });
  return { root, localStatus, app, child, async cleanup() { await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true }); await rm(root, { recursive: true, force: true }); } };
}

function response(statusCode, body, redirected = false) {
  return { status: statusCode, redirected, async json() { return body; } };
}

test("direct local Auth health uses the opaque status once and exposes only PASS", async () => {
  const fixture = await appFixture();
  try {
    const calls = [];
    const pass = await probeLocalRecoveryTargetAuthHealth(fixture.localStatus, { request: async (url, options) => { calls.push({ url: String(url), options }); return response(200, {}); } });
    assert.deepEqual(pass, { status: "PASS", targetAuthHealth: "PASS" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:64321/auth/v1/health");
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.redirect, "manual");
    assert.equal(calls[0].options.headers.apikey, "local-anon");
    assert.doesNotMatch(JSON.stringify(pass), /127\.0\.0\.1|64321|local-anon/);
  } finally { await fixture.cleanup(); }
});

test("direct local Auth health rejects redirect, non-200, request failure, timeout, and non-opaque status", async () => {
  const fixture = await appFixture();
  try {
    for (const request of [
      async () => response(302, {}, true),
      async () => response(503, {}),
      async () => { throw new Error("network endpoint secret"); },
    ]) await assert.rejects(probeLocalRecoveryTargetAuthHealth(fixture.localStatus, { request, timeoutMs: 20 }), { code: "RECOVERY_TARGET_AUTH_HEALTH_FAILED" });
    await assert.rejects(probeLocalRecoveryTargetAuthHealth(fixture.localStatus, { request: async () => new Promise(() => {}), timeoutMs: 2 }), { code: "RECOVERY_TARGET_AUTH_HEALTH_FAILED" });
    let calls = 0;
    await assert.rejects(probeLocalRecoveryTargetAuthHealth({ status: "ADMITTED", API_URL: "https://remote.invalid" }, { request: async () => { calls += 1; } }), { code: "RECOVERY_TARGET_AUTH_HEALTH_FAILED" });
    assert.equal(calls, 0);
  } finally { await fixture.cleanup(); }
});

test("live and ready gates make one exact cold-start-aware request each", async () => {
  const fixture = await appFixture();
  try {
    const liveCalls = [];
    const readyCalls = [];
    const live = await probeLocalRecoveryAppLive(fixture.app, { request: async (url, options) => { liveCalls.push({ url: String(url), options }); return response(200, { status: "ok" }); } });
    const ready = await probeLocalRecoveryAppReady(fixture.app, { request: async (url, options) => { readyCalls.push({ url: String(url), options }); return response(200, { status: "ready" }); } });
    assert.deepEqual(live, { status: "PASS", applicationLive: "PASS" });
    assert.deepEqual(ready, { status: "PASS", applicationReady: "PASS" });
    assert.equal(liveCalls.length, 1);
    assert.equal(readyCalls.length, 1);
    assert.equal(liveCalls[0].url, "http://127.0.0.1:65431/api/health/live");
    assert.equal(readyCalls[0].url, "http://127.0.0.1:65431/api/health/ready");
    assert.ok([...liveCalls, ...readyCalls].every(({ options }) => options.method === "GET" && options.redirect === "manual"));
    const combined = await probeLocalRecoveryAppHealth(fixture.app, { request: async (url) => response(200, { status: String(url).endsWith("/live") ? "ok" : "ready" }) });
    assert.deepEqual(combined, { status: "PASS", applicationLive: "PASS", applicationReady: "PASS" });
  } finally { await fixture.cleanup(); }
});

test("live and ready classify every response without inspecting non-200 bodies", async () => {
  const fixture = await appFixture();
  try {
    for (const [probe, prefix] of [
      [probeLocalRecoveryAppLive, "RECOVERY_APP_LIVE"],
      [probeLocalRecoveryAppReady, "RECOVERY_APP_READY"],
    ]) {
      let bodyReads = 0;
      const non200 = (statusCode, redirected = false) => ({ status: statusCode, redirected, async json() { bodyReads += 1; throw new Error("body must not be read"); } });
      for (const [statusCode, redirected, suffix] of [
        [302, false, "REDIRECTED"], [200, true, "REDIRECTED"], [404, false, "NOT_FOUND"],
        [401, false, "HTTP_REJECTED"], [403, false, "HTTP_REJECTED"], [429, false, "HTTP_REJECTED"],
        [500, false, "SERVER_ERROR"],
      ]) await assert.rejects(probe(fixture.app, { request: async () => non200(statusCode, redirected), runtimeDiagnostic: () => "UNCLASSIFIED" }), { code: `${prefix}_${suffix}` });
      assert.equal(bodyReads, 0);
      await assert.rejects(probe(fixture.app, { request: async () => response(200, { status: "wrong" }) }), { code: `${prefix}_BODY_INVALID` });
      await assert.rejects(probe(fixture.app, { request: async () => ({ status: 200, redirected: false, async json() { throw new Error("invalid body"); } }) }), { code: `${prefix}_BODY_INVALID` });
    }
  } finally { await fixture.cleanup(); }
});

test("live and ready refine 5xx through the fixed runtime diagnostic enum", async () => {
  const fixture = await appFixture();
  try {
    for (const [probe, prefix] of [
      [probeLocalRecoveryAppLive, "RECOVERY_APP_LIVE"],
      [probeLocalRecoveryAppReady, "RECOVERY_APP_READY"],
    ]) {
      for (const [diagnostic, suffix] of [
        ["MODULE_RESOLUTION_FAILURE", "MODULE_RESOLUTION_FAILED"],
        ["COMPILE_FAILURE", "COMPILE_FAILED"],
        ["RUNTIME_FAILURE", "RUNTIME_FAILED"],
        ["UNCLASSIFIED", "SERVER_ERROR"],
        ["UNTRUSTED_DETAIL", "SERVER_ERROR"],
      ]) await assert.rejects(probe(fixture.app, { request: async () => ({ status: 500, redirected: false, async json() { throw new Error("must not parse"); } }), runtimeDiagnostic: () => diagnostic }), { code: `${prefix}_${suffix}` });
    }
  } finally { await fixture.cleanup(); }
});

test("historical module and compile diagnostics cannot contaminate live or ready 5xx classification", async () => {
  const fixture = await appFixture();
  try {
    fixture.child.stderr.emit("data", "Module not found: Can't resolve 'historical-private-module'\nFailed to compile historical-private-source");
    for (const [probe, expectedCode] of [
      [probeLocalRecoveryAppLive, "RECOVERY_APP_LIVE_SERVER_ERROR"],
      [probeLocalRecoveryAppReady, "RECOVERY_APP_READY_SERVER_ERROR"],
    ]) {
      let requests = 0;
      await assert.rejects(probe(fixture.app, {
        request: async () => { requests += 1; return response(500, {}); },
        settleOptions: { quietMs: 1, maxMs: 2 },
      }), (error) => {
        assert.equal(error.code, expectedCode);
        assert.doesNotMatch(JSON.stringify(error), /historical-private|module not found|failed to compile/i);
        return true;
      });
      assert.equal(requests, 1);
    }
  } finally { await fixture.cleanup(); }
});

test("live and ready map request-scoped module categories to fixed safe codes", async () => {
  const fixture = await appFixture();
  try {
    const categories = [
      "PROJECT_ALIAS", "RELATIVE_IMPORT", "NEXT_INTERNAL", "DECLARED_PACKAGE", "OTHER_BARE_PACKAGE", "NODE_BUILTIN",
      "ABSOLUTE_PATH", "REDACTED_PATH", "LOADER_REQUEST", "UNPARSED", "MIXED", "UNKNOWN",
    ];
    for (const [probe, prefix] of [
      [probeLocalRecoveryAppLive, "RECOVERY_APP_LIVE_MODULE"],
      [probeLocalRecoveryAppReady, "RECOVERY_APP_READY_MODULE"],
    ]) {
      for (const category of categories) {
        let requests = 0;
        await assert.rejects(probe(fixture.app, {
          request: async () => { requests += 1; return response(500, {}); },
          settleDiagnostics: async () => ({ status: "SETTLED" }),
          runtimeDiagnostic: () => ({ diagnostic: "MODULE_RESOLUTION_FAILURE", moduleCategory: category, ignoredSpecifier: "private-module" }),
        }), (error) => {
          assert.equal(error.code, `${prefix}_${category}_FAILED`);
          assert.doesNotMatch(JSON.stringify(error), /private-module|127\.0\.0\.1|65431/);
          return true;
        });
        assert.equal(requests, 1);
      }
    }
  } finally { await fixture.cleanup(); }
});

test("cold-start budget admits completion within the limit and classifies timeout or network by endpoint", async () => {
  const fixture = await appFixture();
  try {
    const withinBudget = await probeLocalRecoveryAppLive(fixture.app, {
      timeoutMs: 50,
      request: async () => { await new Promise((accept) => setTimeout(accept, 5)); return response(200, { status: "ok" }); },
    });
    assert.equal(withinBudget.applicationLive, "PASS");
    await assert.rejects(probeLocalRecoveryAppLive(fixture.app, { request: async () => new Promise(() => {}), timeoutMs: 2 }), { code: "RECOVERY_APP_LIVE_REQUEST_FAILED" });
    await assert.rejects(probeLocalRecoveryAppReady(fixture.app, { request: async () => new Promise(() => {}), timeoutMs: 2 }), { code: "RECOVERY_APP_READY_REQUEST_FAILED" });
    await assert.rejects(probeLocalRecoveryAppLive(fixture.app, { request: async () => { throw new Error("network"); } }), { code: "RECOVERY_APP_LIVE_REQUEST_FAILED" });
    await assert.rejects(probeLocalRecoveryAppReady(fixture.app, { request: async () => { throw new Error("network"); } }), { code: "RECOVERY_APP_READY_REQUEST_FAILED" });
  } finally { await fixture.cleanup(); }
});

test("browser network policy admits only the loopback app and recovered Supabase origins", async () => {
  const fixture = await appFixture();
  try {
    const policy = buildRecoveryBrowserNetworkPolicy({ app: fixture.app, localStatus: fixture.localStatus });
    assert.equal(assertRecoveryBrowserRequestAllowed(policy, "http://127.0.0.1:65431/login"), true);
    assert.equal(assertRecoveryBrowserRequestAllowed(policy, "http://127.0.0.1:64321/auth/v1/health"), true);
    for (const url of ["https://example.com", "http://192.168.1.2/resource", "not-a-url"]) assert.throws(() => assertRecoveryBrowserRequestAllowed(policy, url), { code: "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN" });
  } finally { await fixture.cleanup(); }
});

class FakePage {
  constructor(context, scenario) { this.context = context; this.scenario = scenario; this.current = "about:blank"; this.filled = {}; }
  async goto(url) {
    await this.context.request(url);
    this.current = url.endsWith("/dashboard") ? `${this.scenario.origin}${this.scenario.anonymousLanding}` : url;
    if (this.scenario.remoteRequest) await this.context.request("https://remote.invalid/resource");
  }
  locator(selector) {
    return {
      fill: async (value) => { this.filled[selector] = value; },
      waitFor: async () => { if (this.scenario.loginSurfaceMissing === selector) throw new Error("missing"); },
      first: () => ({ waitFor: async () => { if (this.scenario.screenMissing) throw new Error("missing"); } }),
    };
  }
  getByRole() { return {
    click: async () => { if (!this.scenario.loginError) this.current = `${this.scenario.origin}${this.scenario.landing}`; },
    waitFor: async () => { if (this.scenario.loginSurfaceMissing === "button") throw new Error("missing"); },
  }; }
  async waitForURL(predicate) { if (!predicate(new URL(this.current))) throw new Error("login failed"); }
  url() { return this.current; }
}

class FakeContext {
  constructor(scenario) { this.scenario = scenario; this.closed = false; }
  async route(_pattern, handler) { this.handler = handler; }
  async request(url) {
    let continued = false;
    await this.handler({ request: () => ({ url: () => url }), continue: async () => { continued = true; }, abort: async () => undefined });
    return continued;
  }
  async newPage() { this.page = new FakePage(this, this.scenario); return this.page; }
  async close() { this.closed = true; if (this.scenario.contextCleanupFailure) throw new Error("close"); }
}

class FakeBrowser {
  constructor(scenario) { this.scenario = scenario; this.contexts = []; }
  async newContext(options) {
    assert.equal(options.acceptDownloads, false);
    assert.equal(options.serviceWorkers, "block");
    assert.equal(options.recordVideo, undefined);
    assert.equal(options.storageState, undefined);
    const context = new FakeContext(this.scenario);
    this.contexts.push(context);
    return context;
  }
  async close() { this.closed = true; if (this.scenario.browserCleanupFailure) throw new Error("close"); }
}

async function smokeScenario(fixture, overrides = {}) {
  const scenario = { origin: "http://127.0.0.1:65431", landing: "/dashboard", anonymousLanding: "/login", ...overrides };
  const browser = new FakeBrowser(scenario);
  const credentials = { identifier: "recovery@example.invalid", password: "pässword" };
  const result = await runRecoveryApplicationBrowserSmoke({ app: fixture.app, localStatus: fixture.localStatus, credentials, launchBrowser: async () => browser });
  return { result, browser, credentials };
}

test("browser smoke reuses in-memory credentials and accepts dashboard or mandatory password-change landing", async () => {
  const fixture = await appFixture();
  try {
    for (const landing of ["/dashboard", "/cambiar-contrasena-inicial"]) {
      const { result, browser, credentials } = await smokeScenario(fixture, { landing });
      assert.equal(result.applicationLogin, "PASS");
      assert.equal(result.internalScreen, "PASS");
      assert.equal(result.applicationRead, "PASS");
      assert.equal(result.anonymousInternalAccess, "REJECTED");
      assert.equal(result.applicationRemoteIsolation, "VERIFIED");
      assert.equal(browser.contexts[0].page.filled['input[name="email"]'], credentials.identifier);
      assert.equal(browser.contexts[0].page.filled['input[name="password"]'], credentials.password);
      assert.ok(browser.contexts.every((context) => context.closed));
      assert.equal(browser.closed, true);
    }
    await assert.rejects(runRecoveryApplicationBrowserSmoke({ app: fixture.app, localStatus: fixture.localStatus, credentials: { identifier: "phone-only", password: "secret" }, launchBrowser: async () => new FakeBrowser({}) }), { code: "RECOVERY_APP_LOGIN_EMAIL_REQUIRED" });
  } finally { await fixture.cleanup(); }
});

test("login failure, anonymous dashboard delivery, and remote requests fail closed", async () => {
  const fixture = await appFixture();
  try {
    for (const [overrides, code] of [
      [{ loginError: true }, "RECOVERY_APP_LOGIN_FAILED"],
      [{ screenMissing: true }, "RECOVERY_APP_LOGIN_FAILED"],
      [{ anonymousLanding: "/dashboard" }, "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED"],
      [{ remoteRequest: true }, "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN"],
    ]) await assert.rejects(smokeScenario(fixture, overrides), { code });
  } finally { await fixture.cleanup(); }
});

test("browser cleanup failure overrides the primary application failure", async () => {
  const fixture = await appFixture();
  try {
    await assert.rejects(smokeScenario(fixture, { loginError: true, contextCleanupFailure: true }), { code: "RECOVERY_APP_CLEANUP_INCOMPLETE" });
  } finally { await fixture.cleanup(); }
});

test("compatibility browser smoke validates login surface and rejects anonymous dashboard without credentials", async () => {
  const fixture = await appFixture();
  try {
    const scenario = { origin: "http://127.0.0.1:65431", anonymousLanding: "/login" };
    const browser = new FakeBrowser(scenario);
    const phases = [];
    const result = await runRecoveryApplicationCompatibilityBrowserSmoke({ app: fixture.app, localStatus: fixture.localStatus, launchBrowser: async () => browser, onPhase: (phase) => phases.push(phase) });
    assert.deepEqual(result, { status: "PASS", loginSurface: "PASS", anonymousInternalAccess: "REJECTED", browserRemoteIsolation: "VERIFIED", browserCleanup: "PASS" });
    assert.deepEqual(phases, ["BROWSER_LOGIN_SURFACE", "BROWSER_ANONYMOUS"]);
    assert.equal(browser.contexts.length, 2);
    assert.ok(browser.contexts.every((context) => context.closed));
    assert.equal(browser.closed, true);
    assert.ok(browser.contexts.every((context) => Object.keys(context.page.filled).length === 0));
  } finally { await fixture.cleanup(); }
});

test("compatibility browser smoke fails closed for missing login controls, anonymous access, and remote requests", async () => {
  const fixture = await appFixture();
  try {
    for (const [overrides, code] of [
      [{ loginSurfaceMissing: 'input[name="email"]' }, "RECOVERY_APP_LOGIN_SURFACE_FAILED"],
      [{ loginSurfaceMissing: 'input[name="password"]' }, "RECOVERY_APP_LOGIN_SURFACE_FAILED"],
      [{ loginSurfaceMissing: "button" }, "RECOVERY_APP_LOGIN_SURFACE_FAILED"],
      [{ anonymousLanding: "/dashboard" }, "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED"],
      [{ remoteRequest: true }, "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN"],
    ]) {
      const scenario = { origin: "http://127.0.0.1:65431", anonymousLanding: "/login", ...overrides };
      await assert.rejects(runRecoveryApplicationCompatibilityBrowserSmoke({ app: fixture.app, localStatus: fixture.localStatus, launchBrowser: async () => new FakeBrowser(scenario) }), { code });
    }
  } finally { await fixture.cleanup(); }
});

test("compatibility browser cleanup failure overrides a primary surface failure", async () => {
  const fixture = await appFixture();
  try {
    const scenario = { origin: "http://127.0.0.1:65431", anonymousLanding: "/login", loginSurfaceMissing: "button", contextCleanupFailure: true };
    await assert.rejects(runRecoveryApplicationCompatibilityBrowserSmoke({ app: fixture.app, localStatus: fixture.localStatus, launchBrowser: async () => new FakeBrowser(scenario) }), { code: "RECOVERY_BROWSER_CLEANUP_INCOMPLETE" });
  } finally { await fixture.cleanup(); }
});

test("RLS/grant closure is derived only from exact baseline plus audit-only and data-only restore authority", () => {
  const baseline = { status: "PASS", baseline: { status: "PASS", migrationCount: 6 } };
  const restorePlan = { auditOnly: { roles: { status: "PASS", treatment: "AUDIT_ONLY" }, schema: { status: "PASS", treatment: "AUDIT_ONLY" }, history: { status: "PASS", treatment: "AUDIT_ONLY" } }, restoreSql: { status: "READY", transactionAuthority: "PSQL_SINGLE_TRANSACTION" }, sanitized: { status: "PASS" } };
  assert.deepEqual(verifyRlsGrantBaselineAuthority({ baseline, restorePlan }), { status: "VERIFIED", rlsGrantBaseline: "VERIFIED" });
  assert.throws(() => verifyRlsGrantBaselineAuthority({ baseline, restorePlan: { ...restorePlan, auditOnly: { ...restorePlan.auditOnly, roles: { status: "FAIL", treatment: "AUDIT_ONLY" } } } }), { code: "RECOVERY_RLS_GRANT_BASELINE_UNVERIFIED" });
});
