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

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

function getVisibleSearchInput(page: Page) {
  return page.locator('input[name="q"]:visible');
}

function getVisibleFiltersTrigger(page: Page) {
  return page.locator("summary:visible").filter({ hasText: /^filtros/i });
}

async function expectListingContract(page: Page, contract: ListingContract) {
  await page.goto(contract.path);
  await expect(page).toHaveURL(new RegExp(`${contract.path}(?:[/?#].*)?$`));
  await expect(page.getByRole("heading", { name: contract.heading })).toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(getVisibleFiltersTrigger(page)).toBeVisible();

  if (contract.hasPrimaryAction) {
    await expect(
      page.getByRole("link", { name: /nuevo pedido/i }),
    ).toHaveAttribute("href", "/dashboard/pedidos/nuevo");
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
});
