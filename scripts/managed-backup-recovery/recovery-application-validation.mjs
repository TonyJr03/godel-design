import { accessLocalRecoveryApp } from "./local-recovery-app.mjs";
import { accessLocalSupabaseStatus } from "./target-runtime-status.mjs";

const networkPolicyDetails = new WeakMap();

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedRecoveryApplicationValidationError";
  error.code = code;
  throw error;
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function buildRecoveryBrowserNetworkPolicy({ app, localStatus } = {}) {
  let application;
  accessLocalRecoveryApp(app, (value) => { application = value; });
  let runtime;
  accessLocalSupabaseStatus(localStatus, (value) => { runtime = value; });
  const allowed = new Set([new URL(application.origin).origin, new URL(runtime.API_URL).origin]);
  const handle = Object.freeze({ status: "ENFORCED", allowedOriginCount: 2, toJSON: () => ({ status: "ENFORCED", allowedOriginCount: 2 }) });
  networkPolicyDetails.set(handle, allowed);
  return handle;
}

export function assertRecoveryBrowserRequestAllowed(policy, requestUrl) {
  const allowed = networkPolicyDetails.get(policy);
  let origin;
  try { origin = new URL(requestUrl).origin; } catch { fail("RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN", "Recovery browser request is outside the local allowlist"); }
  if (!allowed?.has(origin)) fail("RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN", "Recovery browser request is outside the local allowlist");
  return true;
}

async function admitHealthResponse(response, expectedStatus) {
  if (!response || response.status !== 200 || response.redirected !== false) fail("RECOVERY_APP_HEALTH_FAILED", "Recovery application health gate failed");
  let body;
  try { body = await response.json(); } catch { fail("RECOVERY_APP_HEALTH_FAILED", "Recovery application health response is invalid"); }
  if (!plain(body) || Object.keys(body).length !== 1 || body.status !== expectedStatus) fail("RECOVERY_APP_HEALTH_FAILED", "Recovery application health response is invalid");
}

export async function probeLocalRecoveryAppHealth(app, { request = fetch, timeoutMs = 10_000 } = {}) {
  let application;
  accessLocalRecoveryApp(app, (value) => { application = value; });
  for (const [pathname, expected] of [["/api/health/live", "ok"], ["/api/health/ready", "ready"]]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await request(new URL(pathname, application.origin), { method: "GET", redirect: "manual", signal: controller.signal });
      await admitHealthResponse(response, expected);
    } catch (error) {
      if (error?.code === "RECOVERY_APP_HEALTH_FAILED") throw error;
      fail("RECOVERY_APP_HEALTH_FAILED", "Recovery application health request failed");
    } finally { clearTimeout(timeout); }
  }
  return Object.freeze({ status: "PASS", applicationLive: "PASS", applicationReady: "PASS" });
}

function pathnameOf(value) {
  try { return new URL(value).pathname.replace(/\/$/, "") || "/"; } catch { return ""; }
}

async function installNetworkGuard(context, policy, violation) {
  await context.route("**/*", async (route) => {
    try {
      assertRecoveryBrowserRequestAllowed(policy, route.request().url());
      await route.continue();
    } catch {
      violation.detected = true;
      await route.abort("blockedbyclient");
    }
  });
}

export async function runRecoveryApplicationBrowserSmoke({ app, localStatus, credentials, launchBrowser, timeoutMs = 20_000 } = {}) {
  if (!credentials || Object.keys(credentials).length !== 2 || typeof credentials.identifier !== "string" || typeof credentials.password !== "string") fail("RECOVERY_APP_LOGIN_FAILED", "In-memory application login credentials are required");
  if (!credentials.identifier.includes("@")) fail("RECOVERY_APP_LOGIN_EMAIL_REQUIRED", "Recovery application login requires an email identifier");
  const policy = buildRecoveryBrowserNetworkPolicy({ app, localStatus });
  let application;
  accessLocalRecoveryApp(app, (value) => { application = value; });
  const launcher = launchBrowser ?? (async () => {
    const { chromium } = await import("playwright");
    return chromium.launch({ headless: true });
  });
  let browser;
  const contexts = [];
  let primaryError;
  try {
    browser = await launcher();
    const authenticated = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block", recordVideo: undefined, storageState: undefined });
    contexts.push(authenticated);
    const authenticatedViolation = { detected: false };
    await installNetworkGuard(authenticated, policy, authenticatedViolation);
    const page = await authenticated.newPage();
    await page.goto(new URL("/login", application.origin).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.locator('input[name="email"]').fill(credentials.identifier);
    await page.locator('input[name="password"]').fill(credentials.password);
    await page.getByRole("button", { name: /entrar al workspace/i }).click();
    await page.waitForURL((url) => new Set(["/dashboard", "/cambiar-contrasena-inicial"]).has(pathnameOf(url.href)), { timeout: timeoutMs });
    const landing = pathnameOf(page.url());
    if (!new Set(["/dashboard", "/cambiar-contrasena-inicial"]).has(landing) || authenticatedViolation.detected) {
      fail(authenticatedViolation.detected ? "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN" : "RECOVERY_APP_LOGIN_FAILED", "Recovery application authenticated gate failed");
    }
    await page.locator("main").first().waitFor({ state: "visible", timeout: timeoutMs });
    if (authenticatedViolation.detected) fail("RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN", "Recovery application requested a remote origin");

    const anonymous = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block", recordVideo: undefined, storageState: undefined });
    contexts.push(anonymous);
    const anonymousViolation = { detected: false };
    await installNetworkGuard(anonymous, policy, anonymousViolation);
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(new URL("/dashboard", application.origin).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (pathnameOf(anonymousPage.url()) !== "/login" || anonymousViolation.detected) {
      fail(anonymousViolation.detected ? "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN" : "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED", "Anonymous recovery application access was not rejected");
    }
  } catch (error) {
    primaryError = error?.code ? error : Object.assign(new Error("Recovery application browser smoke failed"), { code: "RECOVERY_APP_LOGIN_FAILED" });
  } finally {
    let cleanupFailed = false;
    for (const context of contexts.reverse()) {
      try { await context.close(); } catch { cleanupFailed = true; }
    }
    if (browser) {
      try { await browser.close(); } catch { cleanupFailed = true; }
    }
    if (cleanupFailed) fail("RECOVERY_APP_CLEANUP_INCOMPLETE", "Recovery browser cleanup did not complete");
  }
  if (primaryError) throw primaryError;
  return Object.freeze({
    status: "PASS",
    applicationLogin: "PASS",
    internalScreen: "PASS",
    applicationRead: "PASS",
    anonymousInternalAccess: "REJECTED",
    applicationRemoteIsolation: "VERIFIED",
  });
}

export function verifyRlsGrantBaselineAuthority({ baseline, restorePlan } = {}) {
  const audits = restorePlan?.auditOnly;
  if (baseline?.status !== "PASS" || baseline?.baseline?.status !== "PASS" || baseline?.baseline?.migrationCount !== 6
    || !audits || ![audits.roles, audits.schema, audits.history].every((item) => item?.status === "PASS" && item?.treatment === "AUDIT_ONLY")
    || restorePlan?.restoreSql?.status !== "READY" || restorePlan.restoreSql.transactionAuthority !== "PSQL_SINGLE_TRANSACTION" || restorePlan?.sanitized?.status !== "PASS") {
    fail("RECOVERY_RLS_GRANT_BASELINE_UNVERIFIED", "Recovery RLS and grant baseline authority is incomplete");
  }
  return Object.freeze({ status: "VERIFIED", rlsGrantBaseline: "VERIFIED" });
}
