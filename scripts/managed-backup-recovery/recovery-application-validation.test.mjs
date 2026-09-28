import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startLocalRecoveryApp, stopLocalRecoveryApp } from "./local-recovery-app.mjs";
import { assertRecoveryBrowserRequestAllowed, buildRecoveryBrowserNetworkPolicy, probeLocalRecoveryAppHealth, runRecoveryApplicationBrowserSmoke, verifyRlsGrantBaselineAuthority } from "./recovery-application-validation.mjs";
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
  const app = await startLocalRecoveryApp({ localStatus, session: { root, evidence }, repoRoot: process.cwd(), allocatePort: async () => 65431, createNextServer: (options) => ({ options }), materializeSource: async () => ({ status: "MATERIALIZED" }), forkProcess: () => new Child(), timeoutMs: 1000 });
  return { root, localStatus, app, async cleanup() { await stopLocalRecoveryApp(app, { timeoutMs: 1000, probeClosed: async () => true }); await rm(root, { recursive: true, force: true }); } };
}

function response(statusCode, body, redirected = false) {
  return { status: statusCode, redirected, async json() { return body; } };
}

test("health gates require exact 200 non-redirect live and ready responses", async () => {
  const fixture = await appFixture();
  try {
    const calls = [];
    const pass = await probeLocalRecoveryAppHealth(fixture.app, { request: async (url, options) => { calls.push({ url: String(url), options }); return response(200, { status: calls.length === 1 ? "ok" : "ready" }); } });
    assert.deepEqual(pass, { status: "PASS", applicationLive: "PASS", applicationReady: "PASS" });
    assert.equal(calls.length, 2);
    assert.ok(calls.every(({ options }) => options.redirect === "manual"));
    await assert.rejects(probeLocalRecoveryAppHealth(fixture.app, { request: async () => response(302, { status: "ok" }, true) }), { code: "RECOVERY_APP_HEALTH_FAILED" });
    await assert.rejects(probeLocalRecoveryAppHealth(fixture.app, { request: async () => response(200, { status: "wrong" }) }), { code: "RECOVERY_APP_HEALTH_FAILED" });
    await assert.rejects(probeLocalRecoveryAppHealth(fixture.app, { request: async () => { throw new Error("timeout"); } }), { code: "RECOVERY_APP_HEALTH_FAILED" });
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
      first: () => ({ waitFor: async () => { if (this.scenario.screenMissing) throw new Error("missing"); } }),
    };
  }
  getByRole() { return { click: async () => { if (!this.scenario.loginError) this.current = `${this.scenario.origin}${this.scenario.landing}`; } }; }
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

test("RLS/grant closure is derived only from exact baseline plus audit-only and data-only restore authority", () => {
  const baseline = { status: "PASS", baseline: { status: "PASS", migrationCount: 6 } };
  const restorePlan = { auditOnly: { roles: { status: "PASS", treatment: "AUDIT_ONLY" }, schema: { status: "PASS", treatment: "AUDIT_ONLY" }, history: { status: "PASS", treatment: "AUDIT_ONLY" } }, restoreSql: { status: "READY", transactionAuthority: "PSQL_SINGLE_TRANSACTION" }, sanitized: { status: "PASS" } };
  assert.deepEqual(verifyRlsGrantBaselineAuthority({ baseline, restorePlan }), { status: "VERIFIED", rlsGrantBaseline: "VERIFIED" });
  assert.throws(() => verifyRlsGrantBaselineAuthority({ baseline, restorePlan: { ...restorePlan, auditOnly: { ...restorePlan.auditOnly, roles: { status: "FAIL", treatment: "AUDIT_ONLY" } } } }), { code: "RECOVERY_RLS_GRANT_BASELINE_UNVERIFIED" });
});
