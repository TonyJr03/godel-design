import { expect, test } from "@playwright/test";

import { expectNoPublicSensitiveText } from "./helpers/assertions";

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
});
