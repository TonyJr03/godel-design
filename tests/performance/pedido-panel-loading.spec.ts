import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { performance as nodePerformance } from "node:perf_hooks";

import { expect, type Browser, type Locator, type Page, test } from "@playwright/test";

import { loginAs } from "../e2e/helpers/auth";

test.describe.configure({ mode: "serial" });

type PanelId = "estado" | "tareas" | "personal" | "archivos" | "comentarios" | "pagos";

type PanelConfig = {
  id: PanelId;
  label: string;
  dialogName: RegExp;
  triggerName: RegExp;
  canonicalContent: (dialog: Locator) => Locator;
};

type PanelSample = {
  panel: PanelId;
  sample: number;
  phase: "warmup" | "measured";
  startedAt: string;
  wallTimeMs: number;
  scriptTransferBytes: number;
  fetchTransferBytes: number;
  resourceCount: number;
  success: boolean;
  error: string | null;
};

const SAMPLE_COUNT = 5;
const perfDir = resolve(process.cwd(), ".next", "diagnostics", "performance");
const storageStatePath = join(perfDir, "pedido-panel-auth-state.json");
const outputPath = join(perfDir, "pedido-panel-results.json");
const samples: PanelSample[] = [];
const notMeasured: Array<{ panel?: PanelId; reason: string }> = [];

let discoveredPedidoPath: string | null = null;

const panels: readonly PanelConfig[] = [
  {
    id: "estado",
    label: "Estado",
    dialogName: /^estado$/i,
    triggerName: /^estado/i,
    canonicalContent: (dialog) => dialog.getByText(/estado actual/i),
  },
  {
    id: "tareas",
    label: "Tareas",
    dialogName: /^tareas$/i,
    triggerName: /^tareas/i,
    canonicalContent: (dialog) =>
      dialog.getByRole("heading", { name: /^tareas registradas$/i }),
  },
  {
    id: "personal",
    label: "Personal",
    dialogName: /^personal$/i,
    triggerName: /^personal/i,
    canonicalContent: (dialog) =>
      dialog.getByText(/no hay personal asignado|asignado el|no hay m.s usuarios disponibles|asignar personal/i),
  },
  {
    id: "archivos",
    label: "Archivos",
    dialogName: /^archivos$/i,
    triggerName: /^archivos/i,
    canonicalContent: (dialog) =>
      dialog.getByRole("heading", { name: /^archivos asociados$/i }),
  },
  {
    id: "comentarios",
    label: "Comentarios",
    dialogName: /^comentarios$/i,
    triggerName: /^comentarios/i,
    canonicalContent: (dialog) =>
      dialog.getByRole("heading", { name: /^conversaci.n interna$/i }),
  },
  {
    id: "pagos",
    label: "Pagos",
    dialogName: /^pagos$/i,
    triggerName: /^pagos/i,
    canonicalContent: (dialog) => dialog.getByText(/^total$/i),
  },
];

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
  return panels.map((panel) => {
    const group = samples.filter(
      (sample) => sample.panel === panel.id && sample.phase === "measured",
    );
    const successful = group.filter((sample) => sample.success);
    const wallTimes = successful.map((sample) => sample.wallTimeMs);
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
      panel: panel.id,
      label: panel.label,
      samples: group.length,
      successes: successful.length,
      failures,
      medianWallTimeMs,
      minWallTimeMs,
      maxWallTimeMs,
      relativeSpread,
      stability,
      medianScriptTransferBytes: median(
        successful.map((sample) => sample.scriptTransferBytes),
      ),
    };
  });
}

function sanitizeMeasurementError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);

  return message
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      "[uuid]",
    )
    .replace(/(password|contrase(?:ñ|n)a)[^,\n\r]*/gi, "$1=[redacted]")
    .slice(0, 1200);
}

