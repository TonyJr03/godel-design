import { expect, type Locator, type Page, test } from "@playwright/test";

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
const workspaceCommentText = `QA comentario workspace ${runLabel}`;

async function clickFirstVisible(locator: Locator) {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);

    if (await candidate.isVisible().catch(() => false)) {
      await candidate.click();
      return;
    }
  }

  throw new Error("No visible element found for locator.");
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
  return openPedidoPanel(page, /^pagos$/i);
}

async function getPedidoStatusPanel(page: Page) {
  return openPedidoPanel(page, /^estado$/i);
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
  const section = await getPedidoStatusPanel(page);
  const statusLabels: Record<string, RegExp> = {
    creado: /estado actual:\s*creado/i,
    en_revision: /estado actual:\s*en revisi.n/i,
    en_produccion: /estado actual:\s*en producci.n/i,
    listo_entrega: /estado actual:\s*listo para entrega/i,
    entregado: /estado actual:\s*entregado/i,
  };

  await section.getByLabel(/^estado$/i).selectOption(status);
  await section.getByRole("button", { name: /actualizar estado/i }).click();
  await expect(section).toBeVisible();
  await expect(section.getByText(statusLabels[status])).toBeVisible({
    timeout: 15_000,
  });
  await page.reload();
}

async function expectPedidoStatusBlocked(page: Page, status: string) {
  const section = await getPedidoStatusPanel(page);
  const option = section.locator(
    `option[value="${status}"]`,
  );

  if ((await option.count()) === 0) {
    return;
  }

  await expect(option).toBeDisabled();
}

async function createQuantifiedTask(page: Page) {
  const taskSection = await getPedidoTasksPanel(page);

  await taskSection.getByLabel(/nueva tarea/i).fill(quantifiedTaskTitle);
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
  const section = await openPedidoPanel(page, /^personal$/i);
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
    page.getByRole("link", { name: /nuevo pedido/i }),
  ).toBeVisible();

  encargoDetailUrl = await createManualPedido(
    page,
    "encargo",
    encargoTitle,
    "500",
  );

  const reviewStatusCta = page.getByRole("button", {
    name: /revisar estado/i,
  });
  await expect(reviewStatusCta).toBeVisible();
  await reviewStatusCta.click();
  await expect(
    page.getByRole("dialog", { name: /^estado$/i }).getByText(/debe revisarse/i),
  ).toBeVisible();
  await updatePedidoStatus(page, "en_revision");

  const createTasksCta = page.getByRole("button", { name: /crear tareas/i });
  await expect(createTasksCta).toBeVisible();
  await createTasksCta.click();
  await expect(page.getByRole("dialog", { name: /^tareas$/i })).toBeVisible();

  await expectPedidoStatusBlocked(page, "en_produccion");
  await createQuantifiedTask(page);
  await updatePedidoStatus(page, "en_produccion");

  const updateTasksCta = page.getByRole("button", {
    name: /actualizar tareas/i,
  });
  await expect(updateTasksCta).toBeVisible();
  await updateTasksCta.click();
  await expect(page.getByRole("dialog", { name: /^tareas$/i })).toBeVisible();

  await expectPedidoStatusBlocked(page, "listo_entrega");
  await completeQuantifiedTask(page);
  await updatePedidoStatus(page, "listo_entrega");

  const reviewPaymentCta = page.getByRole("button", { name: /revisar pago/i });
  await expect(reviewPaymentCta).toBeVisible();
  await reviewPaymentCta.click();
  await expect(
    page.getByRole("dialog", { name: /^pagos$/i }).getByText(/^sin pagar$/i),
  ).toBeVisible();

  await updatePayment(page, "250", "0");
  await expect(
    (await getPedidoPaymentPanel(page)).getByText(/^pago parcial$/i),
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
  await expect(page.getByRole("button", { name: /revisar estado/i }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: /^tareas/i })).toHaveCount(0);
  const printStatusPanel = await openPedidoPanel(page, /^estado$/i);
  await expect(
    printStatusPanel.getByText(
      /este pedido es de impresi.n directa y no requiere tareas/i,
    ),
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

  const desktopRail = page.getByRole("complementary", {
    name: /acciones del workspace/i,
  });
  await expect(
    desktopRail.getByRole("button", { name: /^estado/i }),
  ).toBeVisible();
  await expect(
    desktopRail.getByRole("button", { name: /^tareas/i }),
  ).toBeVisible();
  await expect(
    desktopRail.getByRole("button", { name: /archivos/i }),
  ).toBeVisible();
  await expect(
    desktopRail.getByRole("button", { name: /comentarios/i }),
  ).toBeVisible();
  await expect(
    desktopRail.getByRole("button", { name: /informaci.n/i }),
  ).toBeVisible();
  await expect(
    desktopRail.getByRole("button", { name: /personal/i }),
  ).toBeVisible();
  await expect(
    desktopRail.getByRole("button", { name: /pagos/i }),
  ).toBeVisible();
  await expect(
    desktopRail.getByRole("button", { name: /m.s/i }),
  ).toHaveCount(0);

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
  ).toBeVisible();
  await expect(
    commentsDialog.getByRole("heading", { name: /^conversaci.n interna$/i }),
  ).toBeVisible();

  await commentsDialog
    .getByRole("textbox", { name: /^comentario$/i })
    .fill(workspaceCommentText);
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
  ).toBeVisible();
  await expect(
    filesDialog.getByRole("heading", { name: /^archivos asociados$/i }),
  ).toBeVisible();

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
  await expect(mobileFilesTrigger).toBeVisible();
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
