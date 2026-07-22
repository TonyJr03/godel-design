import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoTechnicalLeakText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const initialDeliveryDate = getFutureDateInputValue(30);
const updatedDeliveryDate = getFutureDateInputValue(45);
const pastDeliveryDate = getFutureDateInputValue(-1);
const initialTitle = `QA Pedido Edicion ${runId}`;
const updatedTitle = `QA Pedido Editado ${runId}`;
const initialDescription = `Descripcion inicial para edicion ${runLabel}`;
const updatedDescription = `Descripcion editada por admin ${runLabel}`;
const supervisorDescription = `Descripcion editada por supervisor ${runLabel}`;
let pedidoDetailUrl = "";
let workerWasAssigned = false;

async function clickFirstVisible(locator: Locator) {
  await expect(async () => {
    const count = await locator.count();

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);

      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        return;
      }
    }

    throw new Error("No visible element found for locator.");
  }).toPass({ timeout: 10_000 });
}

async function closeOpenPedidoDialog(page: Page, acceptUnsaved = false) {
  const openDialog = page.getByRole("dialog");

  if ((await openDialog.count()) === 0) {
    return;
  }

  if (acceptUnsaved) {
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toMatch(/cambios sin guardar/i);
      await dialog.accept();
    });
  }

  const closeButton = openDialog.getByRole("button", { name: /cerrar/i });

  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await expect(openDialog).toBeHidden();
  }
}

async function openPedidoPanel(
  page: Page,
  name: RegExp,
  triggerName = name,
): Promise<Locator> {
  await closeOpenPedidoDialog(page);
  await clickFirstVisible(page.getByRole("button", { name: triggerName }));

  const dialog = page.getByRole("dialog", { name });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

async function createManualPedido(page: Page) {
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog
    .locator('input[name="estimated_delivery_date"]')
    .fill(initialDeliveryDate);
  await dialog.locator('input[name="total_amount"]').fill("500");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(initialTitle);
  await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(
    initialDescription,
  );
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: initialTitle,
      exact: true,
    }),
  ).toBeVisible();

  return page.url();
}

function getPedidoHeader(page: Page) {
  return page.locator("article header").first();
}

function getWorkspaceRail(page: Page) {
  return page.getByRole("complementary", {
    name: /acciones del workspace/i,
  });
}

