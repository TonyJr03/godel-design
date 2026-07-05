import { expect, test } from "@playwright/test";

import { expectNoPublicSensitiveText } from "./helpers/assertions";

test("public solicitud form renders workflows and safe validation", async ({
  page,
}) => {
  await page.goto("/solicitud");

  await expect(
    page.getByRole("heading", { name: /qu. necesitas preparar/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /encargo personalizado/i }),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /impresi.n/i })).toBeVisible();
  await expect(page.getByLabel(/nombre del cliente/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /enviar solicitud/i }),
  ).toBeVisible();

  await page.getByRole("tab", { name: /encargo personalizado/i }).click();

  await expect(page.getByLabel(/tipo de servicio/i)).toBeVisible();
  await expect(page.getByLabel(/descripci.n del trabajo/i)).toBeVisible();
  await expect(page.getByLabel(/seleccionar archivos/i)).toBeVisible();

  await page.getByRole("tab", { name: /impresi.n/i }).click();

  await expect(page.getByLabel(/cantidad de copias/i)).toBeVisible();
  await expect(page.getByLabel(/modo de color/i)).toBeVisible();
  await expect(page.getByLabel(/tama.o de papel/i)).toBeVisible();
  await expect(page.getByLabel(/caras/i)).toBeVisible();
  await expect(page.getByLabel(/seleccionar documento/i)).toBeVisible();

  await page.getByRole("tab", { name: /encargo personalizado/i }).click();

  await page.getByLabel(/nombre del cliente/i).fill("   ");
  await page.getByLabel(/tel.fono/i).fill("5551001");
  await page.getByLabel(/tipo de servicio/i).selectOption("Personalizacion");
  await page
    .getByLabel(/descripci.n del trabajo/i)
    .fill("Prueba focal de validacion segura");
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(page.getByText(/ingresa el nombre del cliente/i)).toBeVisible({
    timeout: 15_000,
  });
  await expectNoPublicSensitiveText(page);
});
