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

function getPedidoTasksSection(page: Page) {
  return page
    .getByRole("heading", { name: /tareas del pedido/i })
    .locator("xpath=ancestor::section[1]");
}

function getPedidoTaskItem(page: Page, title: string) {
  return getPedidoTasksSection(page)
    .locator("li")
    .filter({ hasText: title })
    .first();
}

function getPedidoPaymentSection(page: Page) {
  return page
    .getByRole("heading", { name: /pago del pedido/i })
    .locator("xpath=ancestor::section[1]");
}

function getPedidoStatusSection(page: Page) {
  return page
    .getByRole("heading", { name: /estado del pedido/i })
    .locator("xpath=ancestor::section[1]");
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
    page.getByRole("heading", {
      level: 1,
      name: title,
      exact: true,
    }),
  ).toBeVisible();
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
  const taskSection = getPedidoTasksSection(page);

  await taskSection.getByLabel(/nueva tarea/i).fill(quantifiedTaskTitle);
  await taskSection.getByRole("button", { name: /crear tarea/i }).click();
  await expectStatusMessage(page, /tarea creada correctamente/i);
  await page.reload();
  await expect(getPedidoTaskItem(page, quantifiedTaskTitle)).toBeVisible();
  await expect(getPedidoTaskItem(page, quantifiedTaskTitle).getByText(/cuantificada/i))
    .toBeVisible();
}

async function completeQuantifiedTask(page: Page) {
  const task = getPedidoTaskItem(page, quantifiedTaskTitle);
  const progressForm = task.locator("form").filter({
    hasText: /actualizar progreso/i,
  });

  await task.getByLabel(/actualizar progreso/i).fill("5");
  await progressForm.getByRole("button", { name: /guardar/i }).click();
  await expectStatusMessage(page, /progreso actualizado correctamente/i);
  await page.reload();
  await expect(getPedidoTaskItem(page, quantifiedTaskTitle).getByText(/5\s*\/\s*5/i))
    .toBeVisible();
}

async function updatePayment(page: Page, cash: string, transfer = "0") {
  const section = getPedidoPaymentSection(page);

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
  await expect(getPedidoStatusSection(page).getByText(/^pago pendiente$/i))
    .toBeVisible();
  await updatePayment(page, "250", "0");
  await expect(getPedidoPaymentSection(page).getByText(/^pago parcial$/i))
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
  await expect(
    page.getByText(/este pedido es de impresi.n directa y no requiere tareas/i),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /cargar tareas predeterminadas/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /aplicar plantilla/i }),
  ).toHaveCount(0);
  await expectNoTechnicalLeakText(page);
});

test("pedido workspace contextual panels are accessible", async ({ page }) => {
  test.setTimeout(120_000);

  test.skip(!encargoDetailUrl, "The focal encargo pedido was not created.");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAs(page, "admin");
  await page.goto(encargoDetailUrl);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: encargoTitle,
      exact: true,
    }),
  ).toBeVisible();

  const informationTrigger = page.getByRole("button", {
    name: /informaci.n/i,
  });
  await informationTrigger.click();

  const informationDialog = page.getByRole("dialog", {
    name: /^informaci.n$/i,
  });
  await expect(informationDialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    informationDialog.getByRole("heading", { name: /^informaci.n$/i }),
  ).toBeFocused();
  await expect(
    informationDialog.getByRole("heading", { name: /^cliente$/i }),
  ).toBeVisible();
  await expect(
    informationDialog.getByText(/este pedido no tiene cliente asociado/i),
  ).toBeVisible();
  await expect(
    informationDialog.getByRole("heading", { name: /solicitud de origen/i }),
  ).toBeVisible();
  await expect(
    informationDialog.getByText(/pedido creado manualmente/i),
  ).toBeVisible();
  await expect(
    informationDialog.getByRole("heading", { name: /informaci.n t.cnica/i }),
  ).toBeVisible();
  await expect(informationDialog.getByText(/referencia interna/i))
    .toBeVisible();

  await informationDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(informationDialog).toBeHidden();
  await expect(informationTrigger).toBeFocused();

  const historyTrigger = page.getByRole("button", { name: /historial/i });
  await historyTrigger.click();

  const historyDialog = page.getByRole("dialog", { name: /^historial$/i });
  await expect(historyDialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    historyDialog.getByRole("heading", { name: /^historial$/i }),
  ).toBeFocused();
  await expect(historyDialog.getByText(/pedido creado/i).first())
    .toBeVisible();

  await page.keyboard.press("Escape");
  await expect(historyDialog).toBeHidden();
  await expect(historyTrigger).toBeFocused();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(encargoDetailUrl);

  const mobileHistoryTrigger = page.getByRole("button", {
    name: /historial/i,
  });
  const mobileInformationTrigger = page.getByRole("button", {
    name: /informaci.n/i,
  });

  await expect(mobileHistoryTrigger).toBeVisible();
  await expect(mobileInformationTrigger).toBeVisible();
  await expect(page.getByRole("button", { name: /m.s/i })).toHaveCount(0);

  await mobileInformationTrigger.click();
  await expect(
    page.getByRole("dialog", { name: /^informaci.n$/i }),
  ).toBeVisible();
  await page.getByRole("dialog", { name: /^informaci.n$/i })
    .getByRole("button", { name: /cerrar/i })
    .click();
  await expect(mobileInformationTrigger).toBeFocused();

  const actionBar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });
  const lastControl = page.getByRole("button", {
    name: /agregar comentario/i,
  });

  await lastControl.scrollIntoViewIfNeeded();

  const actionBarBox = await actionBar.boundingBox();
  const lastControlBox = await lastControl.boundingBox();

  expect(actionBarBox).not.toBeNull();
  expect(lastControlBox).not.toBeNull();
  expect(
    (lastControlBox?.y ?? 0) + (lastControlBox?.height ?? 0),
  ).toBeLessThanOrEqual((actionBarBox?.y ?? 0) + 2);

  await page.setViewportSize({ width: 1280, height: 720 });
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
      page.getByRole("heading", {
        level: 1,
        name: impresionTitle,
        exact: true,
      }),
    ).toBeVisible();
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
      page.getByRole("heading", {
        level: 1,
        name: encargoTitle,
        exact: true,
      }),
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
