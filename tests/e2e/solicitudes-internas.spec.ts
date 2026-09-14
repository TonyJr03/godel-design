import { resolve } from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import type { Database } from "@/types/database";
import {
  expectAccessLimitedPage,
  expectNoStorageLeakTextIn,
  expectNoTechnicalLeakText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaEmail, createQaRunId } from "./helpers/qa-data";
import {
  createQaSupabaseClient,
  signOutQaSupabaseClient,
} from "./helpers/supabase";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const futureDate = getFutureDateInputValue(30);
const encargoName = `QA Cliente Solicitud ${runId}`;
const encargoPhone = `555${runId.slice(-7)}`;
const encargoEmail = `qa-solicitud-contacto-largo-${runId}@example.com`;
const encargoDescription = `QA Solicitud Interna Encargo ${runId}`;
const encargoNotes = `Solicitud interna focal creada por Playwright ${runId}`;
const impresionName = `QA Cliente Impresion ${runId}`;
const impresionPhone = `556${runId.slice(-7)}`;
const impresionEmail = createQaEmail("qa-solicitud-impresion", runId);
const pedidoTitle = `QA Pedido Desde Solicitud ${runId}`;
const pedidoDescription = `Pedido convertido desde ${encargoDescription}`;
const selectorSolicitudName = `QA Solicitud Selector ${runId}`;
const selectorSolicitudPhone = `557${runId.slice(-7)}`;
const selectorSolicitudEmail = `qa-solicitud-selector-${runId}@example.com`;
const selectorSolicitudDescription =
  `QA Solicitud para selector asincrono ${runId}`;
const selectorClienteAName = `QA Cliente Selector A ${runId}`;
const selectorClienteAPhone = `558${runId.slice(-7)}`;
const selectorClienteAEmail =
  `qa-selector-cliente-a-${runId}@example.com`;
const selectorClienteANotes = `Notas QA selector cliente A ${runId}`;
const selectorClienteBName = `QA Cliente Selector B ${runId}`;
const selectorClienteBPhone = `559${runId.slice(-7)}`;
const selectorClienteBEmail =
  `qa-selector-cliente-b-${runId}@example.com`;
const selectorClienteBNotes = `Notas QA selector cliente B ${runId}`;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const missingServiceId = "00000000-0000-4000-8000-000000000000";

type QaSupabaseClient = Awaited<ReturnType<typeof createQaSupabaseClient>>;
type ServiceTypeRow = Pick<
  Database["public"]["Tables"]["tipos_servicio"]["Row"],
  "id" | "name" | "workflow_type" | "is_publicly_available"
>;
type SolicitudServiceAssertion = Pick<
  Database["public"]["Tables"]["solicitudes"]["Row"],
  | "id"
  | "service_id"
  | "workflow_type"
  | "status"
  | "converted_order_id"
>;
type PedidoConversionAssertion = Pick<
  Database["public"]["Tables"]["pedidos"]["Row"],
  | "id"
  | "solicitud_id"
  | "service_id"
  | "workflow_type"
  | "title"
  | "description"
>;

let encargoReference = "";
let impresionReference = "";
let encargoDetailUrl = "";
let impresionDetailUrl = "";
let convertedPedidoUrl = "";
let focalSolicitudServiceId = "";

async function listQaServiceTypes(supabase: QaSupabaseClient) {
  const { data, error } = await supabase
    .from("tipos_servicio")
    .select("id, name, workflow_type, is_publicly_available")
    .order("workflow_type", { ascending: true })
    .order("name", { ascending: true })
    .returns<ServiceTypeRow[]>();

  expect(error).toBeNull();
  expect(data).not.toBeNull();

  return data ?? [];
}

async function setQaServiceAvailability(
  supabase: QaSupabaseClient,
  serviceId: string,
  isPubliclyAvailable: boolean,
) {
  const { error } = await supabase
    .from("tipos_servicio")
    .update({ is_publicly_available: isPubliclyAvailable })
    .eq("id", serviceId);

  expect(error).toBeNull();
}

async function resolveHiddenEncargoService(
  supabase: QaSupabaseClient,
  encargoServices: ServiceTypeRow[],
) {
  const alreadyHidden = encargoServices.find(
    (service) => !service.is_publicly_available,
  );

  if (alreadyHidden) {
    return {
      service: alreadyHidden,
      restore: async () => undefined,
    };
  }

  const service = encargoServices[0];

  if (!service) {
    throw new Error("No encargo service types available for QA.");
  }

  await setQaServiceAvailability(supabase, service.id, false);

  return {
    service: {
      ...service,
      is_publicly_available: false,
    },
    restore: async () => {
      await setQaServiceAvailability(supabase, service.id, true);
    },
  };
}

async function createApprovedQaSolicitud({
  supabase,
  service,
  label,
  description,
}: {
  supabase: QaSupabaseClient;
  service: ServiceTypeRow;
  label: string;
  description: string;
}) {
  const { data: cliente, error: clienteError } = await supabase
    .from("clientes")
    .insert({
      name: `QA Cliente ${label} ${runId}`,
      phone: `56${runId.slice(-7)}`,
      email: createQaEmail(`qa-cliente-${label}`, runId),
      notes: `Cliente QA para conversion ${label} ${runId}`,
    })
    .select("id")
    .single<{ id: string }>();

  expect(clienteError).toBeNull();
  expect(cliente).not.toBeNull();

  const { data: solicitud, error: solicitudError } = await supabase
    .from("solicitudes")
    .insert({
      cliente_id: cliente!.id,
      client_name: `QA Cliente ${label} ${runId}`,
      client_phone: `56${runId.slice(-7)}`,
      client_email: createQaEmail(`qa-solicitud-${label}`, runId),
      service_id: service.id,
      workflow_type: service.workflow_type,
      description,
      desired_date: futureDate,
      notes: `Solicitud QA ${label} ${runId}`,
      status: "aprobada",
    })
    .select("id, service_id, workflow_type, status, converted_order_id")
    .single<SolicitudServiceAssertion>();

  expect(solicitudError).toBeNull();
  expect(solicitud).not.toBeNull();

  return solicitud as SolicitudServiceAssertion;
}

async function getSolicitudServiceAssertion(
  supabase: QaSupabaseClient,
  solicitudId: string,
) {
  const { data, error } = await supabase
    .from("solicitudes")
    .select("id, service_id, workflow_type, status, converted_order_id")
    .eq("id", solicitudId)
    .maybeSingle<SolicitudServiceAssertion>();

  expect(error).toBeNull();
  expect(data).not.toBeNull();

  return data as SolicitudServiceAssertion;
}

async function getPedidosForSolicitud(
  supabase: QaSupabaseClient,
  solicitudId: string,
) {
  const { data, error } = await supabase
    .from("pedidos")
    .select("id, solicitud_id, service_id, workflow_type, title, description")
    .eq("solicitud_id", solicitudId)
    .returns<PedidoConversionAssertion[]>();

  expect(error).toBeNull();

  return data ?? [];
}

async function clickFirstVisible(locator: Locator) {
  await expect(async () => {
    const count = await locator.count();

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);

      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        return;
      }
    }

    throw new Error("No visible element found.");
  }).toPass();
}

function getSolicitudesFiltersToggle(page: Page) {
  return page.getByRole("button", { name: /^filtros\b/i });
}

async function openSolicitudPanel(
  page: Page,
  name: RegExp,
  triggerName = name,
): Promise<Locator> {
  const currentDialog = page.getByRole("dialog");

  if ((await currentDialog.count()) > 0) {
    const closeButton = currentDialog.getByRole("button", { name: /cerrar/i });

    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await expect(currentDialog).toBeHidden();
    }
  }

  await clickFirstVisible(page.getByRole("button", { name: triggerName }));

  const dialog = page.getByRole("dialog", { name });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

async function extractPublicReference(page: Page) {
  const bodyText = await page.locator("body").innerText();
  const publicReference = bodyText.match(/GD-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];

  expect(publicReference, "public tracking reference should be visible")
    .toBeTruthy();

  return publicReference as string;
}

async function createPublicEncargo(page: Page) {
  await page.goto("/solicitud");
  await expect(
    page.getByRole("heading", { name: /qu. necesitas preparar/i }),
  ).toBeVisible();

  if (
    await page
      .getByText(/formulario no disponible/i)
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(true, "No public service types are available in this database.");
  }

  await page.getByRole("tab", { name: /encargo/i }).click();
  await page.getByLabel(/nombre del cliente/i).fill(encargoName);
  await page.getByLabel(/tel.fono|telefono/i).fill(encargoPhone);
  await page.getByLabel(/correo electr.nico|correo electronico/i).fill(encargoEmail);
  const serviceSelect = page.getByLabel(/^servicio/i);
  await expect(serviceSelect).toBeVisible();
  focalSolicitudServiceId = await serviceSelect.inputValue();
  await page.getByLabel(/fecha deseada/i).fill(futureDate);
  await page.getByLabel(/descripci.n del trabajo/i).fill(encargoDescription);
  await page.getByLabel(/observaciones adicionales/i).fill(encargoNotes);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(page.getByText(/solicitud enviada correctamente|hemos recibido tu solicitud/i)).toBeVisible({
    timeout: 15_000,
  });
  await expectNoTechnicalLeakText(page);

  return extractPublicReference(page);
}

