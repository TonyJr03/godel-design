import { expect, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

test("admin can access usuarios and see safe profile validation", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/usuarios");
  await expect(
    page.getByRole("heading", { name: /usuarios internos/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/buscar usuarios/i)).toBeVisible();
  await expect(page.getByLabel(/^rol$/i)).toBeVisible();
  await expect(page.getByLabel(/^estado$/i)).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  const unlikelyQuery = `qa-usuarios-sin-resultados-${Date.now()}`;
  await page.getByLabel(/buscar usuarios/i).fill(unlikelyQuery);
  await expect(page).toHaveURL(/\/dashboard\/usuarios\?q=/);
  await expect(
    page.getByText(/sin resultados|no se encontraron usuarios/i).first(),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.goto("/dashboard/usuarios/nuevo");
  await expect(
    page.getByRole("heading", { name: /nuevo perfil interno/i }),
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

  await page.goto("/dashboard/usuarios");
  await expectAccessLimitedPage(page);
});

test("worker cannot access usuarios", async ({ page }) => {
  await loginAs(page, "worker");

  await page.goto("/dashboard/usuarios");
  await expectAccessLimitedPage(page);
});
