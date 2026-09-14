import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import {
  createQaRunId,
  createQaRunLabel,
  createUnlikelyQaQuery,
} from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const serviceName = `QA Servicio ${runLabel}`;
const serviceDescription = `Servicio QA creado por Playwright ${runId}`;
const editedServiceDescription = `Servicio QA editado por Playwright ${runId}`;

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
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

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(40);
}

function getToolbar(page: Page) {
  return page.getByRole("region", { name: /b.squeda y filtros/i }).first();
}

function getPagination(page: Page) {
  return page.getByRole("navigation", {
    name: /paginaci.n de servicios/i,
  });
}

function getAvailabilitySelect(page: Page) {
  return getToolbar(page).locator('select[id$="-filter-availability"]').first();
}

async function openFilters(page: Page) {
  const toolbar = getToolbar(page);
  const filtersButton = toolbar.getByRole("button", { name: /^filtros\b/i });

  if ((await getAvailabilitySelect(page).count()) === 0) {
    await filtersButton.click();
  }
}

async function hasEmptyServiciosState(page: Page) {
  return page
    .getByText(/no hay servicios configurados|no encontramos servicios/i)
    .first()
    .isVisible()
    .catch(() => false);
}

async function expectServicesListingLoaded(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/servicios/);
  await expect(
    page.getByRole("heading", { name: /^servicios$/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/buscar servicios/i)).toBeVisible();
  await openFilters(page);
  await expect(getAvailabilitySelect(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /nuevo servicio/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /ver servicio/i })).toHaveCount(
    0,
  );
  await expectNoVisibleSensitiveText(page);
}

async function expectDiscardChanges(page: Page, closeButton: Locator) {
  let acceptMessage = "";
  const acceptCloseConfirmation = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      acceptMessage = dialog.message();
      await dialog.accept();
      resolve();
    });
  });

  await closeButton.click();
  await acceptCloseConfirmation;
  expect(acceptMessage).toMatch(/cambios sin guardar/i);
}

async function expectFilterOptions(page: Page) {
  await openFilters(page);
  const availabilitySelect = getAvailabilitySelect(page);

  await expect(availabilitySelect).toContainText("Todos los servicios");
  await expect(availabilitySelect).toContainText("Disponibles públicamente");
  await expect(availabilitySelect).toContainText(
    "Ocultos del formulario público",
  );
}

async function expectInitialServices(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/configuracion/servicios");
  await expectServicesListingLoaded(page);

  for (const service of ["Impresión", "Otro"]) {
    await expect(
      page.locator("tr").filter({ hasText: service }).first(),
    ).toBeVisible();
  }

  const impresionRow = page
    .locator("tr")
    .filter({ hasText: "Impresión" })
    .first();

  await expect(impresionRow.getByText(/servicio del sistema/i)).toBeVisible();

  const otroRow = page.locator("tr").filter({ hasText: "Otro" }).first();

  await expect(otroRow.getByText(/servicio del sistema/i)).toHaveCount(0);
}

test("admin can access servicios and non-admin roles are blocked", async ({
  page,
}) => {
  await loginAs(page, "admin");
  await page.goto("/dashboard/configuracion");
  await expect(
    page.getByRole("heading", { name: /configuraci.n/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /servicios/i })).toBeVisible();

  await page.getByRole("link", { name: /servicios/i }).click();
  await expectServicesListingLoaded(page);

  await loginAs(page, "supervisor");
  await page.goto("/dashboard/configuracion/servicios");
  await expectAccessLimitedPage(page);

  await loginAs(page, "worker");
  await page.goto("/dashboard/configuracion/servicios");
  await expectAccessLimitedPage(page);
});

test("admin can validate service form errors", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/dashboard/configuracion/servicios");
  await expectServicesListingLoaded(page);

  await page.getByRole("button", { name: /nuevo servicio/i }).click();
  let createDialog = page.getByRole("dialog", { name: /nuevo servicio/i });

  await expect(createDialog).toBeVisible();
  await createDialog.getByRole("textbox", { name: /^nombre$/i }).fill("   ");
  await createDialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill("   ");
  await createDialog.getByRole("button", { name: /crear servicio/i }).click();
  await expect(
    createDialog.getByText(/el nombre del servicio es obligatorio/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    createDialog.getByText(/la descripci.n del servicio es obligatoria/i),
  ).toBeVisible();

  await expectDiscardChanges(
    page,
    createDialog.getByRole("button", { name: /cerrar/i }),
  );
  await expect(createDialog).toBeHidden();

  await page.getByRole("button", { name: /nuevo servicio/i }).click();
  createDialog = page.getByRole("dialog", { name: /nuevo servicio/i });
  await expect(createDialog).toBeVisible();
  await createDialog.getByRole("textbox", { name: /^nombre$/i }).fill("Otro");
  await createDialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill(`Duplicado QA ${runId}`);
  await createDialog.getByRole("button", { name: /crear servicio/i }).click();
  await expect(
    createDialog.getByText(/ya existe un servicio con ese nombre/i),
  ).toBeVisible({ timeout: 15_000 });

  await expectDiscardChanges(
    page,
    createDialog.getByRole("button", { name: /cerrar/i }),
  );
  await expect(createDialog).toBeHidden();
  await expectNoVisibleSensitiveText(page);
});