async function createPublicSelectorSolicitud(page: Page) {
  await page.goto("/solicitud");
  await expect(
    page.getByRole("heading", { name: /qu. necesitas preparar/i }),
  ).toBeVisible();

  if (
    await page
      .getByText(/formulario no disponible/i)
      .isVisible()
      .catch(() => false)
  ) {
    test.skip(true, "No public service types are available in this database.");
  }

  await page.getByRole("tab", { name: /encargo/i }).click();
  await page.getByLabel(/nombre del cliente/i).fill(selectorSolicitudName);
  await page.getByLabel(/tel.fono|telefono/i).fill(selectorSolicitudPhone);
  await page
    .getByLabel(/correo electr.nico|correo electronico/i)
    .fill(selectorSolicitudEmail);
  await expect(page.getByLabel(/^servicio/i)).toBeVisible();
  await page.getByLabel(/fecha deseada/i).fill(futureDate);
  await page
    .getByLabel(/descripci.n del trabajo/i)
    .fill(selectorSolicitudDescription);
  await page
    .getByLabel(/observaciones adicionales/i)
    .fill(`QA selector asincrono ${runId}`);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(page.getByText(/solicitud enviada correctamente|hemos recibido tu solicitud/i)).toBeVisible({
    timeout: 15_000,
  });
  await expectNoTechnicalLeakText(page);

  return extractPublicReference(page);
}

async function createPublicImpresion(page: Page) {
  await page.goto("/solicitud");
  await page.getByRole("tab", { name: /impresi.n/i }).click();
  await page.getByLabel(/nombre del cliente/i).fill(impresionName);
  await page.getByLabel(/tel.fono|telefono/i).fill(impresionPhone);
  await page.getByLabel(/correo electr.nico|correo electronico/i).fill(
    impresionEmail,
  );
  await page.getByLabel(/cantidad de copias/i).fill("3");
  await page.getByLabel(/modo de color/i).selectOption("color");
  await page.getByLabel(/tama.o de papel/i).selectOption("carta");
  await page.getByLabel(/caras/i).selectOption("una_cara");
  await page.getByLabel(/observaciones/i).fill(`Impresion QA ${runId}`);
  await page.locator('input[name="files"]').setInputFiles(
    resolve(process.cwd(), "tests/e2e/fixtures/sample-print-request.pdf"),
  );
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(page.getByText(/solicitud enviada correctamente|hemos recibido tu solicitud/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/archivo/i).first()).toBeVisible();
  await expectNoTechnicalLeakText(page);

  return extractPublicReference(page);
}

async function createInternalClienteForSelector(
  page: Page,
  cliente: {
    name: string;
    phone: string;
    email: string;
    notes: string;
  },
) {
  await page.goto("/dashboard/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo cliente/i });

  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/^nombre/i).fill(cliente.name);
  await dialog.getByLabel(/tel.fono/i).fill(cliente.phone);
  await dialog.getByLabel(/correo electr.nico/i).fill(cliente.email);
  await dialog.getByLabel(/notas/i).fill(cliente.notes);
  await dialog.getByRole("button", { name: /crear cliente/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expectNoTechnicalLeakText(page);
}

async function expectSolicitudesListLoaded(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/solicitudes(?:[/?#].*)?$/);
  await expect(
    page.getByRole("heading", { name: /^solicitudes$/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/buscar solicitudes/i)).toBeVisible();
  await expectNoTechnicalLeakText(page);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSolicitudClienteCombobox(dialog: Locator) {
  return dialog.getByRole("combobox", { name: /^cliente existente/i });
}

function getSolicitudClienteHiddenInput(dialog: Locator) {
  return dialog.locator('input[type="hidden"][name="cliente_id"]');
}

function getSolicitudClienteListbox(dialog: Locator) {
  return dialog.getByRole("listbox");
}

function getSolicitudClienteOption(dialog: Locator, name: string | RegExp) {
  const optionName = typeof name === "string"
    ? new RegExp(escapeRegExp(name), "i")
    : name;

  return dialog.getByRole("option", { name: optionName });
}

async function getRequiredBox(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();

  return box!;
}

async function openSolicitudDetail(page: Page, query: string, expectedName: string) {
  await page.goto(`/dashboard/solicitudes?q=${encodeURIComponent(query)}`);
  await expectSolicitudesListLoaded(page);

  const solicitudLink = page
    .getByRole("link", {
      name: new RegExp(`abrir solicitud de ${escapeRegExp(expectedName)}`, "i"),
    })
    .first();

  await expect(solicitudLink).toBeVisible({ timeout: 15_000 });
  await solicitudLink.click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`solicitud de ${expectedName}`, "i"),
    }),
  ).toBeVisible();

  return page.url();
}

async function expectDesktopTrigger(
  page: Page,
  triggerName: RegExp,
  className?: RegExp,
) {
  const rail = page.getByRole("complementary", {
    name: /acciones del workspace/i,
  });
  const trigger = rail.getByRole("button", { name: triggerName });

  await expect(trigger).toBeVisible();

  if (className) {
    await expect(trigger).toHaveClass(className);
  }

  return trigger;
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1,
  );
}

function getSolicitudDetailLink(page: Page, clientName: string) {
  return page.getByRole("link", {
    name: new RegExp(`abrir solicitud de ${escapeRegExp(clientName)}`, "i"),
  });
}

function getVisibleSearchInput(page: Page) {
  return page.locator('input[name="q"]:visible');
}

function getSolicitudesPagination(page: Page) {
  return page.getByRole("navigation", {
    name: /paginaci.n de solicitudes/i,
  });
}

async function getSolicitudesPaginationPageInfo(page: Page) {
  const pagination = getSolicitudesPagination(page);
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

async function getSolicitudesPaginationSummary(page: Page) {
  const pagination = getSolicitudesPagination(page);
  const text = await pagination
    .getByText(/Mostrando\s+\d+–\d+\s+de\s+\d+\s+solicitudes/i)
    .innerText();
  const match = text.match(
    /Mostrando\s+(\d+)–(\d+)\s+de\s+(\d+)\s+solicitudes/i,
  );

  expect(match, `Unexpected pagination summary text: ${text}`).not.toBeNull();

  return {
    startItem: Number(match?.[1]),
    endItem: Number(match?.[2]),
    totalCount: Number(match?.[3]),
  };
}

function getPreviousSolicitudPageControl(page: Page) {
  return getSolicitudesPagination(page).getByLabel(/Ir a la p.gina anterior/i);
}

function getNextSolicitudPageControl(page: Page) {
  return getSolicitudesPagination(page).getByLabel(/Ir a la p.gina siguiente/i);
}

function getPreviousSolicitudPageLink(page: Page) {
  return getSolicitudesPagination(page).getByRole("link", {
    name: /Ir a la p.gina anterior/i,
  });
}

function getNextSolicitudPageLink(page: Page) {
  return getSolicitudesPagination(page).getByRole("link", {
    name: /Ir a la p.gina siguiente/i,
  });
}

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(40);
}

async function expectDisabledPaginationControl(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect(locator).toHaveAttribute("aria-disabled", "true");
  await expect(locator).not.toHaveAttribute("href", /.+/);
  await expectTouchTarget(locator);
}

async function expectSolicitudesPaginationA11y(page: Page) {
  const pagination = getSolicitudesPagination(page);

  await expect(pagination).toBeVisible();
  await expect(pagination.getByText(/P.gina\s+\d+\s+de\s+\d+/i)).toBeVisible();
  await expect(
    pagination.getByText(/Mostrando\s+\d+–\d+\s+de\s+\d+\s+solicitudes/i),
  ).toBeVisible();

  for (const control of [
    getPreviousSolicitudPageControl(page),
    getNextSolicitudPageControl(page),
  ]) {
    await expect(control).toBeVisible();
    await expectTouchTarget(control);
  }
}

async function getCurrentSolicitudesUrl(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/solicitudes/);

  return new URL(page.url());
}

async function expectNoSolicitudesLoadError(page: Page) {
  await expect(
    page.getByRole("alert").filter({
      hasText: /no se pudieron cargar las solicitudes/i,
    }),
  ).toHaveCount(0);
}

async function expectSolicitudVisible(page: Page, clientName: string) {
  await expect(getSolicitudDetailLink(page, clientName)).toBeVisible({
    timeout: 15_000,
  });
}

async function hasEmptySolicitudesState(page: Page) {
  return page
    .getByText(/no hay solicitudes registradas todav|no encontramos solicitudes/i)
    .first()
    .isVisible()
    .catch(() => false);
}

async function expectNoDocumentScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));

  expect(dimensions.scrollHeight).toBeLessThanOrEqual(
    dimensions.innerHeight + 2,
  );
}

const SOLICITUD_STATUS_LABELS: Record<string, RegExp> = {
  en_revision: /^En revisi.n$/i,
  contactada: /^Contactada$/i,
  aprobada: /^Aprobada$/i,
  rechazada: /^Rechazada$/i,
  convertida: /^Convertida$/i,
};

const SOLICITUD_STATUS_BUTTONS: Record<string, RegExp> = {
  contactada: /avanzar a contactada/i,
  aprobada: /avanzar a aprobada/i,
};

