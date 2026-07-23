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

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

function getPedidoTitleText(page: Page, title: string) {
  return page.getByText(title, { exact: true });
}

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

function getPagination(page: Page) {
  return page.getByRole("navigation", {
    name: /paginaci.n de plantillas/i,
  });
}

async function getPaginationPageInfo(page: Page) {
  const pagination = getPagination(page);
  const text = await pagination
    .getByText(/P.gina\s+\d+\s+de\s+\d+/i)
    .innerText();
  const match = text.match(/P.gina\s+(\d+)\s+de\s+(\d+)/i);

  expect(match, `Unexpected pagination page text: ${text}`).not.toBeNull();

  return {
    currentPage: Number(match?.[1]),
    totalPages: Number(match?.[2]),
  };
}

async function getPaginationSummary(page: Page) {
  const pagination = getPagination(page);
  const text = await pagination
    .getByText(/Mostrando\s+\d+–\d+\s+de\s+\d+\s+plantillas/i)
    .innerText();
  const match = text.match(
    /Mostrando\s+(\d+)–(\d+)\s+de\s+(\d+)\s+plantillas/i,
  );

  expect(match, `Unexpected pagination summary text: ${text}`).not.toBeNull();

  return {
    startItem: Number(match?.[1]),
    endItem: Number(match?.[2]),
    totalCount: Number(match?.[3]),
  };
}

function getPreviousPageControl(page: Page) {
  return getPagination(page).getByLabel(/Ir a la p.gina anterior/i);
}

function getNextPageControl(page: Page) {
  return getPagination(page).getByLabel(/Ir a la p.gina siguiente/i);
}

function getPreviousPageLink(page: Page) {
  return getPagination(page).getByRole("link", {
    name: /Ir a la p.gina anterior/i,
  });
}

function getNextPageLink(page: Page) {
  return getPagination(page).getByRole("link", {
    name: /Ir a la p.gina siguiente/i,
  });
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(40);
}

async function expectDisabledControl(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveAttribute("aria-disabled", "true");
  await expect(locator).not.toHaveAttribute("href", /.+/);
  await expectTouchTarget(locator);
}

async function expectPaginationA11y(page: Page) {
  const pagination = getPagination(page);

  await expect(pagination).toBeVisible();
  await expect(pagination.getByText(/P.gina\s+\d+\s+de\s+\d+/i)).toBeVisible();
  await expect(
    pagination.getByText(/Mostrando\s+\d+–\d+\s+de\s+\d+\s+plantillas/i),
  ).toBeVisible();

  for (const control of [
    getPreviousPageControl(page),
    getNextPageControl(page),
  ]) {
    await expect(control).toBeVisible();
    await expectTouchTarget(control);
  }
}

async function getCurrentTemplatesUrl(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/plantillas/);

  return new URL(page.url());
}

