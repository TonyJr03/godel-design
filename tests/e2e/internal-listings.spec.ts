import {
  expect,
  type Locator,
  type Page,
  type Route,
  test,
} from "@playwright/test";

import { loginAs } from "./helpers/auth";

type ListingContract = {
  path: string;
  cardsLabel: string;
  heading: RegExp;
  expectedHeaders: RegExp[];
  forbiddenHeaders: RegExp[];
  forbiddenCommands: RegExp[];
  openLinkName: RegExp;
  emptyText: RegExp;
  hasPrimaryAction?: boolean;
};

type ListingHeaderControlsContract = {
  path: string;
  searchLabel: RegExp;
  hasFilters: boolean;
  primaryActionName?: string;
};

const PEDIDOS_ACTIVE_FILTERS_PATH =
  "/dashboard/pedidos?q=Pedido&status=en_revision&payment_status=sin_pago&page=2";

const pedidosContract: ListingContract = {
  path: "/dashboard/pedidos",
  cardsLabel: "Pedidos",
  heading: /^pedidos$/i,
  expectedHeaders: [
    /^pedido$/i,
    /^trabajo$/i,
    /^servicio$/i,
    /^estado$/i,
    /^pago$/i,
    /^entrega$/i,
  ],
  forbiddenHeaders: [
    /^cliente$/i,
    /^solicitud$/i,
    /^prioridad$/i,
    /^progreso$/i,
    /^personal$/i,
    /^creaci.n$/i,
    /^acci.n$/i,
  ],
  forbiddenCommands: [
    /^ver pedido$/i,
  ],
  openLinkName: /abrir pedido/i,
  emptyText: /no hay pedidos registrados|no encontramos pedidos/i,
  hasPrimaryAction: true,
};

const solicitudesContract: ListingContract = {
  path: "/dashboard/solicitudes",
  cardsLabel: "Solicitudes",
  heading: /^solicitudes$/i,
  expectedHeaders: [
    /^cliente$/i,
    /^contacto$/i,
    /^servicio$/i,
    /^estado$/i,
    /^recibida$/i,
  ],
  forbiddenHeaders: [
    /^ref\.$/i,
    /^tipo$/i,
    /^deseada$/i,
    /^acci.n$/i,
  ],
  forbiddenCommands: [
    /^ver solicitud$/i,
  ],
  openLinkName: /abrir solicitud de/i,
  emptyText: /no hay solicitudes registradas|no encontramos solicitudes/i,
};

const listingHeaderControlsContracts: ListingHeaderControlsContract[] = [
  {
    path: "/dashboard/pedidos",
    searchLabel: /buscar pedidos/i,
    hasFilters: true,
    primaryActionName: "Nuevo pedido",
  },
  {
    path: "/dashboard/solicitudes",
    searchLabel: /buscar solicitudes/i,
    hasFilters: true,
  },
  {
    path: "/dashboard/clientes",
    searchLabel: /buscar clientes/i,
    hasFilters: false,
    primaryActionName: "Nuevo cliente",
  },
  {
    path: "/dashboard/configuracion/usuarios",
    searchLabel: /buscar usuarios/i,
    hasFilters: true,
    primaryActionName: "Nuevo usuario",
  },
  {
    path: "/dashboard/configuracion/plantillas",
    searchLabel: /buscar plantillas/i,
    hasFilters: false,
    primaryActionName: "Nueva plantilla",
  },
];

const responsiveListingViewports = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
];

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function expectUniqueFormControlIds(page: Page) {
  const duplicateIds = await page.evaluate(() => {
    const controls = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(
        "input[id], select[id], textarea[id], button[id]",
      ),
    );
    const ids = new Map<string, number>();

    for (const control of controls) {
      ids.set(control.id, (ids.get(control.id) ?? 0) + 1);
    }

    return Array.from(ids.entries())
      .filter(([, count]) => count > 1)
      .map(([id, count]) => `${id} (${count})`);
  });

  expect(duplicateIds, "Duplicate form control IDs").toEqual([]);
}