async function expectSolicitudStatusPanel(
  page: Page,
  status: string,
): Promise<Locator> {
  const dialog = await openSolicitudPanel(page, /^estado$/i, /^estado/i);

  await expect(dialog.locator('select[name="status"]')).toHaveCount(0);
  await expect(
    dialog.getByText(SOLICITUD_STATUS_LABELS[status]).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoTechnicalLeakText(page);

  return dialog;
}

async function updateSolicitudStatus(
  page: Page,
  status: string,
  visibleLabel: RegExp,
) {
  if (status === "en_revision") {
    const dialog = await expectSolicitudStatusPanel(page, status);

    await expect(
      dialog.getByRole("button", { name: SOLICITUD_STATUS_BUTTONS.contactada }),
    ).toBeVisible();
    await expect(dialog.getByText(/no se pudo actualizar el estado/i))
      .toHaveCount(0);
    await page.reload();
    await expectSolicitudStatusPanel(page, status);
    return;
  }

  if (status === "rechazada") {
    const dialog = await expectSolicitudStatusPanel(page, "en_revision");

    await dialog.getByRole("button", { name: /rechazar solicitud/i }).click();
    await expect(
      dialog.getByRole("group", { name: /rechazar esta solicitud/i }),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^cancelar$/i }))
      .toBeVisible();
    await dialog.getByRole("button", { name: /^cancelar$/i }).click();
    await expect(
      dialog.getByRole("group", { name: /rechazar esta solicitud/i }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: /rechazar solicitud/i }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: /rechazar solicitud/i }).click();
    await expect(
      dialog.getByRole("group", { name: /rechazar esta solicitud/i }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: /s.?, rechazar solicitud/i })
      .click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const closedDialog = await expectSolicitudStatusPanel(page, "rechazada");
    await expect(
      closedDialog.getByText(SOLICITUD_STATUS_LABELS.rechazada).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      closedDialog.getByRole("button", { name: /rechazar solicitud/i }),
    ).toHaveCount(0);
    await expect(
      closedDialog.getByRole("button", { name: /avanzar a/i }),
    ).toHaveCount(0);
    await expect(closedDialog.getByText(/zona delicada/i)).toHaveCount(0);
    await expectNoTechnicalLeakText(page);
    await closedDialog.getByRole("button", { name: /cerrar/i }).click();
    await expect(closedDialog).toBeHidden();
    return;
  }

  const dialog = await openSolicitudPanel(page, /^estado$/i, /^estado/i);
  const buttonName = SOLICITUD_STATUS_BUTTONS[status];

  if (!buttonName) {
    throw new Error(`Unsupported solicitud status transition: ${status}`);
  }

  await expect(dialog.locator('select[name="status"]')).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: buttonName })).toBeVisible();
  await dialog.getByRole("button", { name: buttonName }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  const refreshedDialog = await expectSolicitudStatusPanel(page, status);
  await expect(
    refreshedDialog.getByText(SOLICITUD_STATUS_LABELS[status] ?? visibleLabel).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoTechnicalLeakText(page);
}

async function expectSolicitudFilesPanel(page: Page, hasFiles: boolean) {
  const dialog = await openSolicitudPanel(page, /^archivos$/i, /archivos/i);

  await expectNoStorageLeakTextIn(dialog);
  await expect(dialog.getByLabel(/^archivo$/i)).toHaveCount(0);
  await expect(
    dialog.getByRole("heading", { name: /subir/i }),
  ).toHaveCount(0);

  if (hasFiles) {
    const downloadLink = dialog.getByRole("link", { name: /descargar/i }).first();

    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute(
      "href",
      /\/dashboard\/solicitudes\/[^/]+\/archivos\/[^/]+\/download$/,
    );
  } else {
    await expect(
      dialog.getByText(/no hay archivos asociados|todav.a no hay archivos/i),
    ).toBeVisible();
  }

  await dialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(dialog).toBeHidden();
}

test("admin can associate and update a cliente asynchronously from a solicitud", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  const selectorReference = await createPublicSelectorSolicitud(page);

  await loginAs(page, "admin");
  await createInternalClienteForSelector(page, {
    name: selectorClienteAName,
    phone: selectorClienteAPhone,
    email: selectorClienteAEmail,
    notes: selectorClienteANotes,
  });
  await createInternalClienteForSelector(page, {
    name: selectorClienteBName,
    phone: selectorClienteBPhone,
    email: selectorClienteBEmail,
    notes: selectorClienteBNotes,
  });

  const selectorRequests: string[] = [];

  page.on("request", (request) => {
    if (request.url().includes("/api/internal/selectors/clientes")) {
      selectorRequests.push(request.url());
    }
  });

  const selectorDetailUrl = await openSolicitudDetail(
    page,
    selectorSolicitudName,
    selectorSolicitudName,
  );

  await expect(page.getByText(selectorReference).first()).toBeVisible();
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(selectorDetailUrl);
  expect(selectorRequests).toHaveLength(0);

  let dialog = await openSolicitudPanel(page, /^cliente$/i, /cliente/i);
  let combobox = getSolicitudClienteCombobox(dialog);
  let hiddenInput = getSolicitudClienteHiddenInput(dialog);
  let associateButton = dialog.getByRole("button", {
    name: /^asociar cliente$/i,
  });

  await expect(
    dialog.getByText(
      /esta solicitud todav.a no tiene un cliente interno asociado/i,
    ),
  ).toBeVisible();
  await expect(associateButton).toBeVisible();
  await expect(combobox).toHaveValue("");
  await expect(hiddenInput).toHaveValue("");
  expect(selectorRequests).toHaveLength(0);

  const inputBox = await getRequiredBox(combobox);
  const initialButtonBox = await getRequiredBox(associateButton);
  const buttonAlignmentTolerance = 4;

  expect(Math.abs(initialButtonBox.y - inputBox.y)).toBeLessThanOrEqual(
    buttonAlignmentTolerance,
  );
  expect(initialButtonBox.x).toBeGreaterThan(inputBox.x + inputBox.width - 1);

  const initialResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      (url.searchParams.get("q") ?? "") === ""
    );
  });

  await combobox.focus();
  await initialResponsePromise;
  await expect(combobox).toHaveAttribute("aria-expanded", "true");
  await expect(combobox).toHaveAttribute("aria-autocomplete", "list");
  await expect(combobox).toHaveAttribute("aria-required", "true");

  let listbox = getSolicitudClienteListbox(dialog);

  await expect(listbox).toBeVisible();
  const controlsId = await combobox.getAttribute("aria-controls");

  expect(controlsId).toBeTruthy();
  await expect(listbox).toHaveAttribute("id", controlsId as string);
  await expect(getSolicitudClienteOption(dialog, "Sin cliente asociado"))
    .toHaveCount(0);
  await expect(listbox.getByText(/Cargando/i)).toHaveCount(0);
  await expect(async () => {
    const optionCount = await listbox.getByRole("option").count();

    expect(optionCount).toBeGreaterThanOrEqual(1);
    expect(optionCount).toBeLessThanOrEqual(20);
  }).toPass({ timeout: 10_000 });

  const openButtonBox = await getRequiredBox(associateButton);
  const openListboxBox = await getRequiredBox(listbox);

  expect(Math.abs(openButtonBox.y - initialButtonBox.y))
    .toBeLessThanOrEqual(buttonAlignmentTolerance);
  expect(openButtonBox.x).toBeGreaterThan(inputBox.x + inputBox.width - 1);
  expect(openButtonBox.y).toBeLessThan(openListboxBox.y);

  await combobox.press("ArrowDown");
  const arrowActiveDescendant =
    await combobox.getAttribute("aria-activedescendant");

  expect(arrowActiveDescendant).toBeTruthy();
  await combobox.press("End");
  expect(await combobox.getAttribute("aria-activedescendant")).toBeTruthy();
  await combobox.press("Home");
  await expect(combobox).toHaveAttribute("aria-activedescendant", /-option-0$/);
  await combobox.press("Escape");
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(combobox).toBeFocused();

  await associateButton.click();
  await expect(dialog).toBeVisible();
  await expect(combobox).toBeFocused();
  expect(await combobox.evaluate((input) =>
    (input as HTMLInputElement).validationMessage,
  )).toContain("Selecciona una opcion de la lista.");
  await expect(hiddenInput).toHaveValue("");

  const freeTextQuery = `zz-selector-${runId}`;
  const freeTextResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === freeTextQuery
    );
  });

  await combobox.fill(freeTextQuery);
  await freeTextResponsePromise;
  await associateButton.click();
  await expect(dialog).toBeVisible();
  await expect(hiddenInput).toHaveValue("");
  expect(await combobox.evaluate((input) =>
    (input as HTMLInputElement).validationMessage,
  )).toContain("Selecciona una opcion de la lista.");
  await expect(dialog.getByText(/cliente asociado correctamente/i))
    .toHaveCount(0);

  const emailResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === selectorClienteAEmail
    );
  });

  await combobox.fill(selectorClienteAEmail);
  await emailResponsePromise;
  await expect(getSolicitudClienteOption(dialog, selectorClienteAName))
    .toBeVisible();

  const searchedButtonBox = await getRequiredBox(associateButton);

  expect(Math.abs(searchedButtonBox.y - initialButtonBox.y))
    .toBeLessThanOrEqual(buttonAlignmentTolerance);
  expect(searchedButtonBox.x).toBeGreaterThan(inputBox.x + inputBox.width - 1);

  const phoneResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === selectorClienteAPhone
    );
  });

  await combobox.fill(selectorClienteAPhone);
  await phoneResponsePromise;
  await expect(getSolicitudClienteOption(dialog, selectorClienteAName))
    .toBeVisible();

  const nameResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === selectorClienteAName
    );
  });

  await combobox.fill(selectorClienteAName);
  await nameResponsePromise;
  listbox = getSolicitudClienteListbox(dialog);
  const firstOptionText = await listbox.getByRole("option").first().innerText();

  expect(firstOptionText).toContain(selectorClienteAName);
  await expect(combobox).toHaveAttribute("aria-activedescendant", /-option-0$/);
  await expect(dialog.locator('[aria-live="polite"]')).toBeVisible();
  await expect(getSolicitudClienteOption(dialog, selectorClienteAName))
    .toBeVisible();
  await combobox.press("Enter");
  await expect(combobox).toHaveValue(selectorClienteAName);
  await expect(combobox).toHaveAttribute("aria-expanded", "false");
  await expect(combobox).toBeFocused();

  const selectedClienteAId = await hiddenInput.inputValue();

  expect(selectedClienteAId).toMatch(uuidPattern);
  await associateButton.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  dialog = await openSolicitudPanel(page, /^cliente(?:\s|$)/i, /cliente/i);
  combobox = getSolicitudClienteCombobox(dialog);
  hiddenInput = getSolicitudClienteHiddenInput(dialog);
  associateButton = dialog.getByRole("button", {
    name: /^actualizar cliente$/i,
  });

  const clienteBlock = dialog.getByRole("region", {
    name: /^cliente asociado$/i,
  });

  await expect(clienteBlock.getByText(selectorClienteAName)).toBeVisible();
  await expect(clienteBlock.getByText(selectorClienteAPhone)).toBeVisible();
  await expect(clienteBlock.getByText(selectorClienteAEmail)).toBeVisible();

  const clienteALink = clienteBlock.getByRole("link", { name: /ver cliente/i });

  await expect(clienteALink).toBeVisible();
  await expect(clienteALink).toHaveAttribute(
    "href",
    `/dashboard/clientes/${selectedClienteAId}`,
  );
  await expect(combobox).toHaveValue(selectorClienteAName);
  await expect(hiddenInput).toHaveValue(selectedClienteAId);

  let updateButton = associateButton;

  await expect(updateButton).toBeVisible();
  const selectedAResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === selectorClienteAName
    );
  });

  await combobox.click();
  await selectedAResponsePromise;
  await expect(getSolicitudClienteOption(dialog, selectorClienteAName))
    .toHaveAttribute("aria-selected", "true");

  const clienteBResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());

    return (
      url.pathname === "/api/internal/selectors/clientes" &&
      url.searchParams.get("q") === selectorClienteBName
    );
  });

  await combobox.fill(selectorClienteBName);
  await clienteBResponsePromise;
  await expect(getSolicitudClienteOption(dialog, selectorClienteBName))
    .toBeVisible();
  await expect(combobox).toHaveAttribute("aria-activedescendant", /-option-0$/);
  await combobox.press("Enter");
  await expect(combobox).toHaveValue(selectorClienteBName);

  const selectedClienteBId = await hiddenInput.inputValue();

  expect(selectedClienteBId).toMatch(uuidPattern);
  expect(selectedClienteBId).not.toBe(selectedClienteAId);
  await updateButton.click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  dialog = await openSolicitudPanel(page, /^cliente(?:\s|$)/i, /cliente/i);
  combobox = getSolicitudClienteCombobox(dialog);
  hiddenInput = getSolicitudClienteHiddenInput(dialog);
  updateButton = dialog.getByRole("button", { name: /^actualizar cliente$/i });
  const updatedClienteBlock = dialog.getByRole("region", {
    name: /^cliente asociado$/i,
  });
  await expect(updatedClienteBlock.getByText(selectorClienteBName)).toBeVisible();
  await expect(updatedClienteBlock.getByText(selectorClienteAName)).toHaveCount(0);
  await expect(updatedClienteBlock.getByText(selectorClienteBPhone)).toBeVisible();
  await expect(updatedClienteBlock.getByText(selectorClienteBEmail)).toBeVisible();

  const clienteBLink = updatedClienteBlock.getByRole("link", { name: /ver cliente/i });

  await expect(clienteBLink).toHaveAttribute(
    "href",
    `/dashboard/clientes/${selectedClienteBId}`,
  );
  await expect(combobox).toHaveValue(selectorClienteBName);
  await expect(hiddenInput).toHaveValue(selectedClienteBId);
  await expect(updateButton).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(selectorDetailUrl);
  await expectNoHorizontalOverflow(page);
  const mobileDialog = await openSolicitudPanel(page, /^cliente$/i, /cliente/i);
  const mobileCombobox = getSolicitudClienteCombobox(mobileDialog);
  const mobileHiddenInput = getSolicitudClienteHiddenInput(mobileDialog);
  const mobileUpdateButton = mobileDialog.getByRole("button", {
    name: /^actualizar cliente$/i,
  });

  await expect(mobileCombobox).toBeVisible();
  await expect(mobileCombobox).toHaveValue(selectorClienteBName);
  await expect(mobileHiddenInput).toHaveValue(selectedClienteBId);
  await expect(mobileUpdateButton).toBeVisible();

  const mobileInputBox = await getRequiredBox(mobileCombobox);
  const mobileButtonBox = await getRequiredBox(mobileUpdateButton);
  const mobileDialogBox = await getRequiredBox(mobileDialog);

  expect(mobileButtonBox.y).toBeGreaterThan(mobileInputBox.y);
  expect(mobileButtonBox.width).toBeGreaterThanOrEqual(
    mobileDialogBox.width - 48,
  );
  await mobileCombobox.focus();
  const mobileListbox = getSolicitudClienteListbox(mobileDialog);

  await expect(mobileListbox).toBeVisible();

  const mobileListboxBox = await getRequiredBox(mobileListbox);

  expect(mobileListboxBox.x).toBeGreaterThanOrEqual(mobileDialogBox.x - 1);
  expect(mobileListboxBox.x + mobileListboxBox.width).toBeLessThanOrEqual(
    mobileDialogBox.x + mobileDialogBox.width + 1,
  );
  await expectNoHorizontalOverflow(page);
  await expectNoTechnicalLeakText(page);
});

