import { expect, type Page } from "@playwright/test";

import { expectNoPublicSensitiveText } from "./assertions";
import type { QaRunContext } from "./qa-data";

const PUBLIC_REFERENCE_PATTERN = /GD-[A-Z0-9]{4}-[A-Z0-9]{4}/;

function getSolicitudData(qaRun: QaRunContext) {
  return {
    clientName: `${qaRun.ownershipPrefix} Cliente público`,
    clientPhone: qaRun.runId.slice(0, 14),
    clientEmail: `e2e-solicitudes-${qaRun.runId}@example.com`,
    description: `${qaRun.ownershipPrefix} Encargo público`,
    notes: `${qaRun.ownershipPrefix} sin archivos`,
  };
}

async function getPublicReference(page: Page) {
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(PUBLIC_REFERENCE_PATTERN);

  expect(match, "Expected public reference in success state").not.toBeNull();

  return match?.[0] ?? "";
}

export async function submitOwnedPublicEncargoSolicitud(
  page: Page,
  qaRun: QaRunContext,
) {
  const solicitudData = getSolicitudData(qaRun);

  await page.goto("/solicitud");
  await expect(page).toHaveURL(/\/solicitud/);
  await expect(
    page.getByRole("heading", { name: /qu. necesitas preparar/i }),
  ).toBeVisible();

  const serviceSelect = page.locator('select[name="service_id"]').first();

  await expect(serviceSelect).toBeVisible();
  expect(
    (await serviceSelect.locator("option").allTextContents()).map((option) =>
      option.trim(),
    ),
    "El servicio canonico Otro debe estar disponible publicamente.",
  ).toContain("Otro");

  await page.getByLabel(/nombre del cliente/i).fill(solicitudData.clientName);
  await page.getByLabel(/tel.fono/i).fill(solicitudData.clientPhone);
  await page.getByLabel(/correo electr.nico/i).fill(solicitudData.clientEmail);
  await serviceSelect.selectOption({ label: "Otro" });
  await page
    .getByLabel(/descripci.n del trabajo/i)
    .fill(solicitudData.description);
  await page.getByLabel(/observaciones adicionales/i).fill(solicitudData.notes);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(
    page.getByText(/solicitud enviada correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoPublicSensitiveText(page);

  return getPublicReference(page);
}
