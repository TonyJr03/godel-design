import { expect, test } from "@playwright/test";

import { expectNoTechnicalLeakText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { createOwnedManualEncargoPedido } from "./helpers/manual-pedido";
import { createQaRunContext } from "./helpers/qa-data";

const qaRun = createQaRunContext("pedidos");
const pedidoTitle = `${qaRun.ownershipPrefix} Pedido manual`;

test.beforeAll(() => {
  console.log(`[e2e:ownership] scope=pedidos runId=${qaRun.runId}`);
});

test("admin can create an owned isolated manual pedido", async ({ page }) => {
  await loginAs(page, "admin");

  const orderNumber = await createOwnedManualEncargoPedido(page, qaRun);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: pedidoTitle,
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(page.locator("article").first().getByText(/^Creado$/i))
    .toBeVisible();
  expect(orderNumber).toMatch(/^P-\d{2}-\d{4}$/);
  await expectNoTechnicalLeakText(page);
});
