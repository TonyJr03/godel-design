import { expect, type Page, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

type ListingContract = {
  path: string;
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

const pedidosContract: ListingContract = {
  path: "/dashboard/pedidos",
  heading: /^pedidos$/i,
  expectedHeaders: [/^pedido$/i, /^trabajo$/i, /^estado$/i, /^pago$/i, /^entrega$/i],
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

async function expectListingMobileContract(page: Page, contract: ListingContract) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(contract.path);
  await expect(page.getByRole("heading", { name: contract.heading })).toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(getVisibleFiltersTrigger(page)).toBeVisible();

  for (const forbiddenCommand of contract.forbiddenCommands) {
    await expect(page.getByRole("link", { name: forbiddenCommand })).toHaveCount(0);
    await expect(page.getByRole("button", { name: forbiddenCommand }))
      .toHaveCount(0);
  }

  const detailLink = page.getByRole("link", { name: contract.openLinkName }).first();

  if ((await detailLink.count()) > 0) {
    await expect(detailLink).toBeVisible();
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

test.describe("internal operational listings", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "admin");
  });

  test("desktop listings keep compact operational contracts", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await expectListingContract(page, pedidosContract);
    await expectListingContract(page, solicitudesContract);
  });

  test("mobile listings stay compact and clickable", async ({ page }) => {
    await expectListingMobileContract(page, pedidosContract);
    await expectListingMobileContract(page, solicitudesContract);
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
});
