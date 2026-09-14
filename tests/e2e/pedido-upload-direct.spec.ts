import { expect, type Page, test } from "@playwright/test";

import { expectNoVisibleSensitiveText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
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

function createPdfBuffer(size: number) {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n% Godel QA\n"),
    Buffer.alloc(Math.max(0, size - 20)),
  ]);
}

async function createPedidoForDirectUpload(page: Page, suffix: string) {
  const title = `QA carga directa Pedido ${suffix}`;

  await loginAs(page, "admin");
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(
    "Pedido exclusivo para verificar la carga directa de archivos.",
  );
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(
    getFutureDateInputValue(30),
  );
  await dialog.locator('input[name="total_amount"]').fill("0");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const orderLink = page.getByRole("link").filter({ hasText: title }).first();
  await expect(orderLink).toBeVisible();
  await orderLink.click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[0-9a-f-]+$/i);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(/^en revisi.n$/i).first()).toBeVisible();
  await expect(page.getByText(/iniciando revisi.n/i)).toHaveCount(0);

  await page.getByRole("button", { name: /^archivos/i }).click();
  const filesDialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(filesDialog).toBeVisible();
  await expect(filesDialog.getByLabel(/^archivos$/i)).toBeVisible();

  return filesDialog;
}

function trackBrowserTransfer(page: Page) {
  const tusRequests: Array<{
    method: string;
    pathname: string;
    hasAuthorization: boolean;
  }> = [];

  page.on("request", (request) => {
    const url = new URL(request.url());

    if (url.pathname.includes("/storage/v1/upload/resumable")) {
      tusRequests.push({
        method: request.method(),
        pathname: url.pathname,
        hasAuthorization: Boolean(request.headers().authorization),
      });
    }
  });

  return { tusRequests };
}

function waitForPedidoDetailNavigation(page: Page) {
  return page.waitForEvent(
    "framenavigated",
    (frame) => frame === page.mainFrame()
      && /\/dashboard\/pedidos\/[0-9a-f-]+$/i.test(frame.url()),
  );
}

async function reopenFilesPanel(page: Page) {
  await page.getByRole("button", { name: /^archivos/i }).click();
  const filesDialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(filesDialog).toBeVisible();
  return filesDialog;
}

test.describe.configure({ mode: "serial" });

test("pedido uses the production component for authenticated direct TUS upload", async ({ page }) => {
  test.setTimeout(120_000);
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  const traffic = trackBrowserTransfer(page);
  const fileName = "qa-pedido-directo-7mb.pdf";

  await filesDialog.getByLabel(/^archivos$/i).setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: createPdfBuffer(7 * MEBIBYTE),
  });
  const detailNavigation = waitForPedidoDetailNavigation(page);
  await filesDialog.getByRole("button", { name: /^subir archivos$/i }).click();

  await detailNavigation;
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const refreshedFilesDialog = await reopenFilesPanel(page);
  await expect(refreshedFilesDialog.getByText(fileName)).toBeVisible();
  await expect(refreshedFilesDialog.getByRole("link", { name: /^descargar$/i })).toHaveCount(1);

  expect(traffic.tusRequests.some((request) => request.method === "POST")).toBe(true);
  expect(traffic.tusRequests.some((request) => request.method === "PATCH")).toBe(true);
  expect(traffic.tusRequests.every((request) => (
    request.pathname === "/storage/v1/upload/resumable"
    || request.pathname.startsWith("/storage/v1/upload/resumable/")
  ))).toBe(true);
  expect(traffic.tusRequests.some((request) => request.hasAuthorization)).toBe(true);
});

