import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, type Browser, type Page, test } from "@playwright/test";

import { loginAs } from "../e2e/helpers/auth";

test.describe.configure({ mode: "serial" });

type FlowName =
  | "dashboard"
  | "pedidos-default"
  | "pedidos-search"
  | "solicitudes-default"
  | "solicitudes-search";

type FlowConfig = {
  flow: FlowName;
  routeTemplate: string;
  buildPath: () => string;
  waitForCanonicalContent: (page: Page) => Promise<void>;
};

type FlowResult = {
  flow: FlowName;
  routeTemplate: string;
  role: "admin";
  warmupCount: number;
  measuredLoadCount: number;
  success: boolean;
  failures: string[];
  startedAt: string;
  finishedAt: string;
  queryValueStored: false;
};

const perfDir = resolve(process.cwd(), ".next", "diagnostics", "performance");
const attributionDir = join(perfDir, "sql-flow-attribution");
const storageStatePath = join(perfDir, "sql-flow-auth-state.json");
const measuredLoadCount = 3;
const warmupCount = 1;

let pedidoSearchQuery: string | null = null;
let solicitudSearchQuery: string | null = null;

function sanitizeError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);

  return message
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      "[uuid]",
    )
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[phone]")
    .replace(/(password|contrase(?:\u00f1|n)a)[^,\n\r]*/gi, "$1=[redacted]")
    .slice(0, 1200);
}

function flowDir(flow: FlowName) {
  return join(attributionDir, flow);
}

