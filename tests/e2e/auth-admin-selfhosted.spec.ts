import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

function createTemporaryPassword() {
  return `Qa1!${randomBytes(18).toString("base64url")}`;
}

test("admin resets the QA worker password through the production-like application", async ({
  browser,
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_EXTERNAL_SERVER !== "1",
    "This Auth Admin mutation gate runs only through the external production-like runtime.",
  );

  const workerEmail = process.env.GODEL_TEST_WORKER_EMAIL;

  expect(workerEmail).toBeTruthy();

  await loginAs(page, "admin");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/configuracion/usuarios");

  const resetButton = page.getByRole("button", {
    name: /restablecer contrase.a de trabajador qa/i,
  });

  await expect(resetButton).toBeVisible();
  await resetButton.click();

  const resetDialog = page.getByRole("dialog", {
    name: /restablecer contrase.a/i,
  });
  const temporaryPassword = createTemporaryPassword();

  await expect(resetDialog).toBeVisible();
  await resetDialog
    .locator('input[name="password"]')
    .fill(temporaryPassword);
  await resetDialog
    .locator('input[name="password_confirmation"]')
    .fill(temporaryPassword);
  await resetDialog.locator('input[name="confirm_reset"]').check();
  await resetDialog
    .getByRole("button", { name: /^restablecer contrase.a$/i })
    .click();

  await expect(resetDialog).toBeHidden({ timeout: 20_000 });

  const workerContext = await browser.newContext();
  const workerPage = await workerContext.newPage();

  try {
    await workerPage.goto("/login", { waitUntil: "domcontentloaded" });
    await workerPage.getByLabel(/correo/i).fill(workerEmail!);
    await workerPage.locator('input[name="password"]').fill(temporaryPassword);
    await workerPage
      .getByRole("button", { name: /entrar al workspace/i })
      .click();

    await expect(workerPage).toHaveURL(
      /\/(?:dashboard|cambiar-contrasena-inicial)(?:[/?#].*)?$/,
      { timeout: 20_000 },
    );
  } finally {
    await workerContext.close();
  }
});