async function expectPrimaryActionInstance(page: Page, actionName: string) {
  const actionCount = await page.evaluate((name) => {
    return Array.from(document.querySelectorAll("a, button")).filter((element) => {
      const text = (element.textContent ?? "").trim().replace(/\s+/g, " ");
      const ariaLabel = element.getAttribute("aria-label")?.trim();
      const title = element.getAttribute("title")?.trim();

      return text === name || ariaLabel === name || title === name;
    }).length;
  }, actionName);

  expect(actionCount, `Expected one DOM instance of ${actionName}`).toBe(1);
}

function getVisibleSearchInput(page: Page) {
  return page.locator('input[name="q"]:visible');
}

function getVisibleFiltersTrigger(page: Page) {
  return page.getByRole("button", {
    name: /^filtros(?:, \d+ activos?)?$/i,
  });
}

function getListingToolbar(page: Page) {
  return page.getByRole("region", {
    name: /b.squeda y filtros/i,
  });
}

function getActiveFiltersBand(page: Page) {
  return page.getByLabel("Filtros activos");
}

function getActiveChipsViewport(page: Page) {
  return getActiveFiltersBand(page).getByLabel("Criterios activos");
}

function getActiveFilterChipByRemoveButton(page: Page, name: RegExp) {
  return page.getByRole("button", { name }).locator("xpath=..");
}

function getListingDescription(page: Page, description: RegExp) {
  return page.getByText(description, {
    exact: false,
  });
}

async function getRequiredBox(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();

  return box as NonNullable<typeof box>;
}

function getBoxCenterY(box: NonNullable<Awaited<ReturnType<Locator["boundingBox"]>>>) {
  return box.y + box.height / 2;
}

function getCardPart(card: Locator, part: string) {
  return card.locator(`[data-listing-card-part="${part}"]`).first();
}

async function expectCardPartPrecedes(
  card: Locator,
  firstPart: string,
  secondPart: string,
) {
  const precedes = await card.evaluate(
    (element, parts) => {
      const first = element.querySelector(
        `[data-listing-card-part="${parts.firstPart}"]`,
      );
      const second = element.querySelector(
        `[data-listing-card-part="${parts.secondPart}"]`,
      );

      return Boolean(
        first &&
          second &&
          (first.compareDocumentPosition(second) &
            Node.DOCUMENT_POSITION_FOLLOWING) !==
            0,
      );
    },
    { firstPart, secondPart },
  );

  expect(precedes, `${firstPart} should precede ${secondPart}`).toBe(true);
}

async function expectVisibleCardsBelowXl(
  page: Page,
  contract: ListingContract,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(contract.path);
  await expect(page.getByRole("heading", { name: contract.heading }))
    .toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(getVisibleFiltersTrigger(page)).toBeVisible();
  await expect(page.locator("table").first()).toBeHidden();

  for (const forbiddenCommand of contract.forbiddenCommands) {
    await expect(page.getByRole("link", { name: forbiddenCommand })).toHaveCount(0);
    await expect(page.getByRole("button", { name: forbiddenCommand }))
      .toHaveCount(0);
  }

  const cards = page.locator(`div[aria-label="${contract.cardsLabel}"]`);
  const detailLink = page.getByRole("link", {
    name: contract.openLinkName,
  }).first();

  if ((await detailLink.count()) > 0) {
    await expect(cards).toBeVisible();
    await expect(detailLink).toBeVisible();
  } else {
    await expect(page.getByText(contract.emptyText).first()).toBeVisible();
  }

  await expectNoHorizontalOverflow(page);
}

