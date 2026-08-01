import { expect, type Page, test } from "@playwright/test";

import { expectNoPublicSensitiveText } from "./helpers/assertions";
import { submitOwnedPublicEncargoSolicitud } from "./helpers/public-solicitud";
import { createQaRunContext } from "./helpers/qa-data";

const qaRun = createQaRunContext("solicitudes");

test.beforeAll(() => {
  console.log(`[e2e:ownership] scope=solicitudes runId=${qaRun.runId}`);
});

const publicTrackingForbiddenPatterns = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\bservice_id\b/i,
  /\bcliente_id\b/i,
  /\bconverted_order_id\b/i,
  /\bgodel-files\b/i,
  /\bsolicitudes\/[0-9a-f-]+\/originales\//i,
  /\bpagos?\b/i,
  /\bpayment_status\b/i,
  /\busuarios?\s+internos?\b/i,
  /\bauth\.users\b/i,
  /\bmetadata\b/i,
  /\bsupabase\b/i,
  /\bpostgres(?:ql)?\b/i,
  /\bSQLSTATE\b/i,
];

async function expectNoExplicitPublicTrackingLeaks(page: Page) {
  const bodyText = await page.locator("body").innerText();

  for (const pattern of publicTrackingForbiddenPatterns) {
    expect(bodyText).not.toMatch(pattern);
  }
}

test("public tracking resolves an owned solicitud safely", async ({ page }) => {
  const publicReference = await submitOwnedPublicEncargoSolicitud(page, qaRun);

  await page.goto("/estado");

  await expect(
    page.getByRole("heading", {
      name: /consulta el estado de tu solicitud o pedido/i,
    }),
  ).toBeVisible();

  const trackingInput = page.getByLabel(/c.digo de seguimiento/i);

  await expect(trackingInput).toBeVisible();
  await trackingInput.fill(publicReference);
  await page.getByRole("button", { name: /consultar estado/i }).click();

  await expect(page).toHaveURL(new RegExp(`/estado\\?ref=${publicReference}`));

  const resultCard = page.locator("article").filter({
    hasText: publicReference,
  });

  await expect(resultCard).toBeVisible({ timeout: 15_000 });
  await expect(resultCard.getByText(/resultado encontrado/i)).toBeVisible();
  await expect(resultCard.getByText(/^solicitud$/i).first()).toBeVisible();
  await expect(resultCard.getByText(/^solicitud recibida$/i)).toBeVisible();
  await expect(
    resultCard.getByText(
      /recibimos la solicitud y est. pendiente de revisi.n por el equipo/i,
    ),
  ).toBeVisible();
  await expectNoPublicSensitiveText(page);
  await expectNoExplicitPublicTrackingLeaks(page);
});

test("public tracking rejects invalid references safely", async ({ page }) => {
  await page.goto("/estado");

  await expect(
    page.getByRole("heading", {
      name: /consulta el estado de tu solicitud o pedido/i,
    }),
  ).toBeVisible();

  const trackingInput = page.getByLabel(/c.digo de seguimiento/i);
  await expect(trackingInput).toBeVisible();

  await trackingInput.fill("BAD-CODE");
  await page.getByRole("button", { name: /consultar estado/i }).click();

  await expect(page).toHaveURL(/\/estado\?ref=BAD-CODE/);
  await expect(page.getByText(/c.digo inv.lido/i)).toBeVisible();
  await expect(page.getByText(/formato v.lido/i)).toBeVisible();
  await expectNoPublicSensitiveText(page);
  await expectNoExplicitPublicTrackingLeaks(page);
});
