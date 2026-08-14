import { expect, type Page, test } from "@playwright/test";

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

  await page.getByRole("button", { name: /^archivos/i }).click();
  const filesDialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(filesDialog).toBeVisible();
  await expect(filesDialog.getByLabel(/^archivos$/i)).toBeVisible();

  return filesDialog;
}

function trackBrowserTransfer(page: Page) {
  const tusRequests: Array<{
    method: string;
    url: string;
    hasAuthorization: boolean;
    contentLength: number;
  }> = [];
  const nextPostLengths: number[] = [];

  page.on("request", (request) => {
    const url = new URL(request.url());

    if (url.pathname.includes("/storage/v1/upload/resumable")) {
      tusRequests.push({
        method: request.method(),
        url: request.url(),
        hasAuthorization: Boolean(request.headers().authorization),
        contentLength: Number(request.headers()["content-length"] ?? 0),
      });
    }

    if (isNextActionPost(request)) {
      nextPostLengths.push(Number(request.headers()["content-length"] ?? 0));
    }
  });

  return { tusRequests, nextPostLengths };
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
  await filesDialog.getByRole("button", { name: /^subir archivos$/i }).click();

  await expect(filesDialog.getByText(fileName)).toBeVisible();
  await expect(filesDialog.getByText(/^completado/i)).toBeVisible({ timeout: 45_000 });
  await expect(filesDialog.getByRole("link", { name: /^descargar$/i })).toHaveCount(1);

  expect(traffic.tusRequests.some((request) => request.method === "POST")).toBe(true);
  expect(traffic.tusRequests.some((request) => request.method === "PATCH")).toBe(true);
  expect(traffic.tusRequests.some((request) => request.hasAuthorization)).toBe(true);
  expect(traffic.nextPostLengths.length).toBeGreaterThan(0);
  expect(Math.max(...traffic.nextPostLengths)).toBeLessThan(128 * 1024);
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
  await retryButton.click();

  await expect(filesDialog.getByText(/^completado/i)).toBeVisible({ timeout: 45_000 });
  await expect(filesDialog.getByText(/1 archivo subido correctamente/i)).toBeVisible();
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
  await filesDialog.getByRole("button", { name: /^subir archivos$/i }).click();

  for (const name of names) {
    await expect(filesDialog.getByText(name)).toBeVisible();
  }
  await expect(filesDialog.getByText(/^completado/i)).toHaveCount(3, { timeout: 45_000 });
  await expect(filesDialog.getByText(/3 archivos subidos correctamente/i)).toBeVisible();
  await expect(filesDialog.getByRole("link", { name: /^descargar$/i })).toHaveCount(3);
  expect(maximumConcurrentPatches).toBeLessThanOrEqual(2);
  expect(reservationActionPosts).toBeGreaterThanOrEqual(1);
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
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  const input = filesDialog.getByLabel(/^archivos$/i);

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
});

test("pedido cancelled removes operational upload controls", async ({ page }) => {
  const filesDialog = await createPedidoForDirectUpload(page, createQaRunId());
  await filesDialog.getByRole("button", { name: /cerrar/i }).click();

  await page.getByRole("button", { name: /^estado/i }).click();
  const statusDialog = page.getByRole("dialog", { name: /^estado$/i });
  await expect(statusDialog).toBeVisible();
  await statusDialog.getByRole("button", { name: /cancelar pedido/i }).click();
  await statusDialog.getByRole("button", { name: /sí, cancelar pedido/i }).click();
  await expect(statusDialog.getByText(/^cancelado$/i).first()).toBeVisible({ timeout: 15_000 });
  await statusDialog.getByRole("button", { name: /cerrar/i }).click();

  await page.getByRole("button", { name: /^archivos/i }).click();
  const cancelledFilesDialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(cancelledFilesDialog.getByLabel(/^archivos$/i)).toHaveCount(0);
  await expect(cancelledFilesDialog.getByText(/fue cancelado y no admite nuevas subidas/i)).toBeVisible();
});
