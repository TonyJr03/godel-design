import { expect, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const managementDashboardCards = [
  /solicitudes nuevas/i,
  /pedidos activos/i,
  /clientes registrados/i,
];

const workerForbiddenText = [
  /solicitudes nuevas/i,
  /solicitudes pendientes/i,
  /aprobadas sin convertir/i,
  /clientes registrados/i,
];

async function expectDashboardLoaded(page: Page, heading: RegExp) {
  await expect(page).toHaveURL(/\/dashboard(?:\/)?(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /resumen operativo/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /actividad reciente/i }),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);
}

async function expectBodyNotToMatch(page: Page, patterns: RegExp[]) {
  const bodyText = await page.locator("body").innerText();

  for (const pattern of patterns) {
    expect(bodyText).not.toMatch(pattern);
  }
}

async function expectNoDashboardLinks(page: Page, hrefs: string[]) {
  for (const href of hrefs) {
    await expect(page.locator(`a[href^="${href}"]`)).toHaveCount(0);
  }
}

test("admin sees the global dashboard with management sections", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await expectDashboardLoaded(page, /dashboard operativo/i);
  await expect(
    page.getByRole("heading", { name: /trabajo pendiente/i }),
  ).toBeVisible();

  for (const card of managementDashboardCards) {
    await expect(page.getByText(card).first()).toBeVisible();
  }

  await expect(page.locator('a[href^="/dashboard/solicitudes"]')).not.toHaveCount(
    0,
  );
  await expect(page.locator('a[href^="/dashboard/pedidos"]')).not.toHaveCount(0);
  await expect(page.locator('a[href^="/dashboard/clientes"]')).not.toHaveCount(
    0,
  );
});

test("supervisor sees the global dashboard without admin-only navigation", async ({
  page,
}) => {
  await loginAs(page, "supervisor");

  await expectDashboardLoaded(page, /dashboard operativo/i);
  await expect(
    page.getByRole("heading", { name: /trabajo pendiente/i }),
  ).toBeVisible();
  await expectNoDashboardLinks(page, [
    "/dashboard/usuarios",
    "/dashboard/configuracion",
  ]);
});

test("worker sees only assigned-work dashboard context", async ({ page }) => {
  await loginAs(page, "worker");

  await expectDashboardLoaded(page, /mi trabajo asignado/i);
  await expect(
    page.getByRole("heading", { name: /trabajo que requiere seguimiento/i }),
  ).toBeVisible();
  await expectBodyNotToMatch(page, workerForbiddenText);
  await expectNoDashboardLinks(page, [
    "/dashboard/solicitudes",
    "/dashboard/clientes",
    "/dashboard/usuarios",
    "/dashboard/configuracion",
  ]);
});

test("protected dashboard routes remain limited by role", async ({ page }) => {
  await loginAs(page, "worker");
  await page.goto("/dashboard/solicitudes");
  await expectAccessLimitedPage(page);

  await page.goto("/dashboard/clientes");
  await expectAccessLimitedPage(page);

  await loginAs(page, "supervisor");
  await page.goto("/dashboard/usuarios");
  await expectAccessLimitedPage(page);
});
