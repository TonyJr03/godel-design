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
const selectorClientePhone = `555${runId.slice(-7)}`;
const selectorClienteEmail = `qa-pedido-selector-${runId}@example.com`;
const selectorPedidoTitle = `QA Pedido Selector Cliente ${runId}`;
const workerSelectorPedidoTitle = `QA Pedido Selector Personal ${runId}`;
const workerSelectorPedidoDescription =
  `Pedido para validar personal asincrono ${runId}`;
const selectorClienteNotes = `Notas QA selector de pedidos ${runLabel}.`;
const encargoTitle = `QA Pedido Focal Encargo ${runId}`;
const impresionTitle = `QA Pedido Focal Impresion ${runId}`;
const disposableTaskTitle = `QA Tarea Desechable ${runLabel}`;
const editedDisposableTaskTitle = `QA Tarea Desechable Editada ${runLabel}`;
const quantifiedTaskTitle = `QA Tarea Focal Imprimir 5 hojas ${runLabel}`;
const workspaceCommentText = `QA comentario workspace ${runLabel}`;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function taskTitlePattern(title: string) {
  return new RegExp(escapeRegExp(title), "i");
}

function taskProgressPattern(
  completedQuantity: number,
  targetQuantity: number,
  status: "Pendiente" | "Completada",
) {
  return new RegExp(
    `${completedQuantity}\\s+de\\s+${targetQuantity}\\s+(?:\\S+\\s+)?${status}`,
    "i",
  );
}

function getPedidoTaskItemInPanel(taskSection: Locator, title: string) {
  return taskSection.locator("li").filter({ hasText: title }).first();
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

async function expectPedidoTaskActionOrder(
  task: Locator,
  expectedLabels: RegExp[],
) {
  await expect(async () => {
    const labels = await task.getByRole("button").evaluateAll((buttons) =>
      buttons
        .filter((button) => (button as HTMLElement).offsetParent !== null)
        .map((button) => {
          const element = button as HTMLElement;

          return element.getAttribute("aria-label") ?? element.innerText;
        }),
    );

    expect(labels).toHaveLength(expectedLabels.length);

    for (const [index, expectedLabel] of expectedLabels.entries()) {
      expect(labels[index]).toMatch(expectedLabel);
    }
  }).toPass({ timeout: 10_000 });
}

async function expectNoPedidoTaskTechnicalBadges(task: Locator) {
  await expect(task.getByText(/^Simple$/i)).toHaveCount(0);
  await expect(task.getByText(/^Cuantificada$/i)).toHaveCount(0);
}

async function expectPedidoTaskButtonHasPrimaryTone(button: Locator) {
  await expect(button).toHaveClass(/bg-brand-primary/);
}

async function expectPedidoTaskButtonHasNoPrimaryTone(button: Locator) {
  await expect(button).not.toHaveClass(/bg-brand-primary/);
}

function expectedCompleteTaskOrder(title: string) {
  return [
    new RegExp(`marcar como completada tarea ${escapeRegExp(title)}`, "i"),
    new RegExp(`editar tarea ${escapeRegExp(title)}`, "i"),
    new RegExp(`eliminar tarea ${escapeRegExp(title)}`, "i"),
  ];
}

function expectedProgressTaskOrder(title: string) {
  return [
    new RegExp(`actualizar progreso de tarea ${escapeRegExp(title)}`, "i"),
    new RegExp(`editar tarea ${escapeRegExp(title)}`, "i"),
    new RegExp(`eliminar tarea ${escapeRegExp(title)}`, "i"),
  ];
}

function expectedReopenTaskOrder(title: string) {
  return [
    new RegExp(`reabrir tarea ${escapeRegExp(title)}`, "i"),
    new RegExp(`editar tarea ${escapeRegExp(title)}`, "i"),
    new RegExp(`eliminar tarea ${escapeRegExp(title)}`, "i"),
  ];
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

async function getCurrentPedidoOrderNumber(page: Page) {
  const orderNumber = (
    await getPedidoHeader(page).locator("p").first().innerText()
  ).trim();

  expect(orderNumber).not.toBe("");

  return orderNumber;
}

function getPedidosPagination(page: Page) {
  return page.getByRole("navigation", {
    name: /paginaci.n de pedidos/i,
  });
}

async function getPedidosPaginationPageInfo(page: Page) {
  const pagination = getPedidosPagination(page);
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

async function getPedidosPaginationSummary(page: Page) {
  const pagination = getPedidosPagination(page);
  const text = await pagination
    .getByText(/Mostrando\s+\d+[–â€“]\d+\s+de\s+\d+\s+pedidos/i)
    .innerText();
  const match = text.match(
    /Mostrando\s+(\d+)[–â€“](\d+)\s+de\s+(\d+)\s+pedidos/i,
  );

  expect(match, `Unexpected pagination summary text: ${text}`).not.toBeNull();

  return {
    startItem: Number(match?.[1]),
    endItem: Number(match?.[2]),
    totalCount: Number(match?.[3]),
  };
}

function getPreviousPedidoPageControl(page: Page) {
  return getPedidosPagination(page).getByLabel(/Ir a la p.gina anterior/i);
}

function getNextPedidoPageControl(page: Page) {
  return getPedidosPagination(page).getByLabel(/Ir a la p.gina siguiente/i);
}

function getPreviousPedidoPageLink(page: Page) {
  return getPedidosPagination(page).getByRole("link", {
    name: /Ir a la p.gina anterior/i,
  });
}

function getNextPedidoPageLink(page: Page) {
  return getPedidosPagination(page).getByRole("link", {
    name: /Ir a la p.gina siguiente/i,
  });
}

async function expectPaginationTouchTarget(control: Locator) {
  const box = await control.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(40);
}

async function expectDisabledPaginationControl(control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(control).not.toHaveAttribute("href", /.+/);
  await expectPaginationTouchTarget(control);
}

async function expectPedidosPaginationA11y(page: Page) {
  const pagination = getPedidosPagination(page);

  await expect(pagination).toBeVisible();
  await expect(pagination.getByText(/P.gina\s+\d+\s+de\s+\d+/i)).toBeVisible();
  await expect(
    pagination.getByText(/Mostrando\s+\d+[–â€“]\d+\s+de\s+\d+\s+pedidos/i),
  ).toBeVisible();

  for (const control of [
    getPreviousPedidoPageControl(page),
    getNextPedidoPageControl(page),
  ]) {
    await expect(control).toBeVisible();
    await expectPaginationTouchTarget(control);
  }
}

async function getCurrentPedidosUrl(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/pedidos/);

  return new URL(page.url());
}

async function expectNoPedidosLoadError(page: Page) {
  await expect(
    page.getByRole("alert").filter({
      hasText: /no se pudieron cargar los pedidos/i,
    }),
  ).toHaveCount(0);
}

function getPedidoListLink(page: Page, orderNumber: string) {
  return page.getByRole("link", {
    name: new RegExp(`Abrir pedido ${escapeRegExp(orderNumber)}`, "i"),
  });
}

function getPedidosFiltersToggle(page: Page) {
  return page.locator("summary").filter({ hasText: /^Filtros/i });
}

async function hasEmptyPedidosState(page: Page) {
  return page
    .getByText(/no hay pedidos registrados todav|no encontramos pedidos/i)
    .first()
    .isVisible()
    .catch(() => false);
}

async function getVisiblePedidoListTexts(page: Page) {
  return page
    .getByRole("link", { name: /Abrir pedido /i })
    .evaluateAll((elements) =>
      elements
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .map((element) => element.textContent ?? ""),
    );
}

async function expectOnlyVisiblePedidosWithText(
  page: Page,
  expectedText: RegExp,
  unexpectedText?: RegExp,
) {
  const pedidoTexts = await getVisiblePedidoListTexts(page);

  expect(pedidoTexts.length).toBeGreaterThan(0);

  for (const text of pedidoTexts) {
    expect(text).toMatch(expectedText);

    if (unexpectedText) {
      expect(text).not.toMatch(unexpectedText);
    }
  }
}

async function expectCanonicalLastPedidosPage(
  page: Page,
  expectedParams: Record<string, string>,
) {
  await expectPedidosListLoaded(page);
  await expectNoPedidosLoadError(page);

  const empty = await hasEmptyPedidosState(page);

  if (empty) {
    const url = await getCurrentPedidosUrl(page);

    for (const [key, value] of Object.entries(expectedParams)) {
      expect(url.searchParams.get(key)).toBe(value);
    }

    expect(url.searchParams.has("page")).toBe(false);

    return null;
  }

  const pageInfo = await getPedidosPaginationPageInfo(page);
  const summary = await getPedidosPaginationSummary(page);
  const url = await getCurrentPedidosUrl(page);

  for (const [key, value] of Object.entries(expectedParams)) {
    expect(url.searchParams.get(key)).toBe(value);
  }

  if (pageInfo.totalPages > 1) {
    expect(url.searchParams.get("page")).toBe(String(pageInfo.totalPages));
  } else {
    expect(url.searchParams.has("page")).toBe(false);
  }

  expect(pageInfo.currentPage).toBe(pageInfo.totalPages);
  expect(summary.endItem).toBe(summary.totalCount);
  await expectDisabledPaginationControl(getNextPedidoPageControl(page));

  return { pageInfo, summary };
}

async function submitPedidoSearch(page: Page, query: string) {
  await page.goto(`/dashboard/pedidos?q=${encodeURIComponent(query)}`);
  await expectPedidosListLoaded(page);
  await expectNoPedidosLoadError(page);
}

async function loadPedidoSearchCandidate(page: Page, query: string) {
  await page.goto(`/dashboard/pedidos?q=${encodeURIComponent(query)}`);
  await expectPedidosListLoaded(page);

  if (
    await page
      .getByRole("alert")
      .filter({ hasText: /no se pudieron cargar los pedidos/i })
      .isVisible()
      .catch(() => false)
  ) {
    return null;
  }

  if (await hasEmptyPedidosState(page)) {
    return null;
  }

  return getPedidosPaginationPageInfo(page);
}

async function getVisiblePedidoOrderNumbers(page: Page) {
  return page
    .getByRole("link", { name: /Abrir pedido /i })
    .evaluateAll((elements) =>
      elements
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .map((element) =>
          (element.getAttribute("aria-label") ?? "").replace(
            /^Abrir pedido\s+/i,
            "",
          ),
        )
        .filter(Boolean),
    );
}

async function findPedidoWithCliente(page: Page) {
  await page.goto("/dashboard/pedidos", { waitUntil: "domcontentloaded" });
  await expectPedidosListLoaded(page);

  const orderNumbers = await getVisiblePedidoOrderNumbers(page);
  let checkedCount = 0;

  for (const orderNumber of orderNumbers) {
    checkedCount += 1;

    if (checkedCount > 8) {
      break;
    }

    await page.goto("/dashboard/pedidos", { waitUntil: "domcontentloaded" });
    await expectPedidosListLoaded(page);
    await getPedidoListLink(page, orderNumber).click();
    await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/);

    const informationDialog = await openPedidoPanel(
      page,
      /^informaci.n$/i,
      /informaci.n/i,
    );
    const clienteLink = informationDialog
      .locator("section")
      .filter({ has: informationDialog.getByRole("heading", { name: /^cliente$/i }) })
      .getByRole("link");
    let clienteName = "";

    if (await clienteLink.isVisible().catch(() => false)) {
      clienteName = (await clienteLink.innerText()).trim();
    }

    const closeButton = informationDialog.getByRole("button", {
      name: /cerrar/i,
    });

    await closeButton.click();

    if (clienteName) {
      return { orderNumber, clienteName };
    }
  }

  return null;
}

async function findPedidoWithSolicitud(page: Page) {
  await page.goto("/dashboard/pedidos", { waitUntil: "domcontentloaded" });
  await expectPedidosListLoaded(page);

  const orderNumbers = await getVisiblePedidoOrderNumbers(page);
  let checkedCount = 0;

  for (const orderNumber of orderNumbers) {
    checkedCount += 1;

    if (checkedCount > 8) {
      break;
    }

    await page.goto("/dashboard/pedidos", { waitUntil: "domcontentloaded" });
    await expectPedidosListLoaded(page);
    await getPedidoListLink(page, orderNumber).click();
    await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/);

    const informationDialog = await openPedidoPanel(
      page,
      /^informaci.n$/i,
      /informaci.n/i,
    );
    const solicitudSection = informationDialog.locator("section").filter({
      has: informationDialog.getByRole("heading", {
        name: /solicitud de origen/i,
      }),
    });
    const solicitudLink = solicitudSection
      .getByRole("link", { name: /personalizaci.n|impresi.n|dise.o/i });
    let serviceLabel = "";
    let solicitudId = "";

    if (await solicitudLink.isVisible().catch(() => false)) {
      serviceLabel = (await solicitudLink.innerText()).trim();
      const href = await solicitudLink.getAttribute("href");

      solicitudId = href?.match(
        /\/dashboard\/solicitudes\/([0-9a-f-]{36})/i,
      )?.[1] ?? "";
    }

    const closeButton = informationDialog.getByRole("button", {
      name: /cerrar/i,
    });

    await closeButton.click();

    if (serviceLabel && solicitudId) {
      return { orderNumber, serviceLabel, solicitudId };
    }
  }

  return null;
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

  return {
    detailUrl: page.url(),
    orderNumber: await getCurrentPedidoOrderNumber(page),
  };
}