async function expectDesktopTableLayout(page: Page, contract: ListingContract) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(contract.path);

  const table = page.locator("table").first();

  await expect(table).toBeVisible();
  await expect(page.locator(`div[aria-label="${contract.cardsLabel}"]`))
    .toBeHidden();

  for (const header of contract.expectedHeaders) {
    await expect(table.getByRole("columnheader", { name: header }))
      .toBeVisible();
  }

  for (const forbiddenHeader of contract.forbiddenHeaders) {
    await expect(table.getByRole("columnheader", { name: forbiddenHeader }))
      .toHaveCount(0);
  }

  await expectNoHorizontalOverflow(page);
}

async function expectPedidoResponsiveCardStructure(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(pedidosContract.path);
  await expect(page.locator("table").first()).toBeHidden();

  const card = page.getByRole("link", {
    name: pedidosContract.openLinkName,
  }).first();
  const hasCard = await card.waitFor({
    state: "visible",
    timeout: 5000,
  }).then(
    () => true,
    () => false,
  );

  if (!hasCard) {
    test.info().annotations.push({
      type: "skip",
      description:
        "No existing pedidos were available for responsive card content checks.",
    });
    await expect(page.getByText(pedidosContract.emptyText).first())
      .toBeVisible();
    await expectNoHorizontalOverflow(page);
    return;
  }

  await expect(card).toBeVisible();

  for (const part of ["header", "title", "service-meta", "date"]) {
    await expect(getCardPart(card, part)).toBeVisible();
  }

  const directParts = await card.evaluate((element) =>
    Array.from(element.children)
      .map((child) => child.getAttribute("data-listing-card-part"))
      .filter(Boolean),
  );

  expect(directParts).toEqual([
    "header",
    "title",
    "service-meta",
    "date",
  ]);
  await expectCardPartPrecedes(card, "order-number", "badges");
  await expectCardPartPrecedes(card, "workflow", "service");

  const titleIsInsideHeader = await card.evaluate((element) => {
    const header = element.querySelector('[data-listing-card-part="header"]');
    const title = element.querySelector('[data-listing-card-part="title"]');

    return Boolean(header && title && header.contains(title));
  });

  expect(titleIsInsideHeader).toBe(false);

  const title = getCardPart(card, "title");
  const cardBox = await getRequiredBox(card);
  const titleBox = await getRequiredBox(title);
  const leftInset = Math.max(titleBox.x - cardBox.x, 1);
  const rightInset = cardBox.x + cardBox.width - (titleBox.x + titleBox.width);

  expect(rightInset).toBeLessThanOrEqual(leftInset * 2.5);
  expect(titleBox.width).toBeGreaterThanOrEqual(
    cardBox.width - leftInset * 4,
  );

  const titleClamp = await title.evaluate((element) => {
    const style = window.getComputedStyle(element);
    const lineHeight = Number.parseFloat(style.lineHeight);
    const fallbackLineHeight =
      Number.parseFloat(style.fontSize) * 1.5;

    return {
      display: style.display,
      height: element.getBoundingClientRect().height,
      lineHeight: Number.isFinite(lineHeight) ? lineHeight : fallbackLineHeight,
      overflow: style.overflow,
      webkitLineClamp: style.getPropertyValue("-webkit-line-clamp"),
    };
  });

  expect(titleClamp.webkitLineClamp).toBe("2");
  expect(titleClamp.overflow).toBe("hidden");
  expect(titleClamp.height).toBeLessThanOrEqual(titleClamp.lineHeight * 2 + 2);

  const href = await card.getAttribute("href");

  expect(href).toMatch(/^\/dashboard\/pedidos\/[^/]+/);
  expect(cardBox.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
}

async function expectSolicitudResponsiveCardStructure(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto(solicitudesContract.path);
  await expect(page.locator("table").first()).toBeHidden();

  const card = page.getByRole("link", {
    name: solicitudesContract.openLinkName,
  }).first();
  const hasCard = await card.waitFor({
    state: "visible",
    timeout: 5000,
  }).then(
    () => true,
    () => false,
  );

  if (!hasCard) {
    test.info().annotations.push({
      type: "skip",
      description:
        "No existing solicitudes were available for responsive card content checks.",
    });
    await expect(page.getByText(solicitudesContract.emptyText).first())
      .toBeVisible();
    await expectNoHorizontalOverflow(page);
    return;
  }

  await expect(card).toBeVisible();
  await expect(getCardPart(card, "service-meta")).toBeVisible();
  await expectCardPartPrecedes(card, "workflow", "service");
  await expect(card.locator('[data-listing-card-part="workflow"]'))
    .toHaveCount(1);
  await expect(
    getCardPart(card, "service").locator('[data-listing-card-part="workflow"]'),
  ).toHaveCount(0);

  const href = await card.getAttribute("href");
  const cardBox = await getRequiredBox(card);

  expect(href).toMatch(/^\/dashboard\/solicitudes\/[^/]+/);
  expect(cardBox.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
}

async function expectListingContract(page: Page, contract: ListingContract) {
  await page.goto(contract.path);
  await expect(page).toHaveURL(new RegExp(`${contract.path}(?:[/?#].*)?$`));
  await expect(page.getByRole("heading", { name: contract.heading })).toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(getVisibleFiltersTrigger(page)).toBeVisible();

  if (contract.hasPrimaryAction) {
    await expect(
      page.getByRole("button", { name: /nuevo pedido/i }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /nuevo pedido/i }))
      .toHaveCount(0);
  } else {
    await expect(page.getByRole("link", { name: /nueva solicitud/i })).toHaveCount(0);
  }

  for (const forbiddenCommand of contract.forbiddenCommands) {
    await expect(page.getByRole("link", { name: forbiddenCommand })).toHaveCount(0);
    await expect(page.getByRole("button", { name: forbiddenCommand }))
      .toHaveCount(0);
  }

  const table = page.locator("table").first();

  if ((await table.count()) > 0 && (await table.isVisible())) {
    for (const header of contract.expectedHeaders) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }

    for (const forbiddenHeader of contract.forbiddenHeaders) {
      await expect(table.getByRole("columnheader", { name: forbiddenHeader }))
        .toHaveCount(0);
    }

    await expect(page.getByRole("link", { name: contract.openLinkName }).first())
      .toBeVisible();
  } else {
    await expect(page.getByText(contract.emptyText).first()).toBeVisible();
  }

  await expectNoHorizontalOverflow(page);
}

