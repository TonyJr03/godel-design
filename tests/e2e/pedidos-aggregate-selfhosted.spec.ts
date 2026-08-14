import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoTechnicalLeakText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";
import {
  createQaSupabaseClient,
  signOutQaSupabaseClient,
} from "./helpers/supabase";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const futureDate = getFutureDateInputValue(30);
const encargoTitle = `QA Pedido D5 Encargo ${runLabel}`;
const cancelTitle = `QA Pedido D5 Cancelar ${runLabel}`;
const impresionTitle = `QA Pedido D5 Impresion ${runLabel}`;
const taskTitle = `QA Tarea D5 Produccion ${runLabel}`;
const workerComment = `QA comentario D5 Worker ${runLabel}`;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function openPanel(page: Page, name: RegExp, trigger = name): Promise<Locator> {
  const openDialog = page.getByRole("dialog");

  if (await openDialog.isVisible().catch(() => false)) {
    const close = openDialog.getByRole("button", { name: /cerrar/i });

    if (await close.isVisible().catch(() => false)) {
      await close.click();
    }
  }

  await page.getByRole("button", { name: trigger }).filter({ visible: true }).first().click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createPedido(
  page: Page,
  workflow: "encargo" | "impresion",
  title: string,
) {
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: workflow === "encargo" ? /encargo/i : /impresi.n/i }).click();
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill("500");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);

  if (workflow === "encargo") {
    await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(`Encargo D5 ${runLabel}.`);
  } else {
    await dialog.getByLabel(/cantidad de copias/i).fill("8");
    await dialog.getByLabel(/modo de color/i).selectOption("color");
    await dialog.getByLabel(/tama.o de papel/i).selectOption("carta");
    await dialog.getByLabel(/caras/i).selectOption("una_cara");
  }

  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const link = page.getByRole("link").filter({ hasText: title }).first();

  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
  await expect(page.getByText(/^En revisi.n$/i).first()).toBeVisible({ timeout: 15_000 });
  return page.url();
}

async function transition(page: Page, buttonName: RegExp, expected: RegExp) {
  const panel = await openPanel(page, /^estado$/i, /^estado/i);
  const navigation = page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });

  await panel.getByRole("button", { name: buttonName }).click();
  await navigation;
  await expect(page.getByText(expected).first()).toBeVisible({ timeout: 15_000 });
}

async function getQaWorkerName() {
  const supabase = await createQaSupabaseClient("worker");

  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    expect(authError).toBeNull();
    expect(auth.user).not.toBeNull();
    const { data: profile, error: profileError } = await supabase
      .from("perfiles")
      .select("full_name, role, is_active")
      .eq("id", auth.user!.id)
      .maybeSingle();

    expect(profileError).toBeNull();
    expect(profile?.role).toBe("trabajador");
    expect(profile?.is_active).toBe(true);
    expect(profile?.full_name).toBeTruthy();
    return profile!.full_name;
  } finally {
    await signOutQaSupabaseClient(supabase);
  }
}

async function assignWorker(page: Page, workerName: string) {
  const panel = await openPanel(page, /^personal$/i, /personal/i);
  const combobox = panel.getByRole("combobox", { name: /asignar personal/i });

  await combobox.fill(workerName);
  await panel.getByRole("option", { name: new RegExp(escapeRegExp(workerName), "i") }).click();
  const navigation = page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });
  await panel.getByRole("button", { name: /asignar personal/i }).click();
  await navigation;
}

async function removeWorker(page: Page, workerName: string) {
  const panel = await openPanel(page, /^personal$/i, /personal/i);
  const row = panel.locator("li").filter({ hasText: workerName }).first();

  await expect(row).toBeVisible();
  const navigation = page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });
  await row.getByRole("button", { name: /^quitar$/i }).click();
  await navigation;
}

async function createTask(page: Page, detailUrl: string) {
  const panel = await openPanel(page, /^tareas$/i, /tareas/i);
  await panel.getByRole("textbox", { name: /nueva tarea/i }).fill(taskTitle);
  const navigation = page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });
  await panel.getByRole("button", { name: /crear tarea/i }).click();
  await navigation;
  await expect(page).toHaveURL(detailUrl);
}

async function completeTask(page: Page, detailUrl: string) {
  const panel = await openPanel(page, /^tareas$/i, /tareas/i);
  const task = panel.locator("li").filter({ hasText: taskTitle }).first();
  const navigation = page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });
  await task.getByRole("button", { name: new RegExp(`marcar como completada.*${escapeRegExp(taskTitle)}`, "i") }).click();
  await navigation;
  await expect(page).toHaveURL(detailUrl);
}

