import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance as nodePerformance } from "node:perf_hooks";

import { expect, type Browser, type Page, test } from "@playwright/test";

import { loginAs } from "../e2e/helpers/auth";

test.describe.configure({ mode: "serial" });

type Mode = "cold-document-navigation" | "client-prefetched-navigation";
type Role = "public" | "admin";

type RouteConfig = {
  label: string;
  path: string;
  role: Role;
  heading?: RegExp;
  waitForAnyH1?: boolean;
};

type NavigationSample = {
  route: string;
  role: Role;
  sample: number;
  mode: Mode;
  startedAt: string;
  wallTimeMs: number;
  responseStartMs: number | null;
  domContentLoadedMs: number | null;
  loadEventMs: number | null;
  navigationTransferBytes: number;
  navigationEncodedBytes: number;
  navigationDecodedBytes: number;
  scriptTransferBytes: number;
  styleTransferBytes: number;
  imageTransferBytes: number;
  fontTransferBytes: number;
  fetchTransferBytes: number;
  resourceCount: number;
  httpStatus: number | null;
  success: boolean;
  error: string | null;
};

const SAMPLE_COUNT = 5;
const perfDir = resolve(process.cwd(), ".next", "diagnostics", "performance");
const storageStatePath = join(perfDir, "performance-auth-state.json");
const outputPath = join(perfDir, "navigation-results.json");
const samples: NavigationSample[] = [];
const notMeasured: Array<{ route: string; reason: string }> = [];

let discoveredPedidoPath: string | null = null;
let discoveredSolicitudPath: string | null = null;

function routeSummaryKey(sample: NavigationSample) {
  return `${sample.mode} ${sample.role} ${sample.route}`;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length === 0) {
    return null;
  }

  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarizeSamples() {
  const grouped = new Map<string, NavigationSample[]>();

  for (const sample of samples) {
    const key = routeSummaryKey(sample);
    grouped.set(key, [...(grouped.get(key) ?? []), sample]);
  }

  return [...grouped.entries()].map(([key, group]) => {
    const successful = group.filter((sample) => sample.success);
    const wallTimes = successful.map((sample) => sample.wallTimeMs);
    const transferBytes = successful.map(
      (sample) =>
        sample.navigationTransferBytes +
        sample.scriptTransferBytes +
        sample.styleTransferBytes +
        sample.imageTransferBytes +
        sample.fontTransferBytes +
        sample.fetchTransferBytes,
    );
    const medianWallTimeMs = median(wallTimes);
    const minWallTimeMs = wallTimes.length ? Math.min(...wallTimes) : null;
    const maxWallTimeMs = wallTimes.length ? Math.max(...wallTimes) : null;
    const relativeSpread =
      medianWallTimeMs && minWallTimeMs !== null && maxWallTimeMs !== null
        ? (maxWallTimeMs - minWallTimeMs) / medianWallTimeMs
        : null;
    const failures = group.length - successful.length;
    const stability =
      failures > 0 || relativeSpread === null || relativeSpread > 0.3
        ? "unreliable"
        : relativeSpread > 0.15
          ? "noisy"
          : "stable";

    return {
      key,
      route: group[0]?.route ?? "unknown",
      role: group[0]?.role ?? "public",
      mode: group[0]?.mode ?? "cold-document-navigation",
      samples: group.length,
      successes: successful.length,
      failures,
      medianWallTimeMs,
      minWallTimeMs,
      maxWallTimeMs,
      relativeSpread,
      medianTransferBytes: median(transferBytes),
      stability,
    };
  });
}

async function waitForRoute(page: Page, route: RouteConfig) {
  await page.waitForURL((url) => url.pathname === route.path, {
    timeout: 20_000,
  });
  expect(new URL(page.url()).pathname).toBe(route.path);

  if (route.heading) {
    await expect(
      page.getByRole("heading", { name: route.heading }).first(),
    ).toBeVisible({ timeout: 20_000 });
    return;
  }

  if (route.waitForAnyH1) {
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 20_000,
    });
    return;
  }

  await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
}