async function openEditDialog(page: Page) {
  await closeOpenPedidoDialog(page);
  await getPedidoHeader(page)
    .getByRole("button", { name: /editar pedido/i })
    .click();

  const dialog = page.getByRole("dialog", { name: /^editar pedido$/i });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

async function submitEditDialog(dialog: Locator) {
  await dialog.getByRole("button", { name: /guardar cambios/i }).click();
}

async function expectEditFormValues(
  dialog: Locator,
  values: {
    title: string;
    description: string;
    priority: string;
    deliveryDate: string;
    totalAmount: string;
  },
) {
  await expect(dialog.getByLabel(/t.tulo/i)).toHaveValue(values.title);
  await expect(dialog.getByLabel(/descripci.n/i)).toHaveValue(
    values.description,
  );
  await expect(dialog.getByLabel(/prioridad/i)).toHaveValue(values.priority);
  await expect(
    dialog.locator('input[name="estimated_delivery_date"]'),
  ).toHaveValue(values.deliveryDate);
  await expect(dialog.locator('input[name="total_amount"]')).toHaveValue(
    values.totalAmount,
  );
}

async function getUpdateHistoryEvents(page: Page) {
  const historyDialog = await openPedidoPanel(page, /^historial$/i, /historial/i);

  return historyDialog
    .getByText(/^Pedido actualizado$/i)
    .locator("xpath=ancestor::li[1]");
}

async function expectUpdateHistoryCount(page: Page, count: number) {
  const updateEvents = await getUpdateHistoryEvents(page);

  await expect(updateEvents).toHaveCount(count);
  return updateEvents;
}

async function expectNoTechnicalPedidoFieldNames(updateEvents: Locator) {
  const text = (await updateEvents.allInnerTexts()).join("\n");

  expect(text).not.toMatch(
    /\b(?:title|description|estimated_delivery_date|total_amount)\b/i,
  );
}

async function updatePayment(page: Page, cash: string, transfer = "0") {
  const paymentDialog = await openPedidoPanel(page, /^pagos$/i, /pagos/i);

  await paymentDialog.getByLabel(/pagado en efectivo/i).fill(cash);
  await paymentDialog.getByLabel(/pagado por transferencia/i).fill(transfer);
  await paymentDialog.getByRole("button", { name: /actualizar pago/i }).click();
  await expect(
    paymentDialog.getByText(/pago actualizado correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
}

async function updatePedidoStatus(page: Page, status: string, label: RegExp) {
  const statusDialog = await openPedidoPanel(page, /^estado$/i);

  await statusDialog.locator('select[name="status"]').selectOption(status);
  await statusDialog
    .getByRole("button", { name: /actualizar estado/i })
    .click();
  await expect(statusDialog.getByText(label)).toBeVisible({
    timeout: 15_000,
  });
  await page.reload();
}

async function assignTrabajador(page: Page) {
  const personnelDialog = await openPedidoPanel(page, /^personal$/i, /personal/i);
  const select = personnelDialog.getByLabel(/asignar personal/i);

  await expect(select).toBeVisible();

  const trabajadorValue = await select.evaluate((element) => {
    const htmlSelect = element as HTMLSelectElement;
    const trabajadorOption = Array.from(htmlSelect.options).find(
      (option) =>
        !option.disabled &&
        Boolean(option.value) &&
        /trabajador/i.test(option.textContent ?? ""),
    );

    return trabajadorOption?.value ?? "";
  });

  expect(trabajadorValue).not.toBe("");

  await select.selectOption(trabajadorValue);
  await personnelDialog
    .getByRole("button", { name: /asignar personal/i })
    .click();
  await expect(
    personnelDialog.getByText(
      /personal asignado correctamente|usuario ya estaba asignado/i,
    ),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
}

test("admin edits order data and records one sanitized history event", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await loginAs(page, "admin");
  pedidoDetailUrl = await createManualPedido(page);
  await expectNoTechnicalLeakText(page);

  await expect(
    getPedidoHeader(page).getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(1);
  await expect(
    getWorkspaceRail(page).getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(0);

  let editDialog = await openEditDialog(page);

  await expectEditFormValues(editDialog, {
    title: initialTitle,
    description: initialDescription,
    priority: "normal",
    deliveryDate: initialDeliveryDate,
    totalAmount: "500",
  });
  await expect(
    editDialog.locator('input[name="estimated_delivery_date"]'),
  ).not.toHaveAttribute("min");

  await editDialog.getByLabel(/t.tulo/i).fill(`${initialTitle} sin guardar`);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toMatch(/cambios sin guardar/i);
    await dialog.dismiss();
  });
  await editDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(editDialog).toBeVisible();

  await editDialog.getByLabel(/t.tulo/i).fill("   ");
  await submitEditDialog(editDialog);
  await expect(
    editDialog.getByText(/el t.tulo del pedido es obligatorio/i),
  ).toBeVisible();

  await editDialog.getByLabel(/t.tulo/i).fill(updatedTitle);
  await editDialog
    .locator('input[name="estimated_delivery_date"]')
    .fill(pastDeliveryDate);
  await submitEditDialog(editDialog);
  await expect(
    editDialog.getByText(
      /la fecha estimada de entrega no puede estar en el pasado/i,
    ),
  ).toBeVisible();
  await expectNoTechnicalLeakText(page);

  await editDialog.getByLabel(/t.tulo/i).fill(updatedTitle);
  await editDialog.getByLabel(/descripci.n/i).fill(updatedDescription);
  await editDialog.getByLabel(/prioridad/i).selectOption("alta");
  await editDialog
    .locator('input[name="estimated_delivery_date"]')
    .fill(updatedDeliveryDate);
  await editDialog.locator('input[name="total_amount"]').fill("650");
  await submitEditDialog(editDialog);
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: updatedTitle,
      exact: true,
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(getPedidoHeader(page).getByText(/^Alta$/i)).toBeVisible();
  await expectNoTechnicalLeakText(page);

  await expect(
    getPedidoHeader(page).getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(1);
  await expect(
    getWorkspaceRail(page).getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(0);

  editDialog = await openEditDialog(page);
  await expectEditFormValues(editDialog, {
    title: updatedTitle,
    description: updatedDescription,
    priority: "alta",
    deliveryDate: updatedDeliveryDate,
    totalAmount: "650",
  });
  await submitEditDialog(editDialog);
  await expect(editDialog).toBeHidden({ timeout: 15_000 });

  const updateEvents = await expectUpdateHistoryCount(page, 1);
  const updateEvent = updateEvents.first();

  await expect(updateEvent).toContainText(
    /Datos del pedido actualizados:\s*título,\s*descripción,\s*prioridad,\s*fecha estimada,\s*precio\./i,
  );
  await expect(updateEvent).not.toContainText(initialDescription);
  await expect(updateEvent).not.toContainText(updatedDescription);
  await expectNoTechnicalPedidoFieldNames(updateEvents);
  await expectNoTechnicalLeakText(page);

  await assignTrabajador(page);
  workerWasAssigned = true;
});

test("supervisor can edit an active order", async ({ page }) => {
  test.skip(!pedidoDetailUrl, "Admin setup did not create an order.");

  await loginAs(page, "supervisor");
  await page.goto(pedidoDetailUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: updatedTitle, exact: true }),
  ).toBeVisible();

  const editDialog = await openEditDialog(page);

  await editDialog.getByLabel(/descripci.n/i).fill(supervisorDescription);
  await submitEditDialog(editDialog);
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expectNoTechnicalLeakText(page);

  const reopenedDialog = await openEditDialog(page);

  await expect(reopenedDialog.getByLabel(/descripci.n/i)).toHaveValue(
    supervisorDescription,
  );
  await reopenedDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(reopenedDialog).toBeHidden();

  const updateEvents = await expectUpdateHistoryCount(page, 2);
  const supervisorUpdateEvent = updateEvents.filter({
    hasText: /Datos del pedido actualizados:\s*descripción\./i,
  });

  await expect(supervisorUpdateEvent).toHaveCount(1);
  await expect(supervisorUpdateEvent).not.toContainText(supervisorDescription);
  await expectNoTechnicalPedidoFieldNames(updateEvents);
});

test("assigned worker can read but cannot edit order data", async ({ page }) => {
  test.skip(!pedidoDetailUrl, "Admin setup did not create an order.");
  test.skip(!workerWasAssigned, "Admin setup did not assign a worker.");

  await loginAs(page, "worker");
  await page.goto(pedidoDetailUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: updatedTitle, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /editar pedido/i })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("dialog", { name: /^editar pedido$/i }),
  ).toHaveCount(0);
  await expectNoTechnicalLeakText(page);
});

test("admin cannot lower total below paid amount and cannot edit closed order", async ({
  page,
}) => {
  test.setTimeout(120_000);
  test.skip(!pedidoDetailUrl, "Admin setup did not create an order.");

  await loginAs(page, "admin");
  await page.goto(pedidoDetailUrl);
  await updatePayment(page, "300");

  let editDialog = await openEditDialog(page);

  await editDialog.locator('input[name="total_amount"]').fill("200");
  await submitEditDialog(editDialog);
  await expect(
    editDialog.getByText(
      /el precio total no puede ser menor que el monto ya pagado/i,
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoTechnicalLeakText(page);
  await closeOpenPedidoDialog(page, true);

  const updateEventsAfterFailedPrice = await expectUpdateHistoryCount(page, 2);

  await expectNoTechnicalPedidoFieldNames(updateEventsAfterFailedPrice);

  editDialog = await openEditDialog(page);
  await editDialog.locator('input[name="total_amount"]').fill("700");
  await submitEditDialog(editDialog);
  await expect(editDialog).toBeHidden({ timeout: 15_000 });

  const reopenedDialog = await openEditDialog(page);
  await expect(reopenedDialog.locator('input[name="total_amount"]')).toHaveValue(
    "700",
  );
  await reopenedDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(reopenedDialog).toBeHidden();

  const updateEventsAfterPrice = await expectUpdateHistoryCount(page, 3);
  const priceUpdateEvent = updateEventsAfterPrice.filter({
    hasText: /Datos del pedido actualizados:\s*precio\./i,
  });

  await expect(priceUpdateEvent).toHaveCount(1);
  await expectNoTechnicalPedidoFieldNames(updateEventsAfterPrice);
  await updatePedidoStatus(page, "cancelado", /estado actual:\s*cancelado/i);

  await expect(
    page.getByRole("heading", { level: 1, name: updatedTitle, exact: true }),
  ).toBeVisible();
  await expect(getPedidoHeader(page).getByText(/^Cancelado$/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /editar pedido/i })).toHaveCount(
    0,
  );
  await expect(getWorkspaceRail(page)).toBeVisible();
  await expectNoTechnicalLeakText(page);
});
