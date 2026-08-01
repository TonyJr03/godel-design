import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import {
  createQaEmail,
  createQaRunId,
  createUnlikelyQaQuery,
} from "./helpers/qa-data";

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

function getPagination(page: Page) {
  return page.getByRole("navigation", {
    name: /paginaci.n de usuarios/i,
  });
}

async function getPaginationPageInfo(page: Page) {
  const pagination = getPagination(page);
  const text = await pagination
    .getByText(/P.gina\s+\d+\s+de\s+\d+/i)
    .innerText();
  const match = text.match(/P.gina\s+(\d+)\s+de\s+(\d+)/i);

  expect(match, `Unexpected pagination page text: ${text}`).not.toBeNull();

  return {
    currentPage: Number(match?.[1]),
    totalPages: Number(match?.[2]),
  };
}

async function getPaginationSummary(page: Page) {
  const pagination = getPagination(page);
  const text = await pagination
    .getByText(/Mostrando\s+\d+–\d+\s+de\s+\d+\s+usuarios/i)
    .innerText();
  const match = text.match(/Mostrando\s+(\d+)–(\d+)\s+de\s+(\d+)\s+usuarios/i);

  expect(match, `Unexpected pagination summary text: ${text}`).not.toBeNull();

  return {
    startItem: Number(match?.[1]),
    endItem: Number(match?.[2]),
    totalCount: Number(match?.[3]),
  };
}

function getPreviousPageControl(page: Page) {
  return getPagination(page).getByLabel(/Ir a la p.gina anterior/i);
}

function getNextPageControl(page: Page) {
  return getPagination(page).getByLabel(/Ir a la p.gina siguiente/i);
}

function getPreviousPageLink(page: Page) {
  return getPagination(page).getByRole("link", {
    name: /Ir a la p.gina anterior/i,
  });
}

function getNextPageLink(page: Page) {
  return getPagination(page).getByRole("link", {
    name: /Ir a la p.gina siguiente/i,
  });
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(40);
}

async function expectDisabledControl(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveAttribute("aria-disabled", "true");
  await expect(locator).not.toHaveAttribute("href", /.+/);
  await expectTouchTarget(locator);
}

async function expectPaginationA11y(page: Page) {
  const pagination = getPagination(page);

  await expect(pagination).toBeVisible();
  await expect(pagination.getByText(/P.gina\s+\d+\s+de\s+\d+/i)).toBeVisible();
  await expect(
    pagination.getByText(/Mostrando\s+\d+–\d+\s+de\s+\d+\s+usuarios/i),
  ).toBeVisible();

  for (const control of [
    getPreviousPageControl(page),
    getNextPageControl(page),
  ]) {
    await expect(control).toBeVisible();
    await expectTouchTarget(control);
  }
}

async function getCurrentUsuariosUrl(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/usuarios/);

  return new URL(page.url());
}

async function hasEmptyUsuariosState(page: Page) {
  return page
    .getByText(/no hay usuarios registrados todav|no encontramos usuarios/i)
    .first()
    .isVisible()
    .catch(() => false);
}

