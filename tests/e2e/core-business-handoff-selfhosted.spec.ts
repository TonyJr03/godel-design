import { expect, type Page, test } from "@playwright/test";

import { expectNoTechnicalLeakText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

const desktopViewport = { width: 1366, height: 768 };
const mobileViewport = { width: 390, height: 844 };

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

async function expectOperationalRoute(
  page: Page,
  path: string,
  heading: RegExp,
) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  await expectNoTechnicalLeakText(page);
  await expectNoHorizontalOverflow(page);
}

test("self-hosted E: admin cross-domain handoff smoke stays operational", async ({
  page,
}, testInfo) => {
  await page.setViewportSize(desktopViewport);
  await loginAs(page, "admin");

  await expectOperationalRoute(page, "/dashboard", /dashboard operativo/i);
  await expectOperationalRoute(page, "/dashboard/clientes", /^clientes$/i);
  await expectOperationalRoute(page, "/dashboard/solicitudes", /^solicitudes$/i);
  await expectOperationalRoute(page, "/dashboard/pedidos", /^pedidos$/i);
  await expectOperationalRoute(page, "/dashboard/configuracion", /^configuraci.n$/i);
  await page.screenshot({
    path: testInfo.outputPath("cross-domain-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize(mobileViewport);
  await expectOperationalRoute(page, "/dashboard/pedidos", /^pedidos$/i);
  await page.screenshot({
    path: testInfo.outputPath("cross-domain-mobile.png"),
    fullPage: true,
  });
});