async function collectResourceMetrics(page: Page, sinceStartTime: number) {
  return page.evaluate((since) => {
    const resourceEntries = window.performance
      .getEntriesByType("resource")
      .filter((entry) => entry.startTime >= since)
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;

        return {
          name: resource.name,
          initiatorType: resource.initiatorType,
          transferSize: resource.transferSize || 0,
        };
      });

    const totalBy = (predicate: (entry: (typeof resourceEntries)[number]) => boolean) =>
      resourceEntries
        .filter(predicate)
        .reduce((total, entry) => total + entry.transferSize, 0);

    return {
      scriptTransferBytes: totalBy((entry) => entry.initiatorType === "script"),
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

function emptyResourceMetrics(): Awaited<ReturnType<typeof collectResourceMetrics>> {
  return {
    scriptTransferBytes: 0,
    fetchTransferBytes: 0,
    resourceCount: 0,
  };
}

async function collectResourceMetricsSafely(page: Page, sinceStartTime: number) {
  try {
    return await collectResourceMetrics(page, sinceStartTime);
  } catch {
    return emptyResourceMetrics();
  }
}

async function findEncargoDetailPath(page: Page) {
  await page.goto("/dashboard/pedidos", { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: /^pedidos$/i })).toBeVisible({
    timeout: 20_000,
  });

  const candidateCount = await page
    .getByRole("link", { name: /abrir pedido/i })
    .count();
  const maxCandidates = Math.min(candidateCount, 10);

  for (let index = 0; index < maxCandidates; index += 1) {
    await page.goto("/dashboard/pedidos", { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: /^pedidos$/i })).toBeVisible({
      timeout: 20_000,
    });

    const candidate = page.getByRole("link", { name: /abrir pedido/i }).nth(index);
    await expect(candidate).toBeVisible({ timeout: 20_000 });
    await Promise.all([
      page.waitForURL(
        (url) =>
          url.pathname.startsWith("/dashboard/pedidos/") &&
          !url.pathname.includes("/archivos/"),
        { timeout: 20_000 },
      ),
      candidate.click(),
    ]);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
      timeout: 20_000,
    });

    if (await page.getByRole("button", { name: /^tareas/i }).isVisible().catch(() => false)) {
      return new URL(page.url()).pathname;
    }
  }

  return null;
}

async function waitForDetail(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({
    timeout: 20_000,
  });

  for (const panel of panels) {
    await expect(page.getByRole("button", { name: panel.triggerName }).first()).toBeVisible({
      timeout: 20_000,
    });
  }
}

function recordSample(
  panel: PanelConfig,
  sample: number,
  startedAt: string,
  wallTimeMs: number,
  metrics: Awaited<ReturnType<typeof collectResourceMetrics>>,
  success: boolean,
  error: string | null,
) {
  samples.push({
    panel: panel.id,
    sample,
    phase: sample === 0 ? "warmup" : "measured",
    startedAt,
    wallTimeMs: Math.round(wallTimeMs),
    scriptTransferBytes: metrics.scriptTransferBytes,
    fetchTransferBytes: metrics.fetchTransferBytes,
    resourceCount: metrics.resourceCount,
    success,
    error,
  });
}

async function measurePanel(
  browser: Browser,
  panel: PanelConfig,
  sample: number,
  includeSample: boolean,
) {
  if (!discoveredPedidoPath) {
    throw new Error("No encargo pedido detail path discovered.");
  }

  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    storageState: storageStatePath,
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  let startedAt = new Date().toISOString();
  let success = false;
  let error: string | null = null;
  let sinceStartTime = 0;
  let wallTimeMs = 0;
  let clickStarted = false;
  let clickStart = 0;
  let metrics: Awaited<ReturnType<typeof collectResourceMetrics>> =
    emptyResourceMetrics();

  try {
    await waitForDetail(page, discoveredPedidoPath);

    const trigger = page.getByRole("button", { name: panel.triggerName }).first();
    sinceStartTime = await page.evaluate(() => window.performance.now());
    startedAt = new Date().toISOString();
    clickStart = nodePerformance.now();
    clickStarted = true;
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: panel.dialogName });
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    await expect(panel.canonicalContent(dialog).first()).toBeVisible({
      timeout: 20_000,
    });
    wallTimeMs = nodePerformance.now() - clickStart;
    success = true;
  } catch (caught) {
    wallTimeMs = nodePerformance.now() - (clickStarted ? clickStart : 0);
    error = sanitizeMeasurementError(caught);
  } finally {
    metrics = await collectResourceMetricsSafely(page, sinceStartTime);

    if (includeSample || !success) {
      recordSample(panel, sample, startedAt, wallTimeMs, metrics, success, error);
    }

    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
  }

  if (!success) {
    throw new Error(
      `Pedido panel measurement failed: panel=${panel.id}; sample=${
        sample === 0 ? "warmup" : sample
      }; cause=${error ?? "unknown"}`,
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
    discoveredPedidoPath = await findEncargoDetailPath(discoveryPage);
  } finally {
    await discoveryPage.close().catch(() => undefined);
    await discoveryContext.close().catch(() => undefined);
  }

  if (!discoveredPedidoPath) {
    notMeasured.push({
      reason:
        "No existing encargo pedido with a visible Tareas workspace panel was found in /dashboard/pedidos.",
    });
  }
});

test.afterAll(() => {
  mkdirSync(perfDir, { recursive: true });
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
          pedidoPath: discoveredPedidoPath,
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

test("records pedido workspace panel first-open cost", async ({ browser }) => {
  expect(
    discoveredPedidoPath,
    notMeasured[0]?.reason ??
      "No encargo pedido detail path discovered for panel measurement.",
  ).not.toBeNull();

  for (const panel of panels) {
    await measurePanel(browser, panel, 0, false);

    for (let sample = 1; sample <= SAMPLE_COUNT; sample += 1) {
      await measurePanel(browser, panel, sample, true);
    }
  }
});