test("conversion preserves original solicitud service and can use another encargo service", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const supabase = await createQaSupabaseClient("admin");
  let restoreHiddenService = async () => undefined;

  try {
    const services = await listQaServiceTypes(supabase);
    const encargoServices = services.filter(
      (service) => service.workflow_type === "encargo",
    );
    const originalService = encargoServices[0];
    const alternateService = encargoServices.find(
      (service) => service.id !== originalService?.id,
    );

    if (!originalService || !alternateService) {
      throw new Error("At least two encargo services are required for QA.");
    }

    const solicitud = await createApprovedQaSolicitud({
      supabase,
      service: originalService,
      label: "conversion-cambio",
      description: `QA conversion cambio servicio ${runId}`,
    });

    await loginAs(page, "admin");
    await page.goto(`/dashboard/solicitudes/${solicitud.id}`);
    const conversionDialog = await openSolicitudPanel(
      page,
      /^conversi.n$/i,
      /conversi.n/i,
    );
    const serviceSelect = conversionDialog.locator('select[name="service_id"]');

    await expect(serviceSelect).toHaveValue(originalService.id);
    await expect(
      conversionDialog.getByLabel(/entrega estimada\s*\(opcional\)/i),
    ).toBeVisible();
    await expect(
      serviceSelect.locator("option").evaluateAll((options) =>
        options.map((option) => option.textContent ?? "").join("\n"),
      ),
    ).resolves.not.toMatch(/oculto p.blicamente/i);
    await serviceSelect.selectOption(alternateService.id);
    await conversionDialog
      .getByLabel(/t.tulo del pedido/i)
      .fill(`QA Pedido Conversion Servicio ${runId}`);
    await conversionDialog.getByLabel(/prioridad/i).selectOption("normal");
    await conversionDialog.getByLabel(/precio del pedido/i).fill("710");
    await conversionDialog
      .locator('input[name="estimated_delivery_date"]')
      .fill(futureDate);
    await conversionDialog
      .getByLabel(/descripci.n del pedido/i)
      .fill(`QA pedido con servicio alterno ${runId}`);
    await conversionDialog
      .getByRole("button", { name: /convertir en pedido/i })
      .click();
    await expect(conversionDialog).toBeHidden({ timeout: 20_000 });

    const convertedSolicitud = await getSolicitudServiceAssertion(
      supabase,
      solicitud.id,
    );
    const convertedPedidos = await getPedidosForSolicitud(
      supabase,
      solicitud.id,
    );

    expect(convertedSolicitud.service_id).toBe(originalService.id);
    expect(convertedSolicitud.workflow_type).toBe(originalService.workflow_type);
    expect(convertedSolicitud.status).toBe("convertida");
    expect(convertedPedidos).toHaveLength(1);
    expect(convertedPedidos[0]?.service_id).toBe(alternateService.id);
    expect(convertedPedidos[0]?.workflow_type).toBe(
      convertedSolicitud.workflow_type,
    );
    expect(convertedPedidos[0]?.service_id).not.toBe(
      convertedSolicitud.service_id,
    );

    const hiddenServiceSetup = await resolveHiddenEncargoService(
      supabase,
      encargoServices,
    );
    restoreHiddenService = hiddenServiceSetup.restore;

    const hiddenSourceService =
      encargoServices.find(
        (service) => service.id !== hiddenServiceSetup.service.id,
      ) ?? originalService;
    const hiddenSolicitud = await createApprovedQaSolicitud({
      supabase,
      service: hiddenSourceService,
      label: "conversion-oculto",
      description: `QA conversion servicio oculto ${runId}`,
    });

    await page.goto(`/dashboard/solicitudes/${hiddenSolicitud.id}`);
    const hiddenDialog = await openSolicitudPanel(
      page,
      /^conversi.n$/i,
      /conversi.n/i,
    );
    const hiddenOption = hiddenDialog.locator(
      `select[name="service_id"] option[value="${hiddenServiceSetup.service.id}"]`,
    );

    await expect(hiddenOption).toHaveText(hiddenServiceSetup.service.name);
    await expect(
      hiddenDialog
        .locator('select[name="service_id"] option')
        .evaluateAll((options) =>
          options.map((option) => option.textContent ?? "").join("\n"),
        ),
    ).resolves.not.toMatch(/oculto p.blicamente/i);
    await hiddenDialog
      .locator('select[name="service_id"]')
      .selectOption(hiddenServiceSetup.service.id);
    await hiddenDialog
      .getByLabel(/t.tulo del pedido/i)
      .fill(`QA Pedido Servicio Oculto ${runId}`);
    await hiddenDialog.getByLabel(/prioridad/i).selectOption("normal");
    await hiddenDialog.getByLabel(/precio del pedido/i).fill("720");
    await hiddenDialog
      .locator('input[name="estimated_delivery_date"]')
      .fill(futureDate);
    await hiddenDialog
      .getByLabel(/descripci.n del pedido/i)
      .fill(`QA conversion con servicio oculto ${runId}`);
    await hiddenDialog
      .getByRole("button", { name: /convertir en pedido/i })
      .click();
    await expect(hiddenDialog).toBeHidden({ timeout: 20_000 });

    const hiddenPedidos = await getPedidosForSolicitud(
      supabase,
      hiddenSolicitud.id,
    );

    expect(hiddenServiceSetup.service.is_publicly_available).toBe(false);
    expect(hiddenPedidos).toHaveLength(1);
    expect(hiddenPedidos[0]?.service_id).toBe(hiddenServiceSetup.service.id);
    expect(hiddenPedidos[0]?.workflow_type).toBe("encargo");
  } finally {
    await restoreHiddenService();
    await signOutQaSupabaseClient(supabase);
  }
});