async function payInFull(page: Page, detailUrl: string) {
  const panel = await openPanel(page, /^pagos$/i, /pagos/i);
  await panel.getByLabel(/pagado en efectivo/i).fill("500");
  await panel.getByLabel(/pagado por transferencia/i).fill("0");
  const navigation = page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });
  await panel.getByRole("button", { name: /actualizar pago/i }).click();
  await navigation;
  await expect(page).toHaveURL(detailUrl);
  const refreshed = await openPanel(page, /^pagos$/i, /pagos/i);
  await expect(refreshed.getByText(/^Pagado$/i)).toBeVisible();
  await expect(refreshed.getByText(/^0(?:[.,]00)?$/i).first()).toBeVisible();
  await expect(refreshed.getByText(/pagado completamente el/i)).toBeVisible();
}

async function addComment(page: Page, detailUrl: string, content: string) {
  const panel = await openPanel(page, /^comentarios$/i, /comentarios/i);
  await panel.getByRole("textbox", { name: /comentario/i }).fill(content);
  const navigation = page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });
  await panel.getByRole("button", { name: /agregar comentario/i }).click();
  await navigation;
  await expect(page).toHaveURL(detailUrl);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test("self-hosted D.5: Encargo aggregate lifecycle, roles, listing and closed controls", async ({ page }, testInfo) => {
  test.setTimeout(300_000);

  const workerName = await getQaWorkerName();
  await loginAs(page, "admin");
  const detailUrl = await createPedido(page, "encargo", encargoTitle);

  let tasks = await openPanel(page, /^tareas$/i, /tareas/i);
  await expect(tasks.getByText(/no tiene tareas registradas/i)).toBeVisible();
  const payments = await openPanel(page, /^pagos$/i, /pagos/i);
  await expect(payments.getByText(/^Sin pagar$/i)).toBeVisible();
  let status = await openPanel(page, /^estado$/i, /^estado/i);
  await expect(status.getByRole("button", { name: /pasar a producci.n/i })).toBeDisabled();
  await expect(status.getByText(/agrega al menos una tarea/i)).toBeVisible();

  await assignWorker(page, workerName);
  await createTask(page, detailUrl);
  tasks = await openPanel(page, /^tareas$/i, /tareas/i);
  await expect(tasks.locator("li").filter({ hasText: taskTitle }).getByText(/^Pendiente$/i)).toBeVisible();
  await transition(page, /pasar a producci.n/i, /^En producci.n$/i);

  await loginAs(page, "supervisor");
  await page.goto(detailUrl);
  await expect((await openPanel(page, /^personal$/i, /personal/i)).getByRole("combobox", { name: /asignar personal/i })).toBeVisible();
  await expect((await openPanel(page, /^tareas$/i, /tareas/i)).getByRole("textbox", { name: /nueva tarea/i })).toBeVisible();
  await expect((await openPanel(page, /^pagos$/i, /pagos/i)).getByRole("button", { name: /actualizar pago/i })).toBeVisible();
  await expect((await openPanel(page, /^comentarios$/i, /comentarios/i)).getByRole("textbox", { name: /comentario/i })).toBeVisible();

  await loginAs(page, "worker");
  await page.goto(detailUrl);
  await expect(page.getByRole("heading", { level: 1, name: encargoTitle, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /editar pedido/i })).toHaveCount(0);
  await expect((await openPanel(page, /^personal$/i, /personal/i)).getByRole("combobox", { name: /asignar personal/i })).toHaveCount(0);
  await expect((await openPanel(page, /^pagos$/i, /pagos/i)).getByRole("button", { name: /actualizar pago/i })).toHaveCount(0);
  await expect((await openPanel(page, /^tareas$/i, /tareas/i)).getByRole("textbox", { name: /nueva tarea/i })).toBeVisible();
  await addComment(page, detailUrl, workerComment);
  await expect((await openPanel(page, /^comentarios$/i, /comentarios/i)).getByText(workerComment, { exact: true })).toBeVisible();

  await loginAs(page, "admin");
  await page.goto(detailUrl);
  await removeWorker(page, workerName);
  await loginAs(page, "worker");
  await page.goto(detailUrl);
  await expect(page.getByRole("heading", { name: /no encontramos este recurso interno/i })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: encargoTitle, exact: true })).toHaveCount(0);
  await expect(page.getByText(workerComment, { exact: true })).toHaveCount(0);
  await expectNoTechnicalLeakText(page);

  await loginAs(page, "admin");
  await page.goto(detailUrl);
  status = await openPanel(page, /^estado$/i, /^estado/i);
  await expect(status.getByRole("button", { name: /marcar como listo para entrega/i })).toBeDisabled();
  await expect(status.getByText(/completa todas las tareas/i)).toBeVisible();
  await page.setViewportSize({ width: 1366, height: 768 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("d5-encargo-active-desktop.png"), fullPage: true });

  await completeTask(page, detailUrl);
  tasks = await openPanel(page, /^tareas$/i, /tareas/i);
  await expect(tasks.locator("li").filter({ hasText: taskTitle }).getByText(/^Completada$/i)).toBeVisible();
  await transition(page, /marcar como listo para entrega/i, /^Listo para entrega$/i);
  status = await openPanel(page, /^estado$/i, /^estado/i);
  await expect(status.getByRole("button", { name: /marcar como entregado/i })).toBeDisabled();
  await expect(status.getByText(/completamente pagado/i)).toBeVisible();
  await payInFull(page, detailUrl);
  await transition(page, /marcar como entregado/i, /^Entregado$/i);
  status = await openPanel(page, /^estado$/i, /^estado/i);
  await expect(status.getByText(/no admite m.s cambios de estado/i)).toBeVisible();
  await expect(status.getByRole("button", { name: /avanzar|cancelar|volver a producci.n/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /editar pedido/i })).toHaveCount(0);
  tasks = await openPanel(page, /^tareas$/i, /tareas/i);
  await expect(tasks.getByRole("textbox", { name: /nueva tarea/i })).toHaveCount(0);
  const history = await openPanel(page, /^historial$/i, /historial/i);
  await expect(history.getByText(/estado cambiado de creado a en revisi.n/i)).toBeVisible();
  await expect(history.getByText(/estado cambiado de en revisi.n a en producci.n/i)).toBeVisible();
  await expect(history.getByText(/estado cambiado de listo para entrega a entregado/i)).toBeVisible();

  await page.goto(`/dashboard/pedidos?q=${encodeURIComponent(encargoTitle)}`);
  await expect(page.getByLabel(/buscar pedidos/i)).toHaveValue(encargoTitle);
  await expect(page.getByRole("link").filter({ hasText: encargoTitle }).first()).toBeVisible();
  await page.goto(`/dashboard/pedidos?q=${encodeURIComponent(encargoTitle)}&status=entregado`);
  await expect(page.getByRole("link").filter({ hasText: encargoTitle }).first()).toBeVisible();
  await page.goto("/dashboard/pedidos");
  await expect(page.getByLabel(/buscar pedidos/i)).toHaveValue("");
  await expectNoTechnicalLeakText(page);
});

