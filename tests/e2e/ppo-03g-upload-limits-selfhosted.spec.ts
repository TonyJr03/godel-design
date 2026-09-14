import { mkdtemp, readFile, rm, stat, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, type Locator, type Page, type Request, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId } from "./helpers/qa-data";
import { createQaSupabaseClient, signOutQaSupabaseClient } from "./helpers/supabase";

const MEBIBYTE = 1024 * 1024;
const EXACT_FILE_SIZE_BYTES = 20 * MEBIBYTE;
const TUS_CHUNK_SIZE_BYTES = 6 * MEBIBYTE;
const APP_CONTROL_PLANE_MAX_BYTES = 128 * 1024;
const TUS_PATH = /^\/storage\/v1\/upload\/resumable(?:\/|$)/;
const FIXTURE_FILE_NAME = "ppo-03g-exact-20mib.pdf";

let fixtureDirectory = "";
let fixturePath = "";

type NetworkRecord = {
  method: string;
  pathname: string;
  contentLength: number;
  uploadOffset: number | null;
  completedUploadOffset: number | null;
  hasAuthorization: boolean;
  hasSignature: boolean;
};

function requireExternalRuntime() {
  test.skip(
    process.env.PLAYWRIGHT_EXTERNAL_SERVER !== "1",
    "PPO-03G runs only through the external production-like runtime.",
  );
}

function isNextActionPost(request: Request) {
  const url = new URL(request.url());

  return request.method() === "POST"
    && !url.pathname.startsWith("/storage/")
    && Object.hasOwn(request.headers(), "next-action");
}

function toNetworkRecord(request: Request): NetworkRecord {
  const url = new URL(request.url());
  const headers = request.headers();
  const postData = request.postDataBuffer();

  return {
    method: request.method(),
    pathname: url.pathname,
    contentLength: Number(headers["content-length"] ?? postData?.byteLength ?? 0),
    uploadOffset: headers["upload-offset"] === undefined
      ? null
      : Number(headers["upload-offset"]),
    completedUploadOffset: null,
    hasAuthorization: Boolean(headers.authorization),
    hasSignature: Boolean(headers["x-signature"]),
  };
}

function trackUploadTraffic(page: Page) {
  const nextActionPosts: NetworkRecord[] = [];
  const tusRequests: NetworkRecord[] = [];
  const trackedRequests = new Map<Request, NetworkRecord>();

  page.on("request", (request) => {
    const record = toNetworkRecord(request);

    if (isNextActionPost(request)) {
      nextActionPosts.push(record);
      trackedRequests.set(request, record);
    }
    if (TUS_PATH.test(record.pathname)) {
      tusRequests.push(record);
      trackedRequests.set(request, record);
    }
  });
  page.on("requestfinished", async (request) => {
    const record = trackedRequests.get(request);
    if (!record || record.contentLength > 0) return;

    const sizes = await request.sizes();
    record.contentLength = sizes.requestBodySize;
  });
  page.on("response", (response) => {
    const record = trackedRequests.get(response.request());
    const uploadOffset = response.headers()["upload-offset"];
    if (!record || uploadOffset === undefined) return;

    record.completedUploadOffset = Number(uploadOffset);
  });

  return { nextActionPosts, tusRequests };
}

function expectSmallControlPlane(nextActionPosts: NetworkRecord[]) {
  expect(nextActionPosts.length).toBeGreaterThan(0);
  expect(Math.max(...nextActionPosts.map((request) => request.contentLength)))
    .toBeLessThan(APP_CONTROL_PLANE_MAX_BYTES);
}