async function discoverDetailPath(page: Page, listPath: string, prefix: string) {
  await page.goto(listPath, { waitUntil: "load" });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });

  const hrefs = await page.locator(`a[href^="${prefix}/"]`).evaluateAll(
    (links, expectedPrefix) =>
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href))
        .filter(
          (href) =>
            href.startsWith(`${expectedPrefix}/`) &&
            !href.includes("/archivos/") &&
            !href.endsWith("/nuevo"),
        ),
    prefix,
  );

  return hrefs[0] ?? null;
}

async function collectBrowserMetrics(page: Page, sinceStartTime?: number) {
  return page.evaluate((since) => {
    const resourceEntries = window.performance
      .getEntriesByType("resource")
      .filter((entry) => since === undefined || entry.startTime >= since)
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;

        return {
          name: resource.name,
          initiatorType: resource.initiatorType,
          transferSize: resource.transferSize || 0,
        };
      });
    const navigation = window.performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming | undefined;

    const totalBy = (predicate: (entry: (typeof resourceEntries)[number]) => boolean) =>
      resourceEntries
        .filter(predicate)
        .reduce((total, entry) => total + entry.transferSize, 0);

    return {
      responseStartMs: navigation?.responseStart ?? null,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? null,
      loadEventMs: navigation?.loadEventEnd ?? null,
      navigationTransferBytes: navigation?.transferSize ?? 0,
      navigationEncodedBytes: navigation?.encodedBodySize ?? 0,
      navigationDecodedBytes: navigation?.decodedBodySize ?? 0,
      scriptTransferBytes: totalBy((entry) => entry.initiatorType === "script"),
      styleTransferBytes: totalBy(
        (entry) =>
          entry.initiatorType === "link" ||
          entry.initiatorType === "css" ||
          /\.css(?:[?#]|$)/i.test(entry.name),
      ),
      imageTransferBytes: totalBy(
        (entry) =>
          entry.initiatorType === "img" ||
          entry.initiatorType === "image" ||
          /\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#]|$)/i.test(entry.name),
      ),
      fontTransferBytes: totalBy((entry) =>
        /\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(entry.name),
      ),
      fetchTransferBytes: totalBy(
        (entry) =>
          entry.initiatorType === "fetch" ||
          entry.initiatorType === "xmlhttprequest" ||
          entry.name.includes("_rsc"),
      ),
      resourceCount: resourceEntries.length,
    };
  }, sinceStartTime);
}

function recordSample(
  config: RouteConfig,
  mode: Mode,
  sample: number,
  startedAt: string,
  wallTimeMs: number,
  httpStatus: number | null,
  metrics: Awaited<ReturnType<typeof collectBrowserMetrics>>,
  success: boolean,
  error: string | null,
) {
  samples.push({
    route: config.label,
    role: config.role,
    sample,
    mode,
    startedAt,
    wallTimeMs: Math.round(wallTimeMs),
    responseStartMs: metrics.responseStartMs,
    domContentLoadedMs: metrics.domContentLoadedMs,
    loadEventMs: metrics.loadEventMs,
    navigationTransferBytes: metrics.navigationTransferBytes,
    navigationEncodedBytes: metrics.navigationEncodedBytes,
    navigationDecodedBytes: metrics.navigationDecodedBytes,
    scriptTransferBytes: metrics.scriptTransferBytes,
    styleTransferBytes: metrics.styleTransferBytes,
    imageTransferBytes: metrics.imageTransferBytes,
    fontTransferBytes: metrics.fontTransferBytes,
    fetchTransferBytes: metrics.fetchTransferBytes,
    resourceCount: metrics.resourceCount,
    httpStatus,
    success,
    error,
  });
}

