import { resolve } from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoStorageLeakTextIn,
  expectNoTechnicalLeakText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaEmail, createQaRunId } from "./helpers/qa-data";

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

let encargoReference = "";
let impresionReference = "";
let encargoDetailUrl = "";
let impresionDetailUrl = "";
let convertedPedidoUrl = "";

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

  await page.getByRole("tab", { name: /encargo personalizado/i }).click();
  await page.getByLabel(/nombre del cliente/i).fill(encargoName);
  await page.getByLabel(/tel.fono|telefono/i).fill(encargoPhone);
  await page.getByLabel(/correo electr.nico|correo electronico/i).fill(encargoEmail);
  await page.getByLabel(/tipo de servicio/i).selectOption("Personalizacion");
  await page.getByLabel(/fecha deseada/i).fill(futureDate);
  await page.getByLabel(/descripci.n del trabajo/i).fill(encargoDescription);
  await page.getByLabel(/observaciones adicionales/i).fill(encargoNotes);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(page.getByText(/hemos recibido tu solicitud/i)).toBeVisible({
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

  await expect(page.getByText(/hemos recibido tu solicitud/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/archivo/i).first()).toBeVisible();
  await expectNoTechnicalLeakText(page);

  return extractPublicReference(page);
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
    await expect(
      dialog.getByText(SOLICITUD_STATUS_LABELS.rechazada).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      dialog.getByRole("button", { name: /rechazar solicitud/i }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: /avanzar a/i }),
    ).toHaveCount(0);
    await expect(dialog.getByText(/zona delicada/i)).toHaveCount(0);
    await expectNoTechnicalLeakText(page);
    await dialog.getByRole("button", { name: /cerrar/i }).click();
    await expect(dialog).toBeHidden();
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
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(SOLICITUD_STATUS_LABELS[status] ?? visibleLabel).first(),
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
  await expect(page.getByRole("heading", { name: /^archivos recientes$/i }))
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
  await expect(
    clienteDialog.getByText(/cliente creado y asociado correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(clienteDialog).toBeVisible();
  await page.reload();
  const associatedClienteDialog = await openSolicitudPanel(
    page,
    /^cliente$/i,
    /cliente/i,
  );

  await expect(associatedClienteDialog.getByText(encargoName).first())
    .toBeVisible();
  await expect(
    associatedClienteDialog.getByRole("link", { name: /ver cliente/i }),
  ).toBeVisible();
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

  const commentsDialog = await openSolicitudPanel(
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
    await expect(
      commentsDialog.getByText(/comentario agregado correctamente/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(commentsDialog).toBeVisible();
    await expect(commentsDialog.getByText(content)).toBeVisible({
      timeout: 15_000,
    });
    await expect(textarea).toHaveValue("");
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

  const conversionDialog = await openSolicitudPanel(
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
  await expect(
    conversionDialog.getByText(/pedido creado correctamente/i),
  ).toBeVisible({ timeout: 20_000 });
  await expect(conversionDialog.getByText(/^pedido creado$/i)).toBeVisible();
  await expect(
    conversionDialog.getByText(/solicitud convertida/i),
  ).toHaveCount(0);
  await expect(
    conversionDialog.getByText(/la solicitud debe estar aprobada/i),
  ).toHaveCount(0);
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
  await expect(
    infoDialog.getByRole("link", { name: /ver pedido generado/i }),
  ).toBeVisible();
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
    "/dashboard/solicitudes?workflow_type=encargo&status=convertida&page=999999",
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
      workflowType: url.searchParams.get("workflow_type"),
    };
  }).toEqual({
    page:
      validFilterPageInfo.totalPages > 1
        ? String(validFilterPageInfo.totalPages)
        : null,
    status: "convertida",
    workflowType: "encargo",
  });
  if (validFilterPageInfo.totalPages === 1) {
    await expectSolicitudVisible(page, encargoName);
  }

  await page.goto(
    `/dashboard/solicitudes?q=${encodeURIComponent(
      encargoName,
    )}&workflow_type=encargo&status=convertida`,
  );
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);
  await expectSolicitudVisible(page, encargoName);

  await page.goto(
    "/dashboard/solicitudes?status=invalido&workflow_type=desconocido&page=abc",
  );
  await expectSolicitudesListLoaded(page);
  await expect(page.getByText(/filtro de estado no es v.lido/i)).toBeVisible();
  await expect(page.getByText(/filtro de tipo no es v.lido/i)).toBeVisible();
  await expectNoSolicitudesLoadError(page);
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      status: url.searchParams.get("status"),
      workflowType: url.searchParams.get("workflow_type"),
    };
  }).toEqual({
    page: null,
    status: "invalido",
    workflowType: "desconocido",
  });

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

  await page.goto(
    `/dashboard/solicitudes?q=${encodeURIComponent("personalización")}`,
  );
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);
  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return url.searchParams.get("q");
  }).toBe("personalización");
  await expectSolicitudVisible(page, encargoName);

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
    )}&workflow_type=encargo&status=convertida`,
  );
  await expectSolicitudesListLoaded(page);
  await expectNoSolicitudesLoadError(page);
  await expectSolicitudVisible(page, encargoName);

  await page.goto(
    `/dashboard/solicitudes?q=${encodeURIComponent(
      encargoName,
    )}&workflow_type=impresion&status=convertida`,
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
  await expect(page.getByText(/^Filtros/i)).toBeVisible();
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

  await toolbar.locator("summary").click();
  await toolbar.getByLabel(/^tipo$/i).selectOption("encargo");

  await expect.poll(async () => {
    const url = await getCurrentSolicitudesUrl(page);

    return {
      page: url.searchParams.get("page"),
      workflowType: url.searchParams.get("workflow_type"),
    };
  }).toEqual({
    page: null,
    workflowType: "encargo",
  });
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
    await openSolicitudPanel(page, /^estado$/i, /^estado/i);
    await expect(page.getByRole("dialog", { name: /^estado$/i })).toBeVisible();
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
