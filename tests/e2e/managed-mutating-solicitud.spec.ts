import { expect, test } from "@playwright/test";

const runId = process.env.GODEL_MANAGED_MUTATING_RUN_ID;
const ownershipValue =
  process.env.GODEL_MANAGED_MUTATING_OWNERSHIP_VALUE;

if (process.env.GODEL_MANAGED_MUTATING_QA !== "1") {
  throw new Error("Managed mutating QA marker is required.");
}
if (!runId || !/^M4QA-\d{8}T\d{6}Z-[A-Z2-7]{8}$/.test(runId)) {
  throw new Error("Managed mutating run ID is required.");
}
if (ownershipValue !== `M4QA solicitud ${runId}`) {
  throw new Error("Managed mutating ownership value is invalid.");
}

test("submits one isolated managed QA encargo solicitud", async ({ page }) => {
  const desiredDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  await page.goto("/solicitud");
  await expect(
    page.getByRole("heading", { name: /qu. necesitas preparar/i }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /encargo/i }).click();

  const serviceSelect = page.getByLabel(/^servicio/i);
  await expect(serviceSelect).toBeVisible();
  await expect(serviceSelect.locator("option")).not.toHaveCount(0);
  await page
    .getByLabel(/nombre del cliente/i)
    .fill(`QA solicitud ${runId}`);
  await page.getByLabel(/tel.fono|telefono/i).fill("+15550100000");
  await page
    .getByLabel(/correo electr.nico|correo electronico/i)
    .fill(`m4qa-${runId.toLowerCase()}@example.com`);
  await page.getByLabel(/fecha deseada/i).fill(desiredDate);
  await page
    .getByLabel(/descripci.n del trabajo/i)
    .fill(ownershipValue);
  await page
    .getByLabel(/observaciones adicionales/i)
    .fill(`Synthetic managed QA request ${runId}`);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(
    page.getByText(
      /solicitud enviada correctamente|hemos recibido tu solicitud/i,
    ),
  ).toBeVisible();
  const visibleText = await page.locator("body").innerText();
  expect(visibleText).toMatch(/GD-[A-Z0-9]{4}-[A-Z0-9]{4}/);
});