async function createClienteForPedidoSelector(page: Page) {
  await page.goto("/dashboard/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo cliente/i });

  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^nombre/i).fill(clienteLabel);
  await dialog.getByLabel(/tel.fono/i).fill(selectorClientePhone);
  await dialog.getByLabel(/correo electr.nico/i).fill(selectorClienteEmail);
  await dialog.getByLabel(/notas/i).fill(selectorClienteNotes);
  await dialog.getByRole("button", { name: /crear cliente/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expectNoTechnicalLeakText(page);
}

async function createPedidoForWorkerSelector(page: Page) {
  await loginAs(page, "admin");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(workerSelectorPedidoTitle);
  await dialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill(workerSelectorPedidoDescription);
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill("150");
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expectPedidosListLoaded(page);

  const createdPedidoLink = page
    .getByRole("link", { name: /abrir pedido/i })
    .filter({ hasText: workerSelectorPedidoTitle })
    .first();

  await expect(createdPedidoLink).toBeVisible();
  await createdPedidoLink.click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: workerSelectorPedidoTitle,
      exact: true,
    }),
  ).toBeVisible();
  await expectNoTechnicalLeakText(page);

  return page.url();
}

function getClienteCombobox(dialog: Locator) {
  return dialog.getByRole("combobox", { name: /^cliente/i });
}

function getClienteHiddenInput(dialog: Locator) {
  return dialog.locator('input[type="hidden"][name="cliente_id"]');
}

function getClienteListbox(dialog: Locator) {
  return dialog.getByRole("listbox");
}

function getClienteOption(dialog: Locator, label: string | RegExp) {
  const name = typeof label === "string"
    ? new RegExp(escapeRegExp(label), "i")
    : label;

  return dialog.getByRole("option", { name });
}

function getWorkerCombobox(dialog: Locator) {
  return dialog.getByRole("combobox", { name: /^asignar personal$/i });
}

function getWorkerAssignForm(dialog: Locator) {
  return getWorkerCombobox(dialog).locator("xpath=ancestor::form[1]");
}

function getWorkerHiddenInput(dialog: Locator) {
  return getWorkerAssignForm(dialog).locator(
    'input[type="hidden"][name="assigned_profile_id"]',
  );
}

function getWorkerListbox(dialog: Locator) {
  return dialog.getByRole("listbox");
}

function getWorkerOption(dialog: Locator, name: string | RegExp) {
  const optionName = typeof name === "string"
    ? new RegExp(escapeRegExp(name), "i")
    : name;

  return dialog.getByRole("option", { name: optionName });
}

function getWorkerAssignButton(dialog: Locator) {
  return getWorkerAssignForm(dialog).getByRole("button", {
    name: /^asignar personal$/i,
  });
}

async function expectWorkerListboxContainedInDialog(
  listbox: Locator,
  dialog: Locator,
) {
  const dialogBox = await getRequiredBox(dialog);
  const listboxBox = await getRequiredBox(listbox);

  expect(listboxBox.x).toBeGreaterThanOrEqual(dialogBox.x - 1);
  expect(listboxBox.x + listboxBox.width).toBeLessThanOrEqual(
    dialogBox.x + dialogBox.width + 1,
  );
  expect(listboxBox.y).toBeGreaterThanOrEqual(dialogBox.y - 1);

  return { dialogBox, listboxBox };
}

async function expectWorkerListboxScrollBehavior(listbox: Locator) {
  const options = listbox.getByRole("option");
  const optionCount = await options.count();

  expect(optionCount).toBeGreaterThan(0);
  await expect(options.first()).toBeVisible();
  await options.last().scrollIntoViewIfNeeded();
  await expect(options.last()).toBeVisible();

  const metrics = await listbox.evaluate((element) => {
    const htmlElement = element as HTMLElement;
    const style = getComputedStyle(htmlElement);

    return {
      clientHeight: htmlElement.clientHeight,
      scrollHeight: htmlElement.scrollHeight,
      overflowY: style.overflowY,
    };
  });

  expect(metrics.scrollHeight).toBeGreaterThanOrEqual(metrics.clientHeight);

  if (optionCount >= 8 || metrics.scrollHeight > metrics.clientHeight + 1) {
    expect(metrics.overflowY).toMatch(/auto|scroll/i);
  }
}

async function expectWorkerListboxAboveInput(
  listbox: Locator,
  combobox: Locator,
) {
  const inputBox = await getRequiredBox(combobox);
  const listboxBox = await getRequiredBox(listbox);
  const topGap = inputBox.y - (listboxBox.y + listboxBox.height);

  expect(listboxBox.y + listboxBox.height).toBeLessThanOrEqual(
    inputBox.y - 4,
  );
  expect(topGap).toBeGreaterThanOrEqual(4);
  expect(topGap).toBeLessThanOrEqual(8);

  return { inputBox, listboxBox, topGap };
}