async function measureColdRoute(
  browser: Browser,
  route: RouteConfig,
  sample: number,
  includeSample: boolean,
) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    storageState: route.role === "admin" ? storageStatePath : undefined,
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  const startedAt = new Date().toISOString();
  const start = nodePerformance.now();
  let httpStatus: number | null = null;
  let error: string | null = null;
  let success = false;

  try {
    const response = await page.goto(route.path, { waitUntil: "load" });
    httpStatus = response?.status() ?? null;
    await waitForRoute(page, route);
    success = true;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const wallTimeMs = nodePerformance.now() - start;
  const metrics = await collectBrowserMetrics(page);
  await context.close();

  if (includeSample) {
    recordSample(
      route,
      "cold-document-navigation",
      sample,
      startedAt,
      wallTimeMs,
      httpStatus,
      metrics,
      success,
      error,
    );
  }
}

async function measureClientTransition(
  browser: Browser,
  origin: RouteConfig,
  target: RouteConfig,
  linkSelector: string,
  sample: number,
  includeSample: boolean,
  deriveTargetFromLink = false,
  targetPathPrefix?: string,
) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    storageState: storageStatePath,
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  const config = {
    label: `${origin.label} -> ${target.label}`,
    path: target.path,
    role: target.role,
    heading: target.heading,
    waitForAnyH1: target.waitForAnyH1,
  };
  const startedAt = new Date().toISOString();
  let error: string | null = null;
  let success = false;
  let sinceStartTime = 0;
  let targetPath = target.path;

  await page.goto(origin.path, { waitUntil: "load" });
  await waitForRoute(page, origin);

  const start = nodePerformance.now();

  try {
    const link = page.locator(linkSelector).first();
    await expect(link).toBeVisible({ timeout: 20_000 });
    if (deriveTargetFromLink) {
      const href = await link.getAttribute("href");
      if (!href) {
        throw new Error("Visible transition link does not have href.");
      }
      targetPath = new URL(href, "http://127.0.0.1:3100").pathname;
    }
    sinceStartTime = await page.evaluate(() => window.performance.now());
    await Promise.all([
      page.waitForURL(
        (url) =>
          targetPathPrefix
            ? url.pathname.startsWith(targetPathPrefix) &&
              url.pathname !== origin.path &&
              !url.pathname.includes("/archivos/")
            : url.pathname === targetPath,
        {
          timeout: 20_000,
        },
      ),
      link.click(),
    ]);
    if (targetPathPrefix) {
      targetPath = new URL(page.url()).pathname;
    }
    await waitForRoute(page, { ...target, path: targetPath });
    success = true;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }

  const wallTimeMs = nodePerformance.now() - start;
  const metrics = await collectBrowserMetrics(page, sinceStartTime);
  await context.close();

  if (includeSample) {
    recordSample(
      config,
      "client-prefetched-navigation",
      sample,
      startedAt,
      wallTimeMs,
      null,
      {
        ...metrics,
        responseStartMs: null,
        domContentLoadedMs: null,
        loadEventMs: null,
        navigationTransferBytes: 0,
        navigationEncodedBytes: 0,
        navigationDecodedBytes: 0,
      },
      success,
      error,
    );
  }
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(perfDir, { recursive: true });

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();

  await loginAs(page, "admin");
  await context.storageState({ path: storageStatePath });
  await context.close();

  const discoveryContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    storageState: storageStatePath,
    viewport: { width: 1366, height: 768 },
  });
  const discoveryPage = await discoveryContext.newPage();

  discoveredPedidoPath = await discoverDetailPath(
    discoveryPage,
    "/dashboard/pedidos",
    "/dashboard/pedidos",
  );
  discoveredSolicitudPath = await discoverDetailPath(
    discoveryPage,
    "/dashboard/solicitudes",
    "/dashboard/solicitudes",
  );
  await discoveryContext.close();
});