async function hasEmptyTemplatesState(page: Page) {
  return page
    .getByText(/no hay plantillas de tareas todav|no encontramos plantillas/i)
    .first()
    .isVisible()
    .catch(() => false);
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
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/dashboard\/pedidos(\/[^/]+)?$/, {
    timeout: 15_000,
  });

  if (!/\/dashboard\/pedidos\/[^/]+$/.test(new URL(page.url()).pathname)) {
    await clickFirstVisible(getPedidoTitleText(page, title));
    await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/);
  }

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
  let createDialog = page.getByRole("dialog", { name: /nueva plantilla/i });

  await expect(createDialog).toBeVisible();

  const draftName = `QA Draft Template ${runId}`;
  const newTemplateTrigger = page.getByRole("button", {
    name: /nueva plantilla/i,
  });

  await createDialog.getByRole("textbox", { name: /^nombre$/i }).fill(draftName);
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
  await expect(
    createDialog.getByRole("textbox", { name: /^nombre$/i }),
  ).toHaveValue(draftName);

  let acceptMessage = "";
  const acceptCloseConfirmation = new Promise<void>((resolve) => {
    page.once("dialog", async (dialog) => {
      acceptMessage = dialog.message();
      await dialog.accept();
      resolve();
    });
  });
  await createDialog.getByRole("button", { name: /cerrar/i }).click();
  await acceptCloseConfirmation;

  expect(acceptMessage).toMatch(/cambios sin guardar/i);
  await expect(createDialog).toBeHidden();
  await expect(newTemplateTrigger).toBeFocused();

  await newTemplateTrigger.click();
  createDialog = page.getByRole("dialog", { name: /nueva plantilla/i });
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

  await page.goto(
    `/dashboard/configuracion/plantillas?q=${encodeURIComponent(templateName)}`,
  );
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

  const editedTask = getTaskItem(page, editedTaskTitle);
  const deleteEditedTaskButton = editedTask.getByRole("button", {
    name: new RegExp(`eliminar tarea ${editedTaskTitle}`, "i"),
  });

  await deleteEditedTaskButton.click();
  let deleteConfirmation = editedTask.locator("form").filter({
    hasText: /eliminar esta tarea de la plantilla/i,
  });

  await expect(deleteConfirmation).toBeVisible();
  await expect(deleteConfirmation.getByText(editedTaskTitle)).toBeVisible();
  await expect(
    deleteConfirmation.getByRole("button", { name: /cancelar/i }),
  ).toBeFocused();
  await deleteConfirmation.getByRole("button", { name: /cancelar/i }).click();
  await expect(editedTask).toBeVisible();
  await expect(deleteEditedTaskButton).toBeFocused();

  await deleteEditedTaskButton.click();
  deleteConfirmation = editedTask.locator("form").filter({
    hasText: /eliminar esta tarea de la plantilla/i,
  });
  await deleteConfirmation
    .getByRole("button", { name: /^eliminar tarea$/i })
    .click();
  await expect(page.getByText("Tarea eliminada", { exact: true })).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(page.getByText(editedTaskTitle)).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible();
  await expectNoVisibleSensitiveText(page);

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
  await expectNoHorizontalOverflow(page);
  await expectNoVisibleSensitiveText(page);
});

