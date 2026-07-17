import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const futureDate = getFutureDateInputValue(30);
const templateName = `QA Template ${runId}`;
const templateDescription = `Plantilla QA creada por Playwright ${runId}`;
const editedTemplateDescription = `Plantilla QA editada por Playwright ${runId}`;
const simpleTaskTitle = `Disenar arte final QA ${runLabel}`;
const editedTaskTitle = `Disenar arte final aprobado QA ${runLabel}`;
const quantifiedTaskTitle = `Imprimir 10 hojas QA ${runLabel}`;

function getTaskItem(page: Page, title: string) {
  return page.locator("li").filter({ hasText: title }).first();
}

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

async function isBefore(first: Locator, second: Locator) {
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
  return isBefore;
}

async function expectBefore(first: Locator, second: Locator) {
  await expect
    .poll(() => isBefore(first, second), { timeout: 15_000 })
    .toBe(true);
}

async function openPedidoPanel(
  page: Page,
  name: RegExp,
  triggerName = name,
): Promise<Locator> {
  const openDialog = page.getByRole("dialog");

  if ((await openDialog.count()) > 0) {
    const closeButton = openDialog.getByRole("button", { name: /cerrar/i });

    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await expect(openDialog).toBeHidden();
    }
  }

  await clickFirstVisible(page.getByRole("button", { name: triggerName }));

  const dialog = page.getByRole("dialog", { name });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

async function getPedidoTaskItem(page: Page, title: string) {
  return (await openPedidoPanel(page, /^tareas$/i, /tareas/i))
    .locator("li")
    .filter({ hasText: title })
    .first();
}

async function expectConfigurationHubLoaded(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/configuracion/);
  await expect(
    page.getByRole("heading", { name: /configuraci.n/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /usuarios/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /plantillas/i })).toBeVisible();
  await expectNoVisibleSensitiveText(page);
}

async function expectTemplatesListingLoaded(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/plantillas/);
  await expect(
    page.getByRole("heading", { name: /^plantillas$/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/buscar plantillas/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /nueva plantilla/i }),
  ).toBeVisible();
  await expect(page.getByText(/^acción$/i)).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /gestionar tareas/i }),
  ).toHaveCount(0);
  await expectNoVisibleSensitiveText(page);
}

