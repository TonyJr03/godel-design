import { expect, type Page, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { createQaRunId } from "./helpers/qa-data";

const MEBIBYTE = 1024 * 1024;
const TUS_ROUTE = /\/storage\/v1\/upload\/resumable(?:\/|$)/;

function isNextActionPost(request: import("@playwright/test").Request) {
  const url = new URL(request.url());
  const headers = request.headers();

  return request.method() === "POST"
    && !url.pathname.startsWith("/storage/")
    && Object.hasOwn(headers, "next-action");
}

type NetworkRecord = {
  method: string;
  origin: string;
  pathname: string;
  contentLength: number;
  hasSignature: boolean;
  hasAuthorization: boolean;
  uploadOffset: number | null;
};

function createPdfBuffer(size: number) {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n% Godel public upload QA\n"),
    Buffer.alloc(Math.max(0, size - 34)),
  ]);
}

function getEncargoServiceSelect(page: Page) {
  return page.locator('select[name="service_id"]').first();
}

async function setPublicAvailability(page: Page, serviceName: string) {
  await page.goto(`/dashboard/configuracion/servicios?q=${encodeURIComponent(serviceName)}`);
  await expect(page.getByRole("heading", { name: /^servicios$/i })).toBeVisible();

  const row = page.locator("tr").filter({ hasText: serviceName }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /editar servicio/i }).click();

  const dialog = page.getByRole("dialog", { name: /editar servicio/i });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("combobox", { name: /disponibilidad p.blica/i })
    .selectOption("true");
  await dialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
}

async function preparePublicCatalog(page: Page) {
  await loginAs(page, "admin");
  await setPublicAvailability(page, "Otro");
  await setPublicAvailability(page, "Impresión");
}

async function openPublicSolicitud(page: Page, workflow: "encargo" | "impresion") {
  await page.goto("/solicitud");
  await expect(page.getByRole("heading", { name: /qu. necesitas preparar/i })).toBeVisible();

  if (workflow === "impresion") {
    await page.getByRole("tab", { name: /impresi.n/i }).click();
  } else {
    await getEncargoServiceSelect(page).selectOption({ label: "Otro" });
  }

  const runId = createQaRunId();
  await page.getByLabel(/nombre del cliente/i).fill(`Cliente carga pública ${runId}`);
  await page.getByLabel(/tel.fono/i).fill(`555${runId.slice(-6)}`);
  await page.getByLabel(/correo electr.nico/i).fill(`public-${runId}@example.com`);

  if (workflow === "impresion") {
    await page.getByLabel(/cantidad de copias/i).fill("3");
    await page.getByLabel(/modo de color/i).selectOption("color");
    await page.getByLabel(/tama.o de papel/i).selectOption("carta");
    await page.getByLabel(/caras/i).selectOption("una_cara");
    await page.getByLabel(/^observaciones/i).fill("Transferencia TUS pública de QA.");
  } else {
    await page
      .getByLabel(/descripci.n del trabajo/i)
      .fill("Solicitud pública de QA para carga directa.");
    await page.getByLabel(/observaciones adicionales/i).fill("Sin urgencia.");
  }
}

function toNetworkRecord(request: import("@playwright/test").Request): NetworkRecord {
  const url = new URL(request.url());
  const headers = request.headers();
  const postData = request.postDataBuffer();

  return {
    method: request.method(),
    origin: url.origin,
    pathname: url.pathname,
    contentLength: Number(headers["content-length"] ?? postData?.byteLength ?? 0),
    hasSignature: Boolean(headers["x-signature"]),
    hasAuthorization: Boolean(headers.authorization),
    uploadOffset: headers["upload-offset"] === undefined
      ? null
      : Number(headers["upload-offset"]),
  };
}

function trackTransfer(page: Page) {
  const tusRequests: NetworkRecord[] = [];
  const nextPostLengths: number[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("/storage/v1/upload/resumable")) {
      tusRequests.push(toNetworkRecord(request));
    }
    if (isNextActionPost(request)) {
      nextPostLengths.push(Number(request.headers()["content-length"] ?? request.postDataBuffer()?.byteLength ?? 0));
    }
  });

  return { tusRequests, nextPostLengths };
}

async function submitSelectedFiles(page: Page) {
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(page.getByRole("heading", { name: /estado de archivos/i })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  try {
    await preparePublicCatalog(page);
  } finally {
    await page.context().close();
  }
});

