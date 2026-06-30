import { expect, type Page, test } from "@playwright/test";

const publicSensitivePatterns = [
  /\bauth\.users\b/i,
  /\bbucket\b/i,
  /\bcliente_id\b/i,
  /\bfile_path\b/i,
  /\border_number\b/i,
  /\bpayment_status\b/i,
  /\bpedido_id\b/i,
  /\bservice_role\b/i,
  /\bsolicitud_id\b/i,
  /\bSQLSTATE\b/i,
  /\bsupabase\b/i,
  /\bSUPABASE_SERVICE_ROLE_KEY\b/i,
];

async function expectNoVisibleSensitiveText(page: Page) {
  const bodyText = await page.locator("body").innerText();

  for (const pattern of publicSensitivePatterns) {
    expect(bodyText).not.toMatch(pattern);
  }
}

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
  await expectNoVisibleSensitiveText(page);
});