async function expectSearchUsesQueryParam(page: Page, contract: ListingContract) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(contract.path);

  const search = getVisibleSearchInput(page);

  await search.fill("qa");
  await search.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${contract.path}\\?q=qa$`));
}

async function expectListingHeaderControls(
  page: Page,
  contract: ListingHeaderControlsContract,
) {
  await page.goto(contract.path);
  await expect(page).toHaveURL(new RegExp(`${contract.path}(?:[/?#].*)?$`));
  await expectUniqueFormControlIds(page);
  await expect(page.locator('input[name="q"]')).toHaveCount(1);
  await expect(page.getByLabel(contract.searchLabel)).toBeVisible();

  const filterTriggers = getVisibleFiltersTrigger(page);

  await expect(filterTriggers).toHaveCount(contract.hasFilters ? 1 : 0);

  if (contract.hasFilters) {
    await expect(filterTriggers).toBeVisible();
  }

  if (contract.primaryActionName) {
    await expectPrimaryActionInstance(page, contract.primaryActionName);
  }

  await expectNoHorizontalOverflow(page);
}

async function expectFiltersPopoverDismissal(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/pedidos");

  const trigger = getVisibleFiltersTrigger(page);
  const panel = page.getByRole("dialog", { name: /^filtros$/i });

  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();

  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(panel).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
}

async function expectHeaderDescriptionGapStable(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/pedidos");

  const heading = page.getByRole("heading", { name: /^pedidos$/i });
  const description = getListingDescription(
    page,
    /Listado interno de pedidos oficiales para seguimiento operativo\./i,
  );
  const initialHeadingBox = await getRequiredBox(heading);
  const initialDescriptionBox = await getRequiredBox(description);
  const initialDescriptionGap =
    initialDescriptionBox.y - (initialHeadingBox.y + initialHeadingBox.height);

  await page.goto(PEDIDOS_ACTIVE_FILTERS_PATH);
  await expect(page.getByText(/^B.squeda: Pedido$/i)).toBeVisible();
  await expect(page.getByText(/^Estado: En revisi.n$/i)).toBeVisible();
  await expect(page.getByText(/^Pago: Sin pagar$/i)).toBeVisible();

  const filteredHeadingBox = await getRequiredBox(heading);
  const filteredDescriptionBox = await getRequiredBox(description);
  const filteredDescriptionGap =
    filteredDescriptionBox.y -
    (filteredHeadingBox.y + filteredHeadingBox.height);

  expect(
    Math.abs(filteredDescriptionGap - initialDescriptionGap),
  ).toBeLessThanOrEqual(2);
  expect(Math.abs(filteredHeadingBox.y - initialHeadingBox.y)).toBeLessThanOrEqual(
    2,
  );
}

async function expectClearFiltersIsIconOnly(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(PEDIDOS_ACTIVE_FILTERS_PATH);

  const clearButton = page.getByRole("button", {
    name: /^limpiar filtros$/i,
  });

  await expect(clearButton).toBeVisible();
  await expect(clearButton).toHaveAttribute("title", "Limpiar filtros");
  await expect(clearButton).toHaveCount(1);

  const visibleText = await clearButton.evaluate((element) =>
    (element.textContent ?? "").trim().replace(/\s+/g, " "),
  );

  expect(visibleText).toBe("");
  await expect(clearButton.locator("svg[aria-hidden='true']")).toHaveCount(1);

  await clearButton.click();

  await expect(page).toHaveURL(/\/dashboard\/pedidos$/);
  await expect(getActiveFiltersBand(page)).toHaveCount(0);
  await expect(clearButton).toHaveCount(0);
}

async function expectMobileActiveFiltersLayout(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PEDIDOS_ACTIVE_FILTERS_PATH);

  await expect(page.getByRole("heading", { name: /^pedidos$/i })).toBeVisible();
  await expect(
    getListingDescription(
      page,
      /Listado interno de pedidos oficiales para seguimiento operativo\./i,
    ),
  ).toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(getVisibleFiltersTrigger(page)).toBeVisible();
  await expect(getActiveFiltersBand(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^limpiar filtros$/i }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
}

async function expectNoVisibleUpdatingMessage(page: Page) {
  await expect(
    page.getByText("Actualizando resultados...", {
      exact: true,
    }),
  ).not.toBeVisible();
}

async function expectActiveFiltersStayOnOneLine(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(PEDIDOS_ACTIVE_FILTERS_PATH);

  const chips = [
    getActiveFilterChipByRemoveButton(page, /^Quitar B.squeda: Pedido$/i),
    getActiveFilterChipByRemoveButton(page, /^Quitar Estado: En revisi.n$/i),
    getActiveFilterChipByRemoveButton(page, /^Quitar Pago: Sin pagar$/i),
  ];
  const clearButton = page.getByRole("button", {
    name: /^limpiar filtros$/i,
  });

  for (const chip of chips) {
    await expect(chip).toBeVisible();
  }

  await expect(clearButton).toBeVisible();

  const firstCenterY = getBoxCenterY(await getRequiredBox(chips[0]));

  for (const chip of chips.slice(1)) {
    const centerY = getBoxCenterY(await getRequiredBox(chip));

    expect(Math.abs(centerY - firstCenterY)).toBeLessThanOrEqual(2);
  }

  const clearCenterY = getBoxCenterY(await getRequiredBox(clearButton));

  expect(Math.abs(clearCenterY - firstCenterY)).toBeLessThanOrEqual(2);
}

async function expectActiveFiltersLimitResultsShift(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/pedidos");

  const initialTable = page.locator("table:visible").first();

  await expect(initialTable).toBeVisible();

  const initialTableBox = await getRequiredBox(initialTable);

  await page.goto(PEDIDOS_ACTIVE_FILTERS_PATH);

  const filteredTable = page.locator("table:visible").first();

  await expect(filteredTable).toBeVisible();

  const filteredTableBox = await getRequiredBox(filteredTable);
  const resultsShift = filteredTableBox.y - initialTableBox.y;

  expect(resultsShift).toBeGreaterThanOrEqual(0);
  expect(resultsShift).toBeLessThanOrEqual(16);
}

async function expectMobileActiveFiltersUseInternalOverflow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PEDIDOS_ACTIVE_FILTERS_PATH);

  const band = getActiveFiltersBand(page);
  const chipsViewport = getActiveChipsViewport(page);
  const clearButton = page.getByRole("button", {
    name: /^limpiar filtros$/i,
  });
  const chipButtons = [
    page.getByRole("button", { name: /^Quitar B.squeda: Pedido$/i }),
    page.getByRole("button", { name: /^Quitar Estado: En revisi.n$/i }),
    page.getByRole("button", { name: /^Quitar Pago: Sin pagar$/i }),
  ];

  await expect(band).toBeVisible();
  await expect(clearButton).toBeVisible();

  const firstCenterY = getBoxCenterY(
    await getRequiredBox(getActiveFilterChipByRemoveButton(
      page,
      /^Quitar B.squeda: Pedido$/i,
    )),
  );

  for (const button of chipButtons) {
    const chip = button.locator("xpath=..");
    const centerY = getBoxCenterY(await getRequiredBox(chip));

    expect(Math.abs(centerY - firstCenterY)).toBeLessThanOrEqual(2);
  }

  const dimensions = await chipsViewport.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeGreaterThanOrEqual(dimensions.clientWidth);

  const lastChipButton = chipButtons.at(-1);

  expect(lastChipButton).toBeDefined();
  await lastChipButton!.focus();
  await expect(lastChipButton!).toBeFocused();
  await expectNoHorizontalOverflow(page);
}

