import {
  accessLocalRecoveryApp,
  classifyLocalRecoveryAppRuntimeDiagnosticSince,
  createLocalRecoveryAppDiagnosticCheckpoint,
  settleLocalRecoveryAppDiagnostics,
} from "./local-recovery-app.mjs";
import { accessLocalSupabaseStatus } from "./target-runtime-status.mjs";

const networkPolicyDetails = new WeakMap();
const TARGET_AUTH_HEALTH_TIMEOUT_MS = 10_000;
const APPLICATION_COLD_START_TIMEOUT_MS = 120_000;

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

async function requestWithTimeout(request, url, options, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => request(url, { ...options, signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("request timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function runtimeFailureCode(classification, codes) {
  if (typeof classification === "string") return codes.runtime[classification] ?? codes.serverError;
  if (!plain(classification)) return codes.serverError;
  if (classification.diagnostic === "MODULE_RESOLUTION_FAILURE") return codes.module[classification.moduleCategory] ?? codes.module.UNKNOWN;
  return codes.runtime[classification.diagnostic] ?? codes.serverError;
}

async function admitApplicationHealthResponse(app, checkpoint, response, expectedStatus, codes, runtimeDiagnostic, settleDiagnostics, settleOptions) {
  const status = response?.status;
  if (response?.redirected === true || (Number.isInteger(status) && status >= 300 && status <= 399)) fail(codes.redirected, "Recovery application health response was redirected");
  if (status === 404) fail(codes.notFound, "Recovery application health route was not found");
  if (Number.isInteger(status) && status >= 400 && status <= 499) fail(codes.httpRejected, "Recovery application health response was rejected");
  if (Number.isInteger(status) && status >= 500) {
    let classification = Object.freeze({ diagnostic: "UNCLASSIFIED" });
    try {
      await settleDiagnostics(app, checkpoint, settleOptions);
      classification = runtimeDiagnostic(app, checkpoint);
    } catch { classification = Object.freeze({ diagnostic: "UNCLASSIFIED" }); }
    fail(runtimeFailureCode(classification, codes), "Recovery application health server response failed");
  }
  if (status !== 200 || response?.redirected !== false) fail(codes.httpRejected, "Recovery application health response was rejected");
  let body;
  try { body = await response.json(); } catch { fail(codes.bodyInvalid, "Recovery application health response body is invalid"); }
  if (!plain(body) || Object.keys(body).length !== 1 || body.status !== expectedStatus) fail(codes.bodyInvalid, "Recovery application health response body is invalid");
}

async function probeApplicationEndpoint(app, {
  pathname,
  expectedStatus,
  requestCode,
  codes,
  request = fetch,
  timeoutMs = APPLICATION_COLD_START_TIMEOUT_MS,
  createCheckpoint = createLocalRecoveryAppDiagnosticCheckpoint,
  settleDiagnostics = settleLocalRecoveryAppDiagnostics,
  settleOptions,
  runtimeDiagnostic = classifyLocalRecoveryAppRuntimeDiagnosticSince,
}) {
  let application;
  accessLocalRecoveryApp(app, (value) => { application = value; });
  const checkpoint = createCheckpoint(app);
  let response;
  try {
    response = await requestWithTimeout(request, new URL(pathname, application.origin), { method: "GET", redirect: "manual" }, timeoutMs);
  } catch { fail(requestCode, "Recovery application health request failed"); }
  await admitApplicationHealthResponse(app, checkpoint, response, expectedStatus, codes, runtimeDiagnostic, settleDiagnostics, settleOptions);
}

export async function probeLocalRecoveryTargetAuthHealth(localStatus, { request = fetch, timeoutMs = TARGET_AUTH_HEALTH_TIMEOUT_MS } = {}) {
  let runtime;
  try { accessLocalSupabaseStatus(localStatus, (value) => { runtime = value; }); }
  catch { fail("RECOVERY_TARGET_AUTH_HEALTH_FAILED", "Recovery target Auth health gate failed"); }
  try {
    const response = await requestWithTimeout(request, new URL("/auth/v1/health", runtime.API_URL), {
      method: "GET",
      redirect: "manual",
      headers: Object.freeze({ apikey: runtime.ANON_KEY }),
    }, timeoutMs);
    if (!response || response.status !== 200 || response.redirected !== false) fail("RECOVERY_TARGET_AUTH_HEALTH_FAILED", "Recovery target Auth health gate failed");
  } catch (error) {
    if (error?.code === "RECOVERY_TARGET_AUTH_HEALTH_FAILED") throw error;
    fail("RECOVERY_TARGET_AUTH_HEALTH_FAILED", "Recovery target Auth health request failed");
  }
  return Object.freeze({ status: "PASS", targetAuthHealth: "PASS" });
}

export async function probeLocalRecoveryAppLive(app, options = {}) {
  await probeApplicationEndpoint(app, {
    ...options,
    pathname: "/api/health/live",
    expectedStatus: "ok",
    requestCode: "RECOVERY_APP_LIVE_REQUEST_FAILED",
    codes: {
      redirected: "RECOVERY_APP_LIVE_REDIRECTED",
      notFound: "RECOVERY_APP_LIVE_NOT_FOUND",
      httpRejected: "RECOVERY_APP_LIVE_HTTP_REJECTED",
      serverError: "RECOVERY_APP_LIVE_SERVER_ERROR",
      bodyInvalid: "RECOVERY_APP_LIVE_BODY_INVALID",
      runtime: {
        MODULE_RESOLUTION_FAILURE: "RECOVERY_APP_LIVE_MODULE_RESOLUTION_FAILED",
        COMPILE_FAILURE: "RECOVERY_APP_LIVE_COMPILE_FAILED",
        RUNTIME_FAILURE: "RECOVERY_APP_LIVE_RUNTIME_FAILED",
      },
      module: {
        PROJECT_ALIAS: "RECOVERY_APP_LIVE_MODULE_PROJECT_ALIAS_FAILED",
        RELATIVE_IMPORT: "RECOVERY_APP_LIVE_MODULE_RELATIVE_IMPORT_FAILED",
        NEXT_INTERNAL: "RECOVERY_APP_LIVE_MODULE_NEXT_INTERNAL_FAILED",
        DECLARED_PACKAGE: "RECOVERY_APP_LIVE_MODULE_DECLARED_PACKAGE_FAILED",
        OTHER_BARE_PACKAGE: "RECOVERY_APP_LIVE_MODULE_OTHER_BARE_PACKAGE_FAILED",
        NODE_BUILTIN: "RECOVERY_APP_LIVE_MODULE_NODE_BUILTIN_FAILED",
        ABSOLUTE_PATH: "RECOVERY_APP_LIVE_MODULE_ABSOLUTE_PATH_FAILED",
        REDACTED_PATH: "RECOVERY_APP_LIVE_MODULE_REDACTED_PATH_FAILED",
        LOADER_REQUEST: "RECOVERY_APP_LIVE_MODULE_LOADER_REQUEST_FAILED",
        UNPARSED: "RECOVERY_APP_LIVE_MODULE_UNPARSED_FAILED",
        MIXED: "RECOVERY_APP_LIVE_MODULE_MIXED_FAILED",
        UNKNOWN: "RECOVERY_APP_LIVE_MODULE_UNKNOWN_FAILED",
      },
    },
  });
  return Object.freeze({ status: "PASS", applicationLive: "PASS" });
}

export async function probeLocalRecoveryAppReady(app, options = {}) {
  await probeApplicationEndpoint(app, {
    ...options,
    pathname: "/api/health/ready",
    expectedStatus: "ready",
    requestCode: "RECOVERY_APP_READY_REQUEST_FAILED",
    codes: {
      redirected: "RECOVERY_APP_READY_REDIRECTED",
      notFound: "RECOVERY_APP_READY_NOT_FOUND",
      httpRejected: "RECOVERY_APP_READY_HTTP_REJECTED",
      serverError: "RECOVERY_APP_READY_SERVER_ERROR",
      bodyInvalid: "RECOVERY_APP_READY_BODY_INVALID",
      runtime: {
        MODULE_RESOLUTION_FAILURE: "RECOVERY_APP_READY_MODULE_RESOLUTION_FAILED",
        COMPILE_FAILURE: "RECOVERY_APP_READY_COMPILE_FAILED",
        RUNTIME_FAILURE: "RECOVERY_APP_READY_RUNTIME_FAILED",
      },
      module: {
        PROJECT_ALIAS: "RECOVERY_APP_READY_MODULE_PROJECT_ALIAS_FAILED",
        RELATIVE_IMPORT: "RECOVERY_APP_READY_MODULE_RELATIVE_IMPORT_FAILED",
        NEXT_INTERNAL: "RECOVERY_APP_READY_MODULE_NEXT_INTERNAL_FAILED",
        DECLARED_PACKAGE: "RECOVERY_APP_READY_MODULE_DECLARED_PACKAGE_FAILED",
        OTHER_BARE_PACKAGE: "RECOVERY_APP_READY_MODULE_OTHER_BARE_PACKAGE_FAILED",
        NODE_BUILTIN: "RECOVERY_APP_READY_MODULE_NODE_BUILTIN_FAILED",
        ABSOLUTE_PATH: "RECOVERY_APP_READY_MODULE_ABSOLUTE_PATH_FAILED",
        REDACTED_PATH: "RECOVERY_APP_READY_MODULE_REDACTED_PATH_FAILED",
        LOADER_REQUEST: "RECOVERY_APP_READY_MODULE_LOADER_REQUEST_FAILED",
        UNPARSED: "RECOVERY_APP_READY_MODULE_UNPARSED_FAILED",
        MIXED: "RECOVERY_APP_READY_MODULE_MIXED_FAILED",
        UNKNOWN: "RECOVERY_APP_READY_MODULE_UNKNOWN_FAILED",
      },
    },
  });
  return Object.freeze({ status: "PASS", applicationReady: "PASS" });
}

export async function probeLocalRecoveryAppHealth(app, options = {}) {
  await probeLocalRecoveryAppLive(app, options);
  await probeLocalRecoveryAppReady(app, options);
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

export async function runRecoveryApplicationCompatibilityBrowserSmoke({ app, localStatus, launchBrowser, timeoutMs = 20_000, onPhase = () => undefined } = {}) {
  if (typeof onPhase !== "function") fail("RECOVERY_APP_BROWSER_INVALID", "Recovery application browser phase observer is invalid");
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
  let currentPhase = "BROWSER_LOGIN_SURFACE";
  const setPhase = (phase) => { currentPhase = phase; onPhase(phase); };
  try {
    browser = await launcher();

    setPhase("BROWSER_LOGIN_SURFACE");
    const loginContext = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block", recordVideo: undefined, storageState: undefined });
    contexts.push(loginContext);
    const loginViolation = { detected: false };
    await installNetworkGuard(loginContext, policy, loginViolation);
    const loginPage = await loginContext.newPage();
    await loginPage.goto(new URL("/login", application.origin).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await loginPage.locator('input[name="email"]').waitFor({ state: "visible", timeout: timeoutMs });
    await loginPage.locator('input[name="password"]').waitFor({ state: "visible", timeout: timeoutMs });
    await loginPage.getByRole("button", { name: /entrar al workspace/i }).waitFor({ state: "visible", timeout: timeoutMs });
    if (pathnameOf(loginPage.url()) !== "/login" || loginViolation.detected) {
      fail(loginViolation.detected ? "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN" : "RECOVERY_APP_LOGIN_SURFACE_FAILED", "Recovery application login surface gate failed");
    }

    setPhase("BROWSER_ANONYMOUS");
    const anonymousContext = await browser.newContext({ acceptDownloads: false, serviceWorkers: "block", recordVideo: undefined, storageState: undefined });
    contexts.push(anonymousContext);
    const anonymousViolation = { detected: false };
    await installNetworkGuard(anonymousContext, policy, anonymousViolation);
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto(new URL("/dashboard", application.origin).href, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (pathnameOf(anonymousPage.url()) !== "/login" || anonymousViolation.detected) {
      fail(anonymousViolation.detected ? "RECOVERY_APP_REMOTE_REQUEST_FORBIDDEN" : "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED", "Anonymous recovery application access was not rejected");
    }
  } catch (error) {
    if (error?.code) primaryError = error;
    else {
      const code = currentPhase === "BROWSER_ANONYMOUS" ? "RECOVERY_APP_ANONYMOUS_ACCESS_FAILED" : "RECOVERY_APP_LOGIN_SURFACE_FAILED";
      primaryError = Object.assign(new Error("Recovery application compatibility browser smoke failed"), { code });
    }
  } finally {
    let cleanupFailed = false;
    for (const context of contexts.reverse()) {
      try { await context.close(); } catch { cleanupFailed = true; }
    }
    if (browser) {
      try { await browser.close(); } catch { cleanupFailed = true; }
    }
    if (cleanupFailed) {
      setPhase("BROWSER_CLEANUP");
      fail("RECOVERY_BROWSER_CLEANUP_INCOMPLETE", "Recovery browser cleanup did not complete");
    }
  }
  if (primaryError) throw primaryError;
  return Object.freeze({
    status: "PASS",
    loginSurface: "PASS",
    anonymousInternalAccess: "REJECTED",
    browserRemoteIsolation: "VERIFIED",
    browserCleanup: "PASS",
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
