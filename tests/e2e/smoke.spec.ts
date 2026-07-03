import { expect, test } from "@playwright/test";

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

test("admin can log in when QA credentials are available", async ({ page }) => {
  await loginAs(page, "admin");
});