test("admin can create, search, hide and edit a service", async ({ page }) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");
  await page.goto("/dashboard/configuracion/servicios");
  await expectServicesListingLoaded(page);
  await expectInitialServices(page);

  await page.getByRole("button", { name: /nuevo servicio/i }).click();
  let createDialog = page.getByRole("dialog", { name: /nuevo servicio/i });

  await expect(createDialog).toBeVisible();
  await expect(
    createDialog.getByText(/nuevos servicios pertenecen al flujo de encargo/i),
  ).toBeVisible();
  await createDialog
    .getByRole("textbox", { name: /^nombre$/i })
    .fill(`Borrador ${serviceName}`);

  let dismissMessage = "";
  const dismissCloseConfirmation = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      dismissMessage = dialog.message();
      await dialog.dismiss();
      resolve();
    });
  });
  await createDialog.getByRole("button", { name: /cerrar/i }).click();
  await dismissCloseConfirmation;
  expect(dismissMessage).toMatch(/cambios sin guardar/i);
  await expect(createDialog).toBeVisible();

  await expectDiscardChanges(
    page,
    createDialog.getByRole("button", { name: /cerrar/i }),
  );
  await expect(createDialog).toBeHidden();

  await page.getByRole("button", { name: /nuevo servicio/i }).click();
  createDialog = page.getByRole("dialog", { name: /nuevo servicio/i });
  await expect(createDialog).toBeVisible();
  await createDialog.getByRole("textbox", { name: /^nombre$/i }).fill(serviceName);
  await createDialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill(serviceDescription);
  await createDialog
    .getByRole("combobox", { name: /disponibilidad p.blica/i })
    .selectOption("true");
  await createDialog.getByRole("button", { name: /crear servicio/i }).click();
  await expect(createDialog).toBeHidden({ timeout: 15_000 });

  await page.getByLabel(/buscar servicios/i).fill(serviceName);
  await page.getByLabel(/buscar servicios/i).press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/servicios\?q=/);
  const serviceRow = page.locator("tr").filter({ hasText: serviceName }).first();

  await expect(serviceRow).toBeVisible();
  await expect(serviceRow.getByText(serviceDescription)).toBeVisible();
  await expect(serviceRow.getByText(/^encargo$/i)).toBeVisible();
  await expect(serviceRow.getByText(/^disponible$/i)).toBeVisible();

  await clickFirstVisible(
    page.getByRole("button", {
      name: new RegExp(`editar servicio ${serviceName}`, "i"),
    }),
  );
  const editDialog = page.getByRole("dialog", { name: /editar servicio/i });

  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByText(/^encargo$/i)).toBeVisible();
  await editDialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill(editedServiceDescription);
  await editDialog
    .getByRole("combobox", { name: /disponibilidad p.blica/i })
    .selectOption("true");
  await expect(
    editDialog.getByText(/último servicio público/i),
  ).toHaveCount(0);
  await editDialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(serviceRow.getByText(editedServiceDescription)).toBeVisible();
  await expect(serviceRow.getByText(/^disponible$/i)).toBeVisible();

  for (const [iteration, availability] of ["false", "true"].entries()) {
    const nextDescription = `Servicio QA edición ${iteration + 2} ${runId}`;

    await clickFirstVisible(
      page.getByRole("button", {
        name: new RegExp(`editar servicio ${serviceName}`, "i"),
      }),
    );
    const repeatedEditDialog = page.getByRole("dialog", {
      name: /editar servicio/i,
    });
    await repeatedEditDialog
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(nextDescription);
    await repeatedEditDialog
      .getByRole("combobox", { name: /disponibilidad p.blica/i })
      .selectOption(availability);
    await repeatedEditDialog
      .getByRole("button", { name: /guardar cambios/i })
      .click();
    await expect(serviceRow.getByText(nextDescription)).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      serviceRow.getByText(
        availability === "true" ? /^disponible$/i : /^oculto$/i,
      ),
    ).toBeVisible();
  }
  await expectNoVisibleSensitiveText(page);
});