async function expectAllWorkerSelectorRequestsUsePedidoId(
  urls: string[],
  pedidoId: string,
) {
  expect(urls.length).toBeGreaterThan(0);

  for (const requestUrl of urls) {
    const url = new URL(requestUrl);

    expect(url.searchParams.get("pedido_id")).toBe(pedidoId);
  }
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
  const progressButton = task.getByRole("button", {
    name: new RegExp(
      `actualizar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`,
      "i",
    ),
  });
  const editButton = task.getByRole("button", {
    name: new RegExp(`editar tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
  });
  const deleteButton = task.getByRole("button", {
    name: new RegExp(`eliminar tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
  });

  await expect(task).toBeVisible();
  await expect(task.getByText(taskProgressPattern(0, 5, "Pendiente")))
    .toBeVisible();
  await expectNoPedidoTaskTechnicalBadges(task);
  await expectPedidoTaskActionOrder(
    task,
    expectedProgressTaskOrder(quantifiedTaskTitle),
  );
  await expect(progressButton).toBeVisible();
  await expect(editButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
  await expectPedidoTaskButtonHasPrimaryTone(progressButton);
  await expectPedidoTaskButtonHasNoPrimaryTone(editButton);
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
  let taskTitle = disposableTaskTitle;
  let task = getPedidoTaskItemInPanel(taskSection, taskTitle);
  let completeButton = task.getByRole("button", {
    name: new RegExp(
      `marcar como completada tarea ${escapeRegExp(taskTitle)}`,
      "i",
    ),
  });
  let editButton = task.getByRole("button", {
    name: new RegExp(`editar tarea ${escapeRegExp(taskTitle)}`, "i"),
  });
  let deleteButton = task.getByRole("button", {
    name: new RegExp(`eliminar tarea ${escapeRegExp(taskTitle)}`, "i"),
  });

  await expect(task).toBeVisible();
  await expect(task.getByText(/^Pendiente$/i)).toBeVisible();
  await expectNoPedidoTaskTechnicalBadges(task);
  await expectPedidoTaskActionOrder(task, expectedCompleteTaskOrder(taskTitle));
  await expect(completeButton).toBeVisible();
  await expect(editButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
  await expectPedidoTaskButtonHasPrimaryTone(completeButton);
  await expectPedidoTaskButtonHasNoPrimaryTone(editButton);

  await completeButton.click();
  await expect(async () => {
    const completedTask = getPedidoTaskItemInPanel(taskSection, taskTitle);
    const reopenButton = completedTask.getByRole("button", {
      name: new RegExp(`reabrir tarea ${escapeRegExp(taskTitle)}`, "i"),
    });
    const completedEditButton = completedTask.getByRole("button", {
      name: new RegExp(`editar tarea ${escapeRegExp(taskTitle)}`, "i"),
    });

    await expect(completedTask.getByText(/^Completada$/i)).toBeVisible();
    await expectPedidoTaskActionOrder(
      completedTask,
      expectedReopenTaskOrder(taskTitle),
    );
    await expect(reopenButton).toBeVisible();
    await expectPedidoTaskButtonHasNoPrimaryTone(reopenButton);
    await expectPedidoTaskButtonHasNoPrimaryTone(completedEditButton);
  }).toPass({ timeout: 15_000 });

  const reopenButton = task.getByRole("button", {
    name: new RegExp(`reabrir tarea ${escapeRegExp(taskTitle)}`, "i"),
  });

  await reopenButton.click();
  await expect(async () => {
    const pendingTask = getPedidoTaskItemInPanel(taskSection, taskTitle);

    await expect(pendingTask.getByText(/^Pendiente$/i)).toBeVisible();
    await expectPedidoTaskActionOrder(
      pendingTask,
      expectedCompleteTaskOrder(taskTitle),
    );
  }).toPass({ timeout: 15_000 });

  editButton = task.getByRole("button", {
    name: new RegExp(`editar tarea ${escapeRegExp(taskTitle)}`, "i"),
  });
  await editButton.click();

  let titleInput = task.getByRole("textbox", {
    name: new RegExp(`editar tarea ${escapeRegExp(taskTitle)}`, "i"),
  });

  await expect(titleInput).toBeVisible();
  await expect(titleInput).toBeFocused();
  await expect(
    task.getByText(/n.*meros del t.*tulo definen la cantidad de la tarea/i),
  ).toBeVisible();
  await expect(
    task.getByRole("button", {
      name: new RegExp(
        `marcar como completada tarea ${escapeRegExp(taskTitle)}`,
        "i",
      ),
    }),
  ).toHaveCount(0);
  await expect(
    task.getByRole("button", {
      name: new RegExp(`editar tarea ${escapeRegExp(taskTitle)}`, "i"),
    }),
  ).toHaveCount(0);
  await expect(
    task.getByRole("button", {
      name: new RegExp(`eliminar tarea ${escapeRegExp(taskTitle)}`, "i"),
    }),
  ).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(titleInput).toHaveCount(0);
  await expect(task.getByText(taskTitlePattern(taskTitle))).toBeVisible();
  editButton = task.getByRole("button", {
    name: new RegExp(`editar tarea ${escapeRegExp(taskTitle)}`, "i"),
  });
  await expect(editButton).toBeFocused();

  await editButton.click();
  titleInput = task.getByRole("textbox", {
    name: new RegExp(`editar tarea ${escapeRegExp(taskTitle)}`, "i"),
  });
  await expect(titleInput).toBeVisible();
  await titleInput.fill(editedDisposableTaskTitle);
  await task
    .getByRole("button", {
      name: new RegExp(`guardar tarea ${escapeRegExp(taskTitle)}`, "i"),
    })
    .click();
  await expect(async () => {
    await expect(
      taskSection.getByText(taskTitlePattern(editedDisposableTaskTitle)),
    ).toBeVisible();
  }).toPass({ timeout: 15_000 });

  taskTitle = editedDisposableTaskTitle;
  task = getPedidoTaskItemInPanel(taskSection, taskTitle);
  completeButton = task.getByRole("button", {
    name: new RegExp(
      `marcar como completada tarea ${escapeRegExp(taskTitle)}`,
      "i",
    ),
  });
  editButton = task.getByRole("button", {
    name: new RegExp(`editar tarea ${escapeRegExp(taskTitle)}`, "i"),
  });
  deleteButton = task.getByRole("button", {
    name: new RegExp(`eliminar tarea ${escapeRegExp(taskTitle)}`, "i"),
  });

  await expect(task).toBeVisible();
  await expectPedidoTaskActionOrder(task, expectedCompleteTaskOrder(taskTitle));
  await expect(completeButton).toBeVisible();
  await expect(editButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();
  let confirmation = task.locator("form").filter({
    hasText: /eliminar esta tarea/i,
  });

  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByText(taskTitlePattern(taskTitle))).toBeVisible();
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
  const taskSection = await getPedidoTasksPanel(page);
  const task = getPedidoTaskItemInPanel(taskSection, quantifiedTaskTitle);
  let progressButton = task.getByRole("button", {
    name: new RegExp(
      `actualizar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`,
      "i",
    ),
  });

  await expect(task).toBeVisible();
  await expectPedidoTaskActionOrder(
    task,
    expectedProgressTaskOrder(quantifiedTaskTitle),
  );
  await expectPedidoTaskButtonHasPrimaryTone(progressButton);
  await progressButton.click();

  let progressInput = task.getByRole("spinbutton", {
    name: new RegExp(
      `actualizar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`,
      "i",
    ),
  });

  await expect(progressInput).toBeVisible();
  await expect(progressInput).toBeFocused();
  await expect(progressInput).toHaveValue("0");
  await expect(progressInput).toHaveAttribute("max", "5");
  await expect(task.getByText(/^de 5$/i)).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(progressInput).toHaveCount(0);
  await expect(task.getByText(taskProgressPattern(0, 5, "Pendiente")))
    .toBeVisible();
  progressButton = task.getByRole("button", {
    name: new RegExp(
      `actualizar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`,
      "i",
    ),
  });
  await expect(progressButton).toBeFocused();
  await expectPedidoTaskActionOrder(
    task,
    expectedProgressTaskOrder(quantifiedTaskTitle),
  );

  await progressButton.click();
  progressInput = task.getByRole("spinbutton", {
    name: new RegExp(
      `actualizar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`,
      "i",
    ),
  });
  await expect(progressInput).toBeVisible();
  await progressInput.fill("5");
  await task
    .getByRole("button", {
      name: new RegExp(
        `guardar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`,
        "i",
      ),
    })
    .click();

  await expect(async () => {
    const completedTask = getPedidoTaskItemInPanel(
      taskSection,
      quantifiedTaskTitle,
    );

    await expect(completedTask.getByRole("spinbutton")).toHaveCount(0);
    await expect(completedTask.getByText(taskProgressPattern(5, 5, "Completada")))
      .toBeVisible();
    await expectPedidoTaskActionOrder(
      completedTask,
      expectedReopenTaskOrder(quantifiedTaskTitle),
    );
  }).toPass({ timeout: 15_000 });
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
  const combobox = getWorkerCombobox(section);

  if ((await combobox.count()) === 0) {
    await expect(
      section.getByText(/no hay m.s usuarios disponibles|no hay personal/i),
    ).toBeVisible();
    return false;
  }

  const pedidoId = page.url().match(/\/dashboard\/pedidos\/([0-9a-f-]+)/i)
    ?.[1];

  expect(pedidoId).toMatch(uuidPattern);

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/personal-asignable" &&
      url.searchParams.get("pedido_id") === pedidoId &&
      (url.searchParams.get("q") ?? "") === ""
    );
  });

  await combobox.focus();
  await responsePromise;

  const listbox = getWorkerListbox(section);

  await expect(listbox).toBeVisible();

  const options = listbox.getByRole("option");
  const optionCount = await options.count();

  if (optionCount === 0) {
    await expect(
      section.getByText(/no hay m.s usuarios disponibles para asignar/i),
    ).toBeVisible();
    return false;
  }

  const workerOption = (await getWorkerOption(section, /trabajador/i).count()) > 0
    ? getWorkerOption(section, /trabajador/i).first()
    : options.first();

  await workerOption.click();
  await expect(getWorkerHiddenInput(section)).toHaveValue(uuidPattern);
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
let encargoOrderNumber = "";
let impresionDetailUrl = "";
let impresionOrderNumber = "";
let assignedEncargoDetailUrl = "";

test("admin can search and select a cliente asynchronously when creating a pedido", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");
  await createClienteForPedidoSelector(page);

  const selectorRequests: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/internal/selectors/clientes")) {
      selectorRequests.push(request.url());
    }
  });

  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });
  const combobox = getClienteCombobox(dialog);
  const hiddenInput = getClienteHiddenInput(dialog);

  await expect(dialog).toBeVisible();
  await expect(combobox).toBeVisible();
  expect(selectorRequests).toHaveLength(0);

  const initialRequestPromise = page.waitForRequest((request) =>
    request.url().includes("/api/internal/selectors/clientes"),
  );

  await combobox.focus();

  const initialRequest = await initialRequestPromise;
  const initialUrl = new URL(initialRequest.url());

  expect(initialUrl.searchParams.get("q") ?? "").toBe("");
  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await expect(combobox).toHaveAttribute("aria-autocomplete", "list");

  let listbox = getClienteListbox(dialog);

  await expect(listbox).toBeVisible();
  const controlsId = await combobox.getAttribute("aria-controls");

  expect(controlsId).toBeTruthy();
  await expect(listbox).toHaveAttribute("id", controlsId as string);
  await expect(getClienteOption(dialog, "Sin cliente asociado")).toBeVisible();
  await expect(async () => {
    const optionCount = await listbox.getByRole("option").count();

    expect(optionCount).toBeGreaterThanOrEqual(2);
    expect(optionCount).toBeLessThanOrEqual(21);
  }).toPass({ timeout: 10_000 });

  const initialOptionCount = await listbox.getByRole("option").count();

  expect(initialOptionCount).toBeLessThanOrEqual(21);

  await combobox.press("ArrowDown");
  const arrowDownActiveDescendant =
    await combobox.getAttribute("aria-activedescendant");

  expect(arrowDownActiveDescendant).toBeTruthy();

  await combobox.press("End");
  const endActiveDescendant =
    await combobox.getAttribute("aria-activedescendant");

  expect(endActiveDescendant).toBeTruthy();

  if (initialOptionCount > 2) {
    expect(endActiveDescendant).not.toBe(arrowDownActiveDescendant);
  }

  await combobox.press("Home");
  await expect(combobox).toHaveAttribute(
    "aria-activedescendant",
    /-option-0$/,
  );
  await combobox.press("Escape");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(combobox).toBeFocused();

  await combobox.click();
  listbox = getClienteListbox(dialog);
  await expect(listbox).toBeVisible();

  const previousVisibleOptionTexts = await listbox
    .getByRole("option")
    .evaluateAll((options) => {
      return options
        .map((option) => option.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter((text) => text && !/Sin cliente asociado/i.test(text));
    });
  expect(previousVisibleOptionTexts.length).toBeGreaterThan(0);

  const inputContainer = combobox.locator("xpath=parent::*");
  const delayedQuery = selectorClientePhone;
  let releaseDelayedRequest: (() => void) | null = null;
  let delayedRequestStarted = false;

  await page.route("**/api/internal/selectors/clientes**", async (route) => {
    const url = new URL(route.request().url());

    if (
      url.searchParams.get("q") === delayedQuery &&
      !delayedRequestStarted
    ) {
      delayedRequestStarted = true;

      await new Promise<void>((resolve) => {
        releaseDelayedRequest = resolve;
      });
    }

    await route.continue();
  });

  const delayedResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === delayedQuery
    );
  });

  await combobox.fill(delayedQuery);
  await expect(async () => {
    expect(delayedRequestStarted).toBe(true);
  }).toPass({ timeout: 10_000 });

  try {
    await expect(inputContainer.locator(".animate-spin")).toBeVisible();
    await expect(listbox).toBeVisible();
    const pendingVisibleOptionTexts = await listbox
      .getByRole("option")
      .evaluateAll((options) => {
        return options
          .map(
            (option) => option.textContent?.replace(/\s+/g, " ").trim() ?? "",
          )
          .filter((text) => text && !/Sin cliente asociado/i.test(text));
      });

    expect(
      pendingVisibleOptionTexts.some((text) =>
        previousVisibleOptionTexts.includes(text),
      ),
    ).toBe(true);
    await expect(listbox.getByText(/Cargando/i)).toHaveCount(0);
    await expect(listbox).toHaveAttribute("aria-busy", "true");
  } finally {
    (releaseDelayedRequest as (() => void) | null)?.();
  }

  await delayedResponsePromise;
  await expect(inputContainer.locator(".animate-spin")).toHaveCount(0);
  await expect(getClienteListbox(dialog)).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(getClienteOption(dialog, clienteLabel)).toBeVisible({
    timeout: 15_000,
  });

  const emailResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === selectorClienteEmail
    );
  });

  await combobox.fill(selectorClienteEmail);
  await emailResponsePromise;
  await expect(getClienteOption(dialog, clienteLabel)).toBeVisible();

  const nameResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === clienteLabel
    );
  });

  await combobox.fill(clienteLabel);
  await nameResponsePromise;
  await expect(getClienteOption(dialog, "Sin cliente asociado")).toHaveCount(0);
  await expect(getClienteOption(dialog, clienteLabel)).toBeVisible();

  listbox = getClienteListbox(dialog);
  const firstOptionText = await listbox.getByRole("option").first().innerText();

  expect(firstOptionText).not.toMatch(/Sin cliente asociado/i);
  await expect(combobox).toHaveAttribute("aria-activedescendant", /-option-0$/);
  await expect(dialog.locator('[aria-live="polite"]')).toBeVisible();

  await combobox.press("Enter");
  await expect(combobox).toHaveValue(clienteLabel);
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(combobox).toBeFocused();

  const selectedClienteId = await hiddenInput.inputValue();

  expect(selectedClienteId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await combobox.click();
  await expect(getClienteOption(dialog, clienteLabel)).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await combobox.fill(`${clienteLabel} editado`);
  await expect(hiddenInput).toHaveValue("");
  expect(await hiddenInput.inputValue()).not.toBe(selectedClienteId);
  await expect(combobox).toHaveAttribute("aria-expanded", "true");

  await combobox.fill("");
  await expect(getClienteOption(dialog, "Sin cliente asociado")).toBeVisible();
  await getClienteOption(dialog, "Sin cliente asociado").click();
  await expect(combobox).toHaveValue("");
  await expect(hiddenInput).toHaveValue("");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");

  const resetNameResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === clienteLabel
    );
  });

  await combobox.fill(clienteLabel);
  await resetNameResponsePromise;
  await expect(getClienteOption(dialog, clienteLabel)).toBeVisible();
  await combobox.press("Enter");

  const resetClienteId = await hiddenInput.inputValue();

  expect(resetClienteId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await dialog.locator("form").evaluate((form) => {
    (form as HTMLFormElement).reset();
  });

  await expect(combobox).toHaveValue("");
  await expect(hiddenInput).toHaveValue("");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(inputContainer.locator(".animate-spin")).toHaveCount(0);
  await expect(getClienteListbox(dialog)).toHaveCount(0);
  await expect(dialog.getByText(/no se pudieron cargar los clientes/i))
    .toHaveCount(0);

  const finalNameResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === clienteLabel
    );
  });

  await combobox.fill(clienteLabel);
  await finalNameResponsePromise;
  await expect(getClienteOption(dialog, clienteLabel)).toBeVisible();
  await combobox.press("Enter");

  const finalClienteId = await hiddenInput.inputValue();

  expect(finalClienteId).toBe(selectedClienteId);

  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(selectorPedidoTitle);
  await dialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill("Pedido creado para validar el selector asincrono de cliente.");
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill("125");
  await dialog.getByRole("button", { name: /crear pedido/i }).click();

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expectPedidosListLoaded(page);
  await expectNoTechnicalLeakText(page);

  const createdPedidoLink = page
    .getByRole("link", { name: /abrir pedido/i })
    .filter({ hasText: selectorPedidoTitle })
    .first();

  await expect(createdPedidoLink).toBeVisible();
  await createdPedidoLink.click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: selectorPedidoTitle,
      exact: true,
    }),
  ).toBeVisible();

  const informationDialog = await openPedidoPanel(
    page,
    /^informaci.n$/i,
    /informaci.n/i,
  );
  const clienteLink = informationDialog.getByRole("link", {
    name: new RegExp(escapeRegExp(clienteLabel), "i"),
  });

  await expect(clienteLink).toBeVisible();
  await expect(clienteLink).toHaveAttribute(
    "href",
    `/dashboard/clientes/${selectedClienteId}`,
  );
  await informationDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(informationDialog).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expectNoHorizontalOverflow(page);
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const mobileDialog = page.getByRole("dialog", { name: /nuevo pedido/i });
  const mobileCombobox = getClienteCombobox(mobileDialog);
  const mobileInputContainer = mobileCombobox.locator("xpath=parent::*");

  await expect(mobileDialog).toBeVisible();
  await expect(mobileCombobox).toBeVisible();

  const mobileRequestPromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      (url.searchParams.get("q") ?? "") === ""
    );
  });

  await mobileCombobox.focus();
  await mobileRequestPromise;

  const mobileListbox = getClienteListbox(mobileDialog);

  await expect(mobileListbox).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoLocatorHorizontalOverflow(mobileDialog);
  await expectNoLocatorHorizontalOverflow(mobileListbox);

  const mobileDialogBox = await getRequiredBox(mobileDialog);
  const mobileListboxBox = await getRequiredBox(mobileListbox);

  expect(mobileListboxBox.x).toBeGreaterThanOrEqual(mobileDialogBox.x - 1);
  expect(mobileListboxBox.x + mobileListboxBox.width).toBeLessThanOrEqual(
    mobileDialogBox.x + mobileDialogBox.width + 1,
  );

  const mobileInputMetrics = await mobileCombobox.evaluate((input) => {
    const box = input.getBoundingClientRect();
    const style = getComputedStyle(input);

    return {
      paddingRight: Number.parseFloat(style.paddingRight),
      width: box.width,
    };
  });

  expect(mobileInputMetrics.paddingRight).toBeGreaterThanOrEqual(40);
  expect(mobileInputMetrics.width).toBeGreaterThan(0);

  let releaseMobileDelayedRequest: (() => void) | null = null;
  let mobileDelayedRequestStarted = false;
  const mobileDelayedQuery = selectorClientePhone.slice(0, 8);

  await page.route("**/api/internal/selectors/clientes**", async (route) => {
    const url = new URL(route.request().url());

    if (
      url.searchParams.get("q") === mobileDelayedQuery &&
      !mobileDelayedRequestStarted
    ) {
      mobileDelayedRequestStarted = true;

      await new Promise<void>((resolve) => {
        releaseMobileDelayedRequest = resolve;
      });
    }

    await route.continue();
  });

  await mobileCombobox.fill(mobileDelayedQuery);
  await expect(async () => {
    expect(mobileDelayedRequestStarted).toBe(true);
  }).toPass({ timeout: 10_000 });

  try {
    const spinner = mobileInputContainer.locator(".animate-spin");

    await expect(spinner).toBeVisible();

    const inputBox = await getRequiredBox(mobileCombobox);
    const spinnerBox = await getRequiredBox(spinner);

    expect(spinnerBox.x).toBeGreaterThan(inputBox.x + inputBox.width - 40);
    expect(spinnerBox.x + spinnerBox.width).toBeLessThanOrEqual(
      inputBox.x + inputBox.width,
    );
  } finally {
    (releaseMobileDelayedRequest as (() => void) | null)?.();
  }

  await expect(mobileInputContainer.locator(".animate-spin")).toHaveCount(0);
});

