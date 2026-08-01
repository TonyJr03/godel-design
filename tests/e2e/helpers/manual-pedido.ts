import { expect, type Page } from "@playwright/test";

import { expectNoTechnicalLeakText } from "./assertions";
import type { QaRunContext } from "./qa-data";

const ORDER_NUMBER_PATTERN = /P-\d{2}-\d{4}/;

function getPedidoData(qaRun: QaRunContext<"pedidos">) {
  return {
    title: `${qaRun.ownershipPrefix} Pedido manual`,
    description: `${qaRun.ownershipPrefix} Encargo manual aislado`,
  };
}

async function getCurrentPedidoOrderNumber(page: Page) {
  const orderNumber = page
    .locator("article")
    .first()
    .getByText(ORDER_NUMBER_PATTERN)
    .first();

  await expect(orderNumber).toBeVisible();
  const orderNumberText = await orderNumber.innerText();
  const match = orderNumberText.match(ORDER_NUMBER_PATTERN);

  expect(match, "Expected visible pedido number in detail header.").not.toBeNull();

  return match?.[0] ?? "";
}

export async function createOwnedManualEncargoPedido(
  page: Page,
  qaRun: QaRunContext<"pedidos">,
) {
  if (qaRun.scope !== "pedidos") {
    throw new Error("createOwnedManualEncargoPedido requires pedidos scope.");
  }

  const pedidoData = getPedidoData(qaRun);

  await page.goto("/dashboard/pedidos");
  await expect(page).toHaveURL(/\/dashboard\/pedidos(?:[/?#].*)?$/);
  await expect(page.getByRole("heading", { name: /^pedidos$/i })).toBeVisible();
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /encargo/i }).click();

  const serviceSelect = dialog.locator('select[name="service_id"]');

  await expect(serviceSelect).toBeVisible();
  expect(
    (await serviceSelect.locator("option").allTextContents()).map((option) =>
      option.trim(),
    ),
    "El servicio canonico Otro debe estar disponible en pedidos internos.",
  ).toContain("Otro");
  await serviceSelect.selectOption({ label: "Otro" });

  await expect(dialog.locator('input[type="hidden"][name="cliente_id"]'))
    .toHaveValue("");
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await expect(
    dialog.locator('input[name="estimated_delivery_date"]'),
  ).toHaveValue("");
  await dialog.locator('input[name="total_amount"]').fill("100.00");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(pedidoData.title);
  await dialog
    .getByRole("textbox", { name: /descripci.n/i })
    .fill(pedidoData.description);
  await dialog.getByRole("button", { name: /crear pedido/i }).click();

  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await page.goto(`/dashboard/pedidos?q=${encodeURIComponent(pedidoData.title)}`);

  const createdPedidoRow = page
    .getByRole("link", { name: /abrir pedido/i })
    .filter({ hasText: pedidoData.title })
    .first();
  const createdPedidoDetailLink = page
    .locator('a[href^="/dashboard/pedidos/"]')
    .filter({ hasText: pedidoData.title })
    .first();

  await expect(createdPedidoRow).toBeVisible({ timeout: 15_000 });
  await expect(createdPedidoRow.getByText(/^Creado$/i)).toBeVisible();
  await expect(createdPedidoDetailLink).toHaveAttribute(
    "href",
    /^\/dashboard\/pedidos\/[^/]+$/,
  );
  const detailHref = await createdPedidoDetailLink.getAttribute("href");

  expect(detailHref).toMatch(/^\/dashboard\/pedidos\/[^/]+$/);

  await page.goto(detailHref ?? "/dashboard/pedidos");
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: pedidoData.title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator("article").first().getByText(/^Creado$/i))
    .toBeVisible();
  await expectNoTechnicalLeakText(page);

  return getCurrentPedidoOrderNumber(page);
}