test.afterAll(() => {
  rmSync(storageStatePath, { force: true });
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sampleCount: SAMPLE_COUNT,
        viewport: { width: 1366, height: 768 },
        discovered: {
          pedidoDetailAvailable: Boolean(discoveredPedidoPath),
          solicitudDetailAvailable: Boolean(discoveredSolicitudPath),
        },
        notMeasured,
        samples,
        summaries: summarizeSamples(),
      },
      null,
      2,
    )}\n`,
  );
});

test("records cold document navigation baseline", async ({ browser }) => {
  const routes: RouteConfig[] = [
    {
      label: "/",
      path: "/",
      role: "public",
      heading: /da forma a tu idea con una solicitud clara/i,
    },
    {
      label: "/solicitud",
      path: "/solicitud",
      role: "public",
      heading: /necesitas preparar/i,
    },
    {
      label: "/estado",
      path: "/estado",
      role: "public",
      heading: /consulta el estado de tu solicitud o pedido/i,
    },
    {
      label: "/dashboard",
      path: "/dashboard",
      role: "admin",
      heading: /dashboard operativo/i,
    },
    {
      label: "/dashboard/pedidos",
      path: "/dashboard/pedidos",
      role: "admin",
      heading: /^pedidos$/i,
    },
    {
      label: "/dashboard/solicitudes",
      path: "/dashboard/solicitudes",
      role: "admin",
      heading: /^solicitudes$/i,
    },
  ];

  if (discoveredPedidoPath) {
    routes.push({
      label: "/dashboard/pedidos/[id]",
      path: discoveredPedidoPath,
      role: "admin",
      waitForAnyH1: true,
    });
  } else {
    notMeasured.push({
      route: "/dashboard/pedidos/[id]",
      reason: "No pedido detail link found in /dashboard/pedidos.",
    });
  }

  if (discoveredSolicitudPath) {
    routes.push({
      label: "/dashboard/solicitudes/[id]",
      path: discoveredSolicitudPath,
      role: "admin",
      waitForAnyH1: true,
    });
  } else {
    notMeasured.push({
      route: "/dashboard/solicitudes/[id]",
      reason: "No solicitud detail link found in /dashboard/solicitudes.",
    });
  }

  for (const route of routes) {
    await measureColdRoute(browser, route, 0, false);

    for (let sample = 1; sample <= SAMPLE_COUNT; sample += 1) {
      await measureColdRoute(browser, route, sample, true);
    }
  }
});

test("records client transition baseline", async ({ browser }) => {
  const dashboard: RouteConfig = {
    label: "/dashboard",
    path: "/dashboard",
    role: "admin",
    heading: /dashboard operativo/i,
  };
  const pedidos: RouteConfig = {
    label: "/dashboard/pedidos",
    path: "/dashboard/pedidos",
    role: "admin",
    heading: /^pedidos$/i,
  };
  const solicitudes: RouteConfig = {
    label: "/dashboard/solicitudes",
    path: "/dashboard/solicitudes",
    role: "admin",
    heading: /^solicitudes$/i,
  };
  const transitions: Array<{
    origin: RouteConfig;
    target: RouteConfig;
    selector: string;
    deriveTargetFromLink?: boolean;
    targetPathPrefix?: string;
  }> = [
    {
      origin: dashboard,
      target: pedidos,
      selector: 'a[href="/dashboard/pedidos"]:visible',
    },
    {
      origin: dashboard,
      target: solicitudes,
      selector: 'a[href="/dashboard/solicitudes"]:visible',
    },
  ];

  if (discoveredPedidoPath) {
    transitions.push({
      origin: pedidos,
      target: {
        label: "/dashboard/pedidos/[id]",
        path: discoveredPedidoPath,
        role: "admin",
        waitForAnyH1: true,
      },
      selector: 'tr[role="link"]:visible',
      targetPathPrefix: "/dashboard/pedidos/",
    });
  } else {
    notMeasured.push({
      route: "/dashboard/pedidos -> /dashboard/pedidos/[id]",
      reason: "No pedido detail link found in /dashboard/pedidos.",
    });
  }

  for (const transition of transitions) {
    await measureClientTransition(
      browser,
      transition.origin,
      transition.target,
        transition.selector,
        0,
        false,
        transition.deriveTargetFromLink,
        transition.targetPathPrefix,
      );

    for (let sample = 1; sample <= SAMPLE_COUNT; sample += 1) {
      await measureClientTransition(
        browser,
        transition.origin,
        transition.target,
        transition.selector,
        sample,
        true,
        transition.deriveTargetFromLink,
        transition.targetPathPrefix,
      );
    }
  }
});