test(
  "admin can assign and remove personal with the async worker selector",
  async ({ page }) => {
    test.setTimeout(180_000);

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, "admin");

    const forbiddenBackendMessages = [
      /PGRST103/i,
      /Requested range not satisfiable/i,
      /Error searching assignable workers for selector/i,
      /Unexpected error searching assignable workers for selector/i,
      /Error listing existing pedido worker assignments for selector/i,
      /No se pudo cargar el personal asignable/i,
    ];
    const backendErrors: string[] = [];

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

    const workerSelectorDetailUrl = await createPedidoForWorkerSelector(page);
    const workerSelectorRequests: string[] = [];

    page.on("request", (request) => {
      if (
        request.url().includes(
          "/api/internal/selectors/personal-asignable",
        )
      ) {
        workerSelectorRequests.push(request.url());
      }
    });

    await page.goto(workerSelectorDetailUrl);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: workerSelectorPedidoTitle,
        exact: true,
      }),
    ).toBeVisible();

    const pedidoIdMatch = page
      .url()
      .match(/\/dashboard\/pedidos\/([0-9a-f-]+)/i);
    const workerSelectorPedidoId = pedidoIdMatch?.[1] ?? "";

    expect(workerSelectorPedidoId).toMatch(uuidPattern);
    expect(workerSelectorRequests).toHaveLength(0);

    const personnelDialog = await openPedidoPanel(
      page,
      /^personal$/i,
      /personal/i,
    );

    await expect(
      personnelDialog.getByText(
        /No hay personal asignado a este pedido\./i,
      ),
    ).toBeVisible();
    await expect(
      personnelDialog.getByText(/^Asignar personal$/i),
    ).toBeVisible();
    expect(workerSelectorRequests).toHaveLength(0);

    const combobox = getWorkerCombobox(personnelDialog);
    const hiddenInput = getWorkerHiddenInput(personnelDialog);
    const assignButton = getWorkerAssignButton(personnelDialog);
    const assignForm = getWorkerAssignForm(personnelDialog);

    await expect(combobox).toBeVisible();
    await expect(hiddenInput).toHaveValue("");
    await expect(combobox).toHaveValue("");

    const initialInputBox = await getRequiredBox(combobox);
    const initialButtonBox = await getRequiredBox(assignButton);
    const initialFormBox = await getRequiredBox(assignForm);
    const initialDialogBox = await getRequiredBox(personnelDialog);

    expect(Math.abs(initialButtonBox.y - initialInputBox.y))
      .toBeLessThanOrEqual(4);
    expect(initialButtonBox.x).toBeGreaterThan(
      initialInputBox.x + initialInputBox.width - 1,
    );

    const initialResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        (url.searchParams.get("q") ?? "") === ""
      );
    });

    await combobox.focus();
    const initialResponse = await initialResponsePromise;
    const initialResponseBody = await initialResponse.json() as {
      options?: Array<{ value?: string; label?: string; description?: string }>;
    };

    expect(workerSelectorRequests).toHaveLength(1);
    await expectAllWorkerSelectorRequestsUsePedidoId(
      workerSelectorRequests,
      workerSelectorPedidoId,
    );
    await expect(combobox).toHaveAttribute("aria-expanded", "true");
    await expect(combobox).toHaveAttribute("aria-autocomplete", "list");
    await expect(combobox).toHaveAttribute("aria-required", "true");

    let workerListbox = getWorkerListbox(personnelDialog);
    const controlsId = await combobox.getAttribute("aria-controls");

    expect(controlsId).toBeTruthy();
    await expect(workerListbox).toHaveAttribute("id", controlsId as string);
    await expect(workerListbox).toBeVisible();
    await expect(getWorkerOption(personnelDialog, "Sin cliente asociado"))
      .toHaveCount(0);
    await expect(workerListbox.getByText(/Cargando/i)).toHaveCount(0);
    await expect(personnelDialog.locator('[aria-live="polite"]'))
      .toHaveCount(1);

    const initialWorkerOptionCount =
      await workerListbox.getByRole("option").count();

    expect(initialWorkerOptionCount).toBeGreaterThanOrEqual(1);
    expect(initialWorkerOptionCount).toBeLessThanOrEqual(20);
    expect(initialResponseBody.options?.length).toBe(initialWorkerOptionCount);

    const {
      inputBox: openInputBox,
      listboxBox,
      topGap,
    } = await expectWorkerListboxAboveInput(workerListbox, combobox);
    const openButtonBox = await getRequiredBox(assignButton);
    const openFormBox = await getRequiredBox(assignForm);
    const openDialogBox = await getRequiredBox(personnelDialog);

    expect(Math.abs(openInputBox.y - initialInputBox.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(openButtonBox.y - initialButtonBox.y))
      .toBeLessThanOrEqual(2);
    expect(Math.abs(openFormBox.height - initialFormBox.height))
      .toBeLessThanOrEqual(2);
    expect(Math.abs(openFormBox.y - initialFormBox.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(openDialogBox.height - initialDialogBox.height))
      .toBeLessThanOrEqual(2);
    await expectWorkerListboxContainedInDialog(workerListbox, personnelDialog);
    await expectWorkerListboxScrollBehavior(workerListbox);

    const firstOption = workerListbox.getByRole("option").first();
    const selectedWorkerName = (
      await firstOption.locator("span").first().innerText()
    ).trim();
    const selectedWorkerRoleLabel = (
      await firstOption.locator("span").nth(1).innerText()
    ).trim();

    expect(selectedWorkerName.length).toBeGreaterThanOrEqual(2);
    expect(selectedWorkerRoleLabel).toMatch(
      /^(Administrador|Supervisor|Trabajador)$/i,
    );

    await combobox.press("ArrowDown");
    const arrowDownActiveDescendant =
      await combobox.getAttribute("aria-activedescendant");

    expect(arrowDownActiveDescendant).toBeTruthy();

    await combobox.press("End");
    const endActiveDescendant =
      await combobox.getAttribute("aria-activedescendant");

    expect(endActiveDescendant).toBeTruthy();

    if (initialWorkerOptionCount > 1) {
      expect(endActiveDescendant).not.toBe(arrowDownActiveDescendant);
    }

    await combobox.press("Home");
    await expect(combobox).toHaveAttribute(
      "aria-activedescendant",
      /-option-0$/,
    );
    await expect(firstOption).toHaveAttribute("aria-selected", "false");
    await combobox.press("Escape");
    await expect(combobox).toHaveAttribute("aria-expanded", "false");
    await expect(combobox).toBeFocused();

    await assignButton.click();
    await expect(personnelDialog).toBeVisible();
    await expect(combobox).toBeFocused();
    await expect(hiddenInput).toHaveValue("");
    await expect(combobox).toHaveJSProperty(
      "validationMessage",
      "Selecciona una opcion de la lista.",
    );

    const freeTextQuery = `zz-personal-${runId}`;
    const freeTextResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        url.searchParams.get("q") === freeTextQuery
      );
    });

    await combobox.fill(freeTextQuery);
    await freeTextResponsePromise;
    await expect(hiddenInput).toHaveValue("");
    await assignButton.click();
    await expect(personnelDialog).toBeVisible();
    await expect(combobox).toHaveJSProperty(
      "validationMessage",
      "Selecciona una opcion de la lista.",
    );
    await expect(
      personnelDialog.getByText(/Personal asignado correctamente\./i),
    ).toHaveCount(0);

    const resetEmptyResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        (url.searchParams.get("q") ?? "") === ""
      );
    });

    await combobox.fill("");
    await resetEmptyResponsePromise;
    await expect(hiddenInput).toHaveValue("");
    workerListbox = getWorkerListbox(personnelDialog);
    await expect(workerListbox).toBeVisible();

    const requestCountBeforeShortQuery = workerSelectorRequests.length;

    await combobox.fill("z");
    await expect(
      getWorkerListbox(personnelDialog).getByText(
        /Escribe al menos 2 caracteres\./i,
      ),
    ).toBeVisible();
    expect(workerSelectorRequests).toHaveLength(requestCountBeforeShortQuery);
    await expect(hiddenInput).toHaveValue("");

    const restoreOptionsResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        url.searchParams.get("q") === selectedWorkerName
      );
    });

    await combobox.fill(selectedWorkerName);
    await restoreOptionsResponsePromise;
    workerListbox = getWorkerListbox(personnelDialog);
    await expect(getWorkerOption(personnelDialog, selectedWorkerName))
      .toBeVisible();

    const previousVisibleOptionTexts = await workerListbox
      .getByRole("option")
      .evaluateAll((options) =>
        options.map(
          (option) => option.textContent?.replace(/\s+/g, " ").trim() ?? "",
        ),
      );
    const delayedWorkerQuery = selectedWorkerName.length > 2
      ? selectedWorkerName.slice(0, 2)
      : `${selectedWorkerName}a`;
    let releaseDelayedRequest: (() => void) | null = null;
    let delayedRequestStarted = false;

    await page.route(
      "**/api/internal/selectors/personal-asignable**",
      async (route) => {
        const url = new URL(route.request().url());

        if (
          url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
          url.searchParams.get("q") === delayedWorkerQuery &&
          !delayedRequestStarted
        ) {
          delayedRequestStarted = true;

          await new Promise<void>((resolve) => {
            releaseDelayedRequest = resolve;
          });
        }

        await route.continue();
      },
    );

    const delayedWorkerResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        url.searchParams.get("q") === delayedWorkerQuery
      );
    });

    await combobox.fill(delayedWorkerQuery);
    await expect(async () => {
      expect(delayedRequestStarted).toBe(true);
    }).toPass({ timeout: 10_000 });

    try {
      await expect(combobox.locator("xpath=parent::*").locator(".animate-spin"))
        .toBeVisible();
      await expect(workerListbox).toHaveAttribute("aria-busy", "true");
      const pendingVisibleOptionTexts = await workerListbox
        .getByRole("option")
        .evaluateAll((options) =>
          options.map(
            (option) => option.textContent?.replace(/\s+/g, " ").trim() ?? "",
          ),
        );

      expect(
        pendingVisibleOptionTexts.some((text) =>
          previousVisibleOptionTexts.includes(text),
        ),
      ).toBe(true);
      await expect(workerListbox.getByText(/Cargando/i)).toHaveCount(0);

      const pendingInputBox = await getRequiredBox(combobox);
      const pendingButtonBox = await getRequiredBox(assignButton);
      const pendingFormBox = await getRequiredBox(assignForm);

      await expectWorkerListboxAboveInput(workerListbox, combobox);
      expect(Math.abs(pendingInputBox.y - initialInputBox.y))
        .toBeLessThanOrEqual(2);
      expect(Math.abs(pendingButtonBox.y - initialButtonBox.y))
        .toBeLessThanOrEqual(2);
      expect(Math.abs(pendingFormBox.height - initialFormBox.height))
        .toBeLessThanOrEqual(2);
    } finally {
      (releaseDelayedRequest as (() => void) | null)?.();
    }

    await delayedWorkerResponsePromise;
    await expect(combobox.locator("xpath=parent::*").locator(".animate-spin"))
      .toHaveCount(0);
    await expect(getWorkerListbox(personnelDialog)).not.toHaveAttribute(
      "aria-busy",
      "true",
    );

    const nameResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        url.searchParams.get("q") === selectedWorkerName
      );
    });

    await combobox.fill(selectedWorkerName);
    const nameResponse = await nameResponsePromise;
    const nameResponseBody = await nameResponse.json() as {
      options?: Array<{ value?: string; label?: string; description?: string }>;
    };

    await expect(getWorkerOption(personnelDialog, selectedWorkerName))
      .toBeVisible();
    await expect(getWorkerOption(personnelDialog, selectedWorkerRoleLabel))
      .toBeVisible();
    await expect(combobox).toHaveAttribute(
      "aria-activedescendant",
      /-option-0$/,
    );
    await expectWorkerListboxAboveInput(getWorkerListbox(personnelDialog), combobox);

    await combobox.press("Enter");
    await expect(combobox).toHaveValue(selectedWorkerName);
    await expect(combobox).toHaveAttribute("aria-expanded", "false");
    await expect(combobox).toBeFocused();

    const selectedWorkerId = await hiddenInput.inputValue();

    expect(selectedWorkerId).toMatch(uuidPattern);
    expect(
      nameResponseBody.options?.some(
        (option) =>
          option.value === selectedWorkerId &&
          option.label === selectedWorkerName &&
          option.description === selectedWorkerRoleLabel,
      ),
    ).toBe(true);

    await combobox.click();
    await expect(getWorkerOption(personnelDialog, selectedWorkerName))
      .toHaveAttribute("aria-selected", "true");
    await combobox.press("Escape");

    await assignButton.click();
    await expect(
      personnelDialog.getByText(/Personal asignado correctamente\./i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      personnelDialog.getByText(/No hay personal asignado a este pedido\./i),
    ).toHaveCount(0);

    const assignmentRow = personnelDialog
      .locator("li")
      .filter({ hasText: selectedWorkerName })
      .first();

    await expect(assignmentRow).toBeVisible();
    await expect(assignmentRow.getByText(selectedWorkerRoleLabel))
      .toBeVisible();
    await expect(assignmentRow.getByRole("button", { name: /^Quitar$/i }))
      .toBeVisible();
    await expect(getWorkerCombobox(personnelDialog)).toHaveValue("");
    await expect(getWorkerHiddenInput(personnelDialog)).toHaveValue("");
    await expect(getWorkerCombobox(personnelDialog)).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    const exclusionResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        url.searchParams.get("q") === selectedWorkerName
      );
    });

    const postAssignCombobox = getWorkerCombobox(personnelDialog);

    await postAssignCombobox.focus();
    await postAssignCombobox.fill(selectedWorkerName);
    const exclusionResponse = await exclusionResponsePromise;
    const exclusionBody = await exclusionResponse.json() as {
      options?: Array<{ value?: string; label?: string; description?: string }>;
    };

    expect(exclusionBody.options ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: selectedWorkerId }),
      ]),
    );
    await expect(getWorkerOption(personnelDialog, selectedWorkerName))
      .toHaveCount(0);
    if ((exclusionBody.options ?? []).length === 0) {
      await expect(
        getWorkerListbox(personnelDialog).getByText(
          /No hay usuarios disponibles con esa busqueda\./i,
        ),
      ).toBeVisible();
    }

    await postAssignCombobox.press("Escape");
    await assignmentRow.getByRole("button", { name: /^Quitar$/i }).click();
    await expect(
      personnelDialog.getByText(/Asignaci.n removida correctamente\./i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(assignmentRow).toHaveCount(0);
    await expect(
      personnelDialog.getByText(
        /No hay personal asignado a este pedido\./i,
      ),
    ).toBeVisible();
    await expect(getWorkerCombobox(personnelDialog)).toHaveValue("");
    await expect(getWorkerHiddenInput(personnelDialog)).toHaveValue("");

    const reappearanceResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        url.searchParams.get("q") === selectedWorkerName
      );
    });

    const postRemoveCombobox = getWorkerCombobox(personnelDialog);

    await postRemoveCombobox.focus();
    await postRemoveCombobox.fill(selectedWorkerName);
    await reappearanceResponsePromise;
    await expect(getWorkerOption(personnelDialog, selectedWorkerName))
      .toBeVisible();
    await expect(getWorkerOption(personnelDialog, selectedWorkerRoleLabel))
      .toBeVisible();
    await expectWorkerListboxAboveInput(
      getWorkerListbox(personnelDialog),
      postRemoveCombobox,
    );

    await personnelDialog.getByRole("button", { name: /cerrar/i }).click();
    await expect(personnelDialog).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(workerSelectorDetailUrl);
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: /m.s acciones/i }).click();
    const mobileMoreDialog = page.getByRole("dialog", {
      name: /^m.s acciones$/i,
    });

    await expect(mobileMoreDialog).toBeVisible();
    await mobileMoreDialog.getByRole("button", { name: /personal/i }).click();

    const mobilePersonnelDialog = page.getByRole("dialog", {
      name: /^personal$/i,
    });

    await expect(mobilePersonnelDialog).toBeVisible();
    const mobileCombobox = getWorkerCombobox(mobilePersonnelDialog);
    const mobileHiddenInput = getWorkerHiddenInput(mobilePersonnelDialog);
    const mobileAssignButton = getWorkerAssignButton(mobilePersonnelDialog);
    const mobileAssignForm = getWorkerAssignForm(mobilePersonnelDialog);

    await expect(mobileCombobox).toBeVisible();
    await expect(mobileAssignButton).toBeVisible();
    await expect(mobileHiddenInput).toHaveValue("");

    const mobileInitialInputBox = await getRequiredBox(mobileCombobox);
    const mobileInitialButtonBox = await getRequiredBox(mobileAssignButton);
    const mobileInitialFormBox = await getRequiredBox(mobileAssignForm);

    expect(mobileInitialButtonBox.y).toBeGreaterThan(
      mobileInitialInputBox.y + mobileInitialInputBox.height - 1,
    );
    expect(mobileInitialButtonBox.width).toBeGreaterThanOrEqual(
      mobileInitialInputBox.width - 4,
    );
    await expectNoHorizontalOverflow(page);

    const mobileInitialResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());

      return (
        url.pathname === "/api/internal/selectors/personal-asignable" &&
        url.searchParams.get("pedido_id") === workerSelectorPedidoId &&
        (url.searchParams.get("q") ?? "") === ""
      );
    });

    await mobileCombobox.focus();
    await mobileInitialResponsePromise;

    const mobileListbox = getWorkerListbox(mobilePersonnelDialog);

    await expect(mobileListbox).toBeVisible();
    await expectWorkerListboxAboveInput(mobileListbox, mobileCombobox);
    const mobileOpenInputBox = await getRequiredBox(mobileCombobox);
    const mobileOpenButtonBox = await getRequiredBox(mobileAssignButton);
    const mobileOpenFormBox = await getRequiredBox(mobileAssignForm);

    expect(Math.abs(mobileOpenInputBox.y - mobileInitialInputBox.y))
      .toBeLessThanOrEqual(2);
    expect(Math.abs(mobileOpenButtonBox.y - mobileInitialButtonBox.y))
      .toBeLessThanOrEqual(2);
    expect(Math.abs(mobileOpenFormBox.height - mobileInitialFormBox.height))
      .toBeLessThanOrEqual(2);
    await expectWorkerListboxContainedInDialog(
      mobileListbox,
      mobilePersonnelDialog,
    );
    await expectWorkerListboxScrollBehavior(mobileListbox);
    await expectNoHorizontalOverflow(page);

    await expectAllWorkerSelectorRequestsUsePedidoId(
      workerSelectorRequests,
      workerSelectorPedidoId,
    );
    expect(backendErrors).toHaveLength(0);

    console.info(
      [
        `[worker selector] pedidoId=${workerSelectorPedidoId}`,
        `initialOptions=${initialWorkerOptionCount}`,
        `selectedWorker=${selectedWorkerName}`,
        `selectedRole=${selectedWorkerRoleLabel}`,
        `selectedWorkerId=${selectedWorkerId}`,
        `topGap=${topGap}`,
        `listboxBottom=${listboxBox.y + listboxBox.height}`,
      ].join(" "),
    );
  },
);

