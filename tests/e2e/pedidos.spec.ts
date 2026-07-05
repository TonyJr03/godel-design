import { expect, type Page, test } from "@playwright/test";

import { expectNoTechnicalLeakText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const futureDate = getFutureDateInputValue(30);
const clienteLabel = `QA Cliente Focal ${runId}`;
const encargoTitle = `QA Pedido Focal Encargo ${runId}`;
const impresionTitle = `QA Pedido Focal Impresion ${runId}`;
const quantifiedTaskTitle = `QA Tarea Focal Imprimir 5 hojas ${runLabel}`;

function sectionByHeading(page: Page, heading: RegExp) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: heading }),
  }).first();
}

function getTaskItem(page: Page, title: string) {
  return page.locator("li").filter({ hasText: title }).first();
}

async function expectStatusMessage(page: Page, message: RegExp) {
  await expect(page.getByText(message).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function expectPedidosListLoaded(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/pedidos(?:[/?#].*)?$/);
  await expect(page.getByRole("heading", { name: /^pedidos$/i })).toBeVisible();
  await expect(page.getByLabel(/buscar pedidos/i)).toBeVisible();
  await expectNoTechnicalLeakText(page);
}

async function createManualPedido(
  page: Page,
  workflow: "encargo" | "impresion",
  title: string,
  total = "500",
) {
  await page.goto("/dashboard/pedidos/nuevo");
  await expect(
    page.getByRole("heading", { name: /nuevo pedido/i }),
  ).toBeVisible();

  if (workflow === "impresion") {
    await page.getByRole("tab", { name: /impresi.n/i }).click();
    await page.getByLabel(/cantidad de copias/i).fill("8");
    await page.getByLabel(/modo de color/i).selectOption("color");
    await page.getByLabel(/tama.o de papel/i).selectOption("carta");
    await page.getByLabel(/caras/i).selectOption("una_cara");
    await page
      .getByLabel(/observaciones/i)
      .fill(`Pedido de impresion focal para ${clienteLabel}`);
  } else {
    await page.getByRole("tab", { name: /encargo/i }).click();
    await page
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Encargo focal para ${clienteLabel}`);
  }

  await page.getByLabel(/prioridad/i).selectOption("normal");
  await page.getByLabel(/fecha estimada de entrega/i).fill(futureDate);
  await page.getByLabel(/monto total a pagar/i).fill(total);
  await page.getByLabel(/t.tulo del trabajo/i).fill(title);
  await page.getByRole("button", { name: /crear pedido/i }).click();
  await expectStatusMessage(page, /pedido creado correctamente/i);

  await page.getByRole("link", { name: /ver detalle del pedido/i }).click();
  await expect(
    page.getByRole("heading", { name: /detalle del pedido/i }),
  ).toBeVisible();
  await expect(page.getByText(title).first()).toBeVisible();
  await expectNoTechnicalLeakText(page);

  return page.url();
}

async function updatePedidoStatus(page: Page, status: string) {
  const section = sectionByHeading(page, /estado del pedido/i);
  const statusLabels: Record<string, RegExp> = {
    creado: /estado actual:\s*creado/i,
    en_revision: /estado actual:\s*en revisi.n/i,
    en_produccion: /estado actual:\s*en producci.n/i,
    listo_entrega: /estado actual:\s*listo para entrega/i,
    entregado: /estado actual:\s*entregado/i,
  };

  await section.getByLabel(/^estado$/i).selectOption(status);
  await section.getByRole("button", { name: /actualizar estado/i }).click();
  await expect(section.getByText(statusLabels[status])).toBeVisible({
    timeout: 15_000,
  });
  await page.reload();
}

async function expectPedidoStatusBlocked(page: Page, status: string) {
  const option = sectionByHeading(page, /estado del pedido/i).locator(
    `option[value="${status}"]`,
  );

  if ((await option.count()) === 0) {
    return;
  }

  await expect(option).toBeDisabled();
}

async function createQuantifiedTask(page: Page) {
  const taskSection = sectionByHeading(page, /tareas del pedido/i);

  await taskSection.getByLabel(/nueva tarea/i).fill(quantifiedTaskTitle);
  await taskSection.getByRole("button", { name: /crear tarea/i }).click();
  await expectStatusMessage(page, /tarea creada correctamente/i);
  await page.reload();
  await expect(getTaskItem(page, quantifiedTaskTitle)).toBeVisible();
  await expect(getTaskItem(page, quantifiedTaskTitle).getByText(/cuantificada/i))
    .toBeVisible();
}

async function completeQuantifiedTask(page: Page) {
  const task = getTaskItem(page, quantifiedTaskTitle);
  const progressForm = task.locator("form").filter({
    hasText: /actualizar progreso/i,
  });

  await task.getByLabel(/actualizar progreso/i).fill("5");
  await progressForm.getByRole("button", { name: /guardar/i }).click();
  await expectStatusMessage(page, /progreso actualizado correctamente/i);
  await page.reload();
  await expect(getTaskItem(page, quantifiedTaskTitle).getByText(/5\s*\/\s*5/i))
    .toBeVisible();
}

async function updatePayment(page: Page, cash: string, transfer = "0") {
  const section = sectionByHeading(page, /pago del pedido/i);

  await section.getByLabel(/pagado en efectivo/i).fill(cash);
  await section.getByLabel(/pagado por transferencia/i).fill(transfer);
  await section.getByRole("button", { name: /actualizar pago/i }).click();
  await expectStatusMessage(page, /pago actualizado correctamente/i);
  await page.reload();
}

async function assignFirstAvailableWorker(page: Page) {
  const section = sectionByHeading(page, /personal asignado/i);
  const select = section.getByLabel(/asignar personal/i);

  if ((await select.count()) === 0) {
    await expect(
      section.getByText(/no hay m.s usuarios disponibles|no hay personal/i),
    ).toBeVisible();
    return false;
  }

  const value = await select.evaluate((element) => {
    const htmlSelect = element as HTMLSelectElement;
    const options = Array.from(htmlSelect.options).filter(
      (option) => !option.disabled && option.value,
    );

    return (
      options.find((option) => /trabajador/i.test(option.textContent ?? ""))
        ?.value ??
      options[0]?.value ??
      ""
    );
  });

  if (!value) {
    await expect(
      section.getByText(/no hay m.s usuarios disponibles para asignar/i),
    ).toBeVisible();
    return false;
  }

  await select.selectOption(value);
  await section.getByRole("button", { name: /asignar personal/i }).click();
  await expectStatusMessage(
    page,
    /personal asignado correctamente|usuario ya estaba asignado/i,
  );
  await page.reload();

  return true;
}

let encargoDetailUrl = "";
let impresionDetailUrl = "";
let assignedEncargoDetailUrl = "";

test("admin can create and manage focal internal pedidos", async ({ page }) => {
  test.setTimeout(180_000);

  await loginAs(page, "admin");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expect(
    page.getByRole("link", { name: /nuevo pedido/i }),
  ).toBeVisible();

  encargoDetailUrl = await createManualPedido(
    page,
    "encargo",
    encargoTitle,
    "500",
  );

  await expect(
    sectionByHeading(page, /estado del pedido/i).getByText(/debe revisarse/i),
  ).toBeVisible();
  await updatePedidoStatus(page, "en_revision");
  await expectPedidoStatusBlocked(page, "en_produccion");
  await createQuantifiedTask(page);
  await updatePedidoStatus(page, "en_produccion");
  await expectPedidoStatusBlocked(page, "listo_entrega");
  await completeQuantifiedTask(page);
  await updatePedidoStatus(page, "listo_entrega");
  await expect(page.getByText(/pago pendiente/i)).toBeVisible();
  await updatePayment(page, "250", "0");
  await expect(sectionByHeading(page, /pago del pedido/i).getByText(/pago parcial/i))
    .toBeVisible();

  if (await assignFirstAvailableWorker(page)) {
    assignedEncargoDetailUrl = page.url();
  }

  impresionDetailUrl = await createManualPedido(
    page,
    "impresion",
    impresionTitle,
    "300",
  );
  await expect(page.getByText(/no requiere tareas/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /cargar tareas predeterminadas/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /aplicar plantilla/i }),
  ).toHaveCount(0);
  await expectNoTechnicalLeakText(page);
});

test("pedido access follows current role boundaries", async ({ page }) => {
  test.setTimeout(120_000);

  await loginAs(page, "supervisor");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expect(
    page.getByRole("link", { name: /nuevo pedido/i }),
  ).toBeVisible();

  if (impresionDetailUrl) {
    await page.goto(impresionDetailUrl);
    await expect(
      page.getByRole("heading", { name: /detalle del pedido/i }),
    ).toBeVisible();
    await expect(page.getByText(impresionTitle).first()).toBeVisible();
    await expectNoTechnicalLeakText(page);
  }

  await loginAs(page, "worker");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);

  await page.goto("/dashboard/pedidos/nuevo");
  await expect(
    page.getByText(/no tienes permiso para crear pedidos/i),
  ).toBeVisible();
  await expectNoTechnicalLeakText(page);

  if (assignedEncargoDetailUrl) {
    await page.goto(assignedEncargoDetailUrl);
    await expect(
      page.getByRole("heading", { name: /detalle del pedido/i }),
    ).toBeVisible();
    await expectNoTechnicalLeakText(page);
  }

  if (impresionDetailUrl) {
    await page.goto(impresionDetailUrl);
    await expect(page.getByText(/404|no se encontr|no tienes acceso/i))
      .toBeVisible();
  } else if (encargoDetailUrl) {
    await page.goto(encargoDetailUrl);
    await expect(page.getByText(/404|no se encontr|no tienes acceso/i))
      .toBeVisible();
  }
});
