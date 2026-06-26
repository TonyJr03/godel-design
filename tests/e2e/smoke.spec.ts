import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

function readLocalEnv(name: string) {
  if (process.env[name]) {
    return process.env[name];
  }

  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return undefined;
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));

  if (!line) {
    return undefined;
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

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
    page.getByRole("heading", { name: /iniciar sesion|iniciar sesión/i }),
  ).toBeVisible();
});

test("admin can log in when QA credentials are available", async ({ page }) => {
  const email = readLocalEnv("GODEL_TEST_ADMIN_EMAIL");
  const password = readLocalEnv("GODEL_TEST_ADMIN_PASSWORD");

  if (!email || !password) {
    test.skip(true, "QA admin credentials are not configured.");
    return;
  }

  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(email);
  await page.getByLabel(/contraseña|contrasena/i).fill(password);
  await page.getByRole("button", { name: /entrar al workspace/i }).click();

  await expect(page).toHaveURL(/\/dashboard/);
});