test("admin can inspect impresion warning without changing seed", async ({
  page,
}) => {
  await loginAs(page, "admin");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/configuracion/servicios");
  await expectServicesListingLoaded(page);

  const impresionRow = page
    .locator("tr")
    .filter({ hasText: "Impresión" })
    .first();

  await expect(impresionRow).toBeVisible();
  await expect(impresionRow.getByText(/^disponible$/i)).toBeVisible();
  await impresionRow.getByRole("button", { name: /editar servicio/i }).click();
  const editDialog = page.getByRole("dialog", { name: /editar servicio/i });

  await expect(editDialog).toBeVisible();
  await expect(editDialog.getByText(/^impresi.n$/i)).toBeVisible();
  await expect(editDialog.getByText(/^servicio del sistema$/i)).toHaveCount(2);
  await editDialog
    .getByRole("combobox", { name: /disponibilidad p.blica/i })
    .selectOption("false");
  await expect(
    editDialog.getByText(
      /formulario p.blico de impresi.n dejar. de estar disponible/i,
    ),
  ).toBeVisible();

  await expectDiscardChanges(
    page,
    editDialog.getByRole("button", { name: /cerrar/i }),
  );
  await expect(editDialog).toBeHidden();
  await expect(impresionRow.getByText(/^disponible$/i)).toBeVisible();
});

test("admin can use filters, empty state and canonical URLs", async ({
  page,
}) => {
  test.setTimeout(60_000);

  await loginAs(page, "admin");

  await page.goto("/dashboard/configuracion/servicios?page=1");
  await expect.poll(() => new URL(page.url()).search).toBe("");

  await page.goto("/dashboard/configuracion/servicios?availability=invalid");
  await expectServicesListingLoaded(page);
  await expect(page.getByText(/filtro ignorado/i)).toBeVisible();
  await expect(new URL(page.url()).searchParams.get("availability")).toBe(
    "invalid",
  );

  await page.goto("/dashboard/configuracion/servicios?q=Otro");
  await expectServicesListingLoaded(page);
  await expectFilterOptions(page);
  await getAvailabilitySelect(page).selectOption("public");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("availability"))
    .toBe("public");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Otro");

  await openFilters(page);
  await getAvailabilitySelect(page).selectOption("hidden");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("availability"))
    .toBe("hidden");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Otro");

  await openFilters(page);
  await getAvailabilitySelect(page).selectOption("");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("availability"))
    .toBeNull();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe("Otro");

  await page.goto("/dashboard/configuracion/servicios?availability=hidden");
  await expectServicesListingLoaded(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /ocultos/i })).toBeVisible();
  await page.getByRole("button", { name: /ocultos/i }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("availability"))
    .toBeNull();

  await page.goto("/dashboard/configuracion/servicios?availability=public");
  await expectServicesListingLoaded(page);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /limpiar filtros/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /limpiar filtros/i }).click();
  await expect.poll(() => new URL(page.url()).search).toBe("");

  const unlikelyQuery = createUnlikelyQaQuery("servicios-sin-resultados");
  await page.getByLabel(/buscar servicios/i).fill(unlikelyQuery);
  await page.getByLabel(/buscar servicios/i).press("Enter");
  await expect(
    page.getByText(/no encontramos servicios con estos filtros/i),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoVisibleSensitiveText(page);
});

test("servicios listing keeps accessible controls on mobile and desktop", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/configuracion/servicios");
  await expectServicesListingLoaded(page);
  await expectTouchTarget(
    page.getByRole("button", { name: /nuevo servicio/i }),
  );
  await expectNoHorizontalOverflow(page);

  if (!(await hasEmptyServiciosState(page))) {
    const editButtons = page.getByRole("button", {
      name: /editar servicio/i,
    });

    await expectTouchTarget(editButtons.first());
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/configuracion/servicios");
  await expectServicesListingLoaded(page);
  await expectInitialServices(page);
  await expectNoHorizontalOverflow(page);

  if (!(await hasEmptyServiciosState(page))) {
    await expect(getPagination(page)).toBeVisible();
    await expect(
      getPagination(page).getByText(/P.gina\s+\d+\s+de\s+\d+/i),
    ).toBeVisible();
  }
});
