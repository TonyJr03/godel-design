import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectNoPublicSensitiveText,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const qaServiceName = `QA Público ${runLabel}`;
const qaServiceDescription = `Servicio público QA ${runId}`;

function getQaClientName(suffix: string) {
  return `Cliente QA ${suffix} ${runLabel}`;
}

async function getPublicReference(page: Page) {
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/GD-[A-Z0-9]{4}-[A-Z0-9]{4}/);

  expect(match, "Expected public reference in success state").not.toBeNull();

  return match?.[0] ?? "";
}

function getEncargoServiceSelect(page: Page) {
  return page.locator('select[name="service_id"]').first();
}

function getServiceIdControls(page: Page) {
  return page.locator('[name="service_id"]');
}

async function getServiceOptionValue(page: Page, serviceName: string) {
  const value = await getEncargoServiceSelect(page).evaluate(
    (selectElement, expectedServiceName) => {
      const select = selectElement as HTMLSelectElement;
      const option = Array.from(select.options).find(
        (candidate) => candidate.textContent?.trim() === expectedServiceName,
      );

      return option?.value ?? "";
    },
    serviceName,
  );

  expect(value, `Expected option value for ${serviceName}`).not.toBe("");

  return value;
}

async function fillContact(page: Page, suffix: string) {
  await page
    .getByLabel(/nombre del cliente/i)
    .fill(getQaClientName(suffix));
  await page.getByLabel(/tel.fono/i).fill(`555${runId.slice(-6)}`);
  await page
    .getByLabel(/correo electr.nico/i)
    .fill(`cliente-${suffix}-${runId}@example.com`);
}

async function submitEncargo(page: Page, serviceName = "Diseño gráfico") {
  await page.goto("/solicitud");
  await expectPublicCatalogLoaded(page);
  await fillContact(page, "encargo");
  await getEncargoServiceSelect(page).selectOption({
    label: serviceName,
  });
  await page
    .getByLabel(/descripci.n del trabajo/i)
    .fill(`Encargo público dinámico ${runId}`);
  await page.getByLabel(/observaciones adicionales/i).fill("Sin urgencia.");
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(
    page.getByText(/solicitud enviada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });

  return getPublicReference(page);
}