test("admin can create and manage focal internal pedidos", async ({ page }) => {
  test.setTimeout(180_000);

  await loginAs(page, "admin");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expect(
    page.getByRole("button", { name: /nuevo pedido/i }),
  ).toBeVisible();

  const encargoFixture = await createManualPedido(
    page,
    "encargo",
    encargoTitle,
    "500",
  );
  encargoDetailUrl = encargoFixture.detailUrl;
  encargoOrderNumber = encargoFixture.orderNumber;

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

  const impresionFixture = await createManualPedido(
    page,
    "impresion",
    impresionTitle,
    "300",
  );
  impresionDetailUrl = impresionFixture.detailUrl;
  impresionOrderNumber = impresionFixture.orderNumber;
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

test("admin can validate pedidos pagination and canonical URLs", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");
  expect(encargoOrderNumber).not.toBe("");
  expect(impresionOrderNumber).not.toBe("");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expectNoPedidosLoadError(page);

  if (!(await hasEmptyPedidosState(page))) {
    await expectPedidosPaginationA11y(page);

    const pageInfo = await getPedidosPaginationPageInfo(page);
    const summary = await getPedidosPaginationSummary(page);

    expect(pageInfo.currentPage).toBe(1);
    expect(pageInfo.totalPages).toBeGreaterThanOrEqual(1);
    expect(summary.startItem).toBe(1);
    expect(summary.endItem).toBe(Math.min(50, summary.totalCount));
    await expectDisabledPaginationControl(getPreviousPedidoPageControl(page));
    await expectNoHorizontalOverflow(page);

    console.info(
      `[pedidos pagination] totalCount=${summary.totalCount} totalPages=${pageInfo.totalPages}`,
    );

    await page.goto("/dashboard/pedidos?page=1");
    await expectPedidosListLoaded(page);
    expect((await getCurrentPedidosUrl(page)).pathname).toBe(
      "/dashboard/pedidos",
    );
    expect((await getCurrentPedidosUrl(page)).search).toBe("");

    await page.goto("/dashboard/pedidos?page=abc");
    await expectPedidosListLoaded(page);
    expect((await getCurrentPedidosUrl(page)).pathname).toBe(
      "/dashboard/pedidos",
    );
    expect((await getCurrentPedidosUrl(page)).search).toBe("");

    const outOfRangePage = pageInfo.totalPages + 1;

    await page.goto(`/dashboard/pedidos?page=${outOfRangePage}`);
    await expectPedidosListLoaded(page);
    await expectNoPedidosLoadError(page);

    const lastUrl = await getCurrentPedidosUrl(page);
    const lastPageInfo = await getPedidosPaginationPageInfo(page);
    const lastSummary = await getPedidosPaginationSummary(page);

    expect(lastUrl.pathname).toBe("/dashboard/pedidos");
    if (pageInfo.totalPages > 1) {
      expect(lastUrl.searchParams.get("page")).toBe(String(pageInfo.totalPages));
    } else {
      expect(lastUrl.searchParams.has("page")).toBe(false);
    }
    expect(lastPageInfo.currentPage).toBe(pageInfo.totalPages);
    expect(lastSummary.endItem).toBe(summary.totalCount);
    await expectDisabledPaginationControl(getNextPedidoPageControl(page));
  }

  await page.goto("/dashboard/pedidos?payment_status=pagado&page=999999");
  const paidLast = await expectCanonicalLastPedidosPage(page, {
    payment_status: "pagado",
  });

  if (paidLast) {
    await expectOnlyVisiblePedidosWithText(
      page,
      /Pagado/i,
      /Sin pagar|Pago parcial/i,
    );
  }

  await page.goto(
    `/dashboard/pedidos?q=${encodeURIComponent(
      encargoTitle,
    )}&payment_status=pagado&page=999999`,
  );
  await expectPedidosListLoaded(page);
  await expectNoPedidosLoadError(page);

  const paidSearchUrl = await getCurrentPedidosUrl(page);

  expect(paidSearchUrl.searchParams.get("q")).toBe(encargoTitle);
  expect(paidSearchUrl.searchParams.get("payment_status")).toBe("pagado");
  expect(paidSearchUrl.searchParams.has("page")).toBe(false);
  await expect(getPedidoListLink(page, encargoOrderNumber)).toBeVisible();
  await expect(getPedidoListLink(page, encargoOrderNumber)).toContainText(
    /Pagado/i,
  );

  await page.goto(
    `/dashboard/pedidos?q=${encodeURIComponent(
      encargoTitle,
    )}&payment_status=sin_pago`,
  );
  await expectPedidosListLoaded(page);
  await expectNoPedidosLoadError(page);
  expect(await hasEmptyPedidosState(page)).toBe(true);
  await expect(getPedidoListLink(page, encargoOrderNumber)).toHaveCount(0);

  const filterScenarios: Array<{
    url: string;
    params: Record<string, string>;
    expected: RegExp;
    unexpected?: RegExp;
  }> = [
    {
      url: "/dashboard/pedidos?status=nuevo&page=999999",
      params: { status: "nuevo" },
      expected: /Creado|Solicitud recibida/i,
      unexpected:
        /En revisi.n|En producci.n|Listo para entrega|Entregado|Cancelado/i,
    },
    {
      url: "/dashboard/pedidos?workflow_type=encargo&page=999999",
      params: { workflow_type: "encargo" },
      expected: /Encargo/i,
    },
    {
      url: "/dashboard/pedidos?payment_status=sin_pago&page=999999",
      params: { payment_status: "sin_pago" },
      expected: /Sin pagar/i,
      unexpected: /Pagado|Pago parcial/i,
    },
  ];

  for (const scenario of filterScenarios) {
    await page.goto(scenario.url);
    const last = await expectCanonicalLastPedidosPage(page, scenario.params);

    if (last) {
      await expectOnlyVisiblePedidosWithText(
        page,
        scenario.expected,
        scenario.unexpected,
      );
    }
  }

  await page.goto(
    "/dashboard/pedidos?status=invalido&workflow_type=desconocido&payment_status=incorrecto&page=abc",
  );
  await expectPedidosListLoaded(page);
  await expectNoPedidosLoadError(page);
  await expect(page.getByText(/filtro de estado no es v.lido/i)).toBeVisible();
  await expect(page.getByText(/filtro de tipo no es v.lido/i)).toBeVisible();
  await expect(page.getByText(/filtro de pago no es v.lido/i)).toBeVisible();

  const invalidUrl = await getCurrentPedidosUrl(page);

  expect(invalidUrl.searchParams.get("status")).toBe("invalido");
  expect(invalidUrl.searchParams.get("workflow_type")).toBe("desconocido");
  expect(invalidUrl.searchParams.get("payment_status")).toBe("incorrecto");
  expect(invalidUrl.searchParams.has("page")).toBe(false);
});

test("pedido search preserves direct search capabilities", async ({ page }) => {
  test.setTimeout(90_000);

  test.skip(!encargoOrderNumber, "The focal encargo order number is missing.");

  await loginAs(page, "admin");

  for (const query of [
    encargoOrderNumber,
    encargoTitle,
    `Encargo focal para ${clienteLabel}`,
  ]) {
    await submitPedidoSearch(page, query);
    await expect(getPedidoListLink(page, encargoOrderNumber)).toBeVisible();
  }
});

test("pedido search resolves related cliente data", async ({ page }) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");

  const pedidoWithCliente = await findPedidoWithCliente(page);

  if (pedidoWithCliente === null) {
    test.skip(
      true,
      "La búsqueda relacional requiere un pedido con cliente asociado.",
    );
    return;
  }

  await submitPedidoSearch(page, pedidoWithCliente.clienteName);
  await expect(
    getPedidoListLink(page, pedidoWithCliente.orderNumber),
  ).toBeVisible();
  console.info("[pedidos pagination] cliente relational search executed");
});