async function createManualPedido(
  page: Page,
  workflow: "encargo" | "impresion",
  title: string,
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
    await dialog.getByLabel(/observaciones/i).fill(`QA impresion ${runId}`);
  } else {
    await dialog.getByRole("tab", { name: /encargo/i }).click();
    await dialog
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Pedido QA para aplicar plantilla ${runId}`);
  }

  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill("750");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
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
}

async function selectTaskTemplate(page: Page, name: string) {
  const select = page.getByLabel(/seleccionar plantilla/i);
  const templateId = await select.evaluate((element, templateNameToFind) => {
    const htmlSelect = element as HTMLSelectElement;
    const option = Array.from(htmlSelect.options).find((candidate) =>
      candidate.textContent?.includes(templateNameToFind),
    );

    return option?.value ?? "";
  }, name);

  expect(templateId, `template option for ${name} should exist`).toBeTruthy();
  await select.selectOption(templateId);
}

test("admin can access configuration and non-admin roles are blocked", async ({
  page,
}) => {
  await loginAs(page, "admin");
  await page.goto("/dashboard/configuracion");
  await expectConfigurationHubLoaded(page);

  await loginAs(page, "supervisor");
  await page.goto("/dashboard/configuracion");
  await expectAccessLimitedPage(page);

  await loginAs(page, "worker");
  await page.goto("/dashboard/configuracion");
  await expectAccessLimitedPage(page);
});

test("admin can create and manage a task template", async ({ page }) => {
  test.setTimeout(180_000);

  await loginAs(page, "admin");
  await page.goto("/dashboard/configuracion");
  await expectConfigurationHubLoaded(page);

  await page.getByRole("link", { name: /plantillas/i }).click();
  await expectTemplatesListingLoaded(page);

  await page.getByRole("button", { name: /nueva plantilla/i }).click();
  const createDialog = page.getByRole("dialog", { name: /nueva plantilla/i });

  await expect(createDialog).toBeVisible();

  await createDialog.getByRole("textbox", { name: /^nombre$/i }).fill(templateName);
  await createDialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill(templateDescription);
  await createDialog.getByRole("button", { name: /crear plantilla/i }).click();
  await expect(createDialog).toBeHidden({ timeout: 15_000 });
  await expectTemplatesListingLoaded(page);

  await page.getByLabel(/buscar plantillas/i).fill(templateName);
  await page.getByLabel(/buscar plantillas/i).press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/plantillas\?q=/);
  await expect(
    page.getByRole("link", { name: new RegExp(templateName, "i") }),
  ).toBeVisible();

  await page.goto("/dashboard/configuracion/plantillas");
  await expectTemplatesListingLoaded(page);

  await page
    .getByRole("link", {
      name: new RegExp(`abrir plantilla ${templateName}`, "i"),
    })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/plantillas\/[^/]+$/);
  await expect(
    page.getByRole("heading", { name: templateName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/configuraci.n \/ plantillas de tareas/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /editar plantilla/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /tareas de la plantilla/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /nueva tarea/i }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /registro/i })).toBeVisible();

  await page.getByRole("button", { name: /editar plantilla/i }).click();
  let editDialog = page.getByRole("dialog", { name: /editar plantilla/i });

  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel(/descripci.n/i).fill(editedTemplateDescription);
  await editDialog.getByRole("combobox", { name: /estado/i }).selectOption("false");
  await editDialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(editedTemplateDescription)).toBeVisible();
  await expect(page.getByText(/^inactiva$/i).first()).toBeVisible();

  await page.getByRole("button", { name: /editar plantilla/i }).click();
  editDialog = page.getByRole("dialog", { name: /editar plantilla/i });
  await editDialog.getByRole("combobox", { name: /estado/i }).selectOption("true");
  await editDialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/^activa$/i).first()).toBeVisible();
  await expect(page.getByText(editedTemplateDescription)).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.getByLabel(/nueva tarea/i).fill(simpleTaskTitle);
  await page.getByRole("button", { name: /^agregar$/i }).click();
  await expect(
    page.getByText(/tarea agregada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(simpleTaskTitle)).toBeVisible();

  await page.getByLabel(/nueva tarea/i).fill(quantifiedTaskTitle);
  await page.getByRole("button", { name: /^agregar$/i }).click();
  await expect(page.getByText(/tarea agregada correctamente/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible();
  await expect(page.getByText(/cuantificada/i)).toHaveCount(0);

  await getTaskItem(page, quantifiedTaskTitle)
    .getByRole("button", { name: /subir tarea/i })
    .click();
  await expect(page.getByText(simpleTaskTitle)).toBeVisible();
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible();
  await expectBefore(
    getTaskItem(page, quantifiedTaskTitle),
    getTaskItem(page, simpleTaskTitle),
  );

  const simpleTask = getTaskItem(page, simpleTaskTitle);
  await simpleTask
    .getByRole("button", {
      name: new RegExp(`editar tarea ${simpleTaskTitle}`, "i"),
    })
    .click();
  await simpleTask.getByLabel(/editar tarea/i).fill(editedTaskTitle);
  await simpleTask.getByRole("button", { name: /guardar tarea/i }).click();
  await expect(page.getByText(editedTaskTitle)).toBeVisible({
    timeout: 15_000,
  });

  await getTaskItem(page, editedTaskTitle)
    .getByRole("button", {
      name: new RegExp(`eliminar tarea ${editedTaskTitle}`, "i"),
    })
    .click();
  await expect(page.getByText(editedTaskTitle)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible();

  const currentWorkspaceUrl = page.url();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(currentWorkspaceUrl);
  await expect(
    page.getByRole("heading", { name: /tareas de la plantilla/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /nueva tarea/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /editar tarea/i }).first(),
  ).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
  await expectNoVisibleSensitiveText(page);
});

test("admin can apply a template to encargo and impresion has no selector", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await loginAs(page, "admin");

  await createManualPedido(
    page,
    "encargo",
    `QA Pedido Template Encargo ${runId}`,
  );
  const tasksPanel = await openPedidoPanel(page, /^tareas$/i, /tareas/i);
  const templateHeading = tasksPanel.getByRole("heading", {
    name: /cargar tareas predeterminadas/i,
  });
  const registeredTasksHeading = tasksPanel.getByRole("heading", {
    name: /^tareas registradas$/i,
  });
  const newTaskHeading = tasksPanel.getByRole("heading", {
    name: /^nueva tarea$/i,
  });

  await expect(
    tasksPanel.getByText(/escribe cada paso del trabajo/i),
  ).toHaveCount(0);
  await expect(tasksPanel.getByText(/dise.ar el logo/i)).toHaveCount(0);
  await expect(tasksPanel.getByText(/imprimir 40 p.ginas/i)).toHaveCount(0);
  await expect(tasksPanel.getByText(/encuadernar 2 libretas/i)).toHaveCount(0);
  await expect(templateHeading).toBeVisible();
  await expect(
    tasksPanel.getByText(/las tareas de la plantilla se agregar.n al final/i),
  ).toHaveCount(0);
  await expect(
    tasksPanel.locator('label[for="task-template-id"]'),
  ).toBeVisible();
  await expect(tasksPanel.getByLabel(/seleccionar plantilla/i)).toBeVisible();
  await expect(
    tasksPanel.getByText(/si aplicas la misma plantilla/i),
  ).toHaveCount(0);
  await expect(registeredTasksHeading).toBeVisible();
  await expect(newTaskHeading).toBeVisible();
  await expectBefore(templateHeading, newTaskHeading);
  await expectBefore(newTaskHeading, registeredTasksHeading);
  await expect(tasksPanel.getByText(/progreso:/i)).toBeVisible();
  await selectTaskTemplate(page, templateName);
  await page.getByRole("button", { name: /aplicar plantilla/i }).click();
  await expect(tasksPanel).toBeVisible();
  await expect(
    tasksPanel.getByText(/se agreg. 1 tarea desde la plantilla/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(tasksPanel.getByText(quantifiedTaskTitle)).toBeVisible({
    timeout: 15_000,
  });
  await expectBefore(newTaskHeading, registeredTasksHeading);
  await page.reload();
  const copiedTask = await getPedidoTaskItem(page, quantifiedTaskTitle);
  await expect(copiedTask).toBeVisible();

  await createManualPedido(
    page,
    "impresion",
    `QA Pedido Template Impresion ${runId}`,
  );
  await expect(
    page.getByText(/flujo directo de impresi.n|este tipo de pedido no requiere tareas/i),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /descripci.n y especificaciones/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /archivos recientes/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^tareas/i })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /cargar tareas predeterminadas/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /aplicar plantilla/i }),
  ).toHaveCount(0);
});