test("admin can validate task template pagination and canonical URLs", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/configuracion/plantillas");
  await expectTemplatesListingLoaded(page);

  let totalPages = 1;
  let totalCount = 0;

  if (!(await hasEmptyTemplatesState(page))) {
    await expectPaginationA11y(page);

    const pageInfo = await getPaginationPageInfo(page);
    const summary = await getPaginationSummary(page);

    totalPages = pageInfo.totalPages;
    totalCount = summary.totalCount;

    console.info(
      `[plantillas pagination] totalCount=${totalCount} totalPages=${totalPages}`,
    );

    expect(pageInfo.currentPage).toBe(1);
    expect(pageInfo.totalPages).toBeGreaterThanOrEqual(1);
    expect(summary.startItem).toBe(1);
    expect(summary.endItem).toBe(Math.min(50, summary.totalCount));
    await expectDisabledControl(getPreviousPageControl(page));
    await expect(getPreviousPageLink(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }

  await page.goto("/dashboard/configuracion/plantillas?page=1");
  await expect.poll(async () => {
    const url = await getCurrentTemplatesUrl(page);

    return {
      pathname: url.pathname,
      search: url.search,
    };
  }).toEqual({
    pathname: "/dashboard/configuracion/plantillas",
    search: "",
  });

  await page.goto("/dashboard/configuracion/plantillas?page=abc");
  await expect.poll(async () => {
    const url = await getCurrentTemplatesUrl(page);

    return {
      pathname: url.pathname,
      search: url.search,
    };
  }).toEqual({
    pathname: "/dashboard/configuracion/plantillas",
    search: "",
  });

  await page.goto(
    `/dashboard/configuracion/plantillas?page=${totalPages + 1}`,
  );
  await expect.poll(async () => {
    const url = await getCurrentTemplatesUrl(page);

    return {
      page: url.searchParams.get("page"),
      pathname: url.pathname,
    };
  }).toEqual({
    page: totalPages > 1 ? String(totalPages) : null,
    pathname: "/dashboard/configuracion/plantillas",
  });
  await expect(
    page.getByRole("alert").filter({
      hasText: /no se pudieron cargar las plantillas/i,
    }),
  ).toHaveCount(0);

  if (!(await hasEmptyTemplatesState(page))) {
    const lastPageInfo = await getPaginationPageInfo(page);
    const lastPageSummary = await getPaginationSummary(page);

    expect(lastPageInfo.currentPage).toBe(lastPageInfo.totalPages);
    expect(lastPageSummary.endItem).toBe(lastPageSummary.totalCount);
    await expectDisabledControl(getNextPageControl(page));
    await expect(getNextPageLink(page)).toHaveCount(0);
  }

  await page.goto(
    `/dashboard/configuracion/plantillas?q=${encodeURIComponent(
      templateName,
    )}&page=999999`,
  );
  await expect(
    page.getByRole("alert").filter({
      hasText: /no se pudieron cargar las plantillas/i,
    }),
  ).toHaveCount(0);
  await expect.poll(async () => {
    const url = await getCurrentTemplatesUrl(page);

    return {
      page: url.searchParams.get("page"),
      q: url.searchParams.get("q"),
    };
  }).toEqual({
    page: null,
    q: templateName,
  });
  await expect(
    page.getByRole("link", {
      name: new RegExp(`abrir plantilla ${templateName}`, "i"),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /abrir plantilla/i }),
  ).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/configuracion/plantillas");
  if (!(await hasEmptyTemplatesState(page))) {
    await expectPaginationA11y(page);
    await expectNoHorizontalOverflow(page);
  }
});

test("task template pagination preserves the active search", async ({ page }) => {
  await loginAs(page, "admin");

  const candidateQueries = ["a", "e", "i", "o"];
  let selectedQuery: string | null = null;

  for (const query of candidateQueries) {
    await page.goto(
      `/dashboard/configuracion/plantillas?q=${encodeURIComponent(query)}`,
    );
    await expectTemplatesListingLoaded(page);

    if (await hasEmptyTemplatesState(page)) {
      continue;
    }

    await expect(getPagination(page)).toBeVisible();

    const pageInfo = await getPaginationPageInfo(page);

    if (pageInfo.totalPages > 1) {
      selectedQuery = query;
      break;
    }
  }

  test.skip(
    selectedQuery === null,
    "Ninguna busqueda candidata produjo mas de una pagina de plantillas.",
  );

  const query = selectedQuery ?? "";

  await expect(page.locator('input[name="q"]:visible')).toHaveValue(query);
  await expect(getNextPageLink(page)).toBeVisible();
  await getNextPageLink(page).click();
  await expectPaginationA11y(page);

  await expect.poll(async () => {
    const url = await getCurrentTemplatesUrl(page);

    return {
      page: url.searchParams.get("page"),
      q: url.searchParams.get("q"),
    };
  }).toEqual({
    page: "2",
    q: query,
  });
  await expect(page.locator('input[name="q"]:visible')).toHaveValue(query);
});

test("admin can navigate between task template pages", async ({ page }) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/configuracion/plantillas");
  await expectTemplatesListingLoaded(page);

  if (await hasEmptyTemplatesState(page)) {
    test.skip(
      true,
      "La navegacion de plantillas requiere al menos 51 plantillas visibles.",
    );
  }

  await expectPaginationA11y(page);

  const initialPageInfo = await getPaginationPageInfo(page);
  const initialSummary = await getPaginationSummary(page);

  test.skip(
    initialPageInfo.totalPages < 2,
    "La navegacion de plantillas requiere al menos 51 plantillas visibles.",
  );

  expect(initialPageInfo.currentPage).toBe(1);
  expect(initialSummary.startItem).toBe(1);
  expect(initialSummary.endItem).toBe(50);
  await expect(getNextPageLink(page)).toBeVisible();
  await getNextPageLink(page).click();

  await expect.poll(async () => {
    const url = await getCurrentTemplatesUrl(page);

    return url.searchParams.get("page");
  }).toBe("2");

  const secondPageInfo = await getPaginationPageInfo(page);
  const secondSummary = await getPaginationSummary(page);

  expect(secondPageInfo.currentPage).toBe(2);
  expect(secondPageInfo.totalPages).toBe(initialPageInfo.totalPages);
  expect(secondSummary.startItem).toBe(51);
  expect(secondSummary.endItem).toBe(Math.min(100, initialSummary.totalCount));
  expect(secondSummary.totalCount).toBe(initialSummary.totalCount);
  await expect(getPreviousPageLink(page)).toBeVisible();
  await expectTouchTarget(getPreviousPageLink(page));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/configuracion/plantillas?page=2");
  await expectPaginationA11y(page);
  await expectNoHorizontalOverflow(page);

  await getPreviousPageLink(page).click();
  await expect.poll(async () => {
    const url = await getCurrentTemplatesUrl(page);

    return {
      page: url.searchParams.get("page"),
      pathname: url.pathname,
    };
  }).toEqual({
    page: null,
    pathname: "/dashboard/configuracion/plantillas",
  });
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