test("admin can access usuarios and validate the current user creation form", async ({
  page,
}) => {
  const runId = createQaRunId();

  await loginAs(page, "admin");

  await page.goto("/dashboard/configuracion/usuarios");
  await expect(
    page.getByRole("heading", { name: /^usuarios$/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/buscar usuarios/i)).toBeVisible();
  const toolbar = page
    .getByRole("region", { name: /búsqueda y filtros/i })
    .first();
  await toolbar.getByRole("button", { name: /^filtros\b/i }).click();
  await expect(toolbar.getByLabel(/^rol$/i)).toBeVisible();
  await expect(toolbar.getByLabel(/^estado$/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /nuevo usuario/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /ver usuario/i })).toHaveCount(0);
  await expectNoVisibleSensitiveText(page);

  const editUserButtons = page.getByRole("button", { name: /editar usuario/i });
  if ((await editUserButtons.count()) > 0) {
    await editUserButtons.first().click();
    const editDialog = page.getByRole("dialog", { name: /editar usuario/i });

    await expect(editDialog).toBeVisible();
    await editDialog.getByRole("button", { name: /cerrar/i }).click();
    await expect(editDialog).toBeHidden();
  }

  const unlikelyQuery = createUnlikelyQaQuery("usuarios-sin-resultados");
  await page.getByLabel(/buscar usuarios/i).fill(unlikelyQuery);
  await page.getByLabel(/buscar usuarios/i).press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/usuarios\?q=/);
  await expect(
    page.getByText(/sin resultados|no se encontraron usuarios/i).first(),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);

  await page.goto("/dashboard/configuracion/usuarios");
  await page.getByRole("button", { name: /nuevo usuario/i }).click();
  const createDialog = page.getByRole("dialog", { name: /nuevo usuario/i });
  const roleSelect = createDialog.getByRole("combobox", {
    name: /^rol\b/i,
  });

  await expect(createDialog).toBeVisible();
  await expect(
    createDialog.getByText(/crea el acceso del usuario y su perfil interno/i),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: /nuevo perfil interno/i }),
  ).toHaveCount(0);

  await expect(createDialog.getByLabel(/correo electr.nico/i)).toBeVisible();
  await expect(createDialog.getByLabel(/contrase.a temporal/i)).toBeVisible();
  await expect(createDialog.getByLabel(/confirmar contrase.a/i)).toBeVisible();
  await expect(createDialog.getByLabel(/nombre completo/i)).toBeVisible();
  await expect(createDialog.getByLabel(/tel.fono/i)).toBeVisible();
  await expect(createDialog.getByLabel(/url de avatar/i)).toBeVisible();
  await expect(roleSelect).toBeVisible();
  await expect(createDialog.getByLabel(/uuid del usuario auth/i)).toHaveCount(0);
  await expect(createDialog.getByText(/usuario debe existir/i)).toHaveCount(0);
  await expect(
    createDialog.getByRole("button", { name: /crear perfil/i }),
  ).toHaveCount(0);
  await expect(
    createDialog.getByRole("button", { name: /crear usuario/i }),
  ).toBeVisible();

  await expect(
    createDialog.getByText(/canal seguro/i),
  ).toBeVisible();
  await expect(
    createDialog.getByText(/no volver. a mostrarla/i),
  ).toBeVisible();
  await expect(
    createDialog.getByText(/al menos 8 caracteres/i),
  ).toBeVisible();
  await expect(createDialog.getByText(/may.scula/i)).toBeVisible();
  await expect(createDialog.getByText(/min.scula/i)).toBeVisible();
  await expect(createDialog.getByText(/n.mero/i)).toBeVisible();
  await expect(createDialog.getByText(/s.mbolo/i)).toBeVisible();
  await expect(createDialog).not.toContainText(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  );
  await expect(createDialog).not.toContainText(
    /\b(?:secret|token|service_role|auth\.users|file_path|bucket|storage\.objects)\b/i,
  );
  await expectNoVisibleSensitiveText(page);

  await createDialog
    .getByLabel(/correo electr.nico/i)
    .fill(createQaEmail("usuario-validacion-debil", runId));
  await createDialog.getByLabel(/contrase.a temporal/i).fill("Password1");
  await createDialog.getByLabel(/confirmar contrase.a/i).fill("Password1");
  await createDialog
    .getByLabel(/nombre completo/i)
    .fill("Usuario QA de validacion");
  await roleSelect.selectOption("trabajador");
  await createDialog.getByRole("button", { name: /crear usuario/i }).click();

  await expect(createDialog).toBeVisible();
  await expect(
    createDialog.getByText(/car.cter no alfanum.rico/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    createDialog.getByText(/supabase|auth admin|postgres|sqlstate/i),
  ).toHaveCount(0);
  await expect(
    createDialog.getByText(/usuario creado correctamente/i),
  ).toHaveCount(0);
  await expect(createDialog.getByLabel(/contrase.a temporal/i)).toHaveValue("");
  await expect(createDialog.getByLabel(/confirmar contrase.a/i)).toHaveValue("");

  await createDialog
    .getByLabel(/correo electr.nico/i)
    .fill(createQaEmail("usuario-validacion-confirmacion", runId));
  await createDialog.getByLabel(/contrase.a temporal/i).fill("QaTemporal1!");
  await createDialog.getByLabel(/confirmar contrase.a/i).fill("QaTemporal2!");
  await createDialog
    .getByLabel(/nombre completo/i)
    .fill("Usuario QA de validacion");
  await roleSelect.selectOption("trabajador");
  await createDialog.getByRole("button", { name: /crear usuario/i }).click();

  await expect(
    createDialog.getByText(/confirmaci.n debe coincidir/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    createDialog.getByText(/supabase|auth admin|postgres|sqlstate/i),
  ).toHaveCount(0);
  await expect(
    createDialog.getByText(/usuario creado correctamente/i),
  ).toHaveCount(0);
  await expect(createDialog.getByLabel(/contrase.a temporal/i)).toHaveValue("");
  await expect(createDialog.getByLabel(/confirmar contrase.a/i)).toHaveValue("");

  await roleSelect.selectOption("admin");
  const confirmAdminCheckbox = createDialog.getByLabel(
    /acceso administrativo completo/i,
  );

  await expect(confirmAdminCheckbox).toBeVisible();
  await expect(confirmAdminCheckbox).toHaveAttribute("required", "");
  await expect(
    createDialog.getByText(/acceso administrativo completo/i),
  ).toBeVisible();

  await roleSelect.selectOption("trabajador");
  await expect(confirmAdminCheckbox).toHaveCount(0);
  await expectNoVisibleSensitiveText(page);
});

