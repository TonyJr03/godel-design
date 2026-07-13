import { expect, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { createUnlikelyQaQuery } from "./helpers/qa-data";

test("admin can access usuarios and see safe profile validation", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/configuracion/usuarios");
  await expect(
    page.getByRole("heading", { name: /^usuarios$/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/buscar usuarios/i)).toBeVisible();
  const toolbar = page
    .getByRole("region", { name: /búsqueda y filtros/i })
    .first();
  await toolbar.locator("summary").click();
  await expect(toolbar.getByLabel(/^rol$/i)).toBeVisible();
  await expect(toolbar.getByLabel(/^estado$/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /nuevo usuario/i }),
  ).toBeVisible();
  await expect(page.getByText(/^acción$/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /ver usuario/i })).toHaveCount(0);
  await expectNoVisibleSensitiveText(page);

  const editUserLinks = page.getByRole("link", { name: /editar usuario/i });
  if ((await editUserLinks.count()) > 0) {
    await editUserLinks.first().click();
    await expect(page).toHaveURL(
      /\/dashboard\/configuracion\/usuarios\/[^/]+\/editar/,
    );
    await page.goto("/dashboard/configuracion/usuarios");
  }

  const unlikelyQuery = createUnlikelyQaQuery("usuarios-sin-resultados");
  await page.getByLabel(/buscar usuarios/i).fill(unlikelyQuery);
  await page.getByLabel(/buscar usuarios/i).press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/usuarios\?q=/);
  await expect(
    page.getByText(/sin resultados|no se encontraron usuarios/i).first(),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.goto("/dashboard/configuracion/usuarios/nuevo");
  await expect(
    page.getByRole("heading", { name: /nuevo usuario/i }),
  ).toBeVisible();
  await expect(page.getByText(/no crea credenciales/i)).toBeVisible();
  await expect(page.getByLabel(/uuid del usuario auth/i)).toBeVisible();

  await page.getByLabel(/uuid del usuario auth/i).fill("not-a-valid-uuid");
  await page.getByLabel(/nombre completo/i).fill("Usuario QA invalido");
  await page.getByRole("button", { name: /crear perfil/i }).click();

  await expect(
    page.getByText(/ingresa un uuid v.lido de supabase auth/i),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoVisibleSensitiveText(page);
});

test("supervisor cannot access usuarios", async ({ page }) => {
  await loginAs(page, "supervisor");

  await page.goto("/dashboard/configuracion/usuarios");
  await expectAccessLimitedPage(page);
});

test("worker cannot access usuarios", async ({ page }) => {
  await loginAs(page, "worker");

  await page.goto("/dashboard/configuracion/usuarios");
  await expectAccessLimitedPage(page);
});