test.beforeEach(async ({ page }) => {
  await page.context().clearCookies();
});

test("public impresión transfers a 7 MiB file directly to signed TUS Storage", async ({ page }) => {
  test.setTimeout(120_000);
  const traffic = trackTransfer(page);

  await openPublicSolicitud(page, "impresion");
  await page.getByLabel(/seleccionar documento/i).setInputFiles({
    name: "qa-public-direct-7mb.pdf",
    mimeType: "application/pdf",
    buffer: createPdfBuffer(7 * MEBIBYTE),
  });
  await submitSelectedFiles(page);

  await expect(page.getByText(/^recibido/i)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/archivos recibidos:\s*1/i)).toBeVisible();

  expect(traffic.tusRequests.some((request) => request.method === "POST")).toBe(true);
  expect(traffic.tusRequests.some((request) => request.method === "PATCH")).toBe(true);
  expect(traffic.tusRequests.every((request) => request.pathname === "/storage/v1/upload/resumable/sign" || request.pathname.startsWith("/storage/v1/upload/resumable/sign/"))).toBe(true);
  expect(traffic.tusRequests.every((request) => request.hasSignature)).toBe(true);
  expect(traffic.tusRequests.every((request) => !request.hasAuthorization)).toBe(true);
  expect(traffic.nextPostLengths.length).toBeGreaterThan(0);
  expect(Math.max(...traffic.nextPostLengths)).toBeLessThan(128 * 1024);
  expect(traffic.tusRequests.filter((request) => request.method === "PATCH").map((request) => request.uploadOffset)).toEqual(expect.arrayContaining([0, 6 * MEBIBYTE]));
});

test("public retry resumes the same TUS resource without a second reservation", async ({ page }) => {
  test.setTimeout(120_000);
  const resumeOffset = String(6 * MEBIBYTE);
  let blockPatch = true;
  let interceptedPatchCount = 0;
  let initialResource: string | null = null;
  let resumedHeadMatchesResource = false;
  let resumedPatchMatchesResource = false;
  let firstTusSeen = false;
  let startActionPosts = 0;
  let retrying = false;
  let retryTusSeen = false;
  let retryPreTusControlActionPosts = 0;

  await page.route(TUS_ROUTE, async (route) => {
    const request = route.request();
    if (request.method() === "PATCH" && request.headers()["upload-offset"] === resumeOffset && blockPatch) {
      interceptedPatchCount += 1;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("/storage/v1/upload/resumable")) {
      if (retrying) retryTusSeen = true;
      if (request.method() === "PATCH" && !initialResource) initialResource = request.url();
      if (retrying && request.method() === "HEAD" && request.url() === initialResource) resumedHeadMatchesResource = true;
      if (retrying && request.method() === "PATCH" && request.url() === initialResource) resumedPatchMatchesResource = true;
      firstTusSeen = true;
    }
    if (isNextActionPost(request)) {
      if (!firstTusSeen) {
        startActionPosts += 1;
      } else if (retrying && !retryTusSeen) {
        retryPreTusControlActionPosts += 1;
      }
    }
  });

  await openPublicSolicitud(page, "encargo");
  await page.getByLabel(/seleccionar archivos/i).setInputFiles({
    name: "qa-public-resume-7mb.pdf",
    mimeType: "application/pdf",
    buffer: createPdfBuffer(7 * MEBIBYTE),
  });
  await submitSelectedFiles(page);

  const retryButton = page.getByRole("button", { name: /^reintentar$/i });
  await expect(retryButton).toBeVisible({ timeout: 45_000 });
  expect(interceptedPatchCount).toBeGreaterThan(0);
  expect(startActionPosts).toBe(2);

  blockPatch = false;
  retrying = true;
  await page.unroute(TUS_ROUTE);
  await retryButton.click();

  await expect(page.getByText(/^recibido/i)).toBeVisible({ timeout: 45_000 });
  expect(resumedHeadMatchesResource).toBe(true);
  expect(resumedPatchMatchesResource).toBe(true);
  expect(retryPreTusControlActionPosts).toBe(1);

  const persistedKeys = await page.evaluate(() => [
    ...Object.keys(localStorage),
    ...Object.keys(sessionStorage),
  ]);
  expect(persistedKeys.some((key) => /tus|godel-v1|cargas\/v1/i.test(key))).toBe(false);
});

