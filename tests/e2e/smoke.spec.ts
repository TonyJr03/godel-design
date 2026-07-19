import { expect, test } from "@playwright/test";

import { expectNoPublicSensitiveText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

test("public request page loads", async ({ page }) => {
  await page.goto("/solicitud");

  await expect(
    page.getByRole("heading", { name: /necesitas preparar/i }),
  ).toBeVisible();
});

test("public tracking page loads", async ({ page }) => {
  await page.goto("/estado");

  await expect(
    page.getByRole("heading", {
      name: /consulta el estado de tu solicitud o pedido/i,
    }),
  ).toBeVisible();
});

test("login page loads", async ({ page }) => {
  await page.goto("/login");

  await expect(
    page.getByRole("heading", { name: /iniciar sesion|iniciar sesi.n/i }),
  ).toBeVisible();
});

test("public unknown routes render the public not found state", async ({
  page,
}) => {
  async function expectPublicNotFound(pathname: string) {
    await page.goto(pathname);

    await expect(page).toHaveURL(new RegExp(`${pathname}(?:[?#].*)?$`));
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /no encontramos esta p.gina/i,
      }),
    ).toBeVisible();
    await expect(page.getByText(/404/)).toBeVisible();
    await expect(page.getByText(/ruta inexistente/i)).toBeVisible();
    await expect(page.getByText(/no encontramos este recurso interno/i))
      .toHaveCount(0);
    const notFoundActions = page.getByRole("complementary");

    await expect(
      notFoundActions.getByRole("link", { name: /volver al inicio/i }),
    ).toHaveAttribute("href", "/");
    await expect(
      notFoundActions.getByRole("link", { name: /enviar solicitud/i }),
    ).toHaveAttribute("href", "/solicitud");
    await expect(
      notFoundActions.getByRole("link", { name: /consultar estado/i }),
    ).toHaveAttribute("href", "/estado");
    await expect(page.locator('a[href^="/login"]')).toHaveCount(0);
    await expect(page.locator('a[href^="/dashboard"]')).toHaveCount(0);
    await expect(page.getByText(/permiso requerido|acceso interno/i))
      .toHaveCount(0);
    await expectNoPublicSensitiveText(page);
  }

  await expectPublicNotFound("/ruta-publica-inexistente-qa");
  await expectPublicNotFound("/dashboard-inexistente-qa");
});

test("unauthenticated transversal internal states redirect to login", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto("/acceso-denegado");
  await expect(page).toHaveURL(/\/login(?:[/?#].*)?$/);

  await page.context().clearCookies();
  await page.goto("/sin-permisos");
  await expect(page).toHaveURL(/\/login(?:[/?#].*)?$/);
});

test("admin can log in when QA credentials are available", async ({ page }) => {
  await loginAs(page, "admin");
});
