import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectNoTechnicalLeakText,
  expectNoTechnicalLeakTextIn,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const futureDate = getFutureDateInputValue(30);

function pedidoTitle(label: string) {
  return `QA Pedido D1 ${label} ${runLabel}`;
}

async function createManualPedido(
  page: Page,
  workflow: "encargo" | "impresion",
  label: string,
) {
  const title = pedidoTitle(label);

  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });
  await expect(dialog).toBeVisible();

  if (workflow === "impresion") {
    await dialog.getByRole("tab", { name: /impresi.n/i }).click();
    await dialog.getByLabel(/cantidad de copias/i).fill("8");
    await dialog.getByLabel(/modo de color/i).selectOption("color");
    await dialog.getByLabel(/tama.o de papel/i).selectOption("carta");
    await dialog.getByLabel(/caras/i).selectOption("una_cara");
    await dialog.getByLabel(/observaciones/i).fill(`Impresión QA ${label}.`);
  } else {
    await dialog.getByRole("tab", { name: /encargo/i }).click();
    await dialog
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Encargo QA ${label}.`);
  }

  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill("500");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const pedidoLink = page.getByRole("link").filter({ hasText: title }).first();
  await expect(pedidoLink).toBeVisible({ timeout: 15_000 });
  await pedidoLink.click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();

  return title;
}

async function expectAutoReviewComplete(page: Page) {
  await expect(page.getByText(/^En revisi.n$/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/iniciando revisi.n/i)).toHaveCount(0);
  await expectNoTechnicalLeakText(page);
}

async function openPedidoPanel(page: Page, name: RegExp): Promise<Locator> {
  await page.getByRole("button", { name }).first().click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("self-hosted D.1: pedido edit keeps validation and fresh current-route data", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");
  const initialTitle = await createManualPedido(page, "encargo", "edit");
  await expectAutoReviewComplete(page);

  await page.getByRole("button", { name: /editar pedido/i }).click();
  let dialog = page.getByRole("dialog", { name: /^editar pedido$/i });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel(/t.tulo/i).fill("   ");
  await dialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(
    dialog.getByText(/el t.tulo del pedido es obligatorio/i),
  ).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("form")).toHaveAttribute("aria-busy", "false");
  await expect(
    page.getByRole("heading", { level: 1, name: initialTitle, exact: true }),
  ).toBeVisible();

  for (let iteration = 1; iteration <= 3; iteration += 1) {
    const title = `${initialTitle} actualizado ${iteration}`;

    await dialog.getByLabel(/t.tulo/i).fill(title);
    await dialog
      .getByLabel(/descripci.n/i)
      .fill(`Descripción D.1 ${iteration} ${runLabel}`);
    await dialog.getByLabel(/prioridad/i).selectOption("alta");
    await dialog
      .locator('input[name="estimated_delivery_date"]')
      .fill(getFutureDateInputValue(35 + iteration));
    await dialog.locator('input[name="total_amount"]').fill(`${500 + iteration}`);
    await dialog.getByRole("button", { name: /guardar cambios/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(
      page.getByRole("heading", { level: 1, name: title, exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expectNoTechnicalLeakText(page);

    if (iteration < 3) {
      await page.getByRole("button", { name: /editar pedido/i }).click();
      dialog = page.getByRole("dialog", { name: /^editar pedido$/i });
      await expect(dialog).toBeVisible();
    }
  }

  const historyDialog = await openPedidoPanel(page, /historial/i);
  await expect(historyDialog.getByText(/^Pedido actualizado$/i)).toHaveCount(3);
  await expectNoTechnicalLeakTextIn(historyDialog);
});

test("self-hosted D.1: pedido auto-review completes independently", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");

  for (let iteration = 1; iteration <= 3; iteration += 1) {
    await createManualPedido(page, "encargo", `auto-review ${iteration}`);
    await expectAutoReviewComplete(page);

    const historyDialog = await openPedidoPanel(page, /historial/i);
    await expect(
      historyDialog.getByText(/estado cambiado de creado a en revisi.n/i),
    ).toHaveCount(1);
    await historyDialog.getByRole("button", { name: /cerrar/i }).click();
  }
});

test("self-hosted D.1: pedido status advances and cancellation preserves focus", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");
  await createManualPedido(page, "impresion", "status advance");
  await expectAutoReviewComplete(page);

  let statusDialog = await openPedidoPanel(page, /^estado/i);
  await statusDialog.getByRole("button", { name: /pasar a producci.n/i }).click();
  await expect(statusDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/^En producci.n$/i).first()).toBeVisible({
    timeout: 15_000,
  });
  let historyDialog = await openPedidoPanel(page, /historial/i);
  await expect(
    historyDialog.getByText(/estado cambiado de en revisi.n a en producci.n/i),
  ).toHaveCount(1);
  await historyDialog.getByRole("button", { name: /cerrar/i }).click();

  await createManualPedido(page, "impresion", "status cancel");
  await expectAutoReviewComplete(page);
  statusDialog = await openPedidoPanel(page, /^estado/i);
  const cancelTrigger = statusDialog.getByRole("button", {
    name: /cancelar pedido/i,
  });
  await cancelTrigger.click();
  const cancelButton = statusDialog.getByRole("button", { name: /^cancelar$/i });
  await expect(cancelButton).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(cancelTrigger).toBeFocused();

  await cancelTrigger.click();
  await statusDialog
    .getByRole("button", { name: /s., cancelar pedido/i })
    .click();
  await expect(statusDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/^Cancelado$/i).first()).toBeVisible({
    timeout: 15_000,
  });
  statusDialog = await openPedidoPanel(page, /^estado/i);
  await expect(
    statusDialog.getByText(/no admite m.s cambios de estado/i),
  ).toBeVisible();
  await expect(
    statusDialog.getByRole("button", { name: /pasar a producci.n|avanzar/i }),
  ).toHaveCount(0);
  await statusDialog.getByRole("button", { name: /cerrar/i }).click();
  historyDialog = await openPedidoPanel(page, /historial/i);
  await expect(
    historyDialog.getByText(/estado cambiado de en revisi.n a cancelado/i),
  ).toHaveCount(1);
  await expectNoTechnicalLeakText(page);
});
