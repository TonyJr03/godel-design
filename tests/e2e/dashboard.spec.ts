import { expect, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const managementDashboardCards = [
  /solicitudes nuevas/i,
  /^pedidos activos$/i,
  /clientes registrados/i,
];

const workerForbiddenText = [
  /solicitudes nuevas/i,
  /solicitudes pendientes/i,
  /aprobadas sin convertir/i,
  /clientes registrados/i,
];

async function expectDashboardLoaded(
  page: Page,
  heading: RegExp,
  boardHeading: RegExp = /pedidos activos/i,
) {
  await expect(page).toHaveURL(/\/dashboard(?:\/)?(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: boardHeading }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /historial/i }),
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

async function expectInternalNotFoundPage(page: Page, pathname: string) {
  await expect(page).toHaveURL(new RegExp(`${pathname}(?:[?#].*)?$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /no encontramos este recurso interno/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /volver al dashboard/i }),
  ).toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("link", { name: /ir a pedidos/i })).toHaveAttribute(
    "href",
    "/dashboard/pedidos",
  );
  await expect(page).not.toHaveURL(/\/sin-permisos/);
  await expect(page.getByRole("button", { name: /reintentar/i })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /reintentar/i })).toHaveCount(0);
  await expect(page.getByText(/permiso requerido|sesi.n sigue activa/i))
    .toHaveCount(0);
  await expectNoVisibleSensitiveText(page);
}

test("admin sees the global dashboard with management sections", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await expectDashboardLoaded(page, /dashboard operativo/i);
  await expect(
    page.getByRole("button", { name: /solicitudes/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /entregas/i })).toBeVisible();
  await page.getByRole("button", { name: /resumen/i }).click();

  for (const card of managementDashboardCards) {
    await expect(page.getByText(card).first()).toBeVisible();
  }

  await page.getByRole("button", { name: /^cerrar$/i }).click();

  await expect(page.locator('a[href^="/dashboard/solicitudes"]')).not.toHaveCount(
    0,
  );
  await expect(page.locator('a[href^="/dashboard/pedidos"]')).not.toHaveCount(0);
  await expect(page.locator('a[href^="/dashboard/clientes"]')).not.toHaveCount(
    0,
  );
  await expect(page.locator('a[href^="/dashboard/configuracion"]')).not.toHaveCount(
    0,
  );
  await expect(page.locator('a[href^="/dashboard/configuracion/usuarios"]')).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /^usuarios$/i })).toHaveCount(0);

  await page.getByRole("link", { name: /configuración/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /configuración/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /usuarios/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/usuarios/);
  await expect(page.getByRole("heading", { name: /^usuarios$/i })).toBeVisible();
});

test("supervisor sees the global dashboard without admin-only navigation", async ({
  page,
}) => {
  await loginAs(page, "supervisor");

  await expectDashboardLoaded(page, /dashboard operativo/i);
  await expect(
    page.getByRole("button", { name: /solicitudes/i }),
  ).toBeVisible();
  await expectNoDashboardLinks(page, [
    "/dashboard/configuracion",
  ]);
});

test("worker sees only assigned-work dashboard context", async ({ page }) => {
  await loginAs(page, "worker");

  await expectDashboardLoaded(
    page,
    /mi trabajo asignado/i,
    /mis pedidos asignados/i,
  );
  await expect(
    page.getByRole("button", { name: /solicitudes/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /entregas/i })).toBeVisible();
  await page.getByRole("button", { name: /resumen/i }).click();
  await expectBodyNotToMatch(page, workerForbiddenText);
  await expectNoDashboardLinks(page, [
    "/dashboard/solicitudes",
    "/dashboard/clientes",
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
  await page.goto("/dashboard/configuracion/usuarios");
  await expectAccessLimitedPage(page);

  await loginAs(page, "worker");
  await page.goto("/dashboard/configuracion/usuarios");
  await expectAccessLimitedPage(page);
});

test("unknown internal dashboard routes render the internal not found state", async ({
  page,
}) => {
  const unknownPath = "/dashboard/ruta-inexistente-qa";

  await loginAs(page, "worker");
  await page.goto(unknownPath);
  await expectInternalNotFoundPage(page, unknownPath);

  await loginAs(page, "admin");
  await page.goto(unknownPath);
  await expectInternalNotFoundPage(page, unknownPath);
});

test("active internal users do not stay on access-denied", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/acceso-denegado");
  await expectDashboardLoaded(page, /dashboard operativo/i);
});