test("conversion rejects incompatible workflow and keeps print service semantics", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const supabase = await createQaSupabaseClient("admin");

  try {
    const services = await listQaServiceTypes(supabase);
    const encargoService = services.find(
      (service) => service.workflow_type === "encargo",
    );
    const printService = services.find(
      (service) => service.workflow_type === "impresion",
    );

    if (!encargoService || !printService) {
      throw new Error("Operational encargo and print services are required.");
    }

    const incompatibleSolicitud = await createApprovedQaSolicitud({
      supabase,
      service: encargoService,
      label: "conversion-incompatible",
      description: `QA conversion incompatible ${runId}`,
    });

    await loginAs(page, "admin");
    await page.goto(`/dashboard/solicitudes/${incompatibleSolicitud.id}`);
    const incompatibleDialog = await openSolicitudPanel(
      page,
      /^conversi.n$/i,
      /conversi.n/i,
    );

    await incompatibleDialog.locator("form").evaluate((form, printServiceId) => {
      const select = form.querySelector(
        'select[name="service_id"]',
      ) as HTMLSelectElement | null;

      if (!select) {
        throw new Error("service_id select was not found.");
      }

      select.add(new Option("QA servicio incompatible", printServiceId, true, true), 0);
      select.value = printServiceId;
    }, printService.id);
    await incompatibleDialog
      .getByLabel(/t.tulo del pedido/i)
      .fill(`QA Pedido Incompatible ${runId}`);
    await incompatibleDialog.getByLabel(/prioridad/i).selectOption("normal");
    await incompatibleDialog.getByLabel(/precio del pedido/i).fill("730");
    await incompatibleDialog
      .locator('input[name="estimated_delivery_date"]')
      .fill(futureDate);
    await incompatibleDialog
      .getByLabel(/descripci.n del pedido/i)
      .fill(`QA pedido incompatible ${runId}`);
    await incompatibleDialog
      .getByRole("button", { name: /convertir en pedido/i })
      .click();
    await expect(
      incompatibleDialog.locator("#convert-service-id-error"),
    ).toContainText(/no corresponde al tipo de trabajo/i, {
      timeout: 20_000,
    });
    await expectNoTechnicalLeakText(page);

    const rejectedSolicitud = await getSolicitudServiceAssertion(
      supabase,
      incompatibleSolicitud.id,
    );
    const rejectedPedidos = await getPedidosForSolicitud(
      supabase,
      incompatibleSolicitud.id,
    );

    expect(rejectedSolicitud.service_id).toBe(encargoService.id);
    expect(rejectedSolicitud.workflow_type).toBe("encargo");
    expect(rejectedSolicitud.status).toBe("aprobada");
    expect(rejectedSolicitud.converted_order_id).toBeNull();
    expect(rejectedPedidos).toHaveLength(0);

    const printDescription = `QA solicitud impresion convertida ${runId}`;
    const printSolicitud = await createApprovedQaSolicitud({
      supabase,
      service: printService,
      label: "conversion-impresion",
      description: printDescription,
    });

    await page.goto(`/dashboard/solicitudes/${printSolicitud.id}`);
    const printDialog = await openSolicitudPanel(
      page,
      /^conversi.n$/i,
      /conversi.n/i,
    );

    await expect(
      printDialog.locator('input[name="service_id"]'),
    ).toHaveValue(printService.id);
    await expect(printDialog.locator("#service_id_display")).toHaveValue(
      printService.name,
    );
    await expect(printDialog.locator('select[name="service_id"]')).toHaveCount(
      0,
    );
    await expect(printDialog).not.toContainText(/oculto p.blicamente/i);
    await printDialog.getByLabel(/prioridad/i).selectOption("normal");
    await printDialog.getByLabel(/precio del pedido/i).fill("740");
    await printDialog
      .locator('input[name="estimated_delivery_date"]')
      .fill(futureDate);
    await printDialog
      .getByRole("button", { name: /convertir en pedido/i })
      .click();
    await expect(printDialog).toBeHidden({ timeout: 20_000 });

    const printPedidos = await getPedidosForSolicitud(
      supabase,
      printSolicitud.id,
    );

    expect(printPedidos).toHaveLength(1);
    expect(printPedidos[0]?.service_id).toBe(printService.id);
    expect(printPedidos[0]?.workflow_type).toBe("impresion");
    expect(printPedidos[0]?.title).toBe("Pedido de impresión");
    expect(printPedidos[0]?.description).toBe(printDescription);

    const { error: duplicateError } = await supabase.rpc(
      "convertir_solicitud_a_pedido",
      {
        p_solicitud_id: printSolicitud.id,
        p_service_id: printService.id,
        p_title: "Pedido duplicado",
        p_description: "Intento duplicado",
        p_priority: "normal",
        p_estimated_delivery_date: futureDate,
        p_total_amount: 1,
      },
    );

    expect(duplicateError?.message).toContain(
      "Esta solicitud ya fue convertida en pedido.",
    );
    expect(await getPedidosForSolicitud(supabase, printSolicitud.id))
      .toHaveLength(1);
    await expectNoTechnicalLeakText(page);
  } finally {
    await signOutQaSupabaseClient(supabase);
  }
});

