import { expect, type Locator, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { createQaRunId } from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const REPETITIONS = 3;
const ORDER_REPETITIONS = 5;

function testRunLabel(domain: string, index: number) {
  return `QA SA ${domain} ${createQaRunId()} ${index + 1}`;
}

async function submitAndExpectClosed(
  dialog: Locator,
  submitName: RegExp,
) {
  await dialog.getByRole("button", { name: submitName }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

test("self-hosted creation dialogs navigate to their canonical fresh routes", async ({
  page,
}) => {
  test.skip(
    process.env.PLAYWRIGHT_EXTERNAL_SERVER !== "1",
    "This stabilization gate runs only through the external production-like runtime.",
  );
  test.setTimeout(240_000);

  await loginAs(page, "admin");
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.goto("/dashboard/configuracion/servicios");
  for (let index = 0; index < REPETITIONS; index += 1) {
    const name = testRunLabel("Servicio", index);

    await page.getByRole("button", { name: /nuevo servicio/i }).click();
    const dialog = page.getByRole("dialog", { name: /nuevo servicio/i });

    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: /^nombre$/i }).fill(name);
    await dialog
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Servicio creado por el gate transversal ${index + 1}.`);
    await submitAndExpectClosed(dialog, /crear servicio/i);
    await expect(page).toHaveURL(/\/dashboard\/configuracion\/servicios$/);
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible({
      timeout: 20_000,
    });
  }

  await page.goto("/dashboard/clientes");
  for (let index = 0; index < REPETITIONS; index += 1) {
    const name = testRunLabel("Cliente", index);

    await page.getByRole("button", { name: /nuevo cliente/i }).click();
    const dialog = page.getByRole("dialog", { name: /nuevo cliente/i });

    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/^nombre/i).fill(name);
    await dialog.getByLabel(/tel.fono/i).fill(`555${createQaRunId().slice(-7)}`);
    await dialog
      .getByLabel(/correo electr.nico/i)
      .fill(`qa-sa-${createQaRunId()}@example.com`);
    await submitAndExpectClosed(dialog, /crear cliente/i);
    await expect(page).toHaveURL(/\/dashboard\/clientes$/);
    await expect(
      page.getByRole("link").filter({ hasText: name }).first(),
    ).toBeVisible({ timeout: 20_000 });
  }

  await page.goto("/dashboard/configuracion/plantillas");
  for (let index = 0; index < REPETITIONS; index += 1) {
    const name = testRunLabel("Plantilla", index);

    await page.getByRole("button", { name: /nueva plantilla/i }).click();
    const dialog = page.getByRole("dialog", { name: /nueva plantilla/i });

    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: /^nombre$/i }).fill(name);
    await dialog
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Plantilla creada por el gate transversal ${index + 1}.`);
    await submitAndExpectClosed(dialog, /crear plantilla/i);
    await expect(page).toHaveURL(/\/dashboard\/configuracion\/plantillas$/);
    await expect(
      page.getByRole("link").filter({ hasText: name }).first(),
    ).toBeVisible({ timeout: 20_000 });
  }

  await page.goto("/dashboard/pedidos");
  for (let index = 0; index < ORDER_REPETITIONS; index += 1) {
    const title = testRunLabel("Pedido", index);

    await page.getByRole("button", { name: /nuevo pedido/i }).click();
    const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: /encargo/i }).click();
    await dialog
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Pedido creado por el gate transversal ${index + 1}.`);
    await dialog.getByLabel(/prioridad/i).selectOption("normal");
    await dialog.locator('input[name="estimated_delivery_date"]').fill("2030-01-15");
    await dialog.locator('input[name="total_amount"]').fill("100");
    await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
    await submitAndExpectClosed(dialog, /crear pedido/i);
    await expect(page).toHaveURL(/\/dashboard\/pedidos$/);
    await expect(
      page.getByRole("link").filter({ hasText: title }).first(),
    ).toBeVisible({ timeout: 20_000 });
  }
});
