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
    page.getByRole("button", { name: /nuevo usuario/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /ver usuario/i })).toHaveCount(0);
  await expectNoVisibleSensitiveText(page);

  const editUserButtons = page.getByRole("button", { name: /editar usuario/i });
  if ((await editUserButtons.count()) > 0) {
    await editUserButtons.first().click();
    const editDialog = page.getByRole("dialog", { name: /editar usuario/i });

    await expect(editDialog).toBeVisible();
    await editDialog.getByRole("button", { name: /cerrar/i }).click();
    await expect(editDialog).toBeHidden();
  }

  const unlikelyQuery = createUnlikelyQaQuery("usuarios-sin-resultados");
  await page.getByLabel(/buscar usuarios/i).fill(unlikelyQuery);
  await page.getByLabel(/buscar usuarios/i).press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/usuarios\?q=/);
  await expect(
    page.getByText(/sin resultados|no se encontraron usuarios/i).first(),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.goto("/dashboard/configuracion/usuarios");
  await page.getByRole("button", { name: /nuevo usuario/i }).click();
  const createDialog = page.getByRole("dialog", { name: /nuevo perfil interno/i });

  await expect(createDialog).toBeVisible();
  await expect(createDialog.getByText(/usuario debe existir/i)).toBeVisible();
  await expect(createDialog.getByLabel(/uuid del usuario auth/i)).toBeVisible();

  await createDialog.getByLabel(/uuid del usuario auth/i).fill("not-a-valid-uuid");
  await createDialog.getByLabel(/nombre completo/i).fill("Usuario QA invalido");
  await createDialog.getByRole("button", { name: /crear perfil/i }).click();

  await expect(
    createDialog.getByText(/ingresa un uuid v.lido de supabase auth/i),
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