function expectTwentyMiBTusTransfer(
  tusRequests: NetworkRecord[],
  contract: "authenticated" | "signed",
) {
  const patches = tusRequests.filter((request) => request.method === "PATCH");

  expect(tusRequests.some((request) => request.method === "POST")).toBe(true);
  expect(patches.length).toBeGreaterThan(0);
  expect(tusRequests.every((request) => TUS_PATH.test(request.pathname))).toBe(true);
  expect(patches.map((request) => request.uploadOffset)).toEqual(expect.arrayContaining([
    0,
    TUS_CHUNK_SIZE_BYTES,
    2 * TUS_CHUNK_SIZE_BYTES,
    3 * TUS_CHUNK_SIZE_BYTES,
  ]));
  expect(patches.map((request) => request.completedUploadOffset)).toEqual(
    expect.arrayContaining([
      TUS_CHUNK_SIZE_BYTES,
      2 * TUS_CHUNK_SIZE_BYTES,
      3 * TUS_CHUNK_SIZE_BYTES,
      EXACT_FILE_SIZE_BYTES,
    ]),
  );

  if (contract === "authenticated") {
    expect(tusRequests.some((request) => request.hasAuthorization)).toBe(true);
    return;
  }

  expect(tusRequests.every((request) => request.hasSignature)).toBe(true);
  expect(tusRequests.every((request) => !request.hasAuthorization)).toBe(true);
}

async function createPedidoForUpload(page: Page, title: string): Promise<Locator> {
  await loginAs(page, "admin");
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(
    "Pedido determinista para el gate de límites de transporte.",
  );
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(
    getFutureDateInputValue(30),
  );
  await dialog.locator('input[name="total_amount"]').fill("0");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  await page.getByRole("link").filter({ hasText: title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByText(/^en revisi.n$/i).first()).toBeVisible();
  await expect(page.getByText(/iniciando revisi.n/i)).toHaveCount(0);
  await page.getByRole("button", { name: /^archivos/i }).click();

  const filesDialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(filesDialog).toBeVisible();
  return filesDialog;
}

async function expectRangeDownload(page: Page, downloadHref: string) {
  const firstHop = await page.context().request.get(downloadHref, { maxRedirects: 0 });
  expect(firstHop.status()).toBeGreaterThanOrEqual(300);
  expect(firstHop.status()).toBeLessThan(400);

  const location = firstHop.headers().location;
  expect(location).toBeTruthy();
  const signedLocation = new URL(location!, new URL(page.url()).origin);
  expect(signedLocation.origin).toBe(new URL(page.url()).origin);
  expect(signedLocation.pathname.startsWith("/storage/v1/")).toBe(true);

  const response = await page.context().request.get(signedLocation.toString(), {
    headers: { range: "bytes=0-3" },
  });
  const bytes = await response.body();
  expect([200, 206]).toContain(response.status());
  expect(response.headers()["content-type"] ?? "").toMatch(/pdf/i);
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
}

async function setPublicAvailability(page: Page, serviceName: string) {
  await page.goto(`/dashboard/configuracion/servicios?q=${encodeURIComponent(serviceName)}`);
  const row = page.locator("tr").filter({ hasText: serviceName }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /editar servicio/i }).click();

  const dialog = page.getByRole("dialog", { name: /editar servicio/i });
  await dialog.getByRole("combobox", { name: /disponibilidad p.blica/i }).selectOption("true");
  await dialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function findSolicitudId(publicReference: string, clientName: string) {
  const supabase = await createQaSupabaseClient("admin");
  const { data, error } = await supabase
    .from("solicitudes")
    .select("id")
    .eq("public_reference", publicReference)
    .eq("client_name", clientName)
    .single();
  await signOutQaSupabaseClient(supabase);

  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  return data!.id;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  fixtureDirectory = await mkdtemp(join(tmpdir(), "godel-ppo-03g-"));
  fixturePath = join(fixtureDirectory, FIXTURE_FILE_NAME);
  await writeFile(fixturePath, "%PDF-1.7\n% Godel PPO-03G QA\n");
  await truncate(fixturePath, EXACT_FILE_SIZE_BYTES);
  expect((await stat(fixturePath)).size).toBe(EXACT_FILE_SIZE_BYTES);
});

test.afterAll(async () => {
  if (fixtureDirectory) await rm(fixtureDirectory, { recursive: true, force: true });
});

