import { expect, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

test("admin can access clientes, search safely, and see safe form validation", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/clientes");
  await expect(page.getByRole("heading", { name: /^clientes$/i })).toBeVisible();
  await expect(page.getByLabel(/buscar clientes/i)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /nuevo cliente/i }),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  const unlikelyQuery = `qa-clientes-sin-resultados-${Date.now()}`;
  await page.getByLabel(/buscar clientes/i).fill(unlikelyQuery);
  await expect(page).toHaveURL(/\/dashboard\/clientes\?q=/);
  await expect(
    page.getByText(/sin resultados|no se encontraron clientes/i).first(),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.goto("/dashboard/clientes/nuevo");
  await expect(
    page.getByRole("heading", { name: /nuevo cliente/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/^nombre/i)).toBeVisible();
  await expect(page.getByLabel(/tel/i)).toBeVisible();

  await page.getByLabel(/^nombre/i).fill("   ");
  await page.getByLabel(/tel/i).fill("5551000");
  await page.getByRole("button", { name: /crear cliente/i }).click();

  await expect(page.getByText(/el nombre es obligatorio/i)).toBeVisible({
    timeout: 15_000,
  });
  await expectNoVisibleSensitiveText(page);
});

test("supervisor can access clientes", async ({ page }) => {
  await loginAs(page, "supervisor");

  await page.goto("/dashboard/clientes");
  await expect(page.getByRole("heading", { name: /^clientes$/i })).toBeVisible();
  await expect(page.getByLabel(/buscar clientes/i)).toBeVisible();
  await expectNoVisibleSensitiveText(page);
});

test("worker cannot access clientes", async ({ page }) => {
  await loginAs(page, "worker");

  await page.goto("/dashboard/clientes");
  await expectAccessLimitedPage(page);
});
