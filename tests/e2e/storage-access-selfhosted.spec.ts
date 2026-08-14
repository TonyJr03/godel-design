import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoStorageLeakTextIn } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId } from "./helpers/qa-data";
import { createQaSupabaseClient, signOutQaSupabaseClient } from "./helpers/supabase";

const runId = createQaRunId();
function createPdfBuffer(size = 128 * 1024) {
  return Buffer.concat([Buffer.from("%PDF-1.7\n% Godel access QA\n"), Buffer.alloc(size - 24)]);
}

async function getWorkerIdentity() {
  const supabase = await createQaSupabaseClient("worker");
  const { data: auth } = await supabase.auth.getUser();
  expect(auth.user).toBeTruthy();
  const { data: profile, error } = await supabase.from("perfiles")
    .select("full_name, role, is_active").eq("id", auth.user!.id).single();
  await signOutQaSupabaseClient(supabase);
  expect(error).toBeNull();
  expect(profile?.role).toBe("trabajador");
  expect(profile?.is_active).toBe(true);
  return { authUserId: auth.user!.id, fullName: profile!.full_name };
}

async function expectFunctionalSignedDownload(page: Page, downloadHref: string) {
  const firstHop = await page.context().request.get(downloadHref, { maxRedirects: 0 });
  expect(firstHop.status()).toBeGreaterThanOrEqual(300);
  expect(firstHop.status()).toBeLessThan(400);

  const location = firstHop.headers().location;
  expect(location).toBeTruthy();

  const signedLocation = new URL(location!, new URL(page.url()).origin);
  const browserOrigin = new URL(page.url()).origin;
  const isBrowserReachableOrigin = signedLocation.origin === browserOrigin;
  const isInternalOnlyHostname = signedLocation.hostname === "api-gw" || signedLocation.port === "8000";
  expect(signedLocation.pathname.startsWith("/storage/v1/")).toBe(true);
  expect(isBrowserReachableOrigin).toBe(true);
  expect(isInternalOnlyHostname).toBe(false);

  const signedResponse = await page.context().request.get(signedLocation.toString());
  const contentType = signedResponse.headers()["content-type"] ?? "";
  const body = await signedResponse.body();
  expect(signedResponse.ok()).toBe(true);
  expect(body.byteLength).toBeGreaterThan(0);
  expect(contentType).not.toMatch(/text\/html/i);
  expect(contentType).toMatch(/pdf/i);
  expect(body.subarray(0, 4).toString()).toBe("%PDF");
}

async function createPedido(page: Page, label: string) {
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });
  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByRole("textbox", { name: /descripci.n/i }).fill("Fixture determinista Storage access.");
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(getFutureDateInputValue(30));
  await dialog.locator('input[name="total_amount"]').fill("0");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(label);
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await page.getByRole("link").filter({ hasText: label }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
  await expect(page.getByText(/^en revisi.n$/i).first()).toBeVisible();
  await expect(page.getByText(/iniciando revisi.n/i)).toHaveCount(0);
  return page.url();
}

async function openFiles(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /^archivos/i }).click();
  const dialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function uploadCommittedPedidoFile(page: Page, name: string) {
  const dialog = await openFiles(page);
  await dialog.getByLabel(/^archivos$/i).setInputFiles({ name, mimeType: "application/pdf", buffer: createPdfBuffer() });
  const navigation = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame() && /\/dashboard\/pedidos\/[0-9a-f-]+$/i.test(frame.url()));
  await dialog.getByRole("button", { name: /^subir archivos$/i }).click();
  await navigation;
  const refreshed = await openFiles(page);
  const link = refreshed.getByRole("link", { name: /^descargar$/i });
  await expect(refreshed.getByText(name)).toBeVisible();
  await expect(link).toHaveCount(1);
  await expectNoStorageLeakTextIn(refreshed);
  return await link.getAttribute("href");
}

async function assignWorker(page: Page, name: string) {
  await page.getByRole("button", { name: /personal/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /^personal$/i });
  const combobox = dialog.getByRole("combobox", { name: /asignar personal/i });
  await combobox.fill(name);
  await dialog.getByRole("option", { name: new RegExp(name, "i") }).click();
  const navigation = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame() && /\/dashboard\/pedidos\/[0-9a-f-]+$/i.test(frame.url()));
  await dialog.getByRole("button", { name: /asignar personal/i }).click();
  await navigation;
}

test.describe.configure({ mode: "serial" });

