import { expect, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import {
  createQaSupabaseClient,
  signOutQaSupabaseClient,
} from "./helpers/supabase";

type QaSupabaseClient = Awaited<ReturnType<typeof createQaSupabaseClient>>;
type QaCountQuery = PromiseLike<{
  count: number | null;
  error: { message?: string } | null;
}>;

test.describe.configure({ mode: "serial" });

const managementDashboardCards = [
  /solicitudes nuevas/i,
  /^pedidos activos$/i,
  /clientes registrados/i,
];

const workerForbiddenText = [
  /solicitudes nuevas/i,
  /solicitudes pendientes/i,
  /aprobadas sin convertir/i,
  /clientes registrados/i,
];

const pendingSolicitudesVisibleLimit = 8;
const readyOrdersVisibleLimit = 8;

async function resolveQaCount(label: string, query: QaCountQuery) {
  const { count, error } = await query;

  if (error) {
    throw new Error(`${label}: ${error.message ?? "Supabase count error"}`);
  }

  return count ?? 0;
}

async function countManagementPendingSolicitudes(
  supabase: QaSupabaseClient,
) {
  const [nuevas, enRevision, contactadas, aprobadasSinConvertir] =
    await Promise.all([
      resolveQaCount(
        "solicitudes nuevas pendientes",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "nueva"),
      ),
      resolveQaCount(
        "solicitudes en revision pendientes",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "en_revision"),
      ),
      resolveQaCount(
        "solicitudes contactadas pendientes",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "contactada"),
      ),
      resolveQaCount(
        "solicitudes aprobadas sin convertir",
        supabase
          .from("solicitudes")
          .select("id", { count: "exact", head: true })
          .eq("status", "aprobada")
          .is("converted_order_id", null),
      ),
    ]);

  return nuevas + enRevision + contactadas + aprobadasSinConvertir;
}

async function countReadyOrders(supabase: QaSupabaseClient) {
  return resolveQaCount(
    "pedidos listos para entrega",
    supabase
      .from("pedidos")
      .select("id", { count: "exact", head: true })
      .eq("status", "listo_entrega"),
  );
}

async function getQaProfileId(supabase: QaSupabaseClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("No se pudo resolver el usuario QA autenticado.");
  }

  const { data, error } = await supabase
    .from("perfiles")
    .select("id")
    .eq("id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`perfil QA activo: ${error.message}`);
  }

  return data?.id ?? null;
}

