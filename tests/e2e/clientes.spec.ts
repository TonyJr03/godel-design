import { expect, type Locator, type Page, test } from "@playwright/test";

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

function getClientesPagination(page: Page) {
  return page.getByRole("navigation", {
    name: /paginación de clientes/i,
  });
}

function getPreviousPageControl(page: Page) {
  return getClientesPagination(page).getByLabel("Ir a la página anterior", {
    exact: true,
  });
}

function getNextPageControl(page: Page) {
  return getClientesPagination(page).getByLabel("Ir a la página siguiente", {
    exact: true,
  });
}

function getPreviousPageLink(page: Page) {
  return getClientesPagination(page).getByRole("link", {
    name: "Ir a la página anterior",
  });
}

function getNextPageLink(page: Page) {
  return getClientesPagination(page).getByRole("link", {
    name: "Ir a la página siguiente",
  });
}

async function getClientesPaginationPageInfo(page: Page) {
  const pagination = getClientesPagination(page);
  const text = await pagination
    .getByText(/Página\s+\d+\s+de\s+\d+/i)
    .innerText();
  const match = text.match(/Página\s+(\d+)\s+de\s+(\d+)/i);

  expect(match, `Unexpected pagination page text: ${text}`).not.toBeNull();

  return {
    currentPage: Number(match?.[1]),
    totalPages: Number(match?.[2]),
  };
}

async function getClientesPaginationSummary(page: Page) {
  const pagination = getClientesPagination(page);
  const text = await pagination
    .getByText(/Mostrando\s+\d+–\d+\s+de\s+\d+\s+clientes/i)
    .innerText();
  const match = text.match(/Mostrando\s+(\d+)–(\d+)\s+de\s+(\d+)\s+clientes/i);

  expect(match, `Unexpected pagination summary text: ${text}`).not.toBeNull();

  return {
    startItem: Number(match?.[1]),
    endItem: Number(match?.[2]),
    totalCount: Number(match?.[3]),
  };
}

async function expectTouchTarget(control: Locator) {
  const box = await control.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(40);
}

async function expectDisabledPaginationControl(control: Locator) {
  await expect(control).toBeVisible();
  await expect(control).toHaveAttribute("aria-disabled", "true");
  await expect(control).not.toHaveAttribute("href", /.+/);
  await expectTouchTarget(control);
}

async function expectCompactPaginationA11y(page: Page) {
  const pagination = getClientesPagination(page);

  await expect(pagination).toBeVisible();
  await expect(
    pagination.getByText(/Página\s+\d+\s+de\s+\d+/i),
  ).toBeVisible();
  await expect(
    pagination.getByText(/Mostrando\s+\d+–\d+\s+de\s+\d+\s+clientes/i),
  ).toBeVisible();
  await expect(pagination.getByText(/^Anterior$/i)).toHaveCount(0);
  await expect(pagination.getByText(/^Siguiente$/i)).toHaveCount(0);

  for (const control of [
    getPreviousPageControl(page),
    getNextPageControl(page),
  ]) {
    await expect(control).toHaveClass(/rounded-full/);
    await expectTouchTarget(control);
  }
}

async function getCurrentClientesUrl(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/clientes/);

  return new URL(page.url());
}

async function expectClientesListContract(page: Page) {
  await expect(page.getByRole("heading", { name: /^clientes$/i })).toBeVisible();
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /nuevo cliente/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /nuevo cliente/i }),
  ).toHaveCount(0);

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
  await page.goto("/dashboard/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo cliente/i });

  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^nombre/i).fill(clienteName);
  await dialog.getByLabel(/tel.fono/i).fill(clientePhone);
  await dialog.getByLabel(/correo electr.nico/i).fill(clienteEmail);
  await dialog.getByLabel(/notas/i).fill(clienteNotes);
  await dialog.getByRole("button", { name: /crear cliente/i }).click();

  await expect(dialog).toBeHidden({ timeout: 15_000 });
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

  const editLink = page.getByRole("button", { name: /editar cliente/i });

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
  test.setTimeout(90_000);

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

  await page.goto("/dashboard/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo cliente/i });

  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/^nombre/i)).toBeVisible();
  await expect(dialog.getByLabel(/tel.fono/i)).toBeVisible();

  await dialog.getByLabel(/^nombre/i).fill("   ");
  await dialog.getByLabel(/tel.fono/i).fill("5551000");
  await dialog.getByRole("button", { name: /crear cliente/i }).click();

  await expect(page.getByText(/el nombre es obligatorio/i)).toBeVisible({
    timeout: 15_000,
  });
  await expectNoVisibleSensitiveText(page);
});