test("admin can manage solicitud workspace panels end to end", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  encargoReference = await createPublicEncargo(page);
  impresionReference = await createPublicImpresion(page);

  await loginAs(page, "admin");
  encargoDetailUrl = await openSolicitudDetail(page, encargoName, encargoName);

  await expect(page.getByText(encargoReference).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /^trabajo solicitado$/i }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: /^contacto recibido$/i }))
    .toBeVisible();
  await expect(page.getByRole("heading", { name: /^archivos adjuntos$/i }))
    .toBeVisible();
  await expect(page.getByText(encargoDescription).first()).toBeVisible();
  await expect(page.getByText(encargoNotes).first()).toBeVisible();
  await expect(page.getByText(encargoEmail).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^resumen operativo$/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /^conversi.n a pedido$/i }),
  ).toHaveCount(0);
  await expectNoTechnicalLeakText(page);

  await expect(page.getByText(SOLICITUD_STATUS_LABELS.en_revision).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.goto(encargoDetailUrl);

  await updateSolicitudStatus(page, "en_revision", /en revisi.n/i);
  await updateSolicitudStatus(page, "contactada", /contactada/i);
  await updateSolicitudStatus(page, "aprobada", /aprobada/i);
  const approvedStatusDialog = await openSolicitudPanel(
    page,
    /^estado$/i,
    /^estado/i,
  );

  await expect(approvedStatusDialog.locator('select[name="status"]'))
    .toHaveCount(0);
  await expect(
    approvedStatusDialog.getByText(/convertirla en pedido desde la secci.n conversi.n/i),
  ).toBeVisible();
  await expect(
    approvedStatusDialog.getByRole("button", { name: /convertida/i }),
  ).toHaveCount(0);
  await approvedStatusDialog.getByRole("button", { name: /cerrar/i }).click();
  await expectDesktopTrigger(
    page,
    /estado.*lista para convertir/i,
    /border-success/,
  );
  await expectDesktopTrigger(
    page,
    /cliente.*falta asociar cliente/i,
    /border-warning/,
  );
  await expectDesktopTrigger(
    page,
    /conversi.n.*falta asociar cliente/i,
    /border-warning/,
  );

  const clienteDialog = await openSolicitudPanel(page, /^cliente$/i, /cliente/i);

  await expect(
    clienteDialog.getByText(
      /esta solicitud todav.a no tiene un cliente interno asociado/i,
    ),
  ).toBeVisible();
  await clienteDialog
    .getByRole("button", { name: /crear cliente desde esta solicitud/i })
    .click();
  await expect(clienteDialog).toBeHidden({ timeout: 15_000 });
  const associatedClienteDialog = await openSolicitudPanel(
    page,
    /^cliente$/i,
    /cliente/i,
  );

  await expect(associatedClienteDialog.getByText(encargoName).first())
    .toBeVisible();
  const associatedClienteCombobox = getSolicitudClienteCombobox(
    associatedClienteDialog,
  );
  const associatedClienteHiddenInput = getSolicitudClienteHiddenInput(
    associatedClienteDialog,
  );
  const associatedClienteId = await associatedClienteHiddenInput.inputValue();
  const associatedClienteLink = associatedClienteDialog.getByRole("link", {
    name: /ver cliente/i,
  });

  expect(associatedClienteId).toMatch(uuidPattern);
  await expect(associatedClienteCombobox).toHaveValue(encargoName);
  await expect(associatedClienteHiddenInput).toHaveValue(associatedClienteId);
  await expect(
    associatedClienteDialog.getByRole("button", {
      name: /^actualizar cliente$/i,
    }),
  ).toBeVisible();
  await expect(associatedClienteLink).toBeVisible();
  await expect(associatedClienteLink).toHaveAttribute(
    "href",
    `/dashboard/clientes/${associatedClienteId}`,
  );
  await associatedClienteDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(associatedClienteDialog).toBeHidden();
  await expectDesktopTrigger(
    page,
    /cliente.*cliente asociado/i,
    /border-success.*bg-success-soft|bg-success-soft.*border-success/,
  );
  await expectDesktopTrigger(
    page,
    /conversi.n.*lista para convertir/i,
    /border-warning/,
  );

  let commentsDialog = await openSolicitudPanel(
    page,
    /^comentarios$/i,
    /comentarios/i,
  );

  await expect(
    commentsDialog.getByRole("heading", { name: /^conversaci.n interna$/i }),
  ).toBeVisible();
  await expect(
    commentsDialog.getByRole("heading", { name: /^comenta$/i }),
  ).toBeVisible();
  await expect(
    commentsDialog.getByText(/agrega una nota interna sobre esta solicitud/i),
  ).toHaveCount(0);
  await expect(
    commentsDialog.getByText(/todav.a no hay comentarios internos/i),
  ).toBeVisible();

  for (const content of [
    `Primer comentario QA ${runId}`,
    `Segundo comentario QA ${runId}`,
  ]) {
    const textarea = commentsDialog.getByLabel(/^comentario$/i);

    await textarea.fill(content);
    await commentsDialog
      .getByRole("button", { name: /agregar comentario/i })
      .click();
    await expect(commentsDialog).toBeHidden({ timeout: 15_000 });
    commentsDialog = await openSolicitudPanel(
      page,
      /^comentarios$/i,
      /comentarios/i,
    );
    await expect(commentsDialog.getByText(content)).toBeVisible({
      timeout: 15_000,
    });
  }

  const conversationSection = commentsDialog.locator(
    '[aria-labelledby="solicitud-comments-list-title"]',
  );
  const scrollMetrics = await conversationSection.evaluate((element) => ({
    clientHeight: element.clientHeight,
    overflowY: getComputedStyle(element).overflowY,
    scrollHeight: element.scrollHeight,
  }));

  expect(["auto", "scroll"]).toContain(scrollMetrics.overflowY);
  expect(scrollMetrics.scrollHeight).toBeGreaterThanOrEqual(
    scrollMetrics.clientHeight,
  );
  await expect(
    commentsDialog.getByRole("heading", { name: /^comenta$/i }),
  ).toBeVisible();
  await commentsDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(commentsDialog).toBeHidden();

  let conversionDialog = await openSolicitudPanel(
    page,
    /^conversi.n$/i,
    /conversi.n/i,
  );

  await expect(conversionDialog.getByText(/pedido de encargo/i)).toBeVisible();
  await expect(conversionDialog.getByText(/datos del encargo/i).first())
    .toBeVisible();
  await conversionDialog.getByLabel(/t.tulo del pedido/i).fill(pedidoTitle);
  await conversionDialog.getByLabel(/prioridad/i).selectOption("normal");
  await conversionDialog.getByLabel(/precio del pedido/i).fill("900");
  await conversionDialog
    .locator('input[name="estimated_delivery_date"]')
    .fill(futureDate);
  await conversionDialog
    .getByLabel(/descripci.n del pedido/i)
    .fill(pedidoDescription);
  await conversionDialog
    .getByRole("button", { name: /convertir en pedido/i })
    .click();
  await expect(conversionDialog).toBeHidden({ timeout: 20_000 });
  conversionDialog = await openSolicitudPanel(
    page,
    /^conversi.n$/i,
    /conversi.n/i,
  );
  await expect(conversionDialog.getByText(/solicitud ya fue convertida/i)).toBeVisible();
  await expect(
    conversionDialog.getByRole("button", {
      name: /convertir en pedido/i,
    }),
  ).toHaveCount(0);
  const pedidoLink = conversionDialog.getByRole("link", {
    name: /^ver pedido$/i,
  });

  await expect(pedidoLink).toBeVisible();
  convertedPedidoUrl = (await pedidoLink.getAttribute("href")) ?? "";
  await expect(conversionDialog).toBeVisible();
  await page.reload();
  await expectDesktopTrigger(
    page,
    /conversi.n.*pedido creado/i,
    /border-success/,
  );
  await expectDesktopTrigger(
    page,
    /estado.*solicitud convertida/i,
    /border-success/,
  );
  const unavailableConversionDialog = await openSolicitudPanel(
    page,
    /^conversi.n$/i,
    /conversi.n/i,
  );

  await expect(
    unavailableConversionDialog.getByText(/esta solicitud ya fue convertida/i),
  ).toBeVisible();
  await expect(
    unavailableConversionDialog.getByRole("button", {
      name: /convertir en pedido/i,
    }),
  ).toHaveCount(0);
  await unavailableConversionDialog.getByRole("button", { name: /cerrar/i })
    .click();

  const infoDialog = await openSolicitudPanel(
    page,
    /^informaci.n$/i,
    /informaci.n/i,
  );

  await expect(infoDialog.getByText(encargoReference).first()).toBeVisible();
  await expect(infoDialog.getByText(/encargo/i).first()).toBeVisible();
  await expect(infoDialog.getByText(/convertida/i).first()).toBeVisible();
  await expect(infoDialog.getByText(/identificador interno/i)).toBeVisible();
  await infoDialog.getByRole("button", { name: /cerrar/i }).click();

  const historyDialog = await openSolicitudPanel(
    page,
    /^historial$/i,
    /historial/i,
  );

  await expect(historyDialog.getByText(/creaci.n|solicitud creada/i).first())
    .toBeVisible();
  await expect(historyDialog.getByText(/estado/i).first()).toBeVisible();
  await expect(historyDialog.getByText(/cliente/i).first()).toBeVisible();
  await expect(historyDialog.getByText(/pedido/i).first()).toBeVisible();
  await historyDialog.getByRole("button", { name: /cerrar/i }).click();

  await expectSolicitudFilesPanel(page, false);
});

test("admin can validate solicitudes pagination and canonical URLs", async ({
  page,
}) => {
  await loginAs(page, "admin");

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dashboard/solicitudes");
  await expectSolicitudesListLoaded(page);

  let totalPages = 1;
  let totalCount = 0;

  if (!(await hasEmptySolicitudesState(page))) {
    await expectSolicitudesPaginationA11y(page);

    const pageInfo = await getSolicitudesPaginationPageInfo(page);
    const summary = await getSolicitudesPaginationSummary(page);

    totalPages = pageInfo.totalPages;
    totalCount = summary.totalCount;

    console.info(
      `[solicitudes pagination] totalCount=${totalCount} totalPages=${totalPages}`,
    );

    expect(pageInfo.currentPage).toBe(1);
    expect(pageInfo.totalPages).toBeGreaterThanOrEqual(1);
    expect(summary.startItem).toBe(1);
    expect(summary.endItem).toBe(Math.min(50, summary.totalCount));
    await expectDisabledPaginationControl(
      getPreviousSolicitudPageControl(page),
    );
    await expect(getPreviousSolicitudPageLink(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  }

  await page.goto("/dashboard/solicitudes?page=1");
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      pathname: url.pathname,
      search: url.search,
    };
  }).toEqual({
    pathname: "/dashboard/solicitudes",
    search: "",
  });

  await page.goto("/dashboard/solicitudes?page=abc");
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      pathname: url.pathname,
      search: url.search,
    };
  }).toEqual({
    pathname: "/dashboard/solicitudes",
    search: "",
  });

  await page.goto(`/dashboard/solicitudes?page=${totalPages + 1}`);
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      pathname: url.pathname,
    };
  }).toEqual({
    page: totalPages > 1 ? String(totalPages) : null,
    pathname: "/dashboard/solicitudes",
  });
  await expectNoSolicitudesLoadError(page);

  if (!(await hasEmptySolicitudesState(page))) {
    const lastPageInfo = await getSolicitudesPaginationPageInfo(page);
    const lastPageSummary = await getSolicitudesPaginationSummary(page);

    expect(lastPageInfo.currentPage).toBe(lastPageInfo.totalPages);
    expect(lastPageSummary.endItem).toBe(lastPageSummary.totalCount);
    await expectDisabledPaginationControl(getNextSolicitudPageControl(page));
    await expect(getNextSolicitudPageLink(page)).toHaveCount(0);
  }

  await page.goto(
    `/dashboard/solicitudes?service_id=${focalSolicitudServiceId}&status=convertida&page=999999`,
  );
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);

  const validFilterPageInfo = (await getSolicitudesPagination(page)
    .isVisible()
    .catch(() => false))
    ? await getSolicitudesPaginationPageInfo(page)
    : { totalPages: 1 };

  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      status: url.searchParams.get("status"),
      serviceId: url.searchParams.get("service_id"),
    };
  }).toEqual({
    page:
      validFilterPageInfo.totalPages > 1
        ? String(validFilterPageInfo.totalPages)
        : null,
    status: "convertida",
    serviceId: focalSolicitudServiceId,
  });
  if (validFilterPageInfo.totalPages === 1) {
    await expectSolicitudVisible(page, encargoName);
  }

  await page.goto(
    `/dashboard/solicitudes?q=${encodeURIComponent(
      encargoName,
    )}&service_id=${focalSolicitudServiceId}&status=convertida`,
  );
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);
  await expectSolicitudVisible(page, encargoName);

  await page.goto(
    "/dashboard/solicitudes?status=invalido&service_id=desconocido",
  );
  await expectSolicitudesListLoaded(page);
  await expect(page.getByText(/filtro de estado no es v.lido/i)).toBeVisible();
  await expect(page.getByText(/filtro de servicio no es v.lido/i)).toBeVisible();
  await expectNoSolicitudesLoadError(page);
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      status: url.searchParams.get("status"),
      serviceId: url.searchParams.get("service_id"),
    };
  }).toEqual({
    page: null,
    status: "invalido",
    serviceId: "desconocido",
  });
  await expect(
    page.getByRole("button", { name: /^Quitar Servicio:/i }),
  ).toHaveCount(0);
  const invalidServiceToolbar = page
    .getByRole("region", { name: /b.squeda y filtros/i })
    .first();

  await invalidServiceToolbar
    .getByRole("button", { name: /^filtros\b/i })
    .click();
  await expect(invalidServiceToolbar.getByLabel(/^servicio$/i)).toHaveValue("");

  await page.goto("/dashboard/solicitudes?service_id=desconocido&page=1");
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      serviceId: url.searchParams.get("service_id"),
    };
  }).toEqual({ page: null, serviceId: null });

  await page.goto(`/dashboard/solicitudes?service_id=${missingServiceId}`);
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return url.searchParams.get("service_id");
  }).toBe(missingServiceId);
  await expect(page.getByText(/filtro de servicio no es v.lido/i)).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: new RegExp(
        `^Quitar Servicio: ${escapeRegExp(missingServiceId)}$`,
        "i",
      ),
    }),
  ).toBeVisible();
  const missingServiceToolbar = page
    .getByRole("region", { name: /b.squeda y filtros/i })
    .first();

  await missingServiceToolbar
    .getByRole("button", { name: /^filtros\b/i })
    .click();
  await expect(missingServiceToolbar.getByLabel(/^servicio$/i)).toHaveValue("");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/solicitudes");
  await expectSolicitudesListLoaded(page);
  if (!(await hasEmptySolicitudesState(page))) {
    await expectSolicitudesPaginationA11y(page);
    await expectNoHorizontalOverflow(page);
  }
});