function runNodeScript(args: string[]) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `Command failed: node ${args.join(" ")}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .map(sanitizeError)
        .join("\n"),
    );
  }
}

async function waitForDashboard(page: Page) {
  await page.waitForURL((url) => url.pathname === "/dashboard", {
    timeout: 20_000,
  });
  await expect(
    page.getByRole("heading", { name: /dashboard operativo/i }).first(),
  ).toBeVisible({ timeout: 20_000 });
}

async function waitForPedidos(page: Page, expectQuery: boolean) {
  await page.waitForURL((url) => {
    if (url.pathname !== "/dashboard/pedidos") {
      return false;
    }

    return expectQuery ? Boolean(url.searchParams.get("q")) : !url.search;
  }, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /^pedidos$/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByLabel(/buscar pedidos/i)).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.locator("tbody tr, [aria-label='Pedidos'] a, main").first(),
  ).toBeVisible({ timeout: 20_000 });
}

async function waitForSolicitudes(page: Page, expectQuery: boolean) {
  await page.waitForURL((url) => {
    if (url.pathname !== "/dashboard/solicitudes") {
      return false;
    }

    return expectQuery ? Boolean(url.searchParams.get("q")) : !url.search;
  }, { timeout: 20_000 });
  await expect(
    page.getByRole("heading", { name: /^solicitudes$/i }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel(/buscar solicitudes/i)).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    page.locator("tbody tr, [aria-label='Solicitudes'] a, main").first(),
  ).toBeVisible({ timeout: 20_000 });
}

async function loadDocument(browser: Browser, path: string, waitForReady: (page: Page) => Promise<void>) {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    storageState: storageStatePath,
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();

  try {
    await page.goto(path, { waitUntil: "load" });
    await waitForReady(page);
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }
}

async function discoverPedidoSearchQuery(page: Page) {
  await page.goto("/dashboard/pedidos", { waitUntil: "load" });
  await waitForPedidos(page, false);

  const ariaLabel = await page
    .getByRole("link", { name: /abrir pedido/i })
    .first()
    .getAttribute("aria-label")
    .catch(() => null);
  const fromLabel = ariaLabel?.match(/abrir pedido\s+([^\s]+)/i)?.[1]?.trim();

  if (fromLabel && fromLabel.length >= 3) {
    return fromLabel;
  }

  const firstOrderNumber = await page
    .locator("tbody tr")
    .first()
    .locator("td")
    .first()
    .innerText()
    .catch(() => "");
  const fallback = firstOrderNumber.trim().split(/\s+/)[0] ?? "";

  if (fallback.length >= 3) {
    return fallback;
  }

  throw new Error("No safe pedido search term found.");
}

async function discoverSolicitudSearchQuery(page: Page) {
  await page.goto("/dashboard/solicitudes", { waitUntil: "load" });
  await waitForSolicitudes(page, false);

  const serviceText = await page
    .locator("tbody tr")
    .first()
    .locator("td")
    .nth(2)
    .locator("div")
    .first()
    .innerText()
    .catch(() => "");
  const normalizedService = serviceText.trim().replace(/\s+/g, " ");

  if (normalizedService.length >= 3 && !/@/.test(normalizedService)) {
    return normalizedService;
  }

  throw new Error("No safe solicitud search term found.");
}

function createFlowResult(
  flow: FlowConfig,
  startedAt: string,
  success: boolean,
  failures: string[],
): FlowResult {
  return {
    flow: flow.flow,
    routeTemplate: flow.routeTemplate,
    role: "admin",
    warmupCount,
    measuredLoadCount,
    success,
    failures,
    startedAt,
    finishedAt: new Date().toISOString(),
    queryValueStored: false,
  };
}

function writeFlowResult(result: FlowResult) {
  const dir = flowDir(result.flow);

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "flow.json"), `${JSON.stringify(result, null, 2)}\n`);
}

async function measureFlow(browser: Browser, flow: FlowConfig) {
  const dir = flowDir(flow.flow);
  const startedAt = new Date().toISOString();
  const failures: string[] = [];

  mkdirSync(dir, { recursive: true });

  try {
    for (let index = 0; index < warmupCount; index += 1) {
      await loadDocument(browser, flow.buildPath(), flow.waitForCanonicalContent);
    }

    runNodeScript([
      "scripts/performance/pg-stat-snapshot.mjs",
      "--label",
      `${flow.flow}-before`,
      "--output",
      join(dir, "before.json"),
    ]);

    for (let index = 0; index < measuredLoadCount; index += 1) {
      await loadDocument(browser, flow.buildPath(), flow.waitForCanonicalContent);
    }

    runNodeScript([
      "scripts/performance/pg-stat-snapshot.mjs",
      "--label",
      `${flow.flow}-after`,
      "--output",
      join(dir, "after.json"),
    ]);
    runNodeScript([
      "scripts/performance/pg-stat-diff.mjs",
      "--before",
      join(dir, "before.json"),
      "--after",
      join(dir, "after.json"),
      "--output",
      join(dir, "diff.json"),
    ]);

    writeFlowResult(createFlowResult(flow, startedAt, true, failures));
  } catch (caught) {
    failures.push(sanitizeError(caught));
    writeFlowResult(createFlowResult(flow, startedAt, false, failures));
    throw caught;
  }
}

test.beforeAll(async ({ browser }) => {
  mkdirSync(attributionDir, { recursive: true });

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();

  try {
    await loginAs(page, "admin");
    await context.storageState({ path: storageStatePath });
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }

  const discoveryContext = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    storageState: storageStatePath,
    viewport: { width: 1366, height: 768 },
  });
  const discoveryPage = await discoveryContext.newPage();

  try {
    pedidoSearchQuery = await discoverPedidoSearchQuery(discoveryPage);
    solicitudSearchQuery = await discoverSolicitudSearchQuery(discoveryPage);
  } finally {
    await discoveryPage.close().catch(() => undefined);
    await discoveryContext.close().catch(() => undefined);
  }
});

test.afterAll(() => {
  rmSync(storageStatePath, { force: true });
});

test("attributes SQL windows for dashboard and listings", async ({ browser }) => {
  expect(pedidoSearchQuery, "Missing safe pedido search term.").not.toBeNull();
  expect(solicitudSearchQuery, "Missing safe solicitud search term.").not.toBeNull();

  const flows: readonly FlowConfig[] = [
    {
      flow: "dashboard",
      routeTemplate: "/dashboard",
      buildPath: () => "/dashboard",
      waitForCanonicalContent: waitForDashboard,
    },
    {
      flow: "pedidos-default",
      routeTemplate: "/dashboard/pedidos",
      buildPath: () => "/dashboard/pedidos",
      waitForCanonicalContent: (page) => waitForPedidos(page, false),
    },
    {
      flow: "pedidos-search",
      routeTemplate: "/dashboard/pedidos?q=<redacted>",
      buildPath: () => `/dashboard/pedidos?q=${encodeURIComponent(pedidoSearchQuery ?? "")}`,
      waitForCanonicalContent: (page) => waitForPedidos(page, true),
    },
    {
      flow: "solicitudes-default",
      routeTemplate: "/dashboard/solicitudes",
      buildPath: () => "/dashboard/solicitudes",
      waitForCanonicalContent: (page) => waitForSolicitudes(page, false),
    },
    {
      flow: "solicitudes-search",
      routeTemplate: "/dashboard/solicitudes?q=<redacted>",
      buildPath: () =>
        `/dashboard/solicitudes?q=${encodeURIComponent(solicitudSearchQuery ?? "")}`,
      waitForCanonicalContent: (page) => waitForSolicitudes(page, true),
    },
  ];

  for (const flow of flows) {
    await measureFlow(browser, flow);
  }
});