async function expectPendingStateUsesClearButtonSpinner(page: Page) {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(PEDIDOS_ACTIVE_FILTERS_PATH);

  const toolbar = getListingToolbar(page);
  const status = toolbar.getByRole("status");
  const band = getActiveFiltersBand(page);
  const table = page.locator("table:visible").first();
  const clearButton = page.getByRole("button", {
    name: /^limpiar filtros$/i,
  });

  await expect(toolbar).toHaveAttribute("aria-busy", "false");
  await expect(status).toHaveText("");
  await expectNoVisibleUpdatingMessage(page);
  await expect(clearButton).toBeVisible();
  await expect(band).toBeVisible();
  await expect(table).toBeVisible();

  const initialBandBox = await getRequiredBox(band);
  const initialTableBox = await getRequiredBox(table);
  let releaseRequest: (() => void) | undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let hasGatedRequest = false;
  let gatedRequest: Promise<void> | undefined;
  const routeHandler = async (route: Route) => {
    const url = new URL(route.request().url());

    if (url.pathname !== "/dashboard/pedidos" || hasGatedRequest) {
      await route.continue();
      return;
    }

    hasGatedRequest = true;
    gatedRequest = (async () => {
      await requestGate;
      await route.continue();
    })();
    await gatedRequest;
  };

  await page.route("**/dashboard/pedidos**", routeHandler);

  try {
    await clearButton.click();

    const pendingButton = page.getByRole("button", {
      name: /^actualizando resultados$/i,
    });

    await expect(pendingButton).toBeVisible();
    await expect(pendingButton).toHaveAttribute("aria-busy", "true");
    await expect(pendingButton).toHaveAttribute(
      "title",
      "Actualizando resultados",
    );
    await expect(pendingButton.locator("svg[aria-hidden='true']")).toHaveCount(
      1,
    );
    await expect(
      pendingButton.locator("svg[aria-hidden='true'].animate-spin"),
    ).toHaveCount(1);
    await expect(status).toHaveText("Actualizando resultados...");
    await expectNoVisibleUpdatingMessage(page);
    await expect(getActiveFiltersBand(page)).toBeVisible();

    const pendingBandBox = await getRequiredBox(band);
    const pendingTableBox = await getRequiredBox(table);

    expect(Math.abs(pendingBandBox.height - initialBandBox.height))
      .toBeLessThanOrEqual(1);
    expect(Math.abs(pendingTableBox.y - initialTableBox.y))
      .toBeLessThanOrEqual(1);
  } finally {
    releaseRequest?.();
    await gatedRequest?.catch(() => undefined);
    await page.unroute("**/dashboard/pedidos**", routeHandler);
  }

  await expect(page).toHaveURL(/\/dashboard\/pedidos$/);
  await expect(getActiveFiltersBand(page)).toHaveCount(0);
  await expect(status).toHaveText("");
  await expect(toolbar).toHaveAttribute("aria-busy", "false");
}