test("PPO-03G static transport configuration removes the 110 MB exception", async () => {
  const [nextConfig, nginxConfig] = await Promise.all([
    readFile(resolve("next.config.ts"), "utf8"),
    readFile(resolve("docker/nginx/conf.d/default.conf"), "utf8"),
  ]);

  expect(nextConfig).not.toMatch(/110mb/i);
  expect(nextConfig).not.toMatch(/proxyClientMaxBodySize|bodySizeLimit/);
  expect(nginxConfig).not.toMatch(/client_max_body_size\s+110m/i);
  expect(nginxConfig).toMatch(/server[\s\S]*?client_max_body_size\s+1m;/i);
  expect(nginxConfig).toMatch(/location\s+\^~\s+\/storage\/v1\/[\s\S]*?client_max_body_size\s+8m;/i);
});

test("PPO-03G Pedido uploads exactly 20 MiB through authenticated TUS", async ({ page }) => {
  requireExternalRuntime();
  test.setTimeout(600_000);

  const traffic = trackUploadTraffic(page);
  const runId = createQaRunId();
  const fileName = FIXTURE_FILE_NAME;
  const filesDialog = await createPedidoForUpload(page, `QA PPO-03G Pedido ${runId}`);

  await filesDialog.getByLabel(/^archivos$/i).setInputFiles(fixturePath);
  const navigation = page.waitForEvent(
    "framenavigated",
    (frame) => frame === page.mainFrame() && /\/dashboard\/pedidos\/[0-9a-f-]+$/i.test(frame.url()),
  );
  await filesDialog.getByRole("button", { name: /^subir archivos$/i }).click();
  await navigation;

  await page.getByRole("button", { name: /^archivos/i }).click();
  const refreshedDialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(refreshedDialog.getByText(fileName)).toBeVisible();
  const downloadHref = await refreshedDialog.getByRole("link", { name: /^descargar$/i }).getAttribute("href");
  expect(downloadHref).toBeTruthy();

  expectSmallControlPlane(traffic.nextActionPosts);
  expectTwentyMiBTusTransfer(traffic.tusRequests, "authenticated");
  await expectRangeDownload(page, downloadHref!);
});

test("PPO-03G Solicitud uploads exactly 20 MiB through signed TUS", async ({ page }) => {
  requireExternalRuntime();
  test.setTimeout(600_000);

  await loginAs(page, "admin");
  await setPublicAvailability(page, "Otro");
  await page.context().clearCookies();

  const traffic = trackUploadTraffic(page);
  const runId = createQaRunId();
  const clientName = `QA PPO-03G Solicitud ${runId}`;
  const fileName = FIXTURE_FILE_NAME;
  await page.goto("/solicitud");
  await page.locator('select[name="service_id"]').first().selectOption({ label: "Otro" });
  await page.getByLabel(/nombre del cliente/i).fill(clientName);
  await page.getByLabel(/tel.fono/i).fill(`555${runId.slice(-6)}`);
  await page.getByLabel(/correo electr.nico/i).fill(`ppo03g-${runId}@example.com`);
  await page.getByLabel(/descripci.n del trabajo/i).fill("Gate de transporte público de 20 MiB.");
  await page.getByLabel(/observaciones adicionales/i).fill("PPO-03G.");
  await page.getByLabel(/seleccionar archivos/i).setInputFiles(fixturePath);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(page.getByText(/^recibido/i)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/archivos recibidos:\s*1/i)).toBeVisible();
  const publicReference = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(publicReference).toBeTruthy();

  expectSmallControlPlane(traffic.nextActionPosts);
  expectTwentyMiBTusTransfer(traffic.tusRequests, "signed");

  const solicitudId = await findSolicitudId(publicReference, clientName);
  await loginAs(page, "admin");
  await page.goto(`/dashboard/solicitudes/${solicitudId}`);
  await page.getByRole("button", { name: /archivos/i }).first().click();
  const filesDialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(filesDialog.getByText(fileName)).toBeVisible();
  const downloadHref = await filesDialog.getByRole("link", { name: /^descargar$/i }).getAttribute("href");
  expect(downloadHref).toBeTruthy();
  await expectRangeDownload(page, downloadHref!);
});

test("PPO-03G keeps the app body boundary below the Storage chunk boundary", async ({ page }) => {
  requireExternalRuntime();
  const response = await page.context().request.post("/login", {
    data: Buffer.alloc(2 * MEBIBYTE, "x"),
  });

  expect(response.status()).toBe(413);
});