test("pedido resumes the same reserved item after an interrupted PATCH", async ({ page }) => {
  test.setTimeout(120_000);
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  const resumeOffset = String(6 * MEBIBYTE);
  let interceptedPatchCount = 0;
  let resumedHeadCount = 0;
  const resumedHeadUrls: string[] = [];
  const resumedPatchUrls: string[] = [];
  let allowRoutes = false;

  await page.route(TUS_ROUTE, async (route) => {
    const request = route.request();
    if (
      request.method() === "PATCH"
      && request.headers()["upload-offset"] === resumeOffset
      && !allowRoutes
    ) {
      interceptedPatchCount += 1;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });
  page.on("request", (request) => {
    if (
      request.method() === "HEAD"
      && new URL(request.url()).pathname.includes("/storage/v1/upload/resumable")
      && allowRoutes
    ) {
      resumedHeadCount += 1;
      resumedHeadUrls.push(request.url());
    }
    if (
      request.method() === "PATCH"
      && new URL(request.url()).pathname.includes("/storage/v1/upload/resumable")
      && allowRoutes
    ) {
      resumedPatchUrls.push(request.url());
    }
  });

  await filesDialog.getByLabel(/^archivos$/i).setInputFiles({
    name: "qa-pedido-resume-7mb.pdf",
    mimeType: "application/pdf",
    buffer: createPdfBuffer(7 * MEBIBYTE),
  });
  await filesDialog.getByRole("button", { name: /^subir archivos$/i }).click();

  const retryButton = filesDialog.getByRole("button", { name: /^reintentar$/i });
  await expect(retryButton).toBeVisible({ timeout: 45_000 });
  await expect(filesDialog.getByText(/1 archivo necesita reintento/i)).toBeVisible();
  expect(interceptedPatchCount).toBeGreaterThan(0);

  allowRoutes = true;
  await page.unroute(TUS_ROUTE);
  const detailNavigation = waitForPedidoDetailNavigation(page);
  await retryButton.click();

  await detailNavigation;
  const refreshedFilesDialog = await reopenFilesPanel(page);
  await expect(refreshedFilesDialog.getByRole("link", { name: /^descargar$/i })).toHaveCount(1);
  expect(resumedHeadCount).toBeGreaterThan(0);
  expect(resumedPatchUrls.some((url) => resumedHeadUrls.includes(url))).toBe(true);
});

test("pedido reserves one batch and transfers three files with a browser queue of two", async ({ page }) => {
  test.setTimeout(120_000);
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  const names = [
    "qa-pedido-multi-1.pdf",
    "qa-pedido-multi-2.pdf",
    "qa-pedido-multi-3.pdf",
  ];
  let activePatches = 0;
  let maximumConcurrentPatches = 0;
  let reservationActionPosts = 0;

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (isNextActionPost(request)) reservationActionPosts += 1;
    if (request.method() === "PATCH" && url.pathname.includes("/storage/v1/upload/resumable")) {
      activePatches += 1;
      maximumConcurrentPatches = Math.max(maximumConcurrentPatches, activePatches);
    }
  });
  page.on("requestfinished", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname.includes("/storage/v1/upload/resumable")) {
      activePatches = Math.max(0, activePatches - 1);
    }
  });
  page.on("requestfailed", (request) => {
    if (request.method() === "PATCH" && new URL(request.url()).pathname.includes("/storage/v1/upload/resumable")) {
      activePatches = Math.max(0, activePatches - 1);
    }
  });

  await filesDialog.getByLabel(/^archivos$/i).setInputFiles(
    names.map((name) => ({
      name,
      mimeType: "application/pdf",
      buffer: createPdfBuffer(128 * 1024),
    })),
  );
  const detailNavigation = waitForPedidoDetailNavigation(page);
  await filesDialog.getByRole("button", { name: /^subir archivos$/i }).click();

  await detailNavigation;
  const refreshedFilesDialog = await reopenFilesPanel(page);
  for (const name of names) {
    await expect(refreshedFilesDialog.getByText(name)).toBeVisible();
  }
  await expect(refreshedFilesDialog.getByRole("link", { name: /^descargar$/i })).toHaveCount(3);
  expect(maximumConcurrentPatches).toBeLessThanOrEqual(2);
  expect(reservationActionPosts).toBeGreaterThanOrEqual(1);
});

test("pedido keeps a partial batch retryable before canonical navigation", async ({ page }) => {
  test.setTimeout(120_000);
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  const names = ["qa-pedido-partial-a.pdf", "qa-pedido-partial-b.pdf"];
  let firstTusResource: string | null = null;
  let failedTusResource: string | null = null;
  let retrying = false;
  let retryHeadOnFailedResource = 0;
  let retryPatchOnFailedResource = 0;
  let controlPlanePosts = 0;
  let documentNavigations = 0;

  page.on("framenavigated", (frame) => {
    if (
      frame === page.mainFrame()
      && /\/dashboard\/pedidos\/[0-9a-f-]+$/i.test(frame.url())
    ) {
      documentNavigations += 1;
    }
  });
  page.on("request", (request) => {
    if (isNextActionPost(request)) controlPlanePosts += 1;

    if (!retrying || request.url() !== failedTusResource) return;
    if (request.method() === "HEAD") retryHeadOnFailedResource += 1;
    if (request.method() === "PATCH") retryPatchOnFailedResource += 1;
  });
  await page.route(TUS_ROUTE, async (route) => {
    const request = route.request();

    if (request.method() !== "PATCH") {
      await route.continue();
      return;
    }

    if (firstTusResource === null) {
      firstTusResource = request.url();
      await route.continue();
      return;
    }

    if (request.url() !== firstTusResource && failedTusResource === null) {
      failedTusResource = request.url();
    }

    if (request.url() === failedTusResource) {
      await route.abort("failed");
      return;
    }

    await route.continue();
  });

  await filesDialog.getByLabel(/^archivos$/i).setInputFiles(
    names.map((name) => ({
      name,
      mimeType: "application/pdf",
      buffer: createPdfBuffer(128 * 1024),
    })),
  );
  await filesDialog.getByRole("button", { name: /^subir archivos$/i }).click();

  await expect(filesDialog.getByText("Carga completada parcialmente", { exact: true }))
    .toBeVisible({ timeout: 45_000 });
  await expect(filesDialog).toBeVisible();
  await expect(filesDialog.getByText(/^completado.*100%$/i)).toHaveCount(1);
  await expect(filesDialog.getByText(/^requiere reintento.*0%$/i)).toHaveCount(1);
  const retryButton = filesDialog.getByRole("button", { name: /^reintentar$/i });
  await expect(retryButton).toHaveCount(1);
  expect(documentNavigations).toBe(0);
  expect(failedTusResource).not.toBeNull();

  const controlPlanePostsBeforeRetry = controlPlanePosts;
  retrying = true;
  await page.unroute(TUS_ROUTE);
  const detailNavigation = waitForPedidoDetailNavigation(page);
  await retryButton.click();

  await detailNavigation;
  expect(documentNavigations).toBe(1);
  expect(retryHeadOnFailedResource).toBeGreaterThan(0);
  expect(retryPatchOnFailedResource).toBeGreaterThan(0);
  expect(controlPlanePosts).toBe(controlPlanePostsBeforeRetry + 1);

  const refreshedFilesDialog = await reopenFilesPanel(page);
  for (const name of names) {
    await expect(refreshedFilesDialog.getByText(name)).toBeVisible();
  }
  await expect(refreshedFilesDialog.getByRole("link", { name: /^descargar$/i })).toHaveCount(2);
  await expectNoVisibleSensitiveText(page);
});