test("pedido search resolves related solicitud data", async ({ page }) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");

  const pedidoWithSolicitud = await findPedidoWithSolicitud(page);

  if (pedidoWithSolicitud === null) {
    test.skip(
      true,
      "La búsqueda por solicitud requiere un pedido con solicitud asociada.",
    );
    return;
  }

  await submitPedidoSearch(page, pedidoWithSolicitud.serviceLabel);
  await expect(
    getPedidoListLink(page, pedidoWithSolicitud.orderNumber),
  ).toBeVisible();

  const solicitudReferenceQuery = pedidoWithSolicitud.solicitudId
    .replace(/-/g, "")
    .slice(0, 8);

  await submitPedidoSearch(page, solicitudReferenceQuery);
  await expect(
    getPedidoListLink(page, pedidoWithSolicitud.orderNumber),
  ).toBeVisible();
  console.info("[pedidos pagination] solicitud relational search executed");
});

test("admin can navigate between pedidos pages", async ({ page }) => {
  test.setTimeout(90_000);

  await loginAs(page, "admin");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expectNoPedidosLoadError(page);

  test.skip(
    await hasEmptyPedidosState(page),
    "La navegación de pedidos requiere pedidos visibles.",
  );

  const initialPageInfo = await getPedidosPaginationPageInfo(page);
  const initialSummary = await getPedidosPaginationSummary(page);

  test.skip(
    initialPageInfo.totalPages < 2,
    "La navegación de pedidos requiere al menos 51 pedidos visibles.",
  );

  expect(initialPageInfo.currentPage).toBe(1);
  expect(initialSummary.startItem).toBe(1);
  expect(initialSummary.endItem).toBe(50);
  await expectDisabledPaginationControl(getPreviousPedidoPageControl(page));
  await expectPaginationTouchTarget(getNextPedidoPageLink(page));

  await getNextPedidoPageLink(page).click();
  await expect
    .poll(async () => (await getCurrentPedidosUrl(page)).searchParams.get("page"))
    .toBe("2");

  const secondPageInfo = await getPedidosPaginationPageInfo(page);
  const secondSummary = await getPedidosPaginationSummary(page);

  expect(secondPageInfo.currentPage).toBe(2);
  expect(secondPageInfo.totalPages).toBe(initialPageInfo.totalPages);
  expect(secondSummary.startItem).toBe(51);
  expect(secondSummary.endItem).toBe(
    Math.min(100, initialSummary.totalCount),
  );
  expect(secondSummary.totalCount).toBe(initialSummary.totalCount);
  await expectPaginationTouchTarget(getPreviousPedidoPageLink(page));

  if (initialPageInfo.totalPages === 2) {
    await expectDisabledPaginationControl(getNextPedidoPageControl(page));
  } else {
    await expect(getNextPedidoPageLink(page)).toHaveAttribute(
      "href",
      /page=3/,
    );
  }

  await getPreviousPedidoPageLink(page).click();
  await expect
    .poll(async () => (await getCurrentPedidosUrl(page)).search)
    .toBe("");
});