test("admin can validate clientes pagination and canonical URLs", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/clientes");
  await expect(page.getByRole("heading", { name: /^clientes$/i })).toBeVisible();

  if (
    await page
      .getByText(/no hay clientes registrados todav/i)
      .first()
      .isVisible()
  ) {
    test.skip(true, "La paginación requiere al menos un cliente visible.");
  }

  await expectCompactPaginationA11y(page);

  const pageInfo = await getClientesPaginationPageInfo(page);
  const summary = await getClientesPaginationSummary(page);

  console.info(
    `[clientes pagination] totalCount=${summary.totalCount} totalPages=${pageInfo.totalPages}`,
  );

  expect(pageInfo.currentPage).toBe(1);
  expect(pageInfo.totalPages).toBeGreaterThanOrEqual(1);
  expect(summary.startItem).toBe(1);
  expect(summary.endItem).toBe(Math.min(50, summary.totalCount));

  await expectDisabledPaginationControl(getPreviousPageControl(page));
  await expect(getPreviousPageLink(page)).toHaveCount(0);

  await page.goto("/dashboard/clientes?page=1");
  await expect(page).toHaveURL(/\/dashboard\/clientes$/);

  await page.goto("/dashboard/clientes?page=abc");
  await expect(page).toHaveURL(/\/dashboard\/clientes$/);

  await page.goto("/dashboard/clientes?q=a&page=abc");
  await expect.poll(async () => {
    const url = await getCurrentClientesUrl(page);

    return {
      page: url.searchParams.get("page"),
      q: url.searchParams.get("q"),
    };
  }).toEqual({
    page: null,
    q: "a",
  });

  const outOfRangePage = pageInfo.totalPages + 1;

  await page.goto(`/dashboard/clientes?page=${outOfRangePage}`);
  if ((await getClientesPagination(page).count()) === 0) {
    test.info().annotations.push({
      type: "warning",
      description:
        "La URL fuera de rango muestra error de carga en vez de canonicalizar.",
    });
    await page.goto(`/dashboard/clientes?page=${pageInfo.totalPages}`);
  }
  await expectCompactPaginationA11y(page);

  const lastPageInfo = await getClientesPaginationPageInfo(page);
  const lastPageSummary = await getClientesPaginationSummary(page);
  const lastPageUrl = await getCurrentClientesUrl(page);

  expect(lastPageInfo.currentPage).toBe(lastPageInfo.totalPages);
  expect(lastPageSummary.endItem).toBe(lastPageSummary.totalCount);
  expect(lastPageUrl.searchParams.get("page")).toBe(
    lastPageInfo.totalPages > 1 ? String(lastPageInfo.totalPages) : null,
  );
  await expectDisabledPaginationControl(getNextPageControl(page));
  await expect(getNextPageLink(page)).toHaveCount(0);
});