test.describe("internal operational listings", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("desktop listings keep compact operational contracts", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectListingContract(page, pedidosContract);
    await expectListingContract(page, solicitudesContract);
    await expectDesktopTableLayout(page, pedidosContract);
    await expectDesktopTableLayout(page, solicitudesContract);
  });

  test("mobile and tablet listings stay compact and clickable below xl", async ({
    page,
  }) => {
    for (const viewport of responsiveListingViewports) {
      await expectVisibleCardsBelowXl(page, pedidosContract, viewport);
      await expectVisibleCardsBelowXl(page, solicitudesContract, viewport);
    }
  });

  test("pedido responsive cards keep approved hierarchy below xl", async ({
    page,
  }) => {
    for (const viewport of responsiveListingViewports) {
      await expectPedidoResponsiveCardStructure(page, viewport);
    }
  });

  test("solicitud responsive cards show workflow before service below xl", async ({
    page,
  }) => {
    for (const viewport of responsiveListingViewports) {
      await expectSolicitudResponsiveCardStructure(page, viewport);
    }
  });

  test("listing search persists in URL", async ({ page }) => {
    await expectSearchUsesQueryParam(page, pedidosContract);
    await expectSearchUsesQueryParam(page, solicitudesContract);
  });

  test("listing header controls have unique DOM instances and IDs", async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1366, height: 768 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);

      for (const contract of listingHeaderControlsContracts) {
        await expectListingHeaderControls(page, contract);
      }
    }
  });

  test("filters popover opens and restores focus on Escape", async ({
    page,
  }) => {
    await expectFiltersPopoverDismissal(page);
  });

  test("listing header keeps title and description together with active filters", async ({
    page,
  }) => {
    await expectHeaderDescriptionGapStable(page);
  });

  test("global clear filters control is icon-only and clears URL criteria", async ({
    page,
  }) => {
    await expectClearFiltersIsIconOnly(page);
  });

  test("mobile listing header supports active filters without overflow", async ({
    page,
  }) => {
    await expectMobileActiveFiltersLayout(page);
  });

  test("active filter chips stay on one line with fixed clear action", async ({
    page,
  }) => {
    await expectActiveFiltersStayOnOneLine(page);
  });

  test("active filter band only shifts results by one compact row", async ({
    page,
  }) => {
    await expectActiveFiltersLimitResultsShift(page);
  });

  test("mobile active filter band scrolls internally without document overflow", async ({
    page,
  }) => {
    await expectMobileActiveFiltersUseInternalOverflow(page);
  });

  test("pending updates use accessible status and clear button spinner", async ({
    page,
  }) => {
    await expectPendingStateUsesClearButtonSpinner(page);
  });
});
