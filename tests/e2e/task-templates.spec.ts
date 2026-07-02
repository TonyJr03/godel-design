import { expect, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";

test.describe.configure({ mode: "serial" });

const runId = new Date()
  .toISOString()
  .replace(/\D/g, "")
  .slice(0, 14);
const runLabel = runId.replace(
  /\d/g,
  (digit) => "abcdefghij"[Number(digit)] ?? "x",
);
const futureDate = getFutureDateInputValue(30);
const templateName = `QA Template ${runId}`;
const templateDescription = `Plantilla QA creada por Playwright ${runId}`;
const editedTemplateDescription = `Plantilla QA editada por Playwright ${runId}`;
const simpleTaskTitle = `Disenar arte final QA ${runLabel}`;
const editedTaskTitle = `Disenar arte final aprobado QA ${runLabel}`;
const quantifiedTaskTitle = `Imprimir 10 hojas QA ${runLabel}`;

function getTemplateCard(page: Page, name = templateName) {
  return page.locator("article").filter({ hasText: name }).first();
}

function getTaskItem(page: Page, title: string) {
  return page.locator("li").filter({ hasText: title }).first();
}

async function expectConfigurationLoaded(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/configuracion/);
  await expect(
    page.getByRole("heading", { name: /configuraci.n/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^plantillas de tareas$/i }),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);
}

async function createManualPedido(
  page: Page,
  workflow: "encargo" | "impresion",
  title: string,
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
    await page.getByLabel(/observaciones/i).fill(`QA impresion ${runId}`);
  } else {
    await page.getByRole("tab", { name: /encargo/i }).click();
    await page
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Pedido QA para aplicar plantilla ${runId}`);
  }

  await page.getByLabel(/prioridad/i).selectOption("normal");
  await page.getByLabel(/fecha estimada de entrega/i).fill(futureDate);
  await page.getByLabel(/monto total a pagar/i).fill("750");
  await page.getByLabel(/t.tulo del trabajo/i).fill(title);
  await page.getByRole("button", { name: /crear pedido/i }).click();
  await expect(page.getByText(/pedido creado correctamente/i)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole("link", { name: /ver detalle del pedido/i }).click();
  await expect(
    page.getByRole("heading", { name: /detalle del pedido/i }),
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
  await expectConfigurationLoaded(page);

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
  await expectConfigurationLoaded(page);

  await page.getByRole("textbox", { name: /^nombre$/i }).fill(templateName);
  await page
    .getByRole("textbox", { name: /descripci.n/i })
    .fill(templateDescription);
  await page.getByRole("button", { name: /crear plantilla/i }).click();
  await expect(
    page.getByText(/plantilla creada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });

  let templateCard = getTemplateCard(page);
  await expect(templateCard).toBeVisible();
  await expect(
    templateCard.locator("p").filter({ hasText: templateDescription }),
  ).toBeVisible();

  await templateCard.getByText(/^editar$/i).click();
  await templateCard.getByLabel(/descripci.n/i).fill(editedTemplateDescription);
  await templateCard
    .getByRole("button", { name: /guardar cambios/i })
    .click();
  await expect(
    templateCard.getByText(/plantilla actualizada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });

  await templateCard.getByRole("button", { name: /desactivar/i }).click();
  await expect(
    templateCard.getByText(/plantilla desactivada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();

  templateCard = getTemplateCard(page);
  await expect(
    templateCard.getByRole("button", { name: /activar/i }),
  ).toBeVisible();
  await templateCard.getByRole("button", { name: /activar/i }).click();
  await expect(
    templateCard.getByText(/plantilla activada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });

  await getTemplateCard(page)
    .getByRole("link", { name: /gestionar tareas/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /tareas de la plantilla/i }),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.getByLabel(/nueva tarea/i).fill(simpleTaskTitle);
  await page.getByRole("button", { name: /agregar tarea/i }).click();
  await expect(page.getByText(/tarea agregada correctamente/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(simpleTaskTitle)).toBeVisible();

  await page.getByLabel(/nueva tarea/i).fill(quantifiedTaskTitle);
  await page.getByRole("button", { name: /agregar tarea/i }).click();
  await expect(page.getByText(/tarea agregada correctamente/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible();
  await expect(page.getByText(/cuantificada/i).first()).toBeVisible();

  await getTaskItem(page, quantifiedTaskTitle)
    .getByRole("button", { name: /subir/i })
    .click();
  await expect(page.getByText(/orden actualizado correctamente/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(simpleTaskTitle)).toBeVisible();
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible();

  const simpleTask = getTaskItem(page, simpleTaskTitle);
  await simpleTask.getByText(/^editar$/i).click();
  await simpleTask.getByLabel(/editar tarea/i).fill(editedTaskTitle);
  await simpleTask.getByRole("button", { name: /guardar tarea/i }).click();
  await expect(page.getByText(/tarea actualizada correctamente/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(editedTaskTitle)).toBeVisible();

  await getTaskItem(page, editedTaskTitle)
    .getByRole("button", { name: /eliminar/i })
    .click();
  await expect(page.getByText(editedTaskTitle)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible();
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
  await expect(
    page.getByRole("heading", { name: /cargar tareas predeterminadas/i }),
  ).toBeVisible();
  await selectTaskTemplate(page, templateName);
  await page.getByRole("button", { name: /aplicar plantilla/i }).click();
  await expect(
    page.getByText(/se agreg. 1 tarea desde la plantilla/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(getTaskItem(page, quantifiedTaskTitle)).toBeVisible();

  await createManualPedido(
    page,
    "impresion",
    `QA Pedido Template Impresion ${runId}`,
  );
  await expect(page.getByText(/no requiere tareas/i)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /cargar tareas predeterminadas/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /aplicar plantilla/i }),
  ).toHaveCount(0);
});
