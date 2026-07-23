import { expect, type Locator, type Page, test } from "@playwright/test";
import { resolve } from "node:path";

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
const disposableTaskTitle = `QA Tarea Desechable ${runLabel}`;
const quantifiedTaskTitle = `QA Tarea Focal Imprimir 5 hojas ${runLabel}`;
const workspaceCommentText = `QA comentario workspace ${runLabel}`;

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

async function expectBefore(first: Locator, second: Locator) {
  const secondHandle = await second.elementHandle();

  if (!secondHandle) {
    throw new Error(
      "Expected second locator to resolve before comparing DOM order.",
    );
  }

  const isBefore = await first.evaluate((firstElement, secondElement) => {
    return Boolean(
      firstElement.compareDocumentPosition(secondElement as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }, secondHandle);

  await secondHandle.dispose();
  expect(isBefore).toBe(true);
}

async function getElementHeight(locator: Locator) {
  return locator.evaluate((element) =>
    (element as HTMLElement).getBoundingClientRect().height,
  );
}

async function closeOpenPedidoDialog(page: Page) {
  const openDialog = page.getByRole("dialog");

  if ((await openDialog.count()) === 0) {
    return;
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

async function getPedidoTasksPanel(page: Page) {
  return openPedidoPanel(page, /^tareas$/i, /tareas/i);
}

async function getPedidoTaskItem(page: Page, title: string) {
  return (await getPedidoTasksPanel(page))
    .locator("li")
    .filter({ hasText: title })
    .first();
}

async function getPedidoPaymentPanel(page: Page) {
  return openPedidoPanel(page, /^pagos$/i, /pagos/i);
}

async function getPedidoStatusPanel(page: Page) {
  return openPedidoPanel(page, /^estado$/i, /^estado/i);
}

const PEDIDO_STATUS_LABELS: Record<string, RegExp> = {
  creado: /^Creado$/i,
  en_revision: /^En revisi.n$/i,
  en_produccion: /^En producci.n$/i,
  listo_entrega: /^Listo para entrega$/i,
  entregado: /^Entregado$/i,
  cancelado: /^Cancelado$/i,
};

const PEDIDO_STATUS_BUTTONS: Record<string, RegExp> = {
  en_produccion: /pasar a producci.n/i,
  listo_entrega: /marcar como listo para entrega/i,
  entregado: /marcar como entregado/i,
};

function getPedidoHeader(page: Page) {
  return page.locator("article header").first();
}

function getWorkspaceRail(page: Page) {
  return page.getByRole("complementary", {
    name: /acciones del workspace/i,
  });
}

function getRailAction(page: Page, name: RegExp) {
  return getWorkspaceRail(page).getByRole("button", { name });
}

async function expectNoDocumentScroll(page: Page) {
  await expect(async () => {
    const dimensions = await page.evaluate(() => ({
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
    }));

    expect(dimensions.scrollHeight).toBeLessThanOrEqual(
      dimensions.innerHeight + 2,
    );
  }).toPass({ timeout: 10_000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function expectFillPanelSingleScroll(
  dialog: Locator,
  footerElement: Locator,
) {
  await expect(footerElement).toBeVisible();

  const footerHandle = await footerElement.elementHandle();

  if (!footerHandle) {
    throw new Error("Expected footer element to resolve.");
  }

  const metrics = await dialog.evaluate((dialogElement, footer) => {
    const footerNode = footer as HTMLElement;
    const scrollContainers = Array.from(
      dialogElement.querySelectorAll<HTMLElement>("*"),
    ).filter((element) => /auto|scroll/i.test(getComputedStyle(element).overflowY));

    return {
      scrollContainerCount: scrollContainers.length,
      scrollContainersContainingFooter: scrollContainers.filter((element) =>
        element.contains(footerNode),
      ).length,
      hasHorizontalOverflow:
        dialogElement.scrollWidth > dialogElement.clientWidth + 1,
    };
  }, footerHandle);

  await footerHandle.dispose();

  expect(metrics.scrollContainerCount).toBeGreaterThanOrEqual(1);
  expect(metrics.scrollContainersContainingFooter).toBe(0);
  expect(metrics.hasHorizontalOverflow).toBe(false);
}

async function getRequiredBox(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();

  return box as NonNullable<typeof box>;
}

async function expectBadgeInTopRight(button: Locator) {
  const badge = button.locator("[data-workspace-action-badge]");

  await expect(badge).toBeVisible();

  const buttonBox = await getRequiredBox(button);
  const badgeBox = await getRequiredBox(badge);
  const badgeCenterX = badgeBox.x + badgeBox.width / 2;
  const badgeCenterY = badgeBox.y + badgeBox.height / 2;
  const maxSiblingButtonHeight = await button.evaluate((element) => {
    const parent = element.parentElement;

    if (!parent) {
      return element.getBoundingClientRect().height;
    }

    return Math.max(
      ...Array.from(parent.querySelectorAll<HTMLElement>("button"))
        .filter((candidate) => candidate.offsetParent !== null)
        .map((candidate) => candidate.getBoundingClientRect().height),
    );
  });

  expect(badgeCenterX).toBeGreaterThan(buttonBox.x + buttonBox.width * 0.6);
  expect(badgeCenterY).toBeLessThan(buttonBox.y + buttonBox.height * 0.4);
  expect(buttonBox.height).toBeLessThanOrEqual(maxSiblingButtonHeight + 1);
}

async function expectSingleRow(locator: Locator) {
  const rows = await locator.evaluate((element) => {
    const buttons = Array.from(
      element.querySelectorAll<HTMLElement>('button:not([aria-hidden="true"])'),
    ).filter((button) => button.offsetParent !== null);

    return Array.from(
      new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))),
    ).length;
  });

  expect(rows).toBe(1);
}

async function expectBackLinkVariant(
  page: Page,
  variant: "text" | "button",
) {
  const header = getPedidoHeader(page);
  const backLink = header.getByRole("link", { name: /volver a pedidos/i });

  await expect(backLink).toBeVisible();
  await expect(backLink).toHaveAttribute("href", "/dashboard/pedidos");

  const metrics = await backLink.evaluate((element) => {
    const link = element as HTMLElement;
    const style = getComputedStyle(link);
    const box = link.getBoundingClientRect();
    const orderNumber =
      link.parentElement?.querySelector("p")?.getBoundingClientRect() ?? null;

    return {
      borderTopWidth: style.borderTopWidth,
      width: box.width,
      x: box.x,
      orderNumberY: orderNumber?.y ?? null,
      linkY: box.y,
    };
  });

  if (variant === "text") {
    expect(metrics.borderTopWidth).toBe("0px");
    expect(metrics.width).toBeLessThan(page.viewportSize()!.width * 0.75);
    expect(metrics.orderNumberY).not.toBeNull();
    expect(metrics.linkY).toBeLessThan(metrics.orderNumberY as number);
    return;
  }

  expect(metrics.borderTopWidth).not.toBe("0px");
}

async function getVisibleToolbarButtons(toolbar: Locator) {
  return toolbar
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons
        .filter((button) => (button as HTMLElement).offsetParent !== null)
        .map((button) => button.getAttribute("aria-label") ?? button.textContent ?? ""),
    );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectCompactPedidoHeader(
  page: Page,
  title: string,
  deliveryLabel: RegExp = /entrega estimada:/i,
) {
  const header = getPedidoHeader(page);
  const backLink = header.getByRole("link", { name: /volver a pedidos/i });

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible();
  await expect(backLink).toBeVisible();
  await expect(backLink).toHaveAttribute("href", "/dashboard/pedidos");
  await expect(header.getByText(deliveryLabel)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^resumen operativo$/i }),
  ).toHaveCount(0);
  await expect(
    header.getByRole("button", {
      name: /revisar estado|crear tareas|actualizar tareas|revisar pago|completar entrega|avanzar pedido/i,
    }),
  ).toHaveCount(0);
  await expect(
    header.getByRole("button", {
      name: /copiar c.digo de seguimiento/i,
    }),
  ).toBeVisible();
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
    await dialog
      .getByLabel(/observaciones/i)
      .fill(`Pedido de impresion focal para ${clienteLabel}`);
  } else {
    await dialog.getByRole("tab", { name: /encargo/i }).click();
    await dialog
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Encargo focal para ${clienteLabel}`);
  }

  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill(total);
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expectPedidosListLoaded(page);
  await expect(page).not.toHaveURL(/\/dashboard\/pedidos\/[^/]+$/);

  const createdPedidoLink = page
    .getByRole("link")
    .filter({ hasText: title })
    .first();

  await expect(createdPedidoLink).toBeVisible();
  await expect(createdPedidoLink.getByText(/^Creado$/i)).toBeVisible();
  await createdPedidoLink.click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: title,
      exact: true,
    }),
  ).toBeVisible();
  await updatePedidoStatus(page, "en_revision");
  await expectNoTechnicalLeakText(page);

  return page.url();
}

async function updatePedidoStatus(page: Page, status: string) {
  const section = await getPedidoStatusPanel(page);

  await expect(section.locator('select[name="status"]')).toHaveCount(0);

  if (status === "en_revision") {
    await expect(
      section.getByText(PEDIDO_STATUS_LABELS.en_revision).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(section.getByText(/no se pudo actualizar el estado/i))
      .toHaveCount(0);
    await page.reload();
    return;
  }

  if (status === "cancelado") {
    await section.getByRole("button", { name: /cancelar pedido/i }).click();
    await expect(section.getByText(/cancelar este pedido/i)).toBeVisible();
    await expect(section.getByRole("button", { name: /^cancelar$/i }))
      .toBeVisible();
    await section
      .getByRole("button", { name: /s.?, cancelar pedido/i })
      .click();
  } else {
    const buttonName = PEDIDO_STATUS_BUTTONS[status];

    if (!buttonName) {
      throw new Error(`Unsupported pedido status transition: ${status}`);
    }

    await expect(section.getByRole("button", { name: buttonName }))
      .toBeVisible();
    await section.getByRole("button", { name: buttonName }).click();
  }

  await expect(section).toBeVisible();
  await expect(section.getByText(PEDIDO_STATUS_LABELS[status]).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function expectPedidoStatusBlocked(page: Page, status: string) {
  const section = await getPedidoStatusPanel(page);
  const buttonName = PEDIDO_STATUS_BUTTONS[status];

  if (!buttonName) {
    throw new Error(`Unsupported blocked pedido status: ${status}`);
  }

  await expect(section.locator('select[name="status"]')).toHaveCount(0);
  await expect(section.getByRole("button", { name: buttonName }))
    .toBeDisabled();
  await expect(section.getByText(/agrega al menos una tarea|completa todas las tareas|pagad|validar el pago/i))
    .toBeVisible();
}

async function returnPedidoToProduction(page: Page) {
  const section = await getPedidoStatusPanel(page);

  await expect(section.locator('select[name="status"]')).toHaveCount(0);
  await expect(
    section.getByText(PEDIDO_STATUS_LABELS.listo_entrega).first(),
  ).toBeVisible();
  await section.getByRole("button", { name: /volver a producci.n/i }).click();
  await expect(
    section.getByText(PEDIDO_STATUS_LABELS.en_produccion).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    section.getByRole("button", { name: PEDIDO_STATUS_BUTTONS.listo_entrega }),
  ).toBeVisible();
}

async function createQuantifiedTask(page: Page) {
  const taskSection = await getPedidoTasksPanel(page);
  const templateHeading = taskSection.getByRole("heading", {
    name: /cargar tareas predeterminadas/i,
  });
  const registeredTasksHeading = taskSection.getByRole("heading", {
    name: /^tareas registradas$/i,
  });
  const newTaskHeading = taskSection.getByRole("heading", {
    name: /^nueva tarea$/i,
  });
  const newTaskInput = taskSection.getByRole("textbox", {
    name: /nueva tarea/i,
  });

  await expect(
    taskSection.getByText(/escribe cada paso del trabajo/i),
  ).toHaveCount(0);
  await expect(taskSection.getByText(/diseñar el logo/i)).toHaveCount(0);
  await expect(taskSection.getByText(/imprimir 40 páginas/i)).toHaveCount(0);
  await expect(taskSection.getByText(/encuadernar 2 libretas/i)).toHaveCount(0);
  await expect(templateHeading).toBeVisible();
  await expect(registeredTasksHeading).toBeVisible();
  await expect(newTaskHeading).toBeVisible();
  await expect(
    taskSection.getByText(
      /las tareas de la plantilla se agregar.n al final/i,
    ),
  ).toHaveCount(0);
  await expect(
    taskSection.locator('label[for="task-template-id"]'),
  ).toBeVisible();
  await expect(taskSection.getByLabel(/seleccionar plantilla/i)).toBeVisible();
  await expect(
    taskSection.getByText(/si aplicas la misma plantilla/i),
  ).toHaveCount(0);
  await expectBefore(templateHeading, newTaskHeading);
  await expectBefore(newTaskHeading, registeredTasksHeading);
  await expectBefore(newTaskHeading, newTaskInput);

  await newTaskInput.fill(quantifiedTaskTitle);
  await taskSection.getByRole("button", { name: /crear tarea/i }).click();
  await expect(taskSection).toBeVisible();
  await expect(
    taskSection.getByText(/tarea creada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
  const task = await getPedidoTaskItem(page, quantifiedTaskTitle);
  await expect(task).toBeVisible();
  await expect(task.getByText(/cuantificada/i)).toBeVisible();
}

async function createAndDeleteDisposableTask(page: Page) {
  let taskSection = await getPedidoTasksPanel(page);
  const newTaskInput = taskSection.getByRole("textbox", {
    name: /nueva tarea/i,
  });

  await newTaskInput.fill(disposableTaskTitle);
  await taskSection.getByRole("button", { name: /crear tarea/i }).click();
  await expect(taskSection).toBeVisible();
  await expect(
    taskSection.getByText(/tarea creada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();

  taskSection = await getPedidoTasksPanel(page);
  const task = taskSection.locator("li").filter({ hasText: disposableTaskTitle });
  const deleteButton = task.getByRole("button", {
    name: new RegExp(`eliminar tarea ${escapeRegExp(disposableTaskTitle)}`, "i"),
  });

  await expect(task).toBeVisible();
  await deleteButton.click();
  let confirmation = task.locator("form").filter({
    hasText: /eliminar esta tarea/i,
  });

  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText(disposableTaskTitle)).toBeVisible();
  await expect(
    confirmation.getByRole("button", { name: /cancelar/i }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toBeHidden();
  await expect(taskSection).toBeVisible();
  await expect(
    taskSection.getByRole("heading", { name: /^tareas$/i }),
  ).toBeVisible();
  await expect(task).toBeVisible();
  await expect(deleteButton).toBeFocused();

  await deleteButton.click();
  confirmation = task.locator("form").filter({
    hasText: /eliminar esta tarea/i,
  });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: /^eliminar tarea$/i })
    .click();
  await expect(
    taskSection.getByText("Tarea eliminada", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(taskSection.getByText(/tarea eliminada correctamente/i))
    .toBeVisible();
  await expect(task).toHaveCount(0, { timeout: 15_000 });
  await expect(
    taskSection.getByRole("heading", { name: /^tareas registradas$/i }),
  ).toBeVisible();
  await expect(taskSection.getByText(/progreso:/i)).toBeVisible();
  await expectNoTechnicalLeakText(page);
}

async function completeQuantifiedTask(page: Page) {
  const task = await getPedidoTaskItem(page, quantifiedTaskTitle);
  const progressForm = task.locator("form").filter({
    hasText: /actualizar progreso/i,
  });

  await task.getByLabel(/actualizar progreso/i).fill("5");
  await progressForm.getByRole("button", { name: /guardar/i }).click();
  const tasksPanel = page.getByRole("dialog", { name: /^tareas$/i });
  await expect(tasksPanel).toBeVisible();
  await expect(
    tasksPanel.getByText(/progreso actualizado correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(
    (await getPedidoTaskItem(page, quantifiedTaskTitle)).getByText(/5\s*\/\s*5/i),
  ).toBeVisible();
}

async function updatePayment(page: Page, cash: string, transfer = "0") {
  const section = await getPedidoPaymentPanel(page);

  await section.getByLabel(/pagado en efectivo/i).fill(cash);
  await section.getByLabel(/pagado por transferencia/i).fill(transfer);
  await section.getByRole("button", { name: /actualizar pago/i }).click();
  await expect(section).toBeVisible();
  await expect(
    section.getByText(/pago actualizado correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
}

async function assignFirstAvailableWorker(page: Page) {
  const section = await openPedidoPanel(page, /^personal$/i, /personal/i);
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
  await expect(section).toBeVisible();
  await expect(
    section.getByText(
      /personal asignado correctamente|usuario ya estaba asignado/i,
    ),
  ).toBeVisible({ timeout: 15_000 });
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
    page.getByRole("button", { name: /nuevo pedido/i }),
  ).toBeVisible();

  encargoDetailUrl = await createManualPedido(
    page,
    "encargo",
    encargoTitle,
    "500",
  );

  await expectCompactPedidoHeader(page, encargoTitle);
  await expect(
    getRailAction(page, /tareas.*sin tareas registradas/i),
  ).toBeVisible();
  await expect(
    getRailAction(page, /personal.*sin personal asignado/i),
  ).toBeVisible();
  await expect(
    getRailAction(page, /pagos.*pago pendiente/i),
  ).toBeVisible();
  const copyReferenceButton = getPedidoHeader(page).getByRole("button", {
    name: /copiar c.digo de seguimiento/i,
  });
  await copyReferenceButton.click();
  await expect(getPedidoHeader(page).getByRole("status")).toContainText(
    /c.digo copiado/i,
  );
  await expect(copyReferenceButton).toBeVisible();
  await copyReferenceButton.focus();
  await page.keyboard.press("Enter");
  await expect(getPedidoHeader(page).getByRole("status")).toContainText(
    /c.digo copiado/i,
  );
  await expect(copyReferenceButton).toBeFocused();

  const reviewStatusPanel = await getPedidoStatusPanel(page);
  await expect(reviewStatusPanel.locator('select[name="status"]'))
    .toHaveCount(0);
  await expect(
    reviewStatusPanel.getByText(PEDIDO_STATUS_LABELS.en_revision).first(),
  ).toBeVisible();
  await expect(
    reviewStatusPanel.getByRole("button", {
      name: PEDIDO_STATUS_BUTTONS.en_produccion,
    }),
  ).toBeDisabled();
  await updatePedidoStatus(page, "en_revision");

  await expectCompactPedidoHeader(page, encargoTitle);
  await expect(await getPedidoTasksPanel(page)).toBeVisible();

  await expectPedidoStatusBlocked(page, "en_produccion");
  await createAndDeleteDisposableTask(page);
  await createQuantifiedTask(page);
  await updatePedidoStatus(page, "en_produccion");

  await expectCompactPedidoHeader(page, encargoTitle);
  await expect(
    getRailAction(page, /tareas.*tareas pendientes/i),
  ).toBeVisible();
  await expect(await getPedidoTasksPanel(page)).toBeVisible();

  await expectPedidoStatusBlocked(page, "listo_entrega");
  await completeQuantifiedTask(page);
  await updatePedidoStatus(page, "listo_entrega");
  await returnPedidoToProduction(page);
  await updatePedidoStatus(page, "listo_entrega");

  await expectCompactPedidoHeader(page, encargoTitle);
  await expect(
    (await getPedidoPaymentPanel(page)).getByText(/^sin pagar$/i),
  ).toBeVisible();
  await expectPedidoStatusBlocked(page, "entregado");

  await updatePayment(page, "250", "0");
  await expect(
    getRailAction(page, /pagos.*pago pendiente/i),
  ).toBeVisible();
  await expect(
    (await getPedidoPaymentPanel(page)).getByText(/^pago parcial$/i),
  ).toBeVisible();

  await updatePayment(page, "500", "0");
  await expect(
    getRailAction(page, /pagos.*pago completado/i),
  ).toBeVisible();
  await expect(
    (await getPedidoPaymentPanel(page)).getByText(/^pagado$/i),
  ).toBeVisible();

  if (await assignFirstAvailableWorker(page)) {
    assignedEncargoDetailUrl = page.url();
  }

  impresionDetailUrl = await createManualPedido(
    page,
    "impresion",
    impresionTitle,
    "300",
  );
  await expectCompactPedidoHeader(page, impresionTitle);
  await expect(page.getByRole("button", { name: /^tareas/i })).toHaveCount(0);
  await expect(
    page.getByText(/flujo directo de impresi.n/i),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /descripci.n y especificaciones/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /archivos recientes/i }),
  ).toBeVisible();
  await expect(getRailAction(page, /^estado/i)).toBeVisible();
  await expect(getRailAction(page, /^archivos/i)).toBeVisible();
  await expect(getRailAction(page, /^pagos/i)).toBeVisible();
  const printStatusPanel = await openPedidoPanel(page, /^estado$/i, /^estado/i);
  await expect(
    printStatusPanel.getByText(
      /este pedido es de impresi.n directa y no requiere tareas/i,
    ),
  ).toHaveCount(0);
  await expect(printStatusPanel.locator('select[name="status"]')).toHaveCount(0);
  await expect(
    printStatusPanel.getByText(PEDIDO_STATUS_LABELS.en_revision).first(),
  ).toBeVisible();
  await expect(
    printStatusPanel.getByRole("button", {
      name: PEDIDO_STATUS_BUTTONS.en_produccion,
    }),
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

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, "admin");
  await page.goto(encargoDetailUrl);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: encargoTitle,
      exact: true,
    }),
  ).toBeVisible();
  await expectBackLinkVariant(page, "button");
  await expectNoDocumentScroll(page);

  const desktopRail = getWorkspaceRail(page);
  await expect(desktopRail).toBeVisible();
  const desktopStatusTrigger = getRailAction(page, /^estado/i);
  const desktopTasksTrigger = getRailAction(page, /^tareas/i);
  const desktopFilesTrigger = getRailAction(page, /archivos/i);
  const desktopCommentsTrigger = getRailAction(page, /comentarios/i);
  const desktopInformationTrigger = getRailAction(page, /informaci.n/i);
  const desktopPersonnelTrigger = getRailAction(page, /personal/i);
  const desktopPaymentTrigger = getRailAction(page, /pagos/i);
  const desktopHistoryTrigger = getRailAction(page, /historial/i);

  await expect(desktopStatusTrigger).toBeVisible();
  await expect(desktopTasksTrigger).toBeVisible();
  await expect(desktopFilesTrigger).toBeVisible();
  await expect(desktopCommentsTrigger).toBeVisible();
  await expect(desktopInformationTrigger).toBeVisible();
  await expect(desktopPersonnelTrigger).toBeVisible();
  await expect(desktopPaymentTrigger).toBeVisible();
  await expect(desktopHistoryTrigger).toBeVisible();
  await expect(desktopStatusTrigger.getByText(/^Estado$/i)).toHaveCount(0);
  await expect(desktopStatusTrigger.locator("svg")).toBeVisible();
  await expect(desktopHistoryTrigger.locator("svg")).toBeVisible();
  await expect(desktopHistoryTrigger.getByText(/\d+/)).toBeVisible();
  await expect(
    desktopRail.getByRole("button", { name: /m.s/i }),
  ).toHaveCount(0);

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(encargoDetailUrl);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: encargoTitle,
      exact: true,
    }),
  ).toBeVisible();
  await expectNoDocumentScroll(page);

  const compactDesktopRail = getWorkspaceRail(page);
  const compactInformationTrigger = compactDesktopRail.getByRole("button", {
    name: /informaci.n/i,
  });

  await expect(compactDesktopRail).toBeVisible();
  await expect(compactInformationTrigger).toHaveCount(1);
  await expect(
    getRailAction(page, /pagos.*pago completado/i),
  ).toBeVisible();
  await compactInformationTrigger.scrollIntoViewIfNeeded();

  const viewportHeight = await page.evaluate(() => window.innerHeight);
  const informationBox = await compactInformationTrigger.boundingBox();

  expect(informationBox).not.toBeNull();
  expect((informationBox?.y ?? 0) + (informationBox?.height ?? 0))
    .toBeLessThanOrEqual(viewportHeight + 1);
  await expectNoDocumentScroll(page);

  await expect(
    page.getByRole("heading", { name: /^aportes al pedido$/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /^subir archivo$/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /^agregar comentario$/i }),
  ).toHaveCount(0);

  const commentsTrigger = page.getByRole("button", {
    name: /comentarios/i,
  });
  await commentsTrigger.click();

  const commentsDialog = page.getByRole("dialog", {
    name: /^comentarios$/i,
  });
  await expect(commentsDialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    commentsDialog.getByRole("heading", { name: /^comentarios$/i }),
  ).toBeFocused();
  await expect(
    commentsDialog.getByRole("heading", { name: /^agregar comentario$/i }),
  ).toHaveCount(0);
  await expect(
    commentsDialog.getByText(
      /registra una nota interna para el equipo que trabaja en este pedido/i,
    ),
  ).toHaveCount(0);
  const commentsListTitle = commentsDialog.getByRole("heading", {
    name: /^conversaci.n interna$/i,
  });
  const commentComposerTitle = commentsDialog.getByRole("heading", {
    name: /^comenta$/i,
  });
  const commentTextbox = commentsDialog.getByRole("textbox", {
    name: /^comentario$/i,
  });
  const multilineComment = `${workspaceCommentText}
Línea adicional para comprobar crecimiento.
Otra línea de QA para el textarea.`;

  await expect(commentsListTitle).toBeVisible();
  await expect(commentComposerTitle).toBeVisible();
  await expect(commentTextbox).toBeVisible();
  await expectFillPanelSingleScroll(commentsDialog, commentComposerTitle);
  await expectBefore(commentsListTitle, commentComposerTitle);
  await expectBefore(commentComposerTitle, commentTextbox);
  const commentsListSection = commentsListTitle.locator(
    "xpath=ancestor::section[1]",
  );
  await expect(commentsListSection).toBeVisible();
  await expect(async () => {
    const overflowY = await commentsListSection.evaluate(
      (element) => getComputedStyle(element).overflowY,
    );

    expect(overflowY).toMatch(/auto|scroll/i);
  }).toPass();
  await commentsListSection.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(commentComposerTitle).toBeVisible();
  await expect(commentTextbox).toBeVisible();
  const initialCommentTextareaHeight = await getElementHeight(commentTextbox);
  await commentTextbox.fill(multilineComment);
  const expandedCommentTextareaHeight = await getElementHeight(commentTextbox);

  expect(expandedCommentTextareaHeight).toBeGreaterThan(
    initialCommentTextareaHeight,
  );
  expect(expandedCommentTextareaHeight).toBeLessThanOrEqual(160);
  await commentsDialog
    .getByRole("button", { name: /^agregar comentario$/i })
    .click();
  await expect(commentsDialog).toBeVisible();
  await expect(
    commentsDialog.getByText(/comentario agregado correctamente/i),
  ).toBeVisible({ timeout: 15_000 });

  const createdComment = commentsDialog
    .getByRole("listitem")
    .filter({ hasText: workspaceCommentText })
    .first();
  await expect(createdComment).toBeVisible();
  await expect(createdComment.locator("time")).toHaveCount(1);
  await expect(
    createdComment.getByText(/admin|supervisor|trabajador|equipo/i).first(),
  ).toBeVisible();
  await expectBefore(createdComment, commentTextbox);
  await expectBefore(commentsListTitle, commentTextbox);
  await expect(commentTextbox).toHaveValue("");
  const resetCommentTextareaHeight = await getElementHeight(commentTextbox);

  expect(resetCommentTextareaHeight).toBeLessThanOrEqual(
    initialCommentTextareaHeight + 6,
  );

  await commentsDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(commentsDialog).toBeHidden();
  await expect(commentsTrigger).toBeFocused();

  const filesTrigger = page.getByRole("button", { name: /archivos/i });
  await filesTrigger.click();

  const filesDialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(filesDialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    filesDialog.getByRole("heading", { name: /^archivos$/i }),
  ).toBeFocused();
  await expect(
    filesDialog.getByRole("heading", { name: /^subir nuevo archivo$/i }),
  ).toHaveCount(0);
  await expect(
    filesDialog.getByText(
      /agrega archivos internos, avances o entregables seg.n el estado actual/i,
    ),
  ).toHaveCount(0);
  const filesListTitle = filesDialog.getByRole("heading", {
    name: /^archivos asociados$/i,
  });
  const fileInput = filesDialog.getByLabel(/^archivo$/i);

  await expect(filesListTitle).toBeVisible();
  if (await fileInput.isVisible().catch(() => false)) {
    await expectFillPanelSingleScroll(filesDialog, fileInput);
    await expectBefore(filesListTitle, fileInput);
    await expect(
      filesDialog.getByText(/los archivos se guardar.n como/i),
    ).toHaveCount(0);
    const filesListSection = filesListTitle.locator(
      "xpath=ancestor::section[1]",
    );
    await expect(filesListSection).toBeVisible();
    await expect(async () => {
      const overflowY = await filesListSection.evaluate(
        (element) => getComputedStyle(element).overflowY,
      );

      expect(overflowY).toMatch(/auto|scroll/i);
    }).toPass();
    await filesListSection.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(fileInput).toBeVisible();
    await fileInput.setInputFiles(
      resolve(process.cwd(), "tests/e2e/fixtures/sample-print-request.pdf"),
    );
    await filesDialog.getByRole("button", { name: /subir archivo/i }).click();
    await expect(filesDialog).toBeVisible();
    await expect(
      filesDialog.getByText(/archivo subido correctamente/i),
    ).toBeVisible({ timeout: 15_000 });
  }

  const fileDownloadLinks = filesDialog.getByRole("link", {
    name: /descargar/i,
  });
  const fileDownloadLinkCount = await fileDownloadLinks.count();

  if (fileDownloadLinkCount > 0) {
    for (let index = 0; index < fileDownloadLinkCount; index += 1) {
      const href = await fileDownloadLinks.nth(index).getAttribute("href");

      expect(href).toBeTruthy();
      expect(href).toMatch(
        /\/dashboard\/pedidos\/[^/]+\/archivos\/[^/]+\/download$/,
      );
      expect(href).not.toMatch(/file_path|bucket|godel-files|signed|supabase/i);
    }
  } else {
    await expect(
      filesDialog.getByText(/no hay archivos asociados a este pedido/i),
    ).toBeVisible();
  }

  await filesDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(filesDialog).toBeHidden();
  await expect(filesTrigger).toBeFocused();

  const personnelTrigger = page.getByRole("button", { name: /personal/i });
  await personnelTrigger.click();

  const personnelDialog = page.getByRole("dialog", { name: /^personal$/i });
  await expect(personnelDialog).toBeVisible();
  await expect(
    personnelDialog.getByText(
      /usuarios internos que participan operativamente/i,
    ),
  ).toHaveCount(0);
  await expect(
    personnelDialog.getByText(/no hay personal asignado|asignado el/i),
  ).toBeVisible();
  const assignPersonnelSelect = personnelDialog.getByLabel(/asignar personal/i);
  if (await assignPersonnelSelect.isVisible().catch(() => false)) {
    await expectFillPanelSingleScroll(personnelDialog, assignPersonnelSelect);
    await expect(assignPersonnelSelect).toBeVisible();
    await personnelDialog.evaluate((dialog) => {
      const scrollable = Array.from(dialog.querySelectorAll("div")).find(
        (element) => {
          const style = getComputedStyle(element);

          return (
            /auto|scroll/i.test(style.overflowY) &&
            element.scrollHeight >= element.clientHeight
          );
        },
      );

      if (scrollable) {
        scrollable.scrollTop = scrollable.scrollHeight;
      }
    });
    await expect(assignPersonnelSelect).toBeVisible();
  } else {
    const unavailableMessage = personnelDialog.getByText(
      /no hay m.s usuarios disponibles/i,
    );

    await expect(unavailableMessage).toBeVisible();
    await expectFillPanelSingleScroll(personnelDialog, unavailableMessage);
  }
  await personnelDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(personnelDialog).toBeHidden();
  await expect(personnelTrigger).toBeFocused();

  const informationTrigger = page.getByRole("button", {
    name: /informaci.n/i,
  });
  const neutralInformationTrigger = getRailAction(page, /^informaci.n$/i);

  await expect(neutralInformationTrigger).toBeVisible();
  await expect(
    getWorkspaceRail(page).getByRole("button", {
      name: /informaci.n.*sin cliente asociado/i,
    }),
  ).toHaveCount(0);
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

  await page.reload();
  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto(encargoDetailUrl);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: encargoTitle,
      exact: true,
    }),
  ).toBeVisible();
  await expectBackLinkVariant(page, "text");
  await expectNoHorizontalOverflow(page);
  const tabletActionToolbar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });
  await expect(
    tabletActionToolbar.getByRole("button", { name: /^estado/i }),
  ).toBeVisible();
  await expect(
    tabletActionToolbar.getByRole("button", {
      name: /tareas.*tareas completadas/i,
    }),
  ).toBeVisible();
  await expect(
    tabletActionToolbar.getByRole("button", { name: /archivos/i }),
  ).toBeVisible();
  const tabletFilesButton = tabletActionToolbar.getByRole("button", {
    name: /archivos.*1/i,
  });

  await expect(tabletFilesButton).toBeVisible();
  await expectBadgeInTopRight(tabletFilesButton);
  await expect(
    tabletActionToolbar.getByRole("button", { name: /m.s/i }),
  ).toBeVisible();
  await expectSingleRow(tabletActionToolbar);

  await page.setViewportSize({ width: 780, height: 1000 });
  await page.goto(encargoDetailUrl);
  await expectNoHorizontalOverflow(page);
  const narrowTabletToolbar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });

  await expect(async () => {
    const labels = await getVisibleToolbarButtons(narrowTabletToolbar);

    expect(labels.some((label) => /^estado/i.test(label))).toBe(true);
    expect(labels.some((label) => /^tareas/i.test(label))).toBe(true);
    expect(labels.some((label) => /^archivos/i.test(label))).toBe(true);
    expect(labels.some((label) => /m.s acciones/i.test(label))).toBe(true);
  }).toPass();
  await expectSingleRow(narrowTabletToolbar);

  const narrowLabels = await getVisibleToolbarButtons(narrowTabletToolbar);
  const narrowDirectLabels = narrowLabels.filter(
    (label) => !/m.s acciones/i.test(label),
  );
  const narrowMoreButton = narrowTabletToolbar.getByRole("button", {
    name: /m.s acciones/i,
  });

  await narrowMoreButton.click();
  const narrowMoreDialog = page.getByRole("dialog", {
    name: /^m.s acciones$/i,
  });
  await expect(narrowMoreDialog).toBeVisible();

  for (const label of narrowDirectLabels) {
    const baseLabel = label.split(" - ")[0] ?? label;

    await expect(
      narrowMoreDialog.getByRole("button", {
        name: new RegExp(`^${escapeRegExp(baseLabel)}`, "i"),
      }),
    ).toHaveCount(0);
  }

  await expect(
    narrowMoreDialog.getByRole("button", { name: /informaci.n/i }),
  ).toBeVisible();
  await narrowMoreDialog.getByRole("button", { name: /informaci.n/i }).click();
  const narrowInformationDialog = page.getByRole("dialog", {
    name: /^informaci.n$/i,
  });

  await expect(narrowInformationDialog).toBeVisible();
  await narrowInformationDialog.getByRole("button", { name: /volver/i }).click();
  await expect(narrowMoreDialog).toBeVisible();
  await expect(
    narrowMoreDialog.getByRole("button", { name: /informaci.n/i }),
  ).toBeVisible();
  await narrowMoreDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(narrowMoreDialog).toBeHidden();

  await page.setViewportSize({ width: 1270, height: 1000 });
  await page.goto(encargoDetailUrl);
  await expectNoHorizontalOverflow(page);
  const wideTabletToolbar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });

  await expect(async () => {
    const labels = await getVisibleToolbarButtons(wideTabletToolbar);
    const directLabels = labels.filter(
      (label) => !/m.s acciones/i.test(label),
    );

    expect(directLabels.length).toBeGreaterThan(narrowDirectLabels.length);
    expect(directLabels[0]).toMatch(/^estado/i);
    expect(directLabels[1]).toMatch(/^tareas/i);
    expect(directLabels[2]).toMatch(/^archivos/i);
  }).toPass();
  await expectSingleRow(wideTabletToolbar);

  const wideMoreButton = wideTabletToolbar.getByRole("button", {
    name: /m.s acciones/i,
  });

  if ((await wideMoreButton.count()) > 0) {
    await wideMoreButton.click();
    const wideMoreDialog = page.getByRole("dialog", {
      name: /^m.s acciones$/i,
    });

    await expect(wideMoreDialog).toBeVisible();

    const wideLabels = await getVisibleToolbarButtons(wideTabletToolbar);
    const wideDirectLabels = wideLabels.filter(
      (label) => !/m.s acciones/i.test(label),
    );

    for (const label of wideDirectLabels) {
      const baseLabel = label.split(" - ")[0] ?? label;

      await expect(
        wideMoreDialog.getByRole("button", {
          name: new RegExp(`^${escapeRegExp(baseLabel)}`, "i"),
        }),
      ).toHaveCount(0);
    }

    await wideMoreDialog.getByRole("button", { name: /cerrar/i }).click();
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(encargoDetailUrl);
  await expectBackLinkVariant(page, "text");
  await expectNoHorizontalOverflow(page);

  const mobileActionBar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });
  const mobileStatusTrigger = mobileActionBar.getByRole("button", {
    name: /^estado/i,
  });
  const mobileTasksTrigger = mobileActionBar.getByRole("button", {
    name: /^tareas/i,
  });
  const mobileFilesTrigger = mobileActionBar.getByRole("button", {
    name: /archivos/i,
  });
  const mobileCommentsDirectTrigger = mobileActionBar.getByRole("button", {
    name: /comentarios/i,
  });
  const mobileHistoryTrigger = mobileActionBar.getByRole("button", {
    name: /historial/i,
  });
  const mobileInformationDirectTrigger = mobileActionBar.getByRole("button", {
    name: /informaci.n/i,
  });
  const mobileMoreTrigger = mobileActionBar.getByRole("button", {
    name: /m.s/i,
  });

  await expect(mobileStatusTrigger).toBeVisible();
  await expect(mobileTasksTrigger).toBeVisible();
  await expect(
    mobileActionBar.getByRole("button", {
      name: /tareas.*tareas completadas/i,
    }),
  ).toBeVisible();
  await expect(mobileFilesTrigger).toBeVisible();
  await expectBadgeInTopRight(mobileFilesTrigger);
  await expect(mobileMoreTrigger).toBeVisible();
  await expect(mobileCommentsDirectTrigger).toHaveCount(0);
  await expect(mobileHistoryTrigger).toHaveCount(0);
  await expect(mobileInformationDirectTrigger).toHaveCount(0);

  await mobileMoreTrigger.focus();
  await page.keyboard.press("Enter");
  const moreDialog = page.getByRole("dialog", { name: /^m.s acciones$/i });
  await expect(moreDialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    moreDialog.getByRole("button", { name: /comentarios/i }),
  ).toBeVisible();
  await expect(
    moreDialog.getByRole("button", { name: /personal/i }),
  ).toBeVisible();
  await expect(
    moreDialog.getByRole("button", { name: /pagos/i }),
  ).toBeVisible();
  await expect(
    moreDialog.getByRole("button", { name: /historial/i }),
  ).toBeVisible();
  await expect(
    moreDialog.getByRole("button", { name: /informaci.n/i }),
  ).toBeVisible();

  await moreDialog.getByRole("button", { name: /informaci.n/i }).click();
  const mobileInformationDialog = page.getByRole("dialog", {
    name: /^informaci.n$/i,
  });
  await expect(
    mobileInformationDialog,
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const backButton = mobileInformationDialog.getByRole("button", {
    name: /volver/i,
  });
  await expect(backButton).toBeVisible();

  await backButton.click();
  await expect(moreDialog).toBeVisible();
  await expect(
    moreDialog.getByRole("button", { name: /informaci.n/i }),
  ).toBeVisible();

  await moreDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(moreDialog).toBeHidden();
  await expect(mobileMoreTrigger).toBeFocused();

  const lastMainContent = page.getByRole("region", {
    name: /archivos recientes/i,
  });

  await expect(
    page.getByRole("heading", { name: /^aportes al pedido$/i }),
  ).toHaveCount(0);
  await lastMainContent.scrollIntoViewIfNeeded();

  const actionBarBox = await mobileActionBar.boundingBox();
  const lastMainContentBox = await lastMainContent.boundingBox();

  expect(actionBarBox).not.toBeNull();
  expect(lastMainContentBox).not.toBeNull();
  expect(
    (lastMainContentBox?.y ?? 0) + (lastMainContentBox?.height ?? 0),
  ).toBeLessThanOrEqual((actionBarBox?.y ?? 0) + 2);

  await page.setViewportSize({ width: 1280, height: 720 });
});

test("pedido access follows current role boundaries", async ({ page }) => {
  test.setTimeout(120_000);

  await loginAs(page, "supervisor");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expect(
    page.getByRole("button", { name: /nuevo pedido/i }),
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

  if (encargoDetailUrl) {
    await page.goto(encargoDetailUrl);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: encargoTitle,
        exact: true,
      }),
    ).toBeVisible();

    const supervisorStatusPanel = await getPedidoStatusPanel(page);
    await expect(supervisorStatusPanel.locator('select[name="status"]'))
      .toHaveCount(0);
    await expect(
      supervisorStatusPanel.getByText(PEDIDO_STATUS_LABELS.listo_entrega).first(),
    ).toBeVisible();

    const supervisorPaymentPanel = await getPedidoPaymentPanel(page);
    await expect(
      supervisorPaymentPanel.getByRole("button", {
        name: /actualizar pago/i,
      }),
    ).toBeVisible();

    const supervisorPersonnelPanel = await openPedidoPanel(
      page,
      /^personal$/i,
      /personal/i,
    );
    const supervisorAssignSelect =
      supervisorPersonnelPanel.getByLabel(/asignar personal/i);

    if (await supervisorAssignSelect.isVisible().catch(() => false)) {
      await expect(supervisorAssignSelect).toBeVisible();
    } else {
      await expect(
        supervisorPersonnelPanel.getByText(
          /no hay m.s usuarios disponibles para asignar/i,
        ),
      ).toBeVisible();
    }
  }

  await loginAs(page, "worker");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expect(
    page.getByRole("button", { name: /nuevo pedido/i }),
  ).toHaveCount(0);
  await expect(page.getByText(/no tienes permiso para ver clientes/i))
    .toHaveCount(0);
  await expect(page.getByText(/no se pudieron cargar los clientes/i))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: /reintentar/i })).toHaveCount(
    0,
  );

  await page.goto("/dashboard/pedidos/nuevo");
  await expect(
    page.getByText(/no encontramos este recurso interno/i),
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
    await expect(
      page.getByRole("heading", { name: /^trabajo solicitado$/i }),
    ).toBeVisible();
    await expectNoTechnicalLeakText(page);

    const workerTasksPanel = await getPedidoTasksPanel(page);
    await expect(
      workerTasksPanel.getByRole("heading", {
        name: /^tareas registradas$/i,
      }),
    ).toBeVisible();

    const workerFilesPanel = await openPedidoPanel(
      page,
      /^archivos$/i,
      /archivos/i,
    );
    await expect(
      workerFilesPanel.getByRole("heading", {
        name: /^archivos asociados$/i,
      }),
    ).toBeVisible();

    const workerCommentsPanel = await openPedidoPanel(
      page,
      /^comentarios$/i,
      /comentarios/i,
    );
    await expect(
      workerCommentsPanel.getByRole("textbox", { name: /^comentario$/i }),
    ).toBeVisible();

    const workerPersonnelPanel = await openPedidoPanel(
      page,
      /^personal$/i,
      /personal/i,
    );
    await expect(
      workerPersonnelPanel.getByLabel(/asignar personal/i),
    ).toHaveCount(0);
    await expect(
      workerPersonnelPanel.getByRole("button", { name: /quitar/i }),
    ).toHaveCount(0);

    const workerPaymentPanel = await getPedidoPaymentPanel(page);
    await expect(
      workerPaymentPanel.getByRole("button", {
        name: /actualizar pago/i,
      }),
    ).toHaveCount(0);

    const workerHistoryPanel = await openPedidoPanel(
      page,
      /^historial$/i,
      /historial/i,
    );
    await expect(workerHistoryPanel.getByText(/pedido/i).first())
      .toBeVisible();
    await expectNoTechnicalLeakText(page);
  }

  if (impresionDetailUrl) {
    await page.goto(impresionDetailUrl);
    await expect(page.getByText(/404|no encontramos|no tienes acceso/i))
      .toBeVisible();
  } else if (encargoDetailUrl) {
    await page.goto(encargoDetailUrl);
    await expect(page.getByText(/404|no encontramos|no tienes acceso/i))
      .toBeVisible();
  }
});

test("pedido delivered header shows actual delivery date", async ({ page }) => {
  test.setTimeout(120_000);

  test.skip(
    !impresionDetailUrl,
    "The focal impresion pedido was not created.",
  );

  await loginAs(page, "admin");
  await page.goto(impresionDetailUrl);
  await expectCompactPedidoHeader(page, impresionTitle);

  await updatePedidoStatus(page, "en_revision");
  await updatePedidoStatus(page, "en_produccion");
  await updatePedidoStatus(page, "listo_entrega");
  await updatePayment(page, "300", "0");
  await updatePedidoStatus(page, "entregado");

  const header = getPedidoHeader(page);

  await expectCompactPedidoHeader(
    page,
    impresionTitle,
    /fecha de entrega:/i,
  );
  await expect(header.getByText(/entrega estimada:/i)).toHaveCount(0);
});