test("solicitud search preserves direct and mapped search capabilities", async ({
  page,
}) => {
  await loginAs(page, "admin");

  const directQueries = [
    encargoName,
    encargoPhone,
    encargoEmail,
    encargoDescription,
    encargoNotes,
  ];

  for (const query of directQueries) {
    await page.goto(`/dashboard/solicitudes?q=${encodeURIComponent(query)}`);
    await expectSolicitudesListLoaded(page);
    await expectNoSolicitudesLoadError(page);
    await expectSolicitudVisible(page, encargoName);
  }

  const solicitudId = new URL(encargoDetailUrl).pathname.split("/").pop() ?? "";

  expect(solicitudId).toMatch(/^[0-9a-f-]{8,}$/i);

  const referenceQuery = solicitudId.replace(/-/g, "").slice(0, 8);

  await page.goto(
    `/dashboard/solicitudes?q=${encodeURIComponent(referenceQuery)}`,
  );
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return url.searchParams.get("q");
  }).toBe(referenceQuery);
  await expectSolicitudVisible(page, encargoName);

  await page.goto(
    `/dashboard/solicitudes?q=${encodeURIComponent(
      encargoName,
    )}&service_id=${focalSolicitudServiceId}&status=convertida`,
  );
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);
  await expectSolicitudVisible(page, encargoName);

  await page.goto(
    `/dashboard/solicitudes?q=${encodeURIComponent(
      encargoName,
    )}&service_id=${missingServiceId}&status=convertida`,
  );
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);
  await expect(hasEmptySolicitudesState(page)).resolves.toBe(true);
  await expect(getSolicitudDetailLink(page, encargoName)).toHaveCount(0);
});

test("admin can navigate between solicitudes pages", async ({ page }) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/solicitudes");
  await expectSolicitudesListLoaded(page);

  if (await hasEmptySolicitudesState(page)) {
    test.skip(
      true,
      "La navegación de solicitudes requiere al menos 51 solicitudes visibles.",
    );
  }

  await expectSolicitudesPaginationA11y(page);

  const initialPageInfo = await getSolicitudesPaginationPageInfo(page);
  const initialSummary = await getSolicitudesPaginationSummary(page);

  test.skip(
    initialPageInfo.totalPages < 2,
    "La navegación de solicitudes requiere al menos 51 solicitudes visibles.",
  );

  expect(initialPageInfo.currentPage).toBe(1);
  expect(initialSummary.startItem).toBe(1);
  expect(initialSummary.endItem).toBe(50);
  await expectDisabledPaginationControl(getPreviousSolicitudPageControl(page));
  await expect(getNextSolicitudPageLink(page)).toBeVisible();
  await expectTouchTarget(getNextSolicitudPageLink(page));
  await expect(getNextSolicitudPageLink(page)).toHaveAttribute(
    "href",
    "/dashboard/solicitudes?page=2",
  );

  await getNextSolicitudPageLink(page).click();
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return url.searchParams.get("page");
  }).toBe("2");

  const secondPageInfo = await getSolicitudesPaginationPageInfo(page);
  const secondSummary = await getSolicitudesPaginationSummary(page);

  expect(secondPageInfo.currentPage).toBe(2);
  expect(secondPageInfo.totalPages).toBe(initialPageInfo.totalPages);
  expect(secondSummary.startItem).toBe(51);
  expect(secondSummary.endItem).toBe(Math.min(100, initialSummary.totalCount));
  expect(secondSummary.totalCount).toBe(initialSummary.totalCount);
  await expect(getPreviousSolicitudPageLink(page)).toBeVisible();
  await expectTouchTarget(getPreviousSolicitudPageLink(page));

  if (secondPageInfo.totalPages === 2) {
    await expectDisabledPaginationControl(getNextSolicitudPageControl(page));
    await expect(getNextSolicitudPageLink(page)).toHaveCount(0);
  } else {
    await expect(getNextSolicitudPageLink(page)).toHaveAttribute(
      "href",
      "/dashboard/solicitudes?page=3",
    );
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/solicitudes?page=2");
  await expectSolicitudesListLoaded(page);
  await expectSolicitudesPaginationA11y(page);
  await expect(getVisibleSearchInput(page)).toBeVisible();
  await expect(getSolicitudesFiltersToggle(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await getPreviousSolicitudPageLink(page).click();
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      pathname: url.pathname,
    };
  }).toEqual({
    page: null,
    pathname: "/dashboard/solicitudes",
  });
});

test("solicitud pagination preserves the active search", async ({ page }) => {
  await loginAs(page, "admin");

  const candidateQueries = ["a", "e", "i", "o", "5"];
  let selectedQuery: string | null = null;

  for (const query of candidateQueries) {
    await page.goto(`/dashboard/solicitudes?q=${encodeURIComponent(query)}`);
    await expectSolicitudesListLoaded(page);

    if (await hasEmptySolicitudesState(page)) {
      continue;
    }

    await expect(getSolicitudesPagination(page)).toBeVisible();

    const pageInfo = await getSolicitudesPaginationPageInfo(page);

    if (pageInfo.totalPages > 1) {
      selectedQuery = query;
      break;
    }
  }

  test.skip(
    selectedQuery === null,
    "Ninguna búsqueda candidata produjo más de una página de solicitudes.",
  );

  const query = selectedQuery ?? "";

  await expect(getVisibleSearchInput(page)).toHaveValue(query);
  await expect(getNextSolicitudPageLink(page)).toBeVisible();
  await getNextSolicitudPageLink(page).click();
  await expectSolicitudesPaginationA11y(page);

  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      q: url.searchParams.get("q"),
    };
  }).toEqual({
    page: "2",
    q: query,
  });

  const pageInfo = await getSolicitudesPaginationPageInfo(page);

  expect(pageInfo.currentPage).toBe(2);
  await expect(getVisibleSearchInput(page)).toHaveValue(query);
});

