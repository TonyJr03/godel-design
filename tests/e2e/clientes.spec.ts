import { expect, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import {
  createQaRunId,
  createQaRunLabel,
  createUnlikelyQaQuery,
} from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const clienteName = `QA Cliente Cierre ${runLabel}`;
const clientePhone = `555${runId.slice(-7)}`;
const clienteEmail = `qa-cliente-cierre-${runId}@example.com`;
const clienteNotes = `Notas QA de cierre para cliente ${runLabel}.`;

let clienteDetailUrl = "";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

function getClienteDetailLink(page: Page) {
  return page.getByRole("link", {
    name: new RegExp(`abrir cliente ${escapeRegExp(clienteName)}`, "i"),
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getVisibleSearchInput(page: Page) {
  return page.locator('input[name="q"]:visible');
}

async function expectClientesListContract(page: Page) {
  await expect(page.getByRole("heading", { name: /^clientes$/i })).toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(
    page.getByRole("link", { name: /nuevo cliente/i }),
  ).toHaveAttribute("href", "/dashboard/clientes/nuevo");

  const table = page.locator("table").first();

  await expect(table).toBeVisible();

  for (const column of [
    /^cliente$/i,
    /^tel.fono$/i,
    /^correo electr.nico$/i,
    /^creaci.n$/i,
    /^actualizaci.n$/i,
  ]) {
    await expect(table.getByRole("columnheader", { name: column })).toBeVisible();
  }

  await expect(
    table.getByRole("columnheader", { name: /^acci.n$/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^ver cliente$/i }))
    .toHaveCount(0);
  await expect(page.getByRole("button", { name: /^ver cliente$/i }))
    .toHaveCount(0);
}

async function createCliente(page: Page) {
  await page.goto("/dashboard/clientes/nuevo");
  await expect(
    page.getByRole("heading", { name: /nuevo cliente/i }),
  ).toBeVisible();

  await page.getByLabel(/^nombre/i).fill(clienteName);
  await page.getByLabel(/tel.fono/i).fill(clientePhone);
  await page.getByLabel(/correo electr.nico/i).fill(clienteEmail);
  await page.getByLabel(/notas/i).fill(clienteNotes);
  await page.getByRole("button", { name: /crear cliente/i }).click();

  await expect(
    page.getByText(/cliente creado correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoVisibleSensitiveText(page);
}

async function searchCliente(page: Page, query: string) {
  const searchInput = getVisibleSearchInput(page);

  await searchInput.fill(query);
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/clientes\?q=/);
}

async function expectClienteDetail(page: Page) {
  await expect(
    page.getByRole("heading", { level: 1, name: clienteName }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /volver a clientes/i }),
  ).toHaveAttribute("href", "/dashboard/clientes");

  const editLink = page.getByRole("link", { name: /editar cliente/i });

  await expect(editLink).toBeVisible();
  await expect(editLink).toHaveAttribute("aria-label", "Editar cliente");

  await expect(
    page.getByRole("heading", { name: /^datos de contacto$/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^registro$/i }),
  ).toBeVisible();
  await expect(page.getByText(/^actualizaci.n$/i)).toBeVisible();
  await expect(page.getByText(/.ltima actualizaci.n/i)).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /^notas$/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^pedidos vinculados$/i }),
  ).toBeVisible();

  const pedidosPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^pedidos vinculados$/i }),
  });
  const pedidoLinks = pedidosPanel.locator('a[href^="/dashboard/pedidos/"]');

  if ((await pedidoLinks.count()) > 0) {
    await expect(pedidoLinks.first()).toHaveAttribute(
      "href",
      /\/dashboard\/pedidos\//,
    );
  } else {
    await expect(
      pedidosPanel.getByText(/este cliente todav.a no tiene pedidos vinculados/i),
    ).toBeVisible();
  }

  await expectNoVisibleSensitiveText(page);
}

test("admin can validate the clientes listing, search, detail, and form", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/clientes");
  await expectClientesListContract(page);
  await expectNoVisibleSensitiveText(page);
  await expectNoHorizontalOverflow(page);

  const unlikelyQuery = createUnlikelyQaQuery(
    "clientes-sin-resultados",
    runId,
  );

  await searchCliente(page, unlikelyQuery);
  await expect(
    page
      .getByText(/no encontramos clientes|sin resultados|no se encontraron clientes/i)
      .first(),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await createCliente(page);

  await page.goto("/dashboard/clientes");
  await expectClientesListContract(page);
  await searchCliente(page, clienteName);

  const clienteLink = getClienteDetailLink(page);

  await expect(clienteLink).toBeVisible();
  await clienteLink.click();
  await expectClienteDetail(page);
  clienteDetailUrl = page.url();

  await page.goto("/dashboard/clientes/nuevo");
  await expect(
    page.getByRole("heading", { name: /nuevo cliente/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/^nombre/i)).toBeVisible();
  await expect(page.getByLabel(/tel.fono/i)).toBeVisible();

  await page.getByLabel(/^nombre/i).fill("   ");
  await page.getByLabel(/tel.fono/i).fill("5551000");
  await page.getByRole("button", { name: /crear cliente/i }).click();

  await expect(page.getByText(/el nombre es obligatorio/i)).toBeVisible({
    timeout: 15_000,
  });
  await expectNoVisibleSensitiveText(page);
});

test("clientes remain navigable without horizontal overflow on mobile", async ({
  page,
}) => {
  await loginAs(page, "admin");
  test.skip(!clienteDetailUrl, "The focal cliente was not created.");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/dashboard/clientes?q=${encodeURIComponent(clienteName)}`);

  await expect(page.getByRole("heading", { name: /^clientes$/i })).toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(getClienteDetailLink(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(clienteDetailUrl);
  await expect(
    page.getByRole("link", { name: /volver a clientes/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /editar cliente/i }),
  ).toBeVisible();
  await expectClienteDetail(page);
  await expectNoHorizontalOverflow(page);
});

test("supervisor can access clientes", async ({ page }) => {
  await loginAs(page, "supervisor");

  await page.goto("/dashboard/clientes");
  await expect(page.getByRole("heading", { name: /^clientes$/i })).toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expectNoVisibleSensitiveText(page);
});

test("worker cannot access clientes", async ({ page }) => {
  await loginAs(page, "worker");

  await page.goto("/dashboard/clientes");
  await expectAccessLimitedPage(page);
});