test("pedido pagination preserves the active search", async ({ page }) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");

  let selectedQuery = "";

  for (const query of ["a", "e", "i", "o", "5"]) {
    const pageInfo = await loadPedidoSearchCandidate(page, query);

    if (pageInfo && pageInfo.totalPages > 1) {
      selectedQuery = query;
      break;
    }
  }

  test.skip(
    !selectedQuery,
    "La preservación de búsqueda requiere un término con más de una página.",
  );

  await expect(page.getByLabel(/buscar pedidos/i)).toHaveValue(selectedQuery);
  await getNextPedidoPageLink(page).click();

  await expect
    .poll(async () => {
      const url = await getCurrentPedidosUrl(page);

      return {
        page: url.searchParams.get("page"),
        q: url.searchParams.get("q"),
      };
    })
    .toEqual({ page: "2", q: selectedQuery });

  const secondPageInfo = await getPedidosPaginationPageInfo(page);

  expect(secondPageInfo.currentPage).toBe(2);
  await expect(page.getByLabel(/buscar pedidos/i)).toHaveValue(selectedQuery);
});

test("pedido filters remove pagination from the URL", async ({ page }) => {
  test.setTimeout(90_000);

  await loginAs(page, "admin");
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);

  test.skip(
    await hasEmptyPedidosState(page),
    "El reinicio de filtros requiere pedidos visibles.",
  );

  const pageInfo = await getPedidosPaginationPageInfo(page);

  test.skip(
    pageInfo.totalPages < 2,
    "El reinicio de filtros requiere al menos dos páginas.",
  );

  await page.goto("/dashboard/pedidos?page=2");
  await expectPedidosListLoaded(page);
  await getPedidosFiltersToggle(page).click();
  await page.getByLabel(/^Tipo$/i).selectOption("encargo");

  await expect
    .poll(async () => {
      const url = await getCurrentPedidosUrl(page);

      return {
        page: url.searchParams.get("page"),
        workflowType: url.searchParams.get("workflow_type"),
      };
    })
    .toEqual({ page: null, workflowType: "encargo" });
});