test("self-hosted storage access: pedido committed list, download binding and worker revocation", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const titleA = `QA Storage Access Pedido A ${runId}`;
  const titleB = `QA Storage Access Pedido B ${runId}`;
  const fileName = `qa-storage-access-${runId}.pdf`;
  const qaWorker = await getWorkerIdentity();

  await loginAs(page, "admin");
  const pedidoAUrl = await createPedido(page, titleA);
  const downloadHref = await uploadCommittedPedidoFile(page, fileName);
  expect(downloadHref).toMatch(/^\/dashboard\/pedidos\/[0-9a-f-]+\/archivos\/[0-9a-f-]+\/download$/i);
  const [, pedidoAId, fileAId] = downloadHref!.match(/^\/dashboard\/pedidos\/([0-9a-f-]+)\/archivos\/([0-9a-f-]+)\/download$/i)!;
  const pedidoBUrl = await createPedido(page, titleB);
  const pedidoBId = pedidoBUrl.match(/\/dashboard\/pedidos\/([0-9a-f-]+)$/i)![1];
  const filesB = await openFiles(page);
  await expect(filesB.getByText(fileName)).toHaveCount(0);
  await expectNoStorageLeakTextIn(filesB);

  await page.goto(pedidoAUrl);
  await expectFunctionalSignedDownload(page, downloadHref!);
  const wrongOwner = await page.context().request.get(`/dashboard/pedidos/${pedidoBId}/archivos/${fileAId}/download`, { maxRedirects: 0 });
  expect(wrongOwner.status()).toBe(404);
  expect(wrongOwner.headers().location).toBeUndefined();

  await loginAs(page, "supervisor");
  await page.goto(pedidoAUrl);
  await expect((await openFiles(page)).getByText(fileName)).toBeVisible();
  await expectFunctionalSignedDownload(page, downloadHref!);

  await loginAs(page, "admin");
  await page.goto(pedidoAUrl);
  await assignWorker(page, qaWorker.fullName);
  const adminSupabase = await createQaSupabaseClient("admin");
  const { data: assignment, error: assignmentError } = await adminSupabase
    .from("pedido_trabajadores")
    .select("assigned_profile_id, pedido_id")
    .eq("pedido_id", pedidoAId)
    .eq("assigned_profile_id", qaWorker.authUserId)
    .maybeSingle();
  await signOutQaSupabaseClient(adminSupabase);
  expect(assignmentError).toBeNull();
  expect(assignment?.pedido_id).toBe(pedidoAId);
  expect(assignment?.assigned_profile_id).toBe(qaWorker.authUserId);
  await loginAs(page, "worker");
  await page.goto(pedidoAUrl);
  const workerFiles = await openFiles(page);
  await expect(workerFiles.getByText(fileName)).toBeVisible();
  await expectFunctionalSignedDownload(page, downloadHref!);

  const workerFileName = `qa-worker-storage-${runId}.pdf`;
  await workerFiles.getByLabel(/^archivos$/i).setInputFiles({ name: workerFileName, mimeType: "application/pdf", buffer: createPdfBuffer() });
  const workerNavigation = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame() && /\/dashboard\/pedidos\/[0-9a-f-]+$/i.test(frame.url()));
  await workerFiles.getByRole("button", { name: /^subir archivos$/i }).click();
  await workerNavigation;
  await expect((await openFiles(page)).getByText(workerFileName)).toBeVisible();

  await loginAs(page, "admin");
  await page.goto(pedidoAUrl);
  await page.getByRole("button", { name: /personal/i }).first().click();
  const personnel = page.getByRole("dialog", { name: /^personal$/i });
  const workerRow = personnel.locator("li").filter({ hasText: qaWorker.fullName }).first();
  const removal = page.waitForEvent("framenavigated", (frame) => frame === page.mainFrame() && /\/dashboard\/pedidos\/[0-9a-f-]+$/i.test(frame.url()));
  await workerRow.getByRole("button", { name: /^quitar$/i }).click();
  await removal;
  await loginAs(page, "worker");
  const revoked = await page.context().request.get(downloadHref!, { maxRedirects: 0 });
  expect(revoked.status()).toBeGreaterThanOrEqual(400);
  expect(revoked.headers().location).toBeUndefined();
  expect((await revoked.body()).subarray(0, 4).toString()).not.toBe("%PDF");

  const anonymous = await browser.newContext();
  const denied = await anonymous.request.get(`http://localhost:8080${downloadHref}`, { maxRedirects: 0 });
  expect(denied.status()).toBe(307);
  expect(denied.headers().location).toMatch(/^\/login(?:[?#]|$)/);
  await anonymous.close();
});