async function submitImpresion(page: Page) {
  await page.goto("/solicitud");
  await expectPublicCatalogLoaded(page);
  await page.getByRole("tab", { name: /impresi.n/i }).click();
  await fillContact(page, "impresion");
  await page.getByLabel(/cantidad de copias/i).fill("3");
  await page.getByLabel(/modo de color/i).selectOption("color");
  await page.getByLabel(/tama.o de papel/i).selectOption("carta");
  await page.getByLabel(/caras/i).selectOption("una_cara");
  await page.getByLabel(/observaciones/i).fill("Impresión QA con archivo.");
  await page.getByLabel(/seleccionar documento/i).setInputFiles({
    name: `impresion-${runId}.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% QA\n1 0 obj\n<<>>\nendobj\n%%EOF"),
  });
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(
    page.getByText(/solicitud enviada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/archivos recibidos:\s*1/i)).toBeVisible();

  return getPublicReference(page);
}

async function expectPublicCatalogLoaded(page: Page) {
  await expect(page).toHaveURL(/\/solicitud/);
  await expect(
    page.getByRole("heading", { name: /qu. necesitas preparar/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/nombre del cliente/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /enviar solicitud/i }),
  ).toBeVisible();
  await expectNoPublicSensitiveText(page);
}

function getAdminServiceRow(page: Page, serviceName: string) {
  return page.locator("tr").filter({ hasText: serviceName }).first();
}

async function openServicesAdmin(page: Page, query?: string) {
  const target = query
    ? `/dashboard/configuracion/servicios?q=${encodeURIComponent(query)}`
    : "/dashboard/configuracion/servicios";

  await page.goto(target);
  await expect(
    page.getByRole("heading", { name: /^servicios$/i }),
  ).toBeVisible();
}

async function createPublicQaService(page: Page) {
  await openServicesAdmin(page);
  await page.getByRole("button", { name: /nuevo servicio/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo servicio/i });

  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: /^nombre$/i }).fill(qaServiceName);
  await dialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill(qaServiceDescription);
  await dialog
    .getByRole("combobox", { name: /disponibilidad p.blica/i })
    .selectOption("true");
  await dialog.getByRole("button", { name: /crear servicio/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await openServicesAdmin(page, qaServiceName);
  await expect(getAdminServiceRow(page, qaServiceName)).toBeVisible();
}

async function setAdminServiceAvailability(
  page: Page,
  serviceName: string,
  isPubliclyAvailable: boolean,
) {
  await openServicesAdmin(page, serviceName);
  const row = getAdminServiceRow(page, serviceName);

  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /editar servicio/i }).click();
  const dialog = page.getByRole("dialog", { name: /editar servicio/i });

  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("combobox", { name: /disponibilidad p.blica/i })
    .selectOption(isPubliclyAvailable ? "true" : "false");
  await dialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(
    getAdminServiceRow(page, serviceName).getByText(
      isPubliclyAvailable ? /^disponible$/i : /^oculto$/i,
    ),
  ).toBeVisible();
}

async function ensureRequiredPublicServices(page: Page) {
  await loginAs(page, "admin");

  for (const serviceName of [
    "Diseño gráfico",
    "Personalización",
    "Rotulación",
    "Otro",
    "Impresión",
  ]) {
    await setAdminServiceAvailability(page, serviceName, true);
  }
}

async function expectInternalSolicitud(
  page: Page,
  query: string,
  expectedService: string,
  expectedWorkflow: RegExp,
) {
  await loginAs(page, "admin");
  await page.goto(`/dashboard/solicitudes?q=${encodeURIComponent(query)}`);
  await expect(
    page.getByRole("heading", { name: /^solicitudes$/i }),
  ).toBeVisible();
  const row = page
    .locator("tr")
    .filter({ hasText: query })
    .filter({ hasText: expectedService })
    .first();

  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(
    row.locator("span").filter({ hasText: expectedWorkflow }),
  ).toBeVisible();
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

test("public solicitud form renders the dynamic catalog", async ({ page }) => {
  await ensureRequiredPublicServices(page);
  await page.goto("/solicitud");
  await expectPublicCatalogLoaded(page);
  await expect(
    page.getByRole("tab", { name: /encargo personalizado/i }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /impresi.n/i })).toBeVisible();
  await expect(getEncargoServiceSelect(page)).toBeVisible();
  await expect(getServiceIdControls(page)).toHaveCount(1);

  for (const service of [
    "Diseño gráfico",
    "Personalización",
    "Rotulación",
    "Otro",
  ]) {
    await expect(getEncargoServiceSelect(page)).toContainText(service);
  }

  await getEncargoServiceSelect(page).selectOption({
    label: "Personalización",
  });
  const selectedEncargoServiceId = await getServiceOptionValue(
    page,
    "Personalización",
  );

  await expect(getEncargoServiceSelect(page)).toHaveValue(
    selectedEncargoServiceId,
  );
  await expect(
    page.getByText(
      "Personalización de agendas, tazas, libretas y otros artículos.",
    ),
  ).toHaveCount(0);

  await page.getByRole("tab", { name: /impresi.n/i }).click();
  await expect(getServiceIdControls(page)).toHaveCount(1);
  await expect(getServiceIdControls(page).first()).toHaveAttribute(
    "type",
    "hidden",
  );
  await expect(
    page.getByText(
      "Impresión de documentos y materiales proporcionados por el cliente.",
    ),
  ).toHaveCount(0);

  const printServiceId = await getServiceIdControls(page)
    .first()
    .inputValue();

  expect(printServiceId).not.toBe("");
  expect(printServiceId).not.toBe(selectedEncargoServiceId);
  await page.getByRole("tab", { name: /encargo personalizado/i }).click();
  await expect(getServiceIdControls(page)).toHaveCount(1);
  await expect(
    getEncargoServiceSelect(page),
  ).toHaveValue(selectedEncargoServiceId);
});

test("public encargo submit stores the selected catalog service", async ({
  page,
}) => {
  await submitEncargo(page, "Diseño gráfico");

  await expectInternalSolicitud(
    page,
    getQaClientName("encargo"),
    "Diseño gráfico",
    /^encargo$/i,
  );
});

test("public impresion requires and uploads a file", async ({ page }) => {
  await page.goto("/solicitud");
  await expectPublicCatalogLoaded(page);
  await page.getByRole("tab", { name: /impresi.n/i }).click();
  await fillContact(page, "sin-archivo");
  await page.getByLabel(/cantidad de copias/i).fill("2");
  await page.getByLabel(/modo de color/i).selectOption("blanco_negro");
  await page.getByLabel(/tama.o de papel/i).selectOption("a4");
  await page.getByLabel(/caras/i).selectOption("doble_cara");
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(
    page.getByText(/debes adjuntar el documento a imprimir/i),
  ).toBeVisible({ timeout: 15_000 });

  await submitImpresion(page);

  await expectInternalSolicitud(
    page,
    getQaClientName("impresion"),
    "Impresión",
    /^impresi.n$/i,
  );
});

test("hidden service disappears publicly and concurrent submit is rejected", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");
  await createPublicQaService(page);

  await page.goto("/solicitud");
  await expectPublicCatalogLoaded(page);
  await expect(getEncargoServiceSelect(page)).toContainText(qaServiceName);
  const hiddenServiceId = await getServiceOptionValue(page, qaServiceName);

  await fillContact(page, "oculto");
  await getEncargoServiceSelect(page).selectOption(hiddenServiceId);
  await page
    .getByLabel(/descripci.n del trabajo/i)
    .fill("Intento concurrente con servicio oculto.");
  await page.locator("form").evaluate((formElement) => {
    const workflowInput = document.createElement("input");

    workflowInput.type = "hidden";
    workflowInput.name = "workflow_type";
    workflowInput.value = "impresion";
    formElement.prepend(workflowInput);
  });

  const adminPage = await page.context().newPage();

  await setAdminServiceAvailability(adminPage, qaServiceName, false);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(
    page.locator("#service_id-error"),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#service_id-error")).toContainText(
    /servicio seleccionado ya no est. disponible/i,
  );
  await expect(page.getByText(/c.digo de seguimiento/i)).toHaveCount(0);
  await expectNoPublicSensitiveText(page);
  await expect(getEncargoServiceSelect(page)).not.toContainText(qaServiceName);
  await expect(getEncargoServiceSelect(page)).not.toHaveValue(hiddenServiceId);

  const reconciledServiceId = await getEncargoServiceSelect(page).inputValue();

  expect(reconciledServiceId).not.toBe("");
  await adminPage.goto(
    `/dashboard/solicitudes?q=${encodeURIComponent(getQaClientName("oculto"))}`,
  );
  await expect(
    adminPage.getByRole("heading", { name: /^solicitudes$/i }),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("heading", {
      name: /no encontramos solicitudes con estos filtros/i,
    }),
  ).toBeVisible();
  await adminPage.close();
});

test("manipulated workflow_type does not alter the resolved service", async ({
  page,
}) => {
  await page.goto("/solicitud");
  await expectPublicCatalogLoaded(page);
  await fillContact(page, "manipulado");
  await getEncargoServiceSelect(page).selectOption({
    label: "Otro",
  });
  await page
    .getByLabel(/descripci.n del trabajo/i)
    .fill("Encargo con campos manipulados ignorados.");
  await page.locator("form").evaluate((formElement) => {
    const workflowInput = document.createElement("input");

    workflowInput.type = "hidden";
    workflowInput.name = "workflow_type";
    workflowInput.value = "impresion";
    formElement.prepend(workflowInput);
  });
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(
    page.getByText(/solicitud enviada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await getPublicReference(page);

  await expectInternalSolicitud(
    page,
    getQaClientName("manipulado"),
    "Otro",
    /^encargo$/i,
  );
});

test("authenticated visitor sees public services", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/solicitud");
  await expectPublicCatalogLoaded(page);
  await expect(getEncargoServiceSelect(page)).toContainText("Diseño gráfico");
  await expect(page.getByRole("tab", { name: /impresi.n/i })).toBeVisible();
  await expectNoVisibleSensitiveText(page);
});

test("impresion availability can be hidden and restored safely", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");

  try {
    await setAdminServiceAvailability(page, "Impresión", false);
    await page.goto("/solicitud");
    await expectPublicCatalogLoaded(page);
    await expect(
      page.getByRole("tab", { name: /impresi.n/i }),
    ).toHaveCount(0);
    await expect(getEncargoServiceSelect(page)).toContainText("Diseño gráfico");
  } finally {
    await setAdminServiceAvailability(page, "Impresión", true);
  }

  await page.goto("/solicitud");
  await expectPublicCatalogLoaded(page);
  await clickFirstVisible(page.getByRole("tab", { name: /impresi.n/i }));
  await expect(getServiceIdControls(page)).toHaveCount(1);
  await expect(getServiceIdControls(page).first()).toHaveAttribute(
    "type",
    "hidden",
  );
});