test("solicitud filters remove pagination from the URL", async ({ page }) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/solicitudes?page=2");
  await expectSolicitudesListLoaded(page);

  if (await hasEmptySolicitudesState(page)) {
    test.skip(
      true,
      "El reinicio desde página 2 requiere al menos 51 solicitudes visibles.",
    );
  }

  const pageInfo = await getSolicitudesPaginationPageInfo(page);

  test.skip(
    pageInfo.totalPages < 2,
    "El reinicio desde página 2 requiere al menos 51 solicitudes visibles.",
  );

  const toolbar = page
    .getByRole("region", { name: /b.squeda y filtros/i })
    .first();

  await toolbar.getByRole("button", { name: /^filtros\b/i }).click();
  const serviceSelect = toolbar.getByLabel(/^servicio$/i);
  const serviceLabel = await serviceSelect
    .locator(`option[value="${focalSolicitudServiceId}"]`)
    .innerText();

  await serviceSelect.selectOption(focalSolicitudServiceId);

  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      serviceId: url.searchParams.get("service_id"),
    };
  }).toEqual({
    page: null,
    serviceId: focalSolicitudServiceId,
  });
  await expect(
    page.getByRole("button", { name: new RegExp(`^Quitar Servicio: ${escapeRegExp(serviceLabel)}`, "i") }),
  ).toBeVisible();
  await expectNoSolicitudesLoadError(page);

  await toolbar.getByRole("button", { name: /^filtros\b/i }).click();
  await expect(toolbar.getByLabel(/^servicio$/i)).toHaveValue(
    focalSolicitudServiceId,
  );
  await toolbar.getByRole("button", { name: /^filtros\b/i }).click();
  await page
    .getByRole("button", { name: new RegExp(`^Quitar Servicio: ${escapeRegExp(serviceLabel)}`, "i") })
    .click();
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return url.searchParams.get("service_id");
  }).toBeNull();
  await expect(
    page.getByRole("button", { name: /^Quitar Servicio:/i }),
  ).toHaveCount(0);
});

test("solicitud workspace responsive behavior and focus restoration", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");
  await page.goto(encargoDetailUrl);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expectNoHorizontalOverflow(page);
    await expectNoDocumentScroll(page);
    await expect(
      page.getByRole("complementary", { name: /acciones del workspace/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: /acciones del workspace/i }),
    ).toHaveCount(0);
    await expect(page.getByRole("link", { name: /volver a solicitudes/i }))
      .toBeVisible();
  }

  const contactCard = page.locator("section").filter({
    has: page.getByRole("heading", { name: /^contacto recibido$/i }),
  });
  const metadataGrid = contactCard.locator("dl");
  const emailItem = contactCard.locator("div").filter({
    has: page.getByText(/^correo electr.nico$/i),
  }).first();
  const gridBox = await metadataGrid.boundingBox();
  const emailBox = await emailItem.boundingBox();

  expect(gridBox).not.toBeNull();
  expect(emailBox).not.toBeNull();
  expect(emailBox!.width).toBeGreaterThan(gridBox!.width * 0.9);

  const rail = page.getByRole("complementary", {
    name: /acciones del workspace/i,
  });
  const estadoTrigger = rail.getByRole("button", { name: /^estado/i });

  await estadoTrigger.click();
  await expect(page.getByRole("dialog", { name: /^estado$/i })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(estadoTrigger).toBeFocused();
  await estadoTrigger.click();
  const estadoDialog = page.getByRole("dialog", { name: /^estado$/i });

  await expect(estadoDialog).toBeVisible();
  await estadoDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(estadoDialog).toBeHidden();
  await expect(estadoTrigger).toBeFocused();

  await page.setViewportSize({ width: 900, height: 1000 });
  await page.reload();
  const tabletToolbar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });

  await expect(tabletToolbar).toBeVisible();
  await expect(tabletToolbar.getByRole("button", { name: /^estado/i }))
    .toBeVisible();
  await expect(tabletToolbar.getByRole("button", { name: /^cliente/i }))
    .toBeVisible();
  await expect(tabletToolbar.getByRole("button", { name: /^conversi.n/i }))
    .toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.setViewportSize({ width: 780, height: 1000 });
  await page.reload();
  const narrowToolbar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });

  await expect(narrowToolbar.getByRole("button", { name: /m.s acciones/i }))
    .toBeVisible();
  await narrowToolbar.getByRole("button", { name: /m.s acciones/i }).click();
  const moreDialog = page.getByRole("dialog", { name: /^m.s acciones$/i });

  await expect(moreDialog).toBeVisible();
  await expect(
    moreDialog.getByRole("button", { name: /^informaci.n/i }),
  ).toBeVisible();
  await expect(
    moreDialog.getByRole("button", { name: /^estado/i }),
  ).toHaveCount(0);
  await moreDialog.getByRole("button", { name: /cerrar/i }).click();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  const mobileBar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });

  await expect(mobileBar.getByRole("button", { name: /^estado/i }))
    .toBeVisible();
  await expect(mobileBar.getByRole("button", { name: /^cliente/i }))
    .toBeVisible();
  await expect(mobileBar.getByRole("button", { name: /^conversi.n/i }))
    .toBeVisible();
  await expect(mobileBar.getByRole("button", { name: /m.s acciones/i }))
    .toBeVisible();
  await expectNoHorizontalOverflow(page);
  await mobileBar.getByRole("button", { name: /m.s acciones/i }).focus();
  await page.keyboard.press("Enter");
  const mobileMoreDialog = page.getByRole("dialog", {
    name: /^m.s acciones$/i,
  });

  await expect(mobileMoreDialog).toBeVisible();
  await expect(
    mobileMoreDialog.getByRole("button", { name: /^archivos/i }),
  ).toBeVisible();
  await expect(
    mobileMoreDialog.getByRole("button", { name: /^comentarios/i }),
  ).toBeVisible();
  await expect(
    mobileMoreDialog.getByRole("button", { name: /^historial/i }),
  ).toBeVisible();
  await expect(
    mobileMoreDialog.getByRole("button", { name: /^informaci.n/i }),
  ).toBeVisible();
  await mobileMoreDialog.getByRole("button", { name: /^comentarios/i }).click();
  const commentsDialog = page.getByRole("dialog", { name: /^comentarios$/i });

  await expect(commentsDialog).toBeVisible();
  await commentsDialog.getByRole("button", { name: /volver/i }).click();
  await expect(mobileMoreDialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await mobileMoreDialog.getByRole("button", { name: /cerrar/i }).click();
});

test("impresion workflow supports files and rejected closed state", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, "admin");
  impresionDetailUrl = await openSolicitudDetail(
    page,
    impresionName,
    impresionName,
  );

  await expect(page.getByText(impresionReference).first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^datos de impresi.n solicitada$/i }),
  ).toBeVisible();
  await expect(page.getByText(/sample-print-request\.pdf/i).first())
    .toBeVisible();
  await expect(page.getByText(SOLICITUD_STATUS_LABELS.en_revision).first())
    .toBeVisible({ timeout: 15_000 });
  await page.goto(impresionDetailUrl);
  await expectSolicitudFilesPanel(page, true);

  await updateSolicitudStatus(page, "rechazada", /rechazada/i);
  await expectDesktopTrigger(
    page,
    /estado.*solicitud rechazada/i,
    /border-danger/,
  );
  const estadoDialog = await openSolicitudPanel(page, /^estado$/i, /^estado/i);

  await expect(estadoDialog.getByText(/no admite m.s cambios de estado/i))
    .toBeVisible();
  await estadoDialog.getByRole("button", { name: /cerrar/i }).click();
  const conversionDialog = await openSolicitudPanel(
    page,
    /^conversi.n$/i,
    /conversi.n/i,
  );

  await expect(
    conversionDialog.getByText(
      /la solicitud debe estar aprobada antes de convertirse en pedido/i,
    ),
  ).toBeVisible();
  await expect(
    conversionDialog.getByRole("button", { name: /convertir en pedido/i }),
  ).toHaveCount(0);
  await conversionDialog.getByRole("button", { name: /cerrar/i }).click();

  for (const panel of [/archivos/i, /comentarios/i, /historial/i, /informaci.n/i]) {
    const dialog = await openSolicitudPanel(page, new RegExp(panel.source, "i"), panel);

    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /cerrar/i }).click();
  }
});

test("solicitudes access follows current role boundaries", async ({ page }) => {
  test.setTimeout(120_000);

  await loginAs(page, "supervisor");
  await page.goto("/dashboard/solicitudes");
  await expectSolicitudesListLoaded(page);

  if (encargoDetailUrl) {
    await page.goto(encargoDetailUrl);
    await expect(
      page.getByRole("heading", {
        name: new RegExp(`solicitud de ${encargoName}`, "i"),
      }),
    ).toBeVisible();
    const clientDialog = await openSolicitudPanel(page, /^cliente$/i, /^cliente/i);

    await expect(clientDialog.getByText(encargoName).first()).toBeVisible();
    await clientDialog.getByRole("button", { name: /cerrar/i }).click();
    const commentsDialog = await openSolicitudPanel(
      page,
      /^comentarios$/i,
      /^comentarios/i,
    );

    await expect(
      commentsDialog.getByRole("textbox", { name: /comentario/i }),
    ).toBeVisible();
    await commentsDialog.getByRole("button", { name: /cerrar/i }).click();
    const statusDialog = await openSolicitudPanel(page, /^estado$/i, /^estado/i);

    await expect(statusDialog).toBeVisible();
    await statusDialog.getByRole("button", { name: /cerrar/i }).click();
    const conversionDialog = await openSolicitudPanel(
      page,
      /^conversi.n$/i,
      /^conversi.n/i,
    );

    await expect(
      conversionDialog.getByRole("link", { name: /ver pedido/i }),
    ).toBeVisible();
    await conversionDialog.getByRole("button", { name: /cerrar/i }).click();
    await expectNoTechnicalLeakText(page);
  }

  if (convertedPedidoUrl) {
    await page.goto(convertedPedidoUrl);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: pedidoTitle,
        exact: true,
      }),
    ).toBeVisible();
    await expectNoTechnicalLeakText(page);
  }

  await loginAs(page, "worker");
  await page.goto("/dashboard/solicitudes");
  await expectAccessLimitedPage(page);

  if (encargoDetailUrl) {
    await page.goto(encargoDetailUrl);
    await expectAccessLimitedPage(page);
  }

  if (impresionDetailUrl) {
    await page.goto(impresionDetailUrl);
    await expectAccessLimitedPage(page);
  }
});