test("self-hosted D.5: cancellation and Impresion lifecycle remain independent from tasks", async ({ page }, testInfo) => {
  test.setTimeout(180_000);

  await loginAs(page, "admin");
  const cancelUrl = await createPedido(page, "encargo", cancelTitle);
  let status = await openPanel(page, /^estado$/i, /^estado/i);
  await status.getByRole("button", { name: /cancelar pedido/i }).click();
  const cancelNavigation = page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });
  await status.getByRole("button", { name: /s.?, cancelar pedido/i }).click();
  await cancelNavigation;
  await expect(page).toHaveURL(cancelUrl);
  await expect(page.getByText(/^Cancelado$/i).first()).toBeVisible();
  status = await openPanel(page, /^estado$/i, /^estado/i);
  await expect(status.getByRole("button", { name: /avanzar|cancelar/i })).toHaveCount(0);

  const printUrl = await createPedido(page, "impresion", impresionTitle);
  await expect(page.getByRole("button", { name: /^tareas/i })).toHaveCount(0);
  await transition(page, /pasar a producci.n/i, /^En producci.n$/i);
  await transition(page, /marcar como listo para entrega/i, /^Listo para entrega$/i);
  status = await openPanel(page, /^estado$/i, /^estado/i);
  await expect(status.getByRole("button", { name: /marcar como entregado/i })).toBeDisabled();
  await expect(status.getByText(/completamente pagado/i)).toBeVisible();
  await payInFull(page, printUrl);
  await transition(page, /marcar como entregado/i, /^Entregado$/i);
  await expect(page.getByText(/^Entregado$/i).first()).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath("d5-impresion-closed-mobile.png"), fullPage: true });
  await expectNoTechnicalLeakText(page);
});