async function countWorkerAssignedReadyOrders(supabase: QaSupabaseClient) {
  const profileId = await getQaProfileId(supabase);

  if (!profileId) {
    test.skip(
      true,
      "No hay perfil activo para validar conteos asignados del trabajador.",
    );
    return 0;
  }

  return resolveQaCount(
    "pedidos listos asignados al trabajador",
    supabase
      .from("pedidos")
      .select("id, pedido_trabajadores!inner(assigned_profile_id)", {
        count: "exact",
        head: true,
      })
      .eq("pedido_trabajadores.assigned_profile_id", profileId)
      .eq("status", "listo_entrega"),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDashboardCount(value: number) {
  return value.toLocaleString("es");
}

async function expectWorkspaceActionBadge(
  page: Page,
  actionName: RegExp,
  expectedCount: number,
) {
  const action = page.getByRole("button", { name: actionName }).first();
  const ariaLabel = await action.getAttribute("aria-label");

  expect(ariaLabel).toBeTruthy();
  expect(ariaLabel ?? "").toMatch(new RegExp(`${expectedCount}$`));
}

async function openWorkspaceAction(page: Page, actionName: RegExp) {
  await page.getByRole("button", { name: actionName }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function expectMoreLink(
  page: Page,
  itemName: "solicitudes" | "pedidos",
  totalCount: number,
  visibleLimit: number,
) {
  const dialog = page.getByRole("dialog");
  const moreCount = Math.max(0, totalCount - visibleLimit);
  const morePattern = new RegExp(`${itemName} m.s`, "i");

  if (moreCount > 0) {
    await expect(
      dialog.getByRole("link", {
        name: new RegExp(
          `\\+${escapeRegExp(formatDashboardCount(moreCount))} ${itemName} m.s`,
          "i",
        ),
      }),
    ).toBeVisible();
    return;
  }

  await expect(dialog.getByRole("link", { name: morePattern })).toHaveCount(0);
}

async function expectDashboardLoaded(
  page: Page,
  heading: RegExp,
  boardHeading: RegExp = /pedidos activos/i,
) {
  await expect(page).toHaveURL(/\/dashboard(?:\/)?(?:[?#].*)?$/);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: boardHeading }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /historial/i }),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);
}

async function expectBodyNotToMatch(page: Page, patterns: RegExp[]) {
  const bodyText = await page.locator("body").innerText();

  for (const pattern of patterns) {
    expect(bodyText).not.toMatch(pattern);
  }
}

async function expectNoDashboardLinks(page: Page, hrefs: string[]) {
  for (const href of hrefs) {
    await expect(page.locator(`a[href^="${href}"]`)).toHaveCount(0);
  }
}

async function expectInternalNotFoundPage(page: Page, pathname: string) {
  await expect(page).toHaveURL(new RegExp(`${pathname}(?:[?#].*)?$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /no encontramos este recurso interno/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /volver al dashboard/i }),
  ).toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("link", { name: /ir a pedidos/i })).toHaveAttribute(
    "href",
    "/dashboard/pedidos",
  );
  await expect(page).not.toHaveURL(/\/sin-permisos/);
  await expect(page.getByRole("button", { name: /reintentar/i })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /reintentar/i })).toHaveCount(0);
  await expect(page.getByText(/permiso requerido|sesi.n sigue activa/i))
    .toHaveCount(0);
  await expectNoVisibleSensitiveText(page);
}

test("admin sees the global dashboard with management sections", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await expectDashboardLoaded(page, /dashboard operativo/i);
  await expect(
    page.getByRole("button", { name: /solicitudes/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /entregas/i })).toBeVisible();
  await page.getByRole("button", { name: /resumen/i }).click();

  for (const card of managementDashboardCards) {
    await expect(page.getByText(card).first()).toBeVisible();
  }

  await page.getByRole("button", { name: /^cerrar$/i }).click();

  await expect(page.locator('a[href^="/dashboard/solicitudes"]')).not.toHaveCount(
    0,
  );
  await expect(page.locator('a[href^="/dashboard/pedidos"]')).not.toHaveCount(0);
  await expect(page.locator('a[href^="/dashboard/clientes"]')).not.toHaveCount(
    0,
  );
  await expect(page.locator('a[href^="/dashboard/configuracion"]')).not.toHaveCount(
    0,
  );
  await expect(page.locator('a[href^="/dashboard/configuracion/usuarios"]')).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /^usuarios$/i })).toHaveCount(0);

  await page.getByRole("link", { name: /configuración/i }).first().click();
  await expect(
    page.getByRole("heading", { name: /configuración/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /usuarios/i }).click();
  await expect(page).toHaveURL(/\/dashboard\/configuracion\/usuarios/);
  await expect(page.getByRole("heading", { name: /^usuarios$/i })).toBeVisible();
});

test("management dashboard badges and more links use exact counts", async ({
  page,
}) => {
  const supabase = await createQaSupabaseClient("admin");
  let pendingSolicitudesCount = 0;
  let readyOrdersCount = 0;

  try {
    [pendingSolicitudesCount, readyOrdersCount] = await Promise.all([
      countManagementPendingSolicitudes(supabase),
      countReadyOrders(supabase),
    ]);
  } finally {
    await signOutQaSupabaseClient(supabase);
  }

  await loginAs(page, "admin");
  await expectDashboardLoaded(page, /dashboard operativo/i);

  await expectWorkspaceActionBadge(
    page,
    /solicitudes/i,
    pendingSolicitudesCount,
  );
  await expectWorkspaceActionBadge(page, /entregas/i, readyOrdersCount);

  await openWorkspaceAction(page, /solicitudes/i);
  await expect(
    page
      .getByRole("dialog")
      .locator('a[href^="/dashboard/solicitudes/"]'),
  ).toHaveCount(
    Math.min(pendingSolicitudesCount, pendingSolicitudesVisibleLimit),
  );
  await expectMoreLink(
    page,
    "solicitudes",
    pendingSolicitudesCount,
    pendingSolicitudesVisibleLimit,
  );
  await page.getByRole("button", { name: /^cerrar$/i }).click();

  await openWorkspaceAction(page, /entregas/i);
  await expect(
    page.getByRole("dialog").locator('a[href^="/dashboard/pedidos/"]'),
  ).toHaveCount(Math.min(readyOrdersCount, readyOrdersVisibleLimit));
  await expectMoreLink(
    page,
    "pedidos",
    readyOrdersCount,
    readyOrdersVisibleLimit,
  );
});

test("supervisor sees the global dashboard without admin-only navigation", async ({
  page,
}) => {
  await loginAs(page, "supervisor");

  await expectDashboardLoaded(page, /dashboard operativo/i);
  await expect(
    page.getByRole("button", { name: /solicitudes/i }),
  ).toBeVisible();
  await expectNoDashboardLinks(page, [
    "/dashboard/configuracion",
  ]);
});

test("worker sees only assigned-work dashboard context", async ({ page }) => {
  await loginAs(page, "worker");

  await expectDashboardLoaded(
    page,
    /mi trabajo asignado/i,
    /mis pedidos asignados/i,
  );
  await expect(
    page.getByRole("button", { name: /solicitudes/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /entregas/i })).toBeVisible();
  await page.getByRole("button", { name: /resumen/i }).click();
  await expectBodyNotToMatch(page, workerForbiddenText);
  await expectNoDashboardLinks(page, [
    "/dashboard/solicitudes",
    "/dashboard/clientes",
    "/dashboard/configuracion",
  ]);
});

test("worker ready-orders badge counts only assigned pedidos", async ({
  page,
}) => {
  const supabase = await createQaSupabaseClient("worker");
  let assignedReadyOrdersCount = 0;

  try {
    assignedReadyOrdersCount = await countWorkerAssignedReadyOrders(supabase);
  } finally {
    await signOutQaSupabaseClient(supabase);
  }

  await loginAs(page, "worker");
  await expectDashboardLoaded(
    page,
    /mi trabajo asignado/i,
    /mis pedidos asignados/i,
  );

  await expectWorkspaceActionBadge(page, /entregas/i, assignedReadyOrdersCount);
  await openWorkspaceAction(page, /entregas/i);
  await expect(
    page.getByRole("dialog").locator('a[href^="/dashboard/pedidos/"]'),
  ).toHaveCount(Math.min(assignedReadyOrdersCount, readyOrdersVisibleLimit));
  await expectMoreLink(
    page,
    "pedidos",
    assignedReadyOrdersCount,
    readyOrdersVisibleLimit,
  );
});

test("protected dashboard routes remain limited by role", async ({ page }) => {
  await loginAs(page, "worker");
  await page.goto("/dashboard/solicitudes");
  await expectAccessLimitedPage(page);

  await page.goto("/dashboard/clientes");
  await expectAccessLimitedPage(page);

  await loginAs(page, "supervisor");
  await page.goto("/dashboard/configuracion/usuarios");
  await expectAccessLimitedPage(page);

  await loginAs(page, "worker");
  await page.goto("/dashboard/configuracion/usuarios");
  await expectAccessLimitedPage(page);
});

test("unknown internal dashboard routes render the internal not found state", async ({
  page,
}) => {
  const unknownPath = "/dashboard/ruta-inexistente-qa";

  await loginAs(page, "worker");
  await page.goto(unknownPath);
  await expectInternalNotFoundPage(page, unknownPath);

  await loginAs(page, "admin");
  await page.goto(unknownPath);
  await expectInternalNotFoundPage(page, unknownPath);
});

test("active internal users do not stay on access-denied", async ({ page }) => {
  await loginAs(page, "admin");
  await page.goto("/acceso-denegado");
  await expectDashboardLoaded(page, /dashboard operativo/i);
});