test("admin can validate usuarios pagination and canonical URLs", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/configuracion/usuarios");
  await expect(
    page.getByRole("heading", { name: /^usuarios$/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/buscar usuarios/i)).toBeVisible();

  let totalPages = 1;
  let totalCount = 0;

  if (!(await hasEmptyUsuariosState(page))) {
    await expectPaginationA11y(page);

    const pageInfo = await getPaginationPageInfo(page);
    const summary = await getPaginationSummary(page);

    totalPages = pageInfo.totalPages;
    totalCount = summary.totalCount;

    console.info(
      `[usuarios pagination] totalCount=${totalCount} totalPages=${totalPages}`,
    );

    expect(pageInfo.currentPage).toBe(1);
    expect(pageInfo.totalPages).toBeGreaterThanOrEqual(1);
    expect(summary.startItem).toBe(1);
    expect(summary.endItem).toBe(Math.min(50, summary.totalCount));
    await expectDisabledControl(getPreviousPageControl(page));
    await expect(getPreviousPageLink(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }

  await page.goto("/dashboard/configuracion/usuarios?page=1");
  await expect.poll(async () => {
    const url = await getCurrentUsuariosUrl(page);

    return {
      pathname: url.pathname,
      search: url.search,
    };
  }).toEqual({
    pathname: "/dashboard/configuracion/usuarios",
    search: "",
  });

  await page.goto("/dashboard/configuracion/usuarios?page=abc");
  await expect.poll(async () => {
    const url = await getCurrentUsuariosUrl(page);

    return {
      pathname: url.pathname,
      search: url.search,
    };
  }).toEqual({
    pathname: "/dashboard/configuracion/usuarios",
    search: "",
  });

  await page.goto(`/dashboard/configuracion/usuarios?page=${totalPages + 1}`);

  await expect.poll(async () => {
    const url = await getCurrentUsuariosUrl(page);

    return {
      page: url.searchParams.get("page"),
      pathname: url.pathname,
    };
  }).toEqual({
    page: totalPages > 1 ? String(totalPages) : null,
    pathname: "/dashboard/configuracion/usuarios",
  });
  await expect(
    page.getByRole("alert").filter({
      hasText: /no se pudieron cargar los usuarios/i,
    }),
  ).toHaveCount(0);

  if (!(await hasEmptyUsuariosState(page))) {
    const lastPageInfo = await getPaginationPageInfo(page);
    const lastPageSummary = await getPaginationSummary(page);

    expect(lastPageInfo.currentPage).toBe(lastPageInfo.totalPages);
    expect(lastPageSummary.endItem).toBe(lastPageSummary.totalCount);
    await expectDisabledControl(getNextPageControl(page));
    await expect(getNextPageLink(page)).toHaveCount(0);
  }

  await page.goto(
    "/dashboard/configuracion/usuarios?role=admin&active=true&page=999999",
  );
  await expect(
    page.getByRole("alert").filter({
      hasText: /no se pudieron cargar los usuarios/i,
    }),
  ).toHaveCount(0);

  const filteredPageInfo = (await getPagination(page)
    .isVisible()
    .catch(() => false))
    ? await getPaginationPageInfo(page)
    : { totalPages: 1 };

  await expect.poll(async () => {
    const url = await getCurrentUsuariosUrl(page);

    return {
      active: url.searchParams.get("active"),
      page: url.searchParams.get("page"),
      role: url.searchParams.get("role"),
    };
  }).toEqual({
    active: "true",
    page:
      filteredPageInfo.totalPages > 1
        ? String(filteredPageInfo.totalPages)
        : null,
    role: "admin",
  });

  await page.goto(
    "/dashboard/configuracion/usuarios?role=invalido&active=desconocido&page=abc",
  );
  await expect(page.getByText(/filtro de rol no es v.lido/i)).toBeVisible();
  await expect(page.getByText(/filtro de estado no es v.lido/i)).toBeVisible();
  await expect(
    page.getByRole("alert").filter({
      hasText: /no se pudieron cargar los usuarios/i,
    }),
  ).toHaveCount(0);
  await expect.poll(async () => {
    const url = await getCurrentUsuariosUrl(page);

    return {
      active: url.searchParams.get("active"),
      page: url.searchParams.get("page"),
      role: url.searchParams.get("role"),
    };
  }).toEqual({
    active: "desconocido",
    page: null,
    role: "invalido",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/configuracion/usuarios");
  if (!(await hasEmptyUsuariosState(page))) {
    await expectPaginationA11y(page);
    await expectNoHorizontalOverflow(page);
  }
});

test("admin can navigate between usuarios pages", async ({ page }) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/configuracion/usuarios");

  if (await hasEmptyUsuariosState(page)) {
    test.skip(
      true,
      "La navegacion de usuarios requiere al menos 51 usuarios visibles.",
    );
  }

  await expectPaginationA11y(page);

  const initialPageInfo = await getPaginationPageInfo(page);
  const initialSummary = await getPaginationSummary(page);

  test.skip(
    initialPageInfo.totalPages < 2,
    "La navegacion de usuarios requiere al menos 51 usuarios visibles.",
  );

  expect(initialPageInfo.currentPage).toBe(1);
  expect(initialSummary.startItem).toBe(1);
  expect(initialSummary.endItem).toBe(50);
  await expect(getNextPageLink(page)).toBeVisible();
  await expectTouchTarget(getNextPageLink(page));
  await getNextPageLink(page).click();

  await expect.poll(async () => {
    const url = await getCurrentUsuariosUrl(page);

    return url.searchParams.get("page");
  }).toBe("2");

  const secondPageInfo = await getPaginationPageInfo(page);
  const secondSummary = await getPaginationSummary(page);

  expect(secondPageInfo.currentPage).toBe(2);
  expect(secondPageInfo.totalPages).toBe(initialPageInfo.totalPages);
  expect(secondSummary.startItem).toBe(51);
  expect(secondSummary.endItem).toBe(Math.min(100, initialSummary.totalCount));
  expect(secondSummary.totalCount).toBe(initialSummary.totalCount);
  await expect(getPreviousPageLink(page)).toBeVisible();
  await expectTouchTarget(getPreviousPageLink(page));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/configuracion/usuarios?page=2");
  await expectPaginationA11y(page);
  await expectNoHorizontalOverflow(page);

  await getPreviousPageLink(page).click();
  await expect.poll(async () => {
    const url = await getCurrentUsuariosUrl(page);

    return {
      page: url.searchParams.get("page"),
      pathname: url.pathname,
    };
  }).toEqual({
    page: null,
    pathname: "/dashboard/configuracion/usuarios",
  });
});

test("usuario filters remove pagination from the URL", async ({ page }) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/configuracion/usuarios?page=2");

  if (await hasEmptyUsuariosState(page)) {
    test.skip(
      true,
      "El reinicio desde pagina 2 requiere al menos 51 usuarios visibles.",
    );
  }

  const pageInfo = await getPaginationPageInfo(page);

  test.skip(
    pageInfo.totalPages < 2,
    "El reinicio desde pagina 2 requiere al menos 51 usuarios visibles.",
  );

  const toolbar = page
    .getByRole("region", { name: /b.squeda y filtros/i })
    .first();

  await toolbar.getByRole("button", { name: /^filtros\b/i }).click();
  await toolbar.getByLabel(/^estado$/i).selectOption("true");

  await expect.poll(async () => {
    const url = await getCurrentUsuariosUrl(page);

    return {
      active: url.searchParams.get("active"),
      page: url.searchParams.get("page"),
    };
  }).toEqual({
    active: "true",
    page: null,
  });
});

test("supervisor cannot access usuarios", async ({ page }) => {
  await loginAs(page, "supervisor");

  await page.goto("/dashboard/configuracion/usuarios");
  await expectAccessLimitedPage(page);
});

test("worker cannot access usuarios", async ({ page }) => {
  await loginAs(page, "worker");

  await page.goto("/dashboard/configuracion/usuarios");
  await expectAccessLimitedPage(page);
});