test("pedidos pagination remains usable on mobile", async ({ page }) => {
  test.setTimeout(90_000);

  await loginAs(page, "admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/pedidos");
  await expectPedidosListLoaded(page);
  await expect(page.getByRole("heading", { name: /^pedidos$/i })).toBeVisible();
  await expect(page.getByLabel(/buscar pedidos/i)).toBeVisible();
  await expect(getPedidosFiltersToggle(page)).toBeVisible();

  if (!(await hasEmptyPedidosState(page))) {
    await expectPedidosPaginationA11y(page);
  }

  await expectNoHorizontalOverflow(page);
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

  await returnPedidoToProduction(page);
  await page.setViewportSize({ width: 390, height: 844 });
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

  await mobileTasksTrigger.click();
  const mobileTasksDialog = page.getByRole("dialog", { name: /^tareas$/i });
  const mobileQuantifiedTask = getPedidoTaskItemInPanel(
    mobileTasksDialog,
    quantifiedTaskTitle,
  );

  await expect(mobileTasksDialog).toBeVisible();
  await expectNoLocatorHorizontalOverflow(mobileTasksDialog);
  await expect(mobileQuantifiedTask).toBeVisible();
  await expect(
    mobileQuantifiedTask.getByRole("button", {
      name: new RegExp(`reabrir tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
    }),
  ).toBeVisible();
  await expect(
    mobileQuantifiedTask.getByRole("button", {
      name: new RegExp(`editar tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
    }),
  ).toBeVisible();
  await expect(
    mobileQuantifiedTask.getByRole("button", {
      name: new RegExp(`eliminar tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
    }),
  ).toBeVisible();
  await mobileTasksDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(mobileTasksDialog).toBeHidden();

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
  await page.goto(encargoDetailUrl);
  await updatePedidoStatus(page, "listo_entrega");
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