test("public encargo reserves one batch, completes three files, and caps PATCH concurrency at two", async ({ page }) => {
  test.setTimeout(120_000);
  let firstTusSeen = false;
  let startActionPosts = 0;
  let activePatches = 0;
  let maximumConcurrentPatches = 0;
  const resources = new Set<string>();

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!firstTusSeen && isNextActionPost(request)) {
      startActionPosts += 1;
    }
    if (!url.pathname.includes("/storage/v1/upload/resumable")) return;
    firstTusSeen = true;
    if (request.method() === "PATCH") {
      resources.add(request.url());
      activePatches += 1;
      maximumConcurrentPatches = Math.max(maximumConcurrentPatches, activePatches);
    }
  });
  for (const event of ["requestfinished", "requestfailed"] as const) {
    page.on(event, (request) => {
      if (request.method() === "PATCH" && new URL(request.url()).pathname.includes("/storage/v1/upload/resumable")) {
        activePatches = Math.max(0, activePatches - 1);
      }
    });
  }

  await openPublicSolicitud(page, "encargo");
  const names = ["qa-public-batch-1.pdf", "qa-public-batch-2.pdf", "qa-public-batch-3.pdf"];
  await page.getByLabel(/seleccionar archivos/i).setInputFiles(names.map((name) => ({
    name,
    mimeType: "application/pdf",
    buffer: createPdfBuffer(128 * 1024),
  })));
  await submitSelectedFiles(page);

  await expect(page.getByText(/^recibido/i)).toHaveCount(3, { timeout: 45_000 });
  await expect(page.getByText(/archivos recibidos:\s*3/i)).toBeVisible();
  expect(startActionPosts).toBe(3);
  expect(resources.size).toBe(3);
  expect(maximumConcurrentPatches).toBeLessThanOrEqual(2);
});

test("public finalize retry does not repeat signed TUS transfer", async ({ page }) => {
  test.setTimeout(120_000);
  let tusCompleted = false;
  let finalizeBlocked = false;
  let blockFinalize = true;
  let tusRequestCount = 0;

  page.on("requestfinished", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname.includes("/storage/v1/upload/resumable")) {
      tusCompleted = true;
    }
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.includes("/storage/v1/upload/resumable")) tusRequestCount += 1;
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (blockFinalize && tusCompleted && !finalizeBlocked && isNextActionPost(request)) {
      finalizeBlocked = true;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  await openPublicSolicitud(page, "encargo");
  await page.getByLabel(/seleccionar archivos/i).setInputFiles({
    name: "qa-public-finalize-retry.pdf",
    mimeType: "application/pdf",
    buffer: createPdfBuffer(128 * 1024),
  });
  await submitSelectedFiles(page);

  const retryButton = page.getByRole("button", { name: /^reintentar$/i });
  await expect(retryButton).toBeVisible({ timeout: 45_000 });
  expect(finalizeBlocked).toBe(true);
  const tusRequestCountBeforeRetry = tusRequestCount;

  blockFinalize = false;
  await retryButton.click();
  await expect(page.getByText(/^recibido/i)).toBeVisible({ timeout: 45_000 });
  expect(tusRequestCount).toBe(tusRequestCountBeforeRetry);
});

test("public browser limits reject eleven files, an oversized file, and SVG before reservation", async ({ page }) => {
  await openPublicSolicitud(page, "encargo");
  const input = page.getByLabel(/seleccionar archivos/i);

  await input.setInputFiles(Array.from({ length: 11 }, (_, index) => ({
    name: `qa-public-limit-${index}.pdf`,
    mimeType: "application/pdf",
    buffer: createPdfBuffer(128),
  })));
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(page.locator("#files-error")).toContainText(/hasta 10 archivos/i);

  await input.setInputFiles({
    name: "qa-public-too-large.pdf",
    mimeType: "application/pdf",
    buffer: createPdfBuffer(20 * MEBIBYTE + 1),
  });
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(page.locator("#files-error")).toContainText(/m.ximo 20.0 MB/i);

  await input.setInputFiles({
    name: "qa-public-blocked.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg></svg>"),
  });
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(page.locator("#files-error")).toContainText(/PDF, imagen, documento, ZIP, RAR o CDR/i);
});
