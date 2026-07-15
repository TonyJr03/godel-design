import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoVisibleSensitiveText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const desktopViewport = { width: 1366, height: 768 };
const mobileViewport = { width: 375, height: 812 };

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function expectNoDocumentScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));

  expect(dimensions.scrollHeight).toBeLessThanOrEqual(
    dimensions.innerHeight + 2,
  );
}

async function expectMinTargetSize(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
}

async function getSidebarWidth(sidebar: Locator) {
  const box = await sidebar.boundingBox();

  expect(box).not.toBeNull();

  return box?.width ?? 0;
}

async function expectSidebarCookie(page: Page, value: string) {
  await expect
    .poll(async () => {
      const cookie = (await page.context().cookies()).find(
        (entry) => entry.name === "godel_sidebar_collapsed",
      );

      return cookie?.value;
    })
    .toBe(value);
}

function getDesktopSidebar(page: Page) {
  const desktopNav = page.getByRole("navigation", {
    name: /navegaci.n principal/i,
  });

  return {
    sidebar: desktopNav.locator("xpath=ancestor::aside[1]"),
    desktopNav,
  };
}

test("admin can use the desktop shell collapsed and expanded", async ({
  page,
}) => {
  await page.setViewportSize(desktopViewport);
  await loginAs(page, "admin");

  const { sidebar, desktopNav } = getDesktopSidebar(page);

  await expect(sidebar).toBeVisible();
  await expect(page.getByRole("img", { name: /godel dise.o/i })).toBeVisible();
  await expect(desktopNav.getByRole("link", { name: /dashboard/i })).toBeVisible();
  await expect(desktopNav.getByRole("link", { name: /solicitudes/i }))
    .toBeVisible();
  await expect(desktopNav.getByRole("link", { name: /pedidos/i }))
    .toBeVisible();
  await expect(sidebar.getByText(/administrador/i)).toBeVisible();
  await expectNoVisibleSensitiveText(page);
  await expectNoHorizontalOverflow(page);

  const collapseButton = sidebar.getByRole("button", {
    name: /contraer barra lateral/i,
  });

  await expect(collapseButton).toBeVisible();
  await expect(collapseButton).toHaveAttribute("aria-expanded", "true");
  await expect(collapseButton).toHaveAttribute(
    "aria-controls",
    "dashboard-sidebar-navigation",
  );
  await expectMinTargetSize(collapseButton);

  const expandedWidth = await getSidebarWidth(sidebar);

  expect(expandedWidth).toBeGreaterThanOrEqual(240);
  await collapseButton.click();

  const expandButton = sidebar.getByRole("button", {
    name: /expandir barra lateral/i,
  });

  await expect(expandButton).toHaveAttribute("aria-expanded", "false");
  await expectMinTargetSize(expandButton);
  await expectSidebarCookie(page, "1");
  await expect(sidebar.getByRole("link", { name: /pedidos/i })).toBeVisible();
  await expect(sidebar.locator("svg").first()).toBeVisible();
  expect(await getSidebarWidth(sidebar)).toBeLessThan(expandedWidth);

  await page.reload();
  await expect(
    sidebar.getByRole("button", { name: /expandir barra lateral/i }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(await getSidebarWidth(sidebar)).toBeLessThan(expandedWidth);

  await expandButton.click();
  await expect(
    sidebar.getByRole("button", { name: /contraer barra lateral/i }),
  ).toHaveAttribute("aria-expanded", "true");
  await expectSidebarCookie(page, "0");
  await expect.poll(() => getSidebarWidth(sidebar)).toBeGreaterThanOrEqual(240);

  await page.goto("/dashboard/pedidos");
  await expect(desktopNav.getByRole("link", { name: /pedidos/i }))
    .toHaveAttribute("aria-current", "page");

  await page.goto("/dashboard/solicitudes");
  await expect(desktopNav.getByRole("link", { name: /solicitudes/i }))
    .toHaveAttribute("aria-current", "page");

  const skipLink = page.getByRole("link", {
    name: /saltar al contenido principal/i,
  });

  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe("main-content");

  await sidebar.getByRole("button", { name: /cerrar sesi.n/i }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("admin can use the mobile details navigation", async ({ page }) => {
  await page.setViewportSize(mobileViewport);
  await loginAs(page, "admin");

  const details = page.locator("header details").first();
  const summary = details.locator("summary").filter({ hasText: /men/i });
  const { sidebar } = getDesktopSidebar(page);

  await expect(sidebar).toBeHidden();
  await expect(page.getByRole("img", { name: /godel dise.o/i })).toBeVisible();
  await expect(summary).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await summary.click();
  await expect(details).toHaveAttribute("open", "");
  await expect(
    details.getByRole("navigation", { name: /navegaci.n principal/i }),
  ).toBeVisible();
  await expect(details.getByRole("link", { name: /pedidos/i })).toBeVisible();
  await expect(details.getByText(/administrador/i)).toBeVisible();
  await expect(details.getByRole("button", { name: /cerrar sesi.n/i }))
    .toBeVisible();

  await details.getByRole("link", { name: /pedidos/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos(?:[/?#].*)?$/);
  await expect
    .poll(() =>
      details.evaluate((element) => element.hasAttribute("open")),
    )
    .toBe(false);
  await expect(sidebar).toBeHidden();
  await expectNoVisibleSensitiveText(page);
  await expectNoHorizontalOverflow(page);
});

test("shell navigation respects current role visibility", async ({ page }) => {
  await page.setViewportSize(desktopViewport);
  await loginAs(page, "admin");

  const { desktopNav: adminNav } = getDesktopSidebar(page);

  for (const label of [
    /dashboard/i,
    /solicitudes/i,
    /pedidos/i,
    /clientes/i,
    /configuraci.n/i,
  ]) {
    await expect(adminNav.getByRole("link", { name: label })).toBeVisible();
  }

  await loginAs(page, "worker");

  const { desktopNav: workerNav } = getDesktopSidebar(page);

  await expect(workerNav.getByRole("link", { name: /dashboard/i })).toBeVisible();
  await expect(workerNav.getByRole("link", { name: /pedidos/i })).toBeVisible();
  await expect(workerNav.getByRole("link", { name: /solicitudes/i }))
    .toHaveCount(0);
  await expect(workerNav.getByRole("link", { name: /clientes/i }))
    .toHaveCount(0);
  await expect(workerNav.getByRole("link", { name: /usuarios/i }))
    .toHaveCount(0);
  await expect(workerNav.getByRole("link", { name: /configuraci.n/i }))
    .toHaveCount(0);
  await expectNoVisibleSensitiveText(page);
});

test("shell coexists with an existing pedido workspace", async ({ page }) => {
  await page.setViewportSize(desktopViewport);
  await loginAs(page, "admin");
  await page.goto("/dashboard/pedidos");

  const detailLinks = page.getByRole("link", { name: /ver pedido/i });

  if ((await detailLinks.count()) === 0) {
    test.skip(
      true,
      "No existing pedido workspace was available for the focal shell check.",
    );
  }

  await detailLinks.first().click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+(?:[?#].*)?$/);
  await expect(page.locator("aside").first()).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: /acciones del workspace/i }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoDocumentScroll(page);

  const workspaceUrl = page.url();

  await page.setViewportSize(mobileViewport);
  await page.goto(workspaceUrl);
  await expect(page.locator("header").getByText(/men/i)).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: /acciones del workspace/i }),
  ).toBeVisible();
  await expect(page.locator("aside").first()).toBeHidden();
  await expectNoHorizontalOverflow(page);
});