test("pedido handles a browser session invalidated after opening the files panel", async ({ page }) => {
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  const logoutPage = await page.context().newPage();

  await logoutPage.goto("/dashboard");
  await logoutPage.getByRole("button", { name: /cerrar sesi.n/i }).click();
  await expect(logoutPage).toHaveURL(/\/login/);
  await logoutPage.close();

  const traffic = trackBrowserTransfer(page);
  await filesDialog.getByLabel(/^archivos$/i).setInputFiles({
    name: "qa-pedido-session-expired.pdf",
    mimeType: "application/pdf",
    buffer: createPdfBuffer(128 * 1024),
  });
  const submitButton = filesDialog.getByRole("button", { name: /^subir archivos$/i });
  await submitButton.click();

  await expect(filesDialog.getByText("No se pudo iniciar la carga", { exact: true })).toBeVisible();
  await expect(submitButton).toBeEnabled();
  expect(traffic.tusRequests).toHaveLength(0);
});

test("pedido rejects client-side counts, sizes and extensions before reserving", async ({ page }) => {
  test.setTimeout(120_000);
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  const input = filesDialog.getByLabel(/^archivos$/i);
  let reserveControlPlanePosts = 0;

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "POST" && !url.pathname.startsWith("/storage/")) {
      reserveControlPlanePosts += 1;
    }
  });

  await input.setInputFiles(Array.from({ length: 11 }, (_, index) => ({
    name: `qa-max-${index}.pdf`,
    mimeType: "application/pdf",
    buffer: createPdfBuffer(128),
  })));
  await expect(filesDialog.getByText(/entre 1 y 10 archivos/i)).toBeVisible();

  await input.setInputFiles({
    name: "qa-too-large.pdf",
    mimeType: "application/pdf",
    buffer: createPdfBuffer(20 * MEBIBYTE + 1),
  });
  await expect(filesDialog.getByText(/máximo 20\.0 MB/i)).toBeVisible();

  await input.setInputFiles({
    name: "qa-blocked.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg></svg>"),
  });
  await expect(filesDialog.getByText(/PDF, imagen, documento, ZIP, RAR o CDR/i)).toBeVisible();
  expect(reserveControlPlanePosts).toBe(0);
});

test("pedido cancelled removes operational upload controls", async ({ page }) => {
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  await filesDialog.getByRole("button", { name: /cerrar/i }).click();

  await page.getByRole("button", { name: /^estado/i }).click();
  const statusDialog = page.getByRole("dialog", { name: /^estado$/i });
  await expect(statusDialog).toBeVisible();
  await statusDialog.getByRole("button", { name: /cancelar pedido/i }).click();
  const detailNavigation = waitForPedidoDetailNavigation(page);
  await statusDialog.getByRole("button", { name: /sí, cancelar pedido/i }).click();
  await detailNavigation;
  await expect(page.getByText(/^cancelado$/i).first()).toBeVisible();

  const cancelledFilesDialog = await reopenFilesPanel(page);
  await expect(cancelledFilesDialog.getByLabel(/^archivos$/i)).toHaveCount(0);
  await expect(cancelledFilesDialog.getByText(/fue cancelado y no admite nuevas subidas/i)).toBeVisible();
});