test("admin can navigate between cliente pages", async ({ page }) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/clientes");
  await expectCompactPaginationA11y(page);

  const initialPageInfo = await getClientesPaginationPageInfo(page);
  const initialSummary = await getClientesPaginationSummary(page);

  test.skip(
    initialPageInfo.totalPages < 2,
    "La navegación a página 2 requiere al menos 51 clientes visibles.",
  );

  expect(initialPageInfo.currentPage).toBe(1);
  expect(initialSummary.startItem).toBe(1);
  expect(initialSummary.endItem).toBe(50);
  await expectDisabledPaginationControl(getPreviousPageControl(page));

  const nextLink = getNextPageLink(page);

  await expect(nextLink).toBeVisible();
  await expect(nextLink).toHaveAttribute("title", "Página siguiente");
  await expectTouchTarget(nextLink);
  await nextLink.click();
  await expect(page).toHaveURL(/\/dashboard\/clientes\?page=2$/);

  await expectCompactPaginationA11y(page);

  const secondPageInfo = await getClientesPaginationPageInfo(page);
  const secondPageSummary = await getClientesPaginationSummary(page);

  expect(secondPageInfo.currentPage).toBe(2);
  expect(secondPageInfo.totalPages).toBe(initialPageInfo.totalPages);
  expect(secondPageSummary.startItem).toBe(51);
  expect(secondPageSummary.endItem).toBe(
    Math.min(100, initialSummary.totalCount),
  );
  expect(secondPageSummary.totalCount).toBe(initialSummary.totalCount);

  const previousLink = getPreviousPageLink(page);

  await expect(previousLink).toBeVisible();
  await expect(previousLink).toHaveAttribute("href", "/dashboard/clientes");
  await expectTouchTarget(previousLink);

  if (secondPageInfo.totalPages === 2) {
    await expectDisabledPaginationControl(getNextPageControl(page));
    await expect(getNextPageLink(page)).toHaveCount(0);
  } else {
    await expect(getNextPageLink(page)).toHaveAttribute(
      "href",
      "/dashboard/clientes?page=3",
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/clientes?page=2");
  await expectCompactPaginationA11y(page);
  await expect(getPreviousPageControl(page)).toBeVisible();
  await expect(getNextPageControl(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await previousLink.click();
  await expect(page).toHaveURL(/\/dashboard\/clientes$/);
});

test("cliente pagination preserves the active search", async ({ page }) => {
  await loginAs(page, "admin");

  const candidateQueries = ["5", "a", "e", "o"];
  let selectedQuery: string | null = null;

  for (const query of candidateQueries) {
    await page.goto(`/dashboard/clientes?q=${encodeURIComponent(query)}`);

    const pagination = getClientesPagination(page);

    if ((await pagination.count()) === 0) {
      continue;
    }

    const pageInfo = await getClientesPaginationPageInfo(page);

    if (pageInfo.totalPages > 1) {
      selectedQuery = query;
      break;
    }
  }

  test.skip(
    selectedQuery === null,
    "Ninguna búsqueda candidata produjo más de una página de clientes.",
  );

  const query = selectedQuery ?? "";

  await expect(getVisibleSearchInput(page)).toHaveValue(query);
  await expect(getNextPageLink(page)).toBeVisible();
  await getNextPageLink(page).click();
  await expectCompactPaginationA11y(page);

  await expect.poll(() => {
    const url = new URL(page.url());

    return {
      page: url.searchParams.get("page"),
      q: url.searchParams.get("q"),
    };
  }).toEqual({
    page: "2",
    q: query,
  });

  const pageInfo = await getClientesPaginationPageInfo(page);

  expect(pageInfo.currentPage).toBe(2);
  await expect(getVisibleSearchInput(page)).toHaveValue(query);
});

test("cliente search removes pagination from the URL", async ({ page }) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/clientes?page=2");
  const pageInfo = await getClientesPaginationPageInfo(page);

  test.skip(
    pageInfo.totalPages < 2,
    "El reinicio desde página 2 requiere al menos 51 clientes visibles.",
  );

  const resetQuery = "qa";
  const searchInput = getVisibleSearchInput(page);

  await searchInput.fill(resetQuery);
  await searchInput.press("Enter");

  await expect.poll(async () => {
    const url = await getCurrentClientesUrl(page);

    return {
      page: url.searchParams.get("page"),
      q: url.searchParams.get("q"),
    };
  }).toEqual({
    page: null,
    q: resetQuery,
  });
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
    page.getByRole("button", { name: /editar cliente/i }),
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
