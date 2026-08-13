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
const secondEditedTemplateDescription = `Plantilla QA edición 2 ${runId}`;
const thirdEditedTemplateDescription = `Plantilla QA edición 3 ${runId}`;
const simpleTaskTitle = `Disenar arte final QA ${runLabel}`;
const editedTaskTitle = `Disenar arte final aprobado QA ${runLabel}`;
const quantifiedTaskTitle = `Imprimir 10 hojas QA ${runLabel}`;
const editedQuantifiedTaskTitle = `Imprimir 12 hojas QA ${runLabel}`;
const thirdTaskTitle = `Confirmar entrega QA ${runLabel}`;
const editedThirdTaskTitle = `Confirmar entrega final QA ${runLabel}`;

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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getRequiredBox(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();

  return box as NonNullable<typeof box>;
}

async function expectNoLocatorHorizontalOverflow(locator: Locator) {
  const dimensions = await locator.evaluate((element) => ({
    clientWidth: (element as HTMLElement).clientWidth,
    scrollWidth: (element as HTMLElement).scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
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

function getTaskTemplateCombobox(tasksPanel: Locator) {
  return tasksPanel.getByRole("combobox", {
    name: /seleccionar plantilla/i,
  });
}

function getTaskTemplateForm(tasksPanel: Locator) {
  return getTaskTemplateCombobox(tasksPanel).locator("xpath=ancestor::form[1]");
}

function getTaskTemplateHiddenInput(tasksPanel: Locator) {
  return getTaskTemplateForm(tasksPanel).locator(
    'input[type="hidden"][name="template_id"]',
  );
}

function getTaskTemplateListbox(tasksPanel: Locator) {
  return getTaskTemplateForm(tasksPanel).getByRole("listbox");
}

function getTaskTemplateOption(tasksPanel: Locator, name: string | RegExp) {
  const optionName = typeof name === "string"
    ? new RegExp(escapeRegExp(name), "i")
    : name;

  return getTaskTemplateForm(tasksPanel).getByRole("option", {
    name: optionName,
  });
}

function getApplyTaskTemplateButton(tasksPanel: Locator) {
  return getTaskTemplateForm(tasksPanel).getByRole("button", {
    name: /^aplicar plantilla$/i,
  });
}

async function expectTaskTemplateRequestsUsePedidoId(
  requestUrls: string[],
  pedidoId: string,
) {
  for (const requestUrl of requestUrls) {
    const url = new URL(requestUrl);

    expect(url.searchParams.get("pedido_id")).toBe(pedidoId);
  }
}

async function expectTaskTemplateListboxBelowInput(
  listbox: Locator,
  combobox: Locator,
) {
  const inputBox = await getRequiredBox(combobox);
  const listboxBox = await getRequiredBox(listbox);
  const bottomGap = listboxBox.y - (inputBox.y + inputBox.height);

  expect(listboxBox.y).toBeGreaterThanOrEqual(
    inputBox.y + inputBox.height + 4,
  );
  expect(bottomGap).toBeGreaterThanOrEqual(4);
  expect(bottomGap).toBeLessThanOrEqual(10);

  return { inputBox, listboxBox, bottomGap };
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
  await editDialog.getByRole("combobox", { name: /estado/i }).selectOption("true");
  await editDialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(editedTemplateDescription)).toBeVisible();
  await expect(page.getByText(/^activa$/i).first()).toBeVisible();

  await page.getByRole("button", { name: /editar plantilla/i }).click();
  editDialog = page.getByRole("dialog", { name: /editar plantilla/i });
  await editDialog
    .getByLabel(/descripci.n/i)
    .fill(secondEditedTemplateDescription);
  await editDialog.getByRole("combobox", { name: /estado/i }).selectOption("false");
  await editDialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/^inactiva$/i).first()).toBeVisible();
  await expect(page.getByText(secondEditedTemplateDescription)).toBeVisible();

  await page.getByRole("button", { name: /editar plantilla/i }).click();
  editDialog = page.getByRole("dialog", { name: /editar plantilla/i });
  await editDialog
    .getByLabel(/descripci.n/i)
    .fill(thirdEditedTemplateDescription);
  await editDialog.getByRole("combobox", { name: /estado/i }).selectOption("true");
  await editDialog.getByRole("button", { name: /guardar cambios/i }).click();
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/^activa$/i).first()).toBeVisible();
  await expect(page.getByText(thirdEditedTemplateDescription)).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.getByLabel(/nueva tarea/i).fill(simpleTaskTitle);
  await page.getByRole("button", { name: /^agregar$/i }).click();
  await expect(page.getByText(simpleTaskTitle)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByLabel(/nueva tarea/i).fill(quantifiedTaskTitle);
  await page.getByRole("button", { name: /^agregar$/i }).click();
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/cuantificada/i)).toHaveCount(0);

  await page.getByLabel(/nueva tarea/i).fill(thirdTaskTitle);
  await page.getByRole("button", { name: /^agregar$/i }).click();
  await expect(page.getByText(thirdTaskTitle)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByLabel(/nueva tarea/i).fill(" ");
  await page.getByRole("button", { name: /^agregar$/i }).click();
  await expect(
    page.getByText(/escribe un t.tulo v.lido para la tarea/i).first(),
  ).toBeVisible({ timeout: 15_000 });

  await getTaskItem(page, quantifiedTaskTitle)
    .getByRole("button", { name: /subir tarea/i })
    .click();
  await expect(page.getByText(simpleTaskTitle)).toBeVisible();
  await expect(page.getByText(quantifiedTaskTitle)).toBeVisible();
  await expectBefore(
    getTaskItem(page, quantifiedTaskTitle),
    getTaskItem(page, simpleTaskTitle),
  );

  await getTaskItem(page, simpleTaskTitle)
    .getByRole("button", { name: /bajar tarea/i })
    .click();
  await expectBefore(
    getTaskItem(page, thirdTaskTitle),
    getTaskItem(page, simpleTaskTitle),
  );

  await getTaskItem(page, thirdTaskTitle)
    .getByRole("button", { name: /subir tarea/i })
    .click();
  await expectBefore(
    getTaskItem(page, thirdTaskTitle),
    getTaskItem(page, quantifiedTaskTitle),
  );

  for (const [title, updatedTitle] of [
    [simpleTaskTitle, editedTaskTitle],
    [quantifiedTaskTitle, editedQuantifiedTaskTitle],
    [thirdTaskTitle, editedThirdTaskTitle],
  ]) {
    const task = getTaskItem(page, title);
    await task
      .getByRole("button", {
        name: new RegExp(`editar tarea ${escapeRegExp(title)}`, "i"),
      })
      .click();
    await task.getByLabel(/editar tarea/i).fill(updatedTitle);
    await task.getByRole("button", { name: /guardar tarea/i }).click();
    await expect(page.getByText(updatedTitle)).toBeVisible({
      timeout: 15_000,
    });
  }

  for (const [index, title] of [
    editedTaskTitle,
    editedQuantifiedTaskTitle,
    editedThirdTaskTitle,
  ].entries()) {
    const task = getTaskItem(page, title);
    const deleteButton = task.getByRole("button", {
      name: new RegExp(`eliminar tarea ${escapeRegExp(title)}`, "i"),
    });
    await deleteButton.click();
    let deleteConfirmation = task.locator("form").filter({
      hasText: /eliminar esta tarea de la plantilla/i,
    });

    if (index === 0) {
      await deleteConfirmation.getByRole("button", { name: /cancelar/i }).click();
      await expect(task).toBeVisible();
      await deleteButton.click();
      deleteConfirmation = task.locator("form").filter({
        hasText: /eliminar esta tarea de la plantilla/i,
      });
    }

    const deletionNavigation = page.waitForNavigation({
      waitUntil: "domcontentloaded",
    });
    await deleteConfirmation
      .getByRole("button", { name: /^eliminar tarea$/i })
      .click();
    await deletionNavigation;
    await expect(page.getByText(title, { exact: true })).toHaveCount(0, {
      timeout: 15_000,
    });
  }
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
    page.getByText(/esta plantilla todav.a no tiene tareas/i),
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

test("admin can apply a template with the async selector and impresion has no selector", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, "admin");

  const forbiddenBackendMessages = [
    /PGRST103/i,
    /Requested range not satisfiable/i,
    /Error checking pedido before task template selector search/i,
    /Error searching task templates for selector/i,
    /Unexpected error searching task templates for selector/i,
    /No se pudieron cargar las plantillas disponibles/i,
  ];
  const backendErrors: string[] = [];
  const taskTemplateSelectorRequests: string[] = [];

  page.on("console", (message) => {
    const text = message.text();

    if (forbiddenBackendMessages.some((pattern) => pattern.test(text))) {
      backendErrors.push(text);
    }
  });

  page.on("pageerror", (error) => {
    const text = error.message;

    if (forbiddenBackendMessages.some((pattern) => pattern.test(text))) {
      backendErrors.push(text);
    }
  });

  page.on("request", (request) => {
    if (
      request.url().includes(
        "/api/internal/selectors/plantillas-tareas",
      )
    ) {
      taskTemplateSelectorRequests.push(request.url());
    }
  });

  await createManualPedido(
    page,
    "encargo",
    `QA Pedido Template Encargo ${runId}`,
  );
  const pedidoIdMatch = page
    .url()
    .match(/\/dashboard\/pedidos\/([0-9a-f-]+)/i);
  const templateSelectorPedidoId = pedidoIdMatch?.[1] ?? "";
  const encargoDetailUrl = page.url();

  expect(templateSelectorPedidoId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  expect(taskTemplateSelectorRequests).toHaveLength(0);

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
  expect(taskTemplateSelectorRequests).toHaveLength(0);

  const combobox = getTaskTemplateCombobox(tasksPanel);
  const hiddenInput = getTaskTemplateHiddenInput(tasksPanel);
  const applyButton = getApplyTaskTemplateButton(tasksPanel);
  const applyForm = getTaskTemplateForm(tasksPanel);

  await expect(combobox).toBeVisible();
  await expect(applyButton).toBeVisible();
  await expect(combobox).toHaveValue("");
  await expect(hiddenInput).toHaveValue("");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(getTaskTemplateListbox(tasksPanel)).toHaveCount(0);
  await expect(
    tasksPanel.getByText(/si aplicas la misma plantilla/i),
  ).toHaveCount(0);
  await expect(registeredTasksHeading).toBeVisible();
  await expect(newTaskHeading).toBeVisible();
  await expectBefore(templateHeading, newTaskHeading);
  await expectBefore(newTaskHeading, registeredTasksHeading);
  await expect(tasksPanel.getByText(/progreso:/i)).toBeVisible();

  const initialInputBox = await getRequiredBox(combobox);
  const initialButtonBox = await getRequiredBox(applyButton);
  const initialFormBox = await getRequiredBox(applyForm);

  expect(Math.abs(initialButtonBox.y - initialInputBox.y))
    .toBeLessThanOrEqual(4);
  expect(initialButtonBox.x).toBeGreaterThan(
    initialInputBox.x + initialInputBox.width - 1,
  );

  const initialResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/plantillas-tareas" &&
      url.searchParams.get("pedido_id") === templateSelectorPedidoId &&
      (url.searchParams.get("q") ?? "") === ""
    );
  });

  await applyButton.click();
  await expect(tasksPanel).toBeVisible();
  await expect(combobox).toBeFocused();
  await expect(hiddenInput).toHaveValue("");
  await expect(combobox).toHaveValue("");
  await expect(
    tasksPanel.getByText(/se agreg. 1 tarea desde la plantilla/i),
  ).toHaveCount(0);

  const validationMessage = await combobox.evaluate(
    (element) => (element as HTMLInputElement).validationMessage,
  );

  expect(validationMessage).toContain("Selecciona una opcion de la lista.");

  const initialResponse = await initialResponsePromise;
  const initialBody = (await initialResponse.json()) as {
    options?: unknown;
  };

  expect(Array.isArray(initialBody.options)).toBe(true);

  const initialOptions = initialBody.options as Array<Record<string, unknown>>;

  expect(initialOptions.length).toBeGreaterThanOrEqual(1);
  expect(initialOptions.length).toBeLessThanOrEqual(20);

  for (const option of initialOptions) {
    expect(Object.keys(option).sort()).toEqual([
      "description",
      "label",
      "value",
    ]);
    expect(option.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(typeof option.label).toBe("string");
    expect((option.label as string).trim()).not.toBe("");
    expect(option.description).toMatch(/^\d+ tareas?$/);
    expect(option.description).not.toBe(editedTemplateDescription);
  }

  await expectTaskTemplateRequestsUsePedidoId(
    taskTemplateSelectorRequests,
    templateSelectorPedidoId,
  );
  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await expect(combobox).toHaveAttribute("aria-autocomplete", "list");
  await expect(combobox).toHaveAttribute("aria-required", "true");

  let listbox = getTaskTemplateListbox(tasksPanel);
  const controlsId = await combobox.getAttribute("aria-controls");

  expect(controlsId).toBeTruthy();
  await expect(listbox).toHaveAttribute("id", controlsId as string);
  await expect(listbox).toBeVisible();
  await expect(listbox.getByRole("option")).toHaveCount(initialOptions.length);

  const {
    inputBox: openInputBox,
    listboxBox,
    bottomGap,
  } = await expectTaskTemplateListboxBelowInput(listbox, combobox);
  const openButtonBox = await getRequiredBox(applyButton);
  const openFormBox = await getRequiredBox(applyForm);
  const dialogBox = await getRequiredBox(tasksPanel);

  expect(Math.abs(openInputBox.y - initialInputBox.y)).toBeLessThanOrEqual(2);
  expect(Math.abs(openButtonBox.y - initialButtonBox.y)).toBeLessThanOrEqual(2);
  expect(openFormBox.height).toBeGreaterThan(initialFormBox.height);
  await expectNoHorizontalOverflow(page);
  await expectNoLocatorHorizontalOverflow(tasksPanel);
  await expectNoLocatorHorizontalOverflow(listbox);
  expect(listboxBox.x).toBeGreaterThanOrEqual(dialogBox.x - 1);
  expect(listboxBox.x + listboxBox.width).toBeLessThanOrEqual(
    dialogBox.x + dialogBox.width + 1,
  );

  await combobox.press("Escape");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await combobox.fill("");

  const requestsBeforeShortQuery = taskTemplateSelectorRequests.length;
  const oneCharacterQuery = templateName.slice(0, 1);
  const twoCharacterQuery = templateName.slice(0, 2);

  await combobox.fill(oneCharacterQuery);
  await expect(
    getTaskTemplateListbox(tasksPanel).getByText(
      /Escribe al menos 2 caracteres\./i,
    ),
  ).toBeVisible();

  const twoCharacterResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/plantillas-tareas" &&
      url.searchParams.get("pedido_id") === templateSelectorPedidoId &&
      url.searchParams.get("q") === twoCharacterQuery
    );
  });

  await combobox.fill(twoCharacterQuery);
  await twoCharacterResponsePromise;

  const newRequests = taskTemplateSelectorRequests.slice(
    requestsBeforeShortQuery,
  );
  const searchRequests = newRequests
    .map((requestUrl) => new URL(requestUrl))
    .filter((url) => url.searchParams.has("q"));

  expect(searchRequests).toHaveLength(1);
  expect(searchRequests[0].searchParams.get("q")).toBe(twoCharacterQuery);
  expect(
    searchRequests.some(
      (url) => url.searchParams.get("q") === oneCharacterQuery,
    ),
  ).toBe(false);
  await expect(hiddenInput).toHaveValue("");

  const unmatchedQuery = `zz-template-${runId}`;
  const unmatchedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/plantillas-tareas" &&
      url.searchParams.get("pedido_id") === templateSelectorPedidoId &&
      url.searchParams.get("q") === unmatchedQuery
    );
  });

  await combobox.fill(unmatchedQuery);
  await unmatchedResponsePromise;
  await expect(
    getTaskTemplateListbox(tasksPanel).getByText(
      /No hay plantillas activas con tareas para esa busqueda\./i,
    ),
  ).toBeVisible();
  await expect(hiddenInput).toHaveValue("");
  await applyButton.click();
  await expect(combobox).toBeFocused();
  await expect(hiddenInput).toHaveValue("");
  const freeTextValidationMessage = await combobox.evaluate(
    (element) => (element as HTMLInputElement).validationMessage,
  );

  expect(freeTextValidationMessage).toContain(
    "Selecciona una opcion de la lista.",
  );
  await expect(
    tasksPanel.getByText(/se agreg. 1 tarea desde la plantilla/i),
  ).toHaveCount(0);

  const focalResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/plantillas-tareas" &&
      url.searchParams.get("pedido_id") === templateSelectorPedidoId &&
      url.searchParams.get("q") === templateName
    );
  });

  await combobox.fill(templateName);
  await focalResponsePromise;

  listbox = getTaskTemplateListbox(tasksPanel);
  const focalOption = getTaskTemplateOption(tasksPanel, templateName);

  await expect(focalOption).toHaveCount(1);
  await expect(focalOption).toBeVisible();
  await expect(focalOption.locator("span").first()).toHaveText(templateName);
  await expect(focalOption.locator("span").nth(1)).toHaveText("1 tarea");
  await expect(combobox).toHaveAttribute(
    "aria-activedescendant",
    /-option-0$/,
  );
  await expectTaskTemplateListboxBelowInput(listbox, combobox);

  await combobox.press("Enter");
  await expect(combobox).toHaveValue(templateName);
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(combobox).toBeFocused();

  const selectedTemplateId = await hiddenInput.inputValue();

  expect(selectedTemplateId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await combobox.click();
  await expect(getTaskTemplateOption(tasksPanel, templateName)).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await combobox.press("Escape");

  await expect(
    tasksPanel.locator("li").filter({ hasText: quantifiedTaskTitle }),
  ).toHaveCount(0);
  await applyButton.click();
  await expect(tasksPanel).toBeVisible();
  await expect(
    tasksPanel.getByText(/se agreg. 1 tarea desde la plantilla/i),
  ).toBeVisible({ timeout: 15_000 });
  const copiedTaskRows = tasksPanel
    .locator("li")
    .filter({ hasText: quantifiedTaskTitle });

  await expect(copiedTaskRows).toHaveCount(1, { timeout: 15_000 });
  await expect(copiedTaskRows.first()).toContainText(
    /0\s+de\s+10\s+(?:\S+\s+)?Pendiente/i,
  );
  await expect(combobox).toHaveValue("");
  await expect(hiddenInput).toHaveValue("");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(combobox.locator("xpath=parent::*").locator(".animate-spin"))
    .toHaveCount(0);
  await expect(applyButton).toBeEnabled();
  await expectBefore(newTaskHeading, registeredTasksHeading);

  const secondFocalResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/plantillas-tareas" &&
      url.searchParams.get("pedido_id") === templateSelectorPedidoId &&
      url.searchParams.get("q") === templateName
    );
  });

  await combobox.focus();
  await combobox.fill(templateName);
  await secondFocalResponsePromise;
  await expect(getTaskTemplateOption(tasksPanel, templateName)).toBeVisible();
  await combobox.press("Enter");
  await expect(hiddenInput).toHaveValue(selectedTemplateId);
  await applyButton.click();
  await expect(
    tasksPanel.getByText(/se agreg. 1 tarea desde la plantilla/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(copiedTaskRows).toHaveCount(2, { timeout: 15_000 });
  await expect(combobox).toHaveValue("");
  await expect(hiddenInput).toHaveValue("");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(combobox.locator("xpath=parent::*").locator(".animate-spin"))
    .toHaveCount(0);
  await expect(applyButton).toBeEnabled();

  await expectTaskTemplateRequestsUsePedidoId(
    taskTemplateSelectorRequests,
    templateSelectorPedidoId,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(encargoDetailUrl);
  const mobileTasksPanel = await openPedidoPanel(page, /^tareas$/i, /tareas/i);
  const mobileCombobox = getTaskTemplateCombobox(mobileTasksPanel);
  const mobileHiddenInput = getTaskTemplateHiddenInput(mobileTasksPanel);
  const mobileApplyButton = getApplyTaskTemplateButton(mobileTasksPanel);
  const mobileApplyForm = getTaskTemplateForm(mobileTasksPanel);

  await expect(mobileCombobox).toBeVisible();
  await expect(mobileApplyButton).toBeVisible();
  await expect(mobileHiddenInput).toHaveValue("");

  const mobileInitialInputBox = await getRequiredBox(mobileCombobox);
  const mobileInitialButtonBox = await getRequiredBox(mobileApplyButton);
  const mobileInitialFormBox = await getRequiredBox(mobileApplyForm);

  expect(mobileInitialButtonBox.y).toBeGreaterThan(
    mobileInitialInputBox.y + mobileInitialInputBox.height - 1,
  );
  expect(mobileInitialButtonBox.width).toBeGreaterThanOrEqual(
    mobileInitialFormBox.width - 4,
  );
  await expectNoHorizontalOverflow(page);

  const mobileFocalResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/plantillas-tareas" &&
      url.searchParams.get("pedido_id") === templateSelectorPedidoId &&
      url.searchParams.get("q") === templateName
    );
  });

  await mobileCombobox.focus();
  await mobileCombobox.fill(templateName);
  await mobileFocalResponsePromise;

  const mobileListbox = getTaskTemplateListbox(mobileTasksPanel);
  const { listboxBox: mobileListboxBox } =
    await expectTaskTemplateListboxBelowInput(mobileListbox, mobileCombobox);
  const mobileDialogBox = await getRequiredBox(mobileTasksPanel);

  await expect(mobileListbox).toBeVisible();
  expect(mobileListboxBox.x).toBeGreaterThanOrEqual(mobileDialogBox.x - 1);
  expect(mobileListboxBox.x + mobileListboxBox.width).toBeLessThanOrEqual(
    mobileDialogBox.x + mobileDialogBox.width + 1,
  );
  await expectNoHorizontalOverflow(page);
  await expectNoLocatorHorizontalOverflow(mobileTasksPanel);
  await expectNoLocatorHorizontalOverflow(mobileListbox);
  await expect(getTaskTemplateOption(mobileTasksPanel, templateName))
    .toBeVisible();
  await expect(getTaskTemplateOption(mobileTasksPanel, /1 tarea/i))
    .toBeVisible();

  const requestsBeforeImpresion = taskTemplateSelectorRequests.length;
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
    page.getByRole("heading", { name: /archivos asociados/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^tareas/i })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /cargar tareas predeterminadas/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: /seleccionar plantilla/i }),
  ).toHaveCount(0);
  await expect(
    page.locator('input[type="hidden"][name="template_id"]'),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /aplicar plantilla/i }),
  ).toHaveCount(0);
  expect(taskTemplateSelectorRequests).toHaveLength(requestsBeforeImpresion);
  expect(backendErrors).toEqual([]);

  console.info(
    [
      `[task template selector] pedidoId=${templateSelectorPedidoId}`,
      `initialOptions=${initialOptions.length}`,
      `template=${templateName}`,
      `templateTasks=1`,
      `templateId=${selectedTemplateId}`,
      `bottomGap=${bottomGap}`,
    ].join(" "),
  );
});
