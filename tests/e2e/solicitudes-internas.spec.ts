import { expect, type Page, test } from "@playwright/test";

import {
  expectAccessLimitedPage,
  expectNoTechnicalLeakText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaEmail, createQaRunId } from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const futureDate = getFutureDateInputValue(30);
const clientName = `QA Cliente Solicitud ${runId}`;
const clientPhone = `555${runId.slice(-7)}`;
const clientEmail = createQaEmail("qa-solicitud", runId);
const solicitudDescription = `QA Solicitud Interna ${runId}`;
const solicitudNotes = `Solicitud interna focal creada por Playwright ${runId}`;
const pedidoTitle = `QA Pedido Desde Solicitud ${runId}`;
const pedidoDescription = `Pedido convertido desde ${solicitudDescription}`;

function sectionByHeading(page: Page, heading: RegExp) {
  return page.locator("section").filter({
    has: page.getByRole("heading", { name: heading }),
  }).first();
}

async function expectStatusMessage(page: Page, message: RegExp) {
  await expect(page.getByText(message).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function createPublicSolicitudFixture(page: Page) {
  await page.goto("/solicitud");
  await expect(
    page.getByRole("heading", { name: /qu. necesitas preparar/i }),
  ).toBeVisible();

  await page.getByRole("tab", { name: /encargo personalizado/i }).click();
  await page.getByLabel(/nombre del cliente/i).fill(clientName);
  await page.getByLabel(/tel.fono|telefono/i).fill(clientPhone);
  await page.getByLabel(/correo electr.nico|correo electronico/i).fill(clientEmail);
  await page.getByLabel(/tipo de servicio/i).selectOption("Personalizacion");
  await page.getByLabel(/fecha deseada/i).fill(futureDate);
  await page.getByLabel(/descripci.n del trabajo/i).fill(solicitudDescription);
  await page.getByLabel(/observaciones adicionales/i).fill(solicitudNotes);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(page.getByText(/hemos recibido tu solicitud/i)).toBeVisible({
    timeout: 15_000,
  });
  await expectNoTechnicalLeakText(page);

  const bodyText = await page.locator("body").innerText();
  const publicReference = bodyText.match(/GD-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];

  expect(publicReference, "public tracking reference should be visible")
    .toBeTruthy();

  return publicReference as string;
}

async function expectSolicitudesListLoaded(page: Page) {
  await expect(page).toHaveURL(/\/dashboard\/solicitudes(?:[/?#].*)?$/);
  await expect(
    page.getByRole("heading", { name: /^solicitudes$/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/buscar solicitudes/i)).toBeVisible();
  await expectNoTechnicalLeakText(page);
}

async function openSolicitudDetail(page: Page, query = clientName) {
  await page.goto(`/dashboard/solicitudes?q=${encodeURIComponent(query)}`);
  await expectSolicitudesListLoaded(page);
  const solicitudRow = page.getByRole("row").filter({ hasText: clientName })
    .first();

  await expect(solicitudRow).toBeVisible({
    timeout: 15_000,
  });
  await solicitudRow.getByRole("link", { name: /ver solicitud/i }).click();
  await expect(
    page.getByRole("heading", { name: new RegExp(`solicitud de ${clientName}`, "i") }),
  ).toBeVisible();
  await expect(page.getByText(solicitudDescription).first()).toBeVisible();
  await expect(page.getByText(clientEmail).first()).toBeVisible();
  await expectNoTechnicalLeakText(page);

  return page.url();
}

async function updateSolicitudStatus(
  page: Page,
  status: string,
  visibleLabel: RegExp,
) {
  const form = page.locator("form").filter({
    has: page.getByLabel(/siguiente estado/i),
  }).first();

  await form.getByLabel(/siguiente estado/i).selectOption(status);
  await form.getByRole("button", { name: /actualizar estado/i }).click();
  await expectStatusMessage(page, /estado actualizado correctamente/i);
  await page.reload();
  await expect(page.getByText(visibleLabel).first()).toBeVisible();
  await expectNoTechnicalLeakText(page);
}

async function createClienteFromSolicitud(page: Page) {
  const section = sectionByHeading(page, /cliente asociado/i);

  await section
    .getByRole("button", { name: /crear cliente desde esta solicitud/i })
    .click();
  await expectStatusMessage(page, /cliente creado y asociado correctamente/i);
  await page.reload();

  const refreshedSection = sectionByHeading(page, /cliente asociado/i);
  await expect(refreshedSection.getByText(clientName).first()).toBeVisible();
  await expect(refreshedSection.getByRole("link", { name: /ver cliente/i }))
    .toBeVisible();
  await expectNoTechnicalLeakText(page);
}

async function convertSolicitudToPedido(page: Page) {
  const section = sectionByHeading(page, /conversi.n a pedido/i);

  await section.getByLabel(/t.tulo del pedido/i).fill(pedidoTitle);
  await section.getByLabel(/prioridad/i).selectOption("normal");
  await section.getByLabel(/monto total a pagar/i).fill("900");
  await section.getByLabel(/fecha estimada de entrega/i).fill(futureDate);
  await section.getByLabel(/descripci.n del pedido/i).fill(pedidoDescription);
  await section.getByRole("button", { name: /convertir en pedido/i }).click();
  await expectStatusMessage(page, /pedido creado correctamente/i);

  await section.getByRole("link", { name: /^ver pedido$/i }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: pedidoTitle,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(pedidoDescription).first()).toBeVisible();
  await expectNoTechnicalLeakText(page);

  return page.url();
}

let publicReference = "";
let solicitudDetailUrl = "";
let convertedPedidoUrl = "";

test("admin can review and convert a public solicitud fixture", async ({
  page,
}) => {
  test.setTimeout(180_000);

  publicReference = await createPublicSolicitudFixture(page);

  await loginAs(page, "admin");
  await page.goto("/dashboard/solicitudes");
  await expectSolicitudesListLoaded(page);

  solicitudDetailUrl = await openSolicitudDetail(page);
  await expect(page.getByText(publicReference).first()).toBeVisible();

  await updateSolicitudStatus(page, "en_revision", /en revisi.n/i);
  await updateSolicitudStatus(page, "contactada", /contactada/i);
  await updateSolicitudStatus(page, "aprobada", /aprobada/i);
  await expect(
    page.getByText(/puede convertirse en pedido/i).first(),
  ).toBeVisible();

  await createClienteFromSolicitud(page);
  convertedPedidoUrl = await convertSolicitudToPedido(page);
});

test("solicitudes access follows current role boundaries", async ({ page }) => {
  test.setTimeout(120_000);

  await loginAs(page, "supervisor");
  await page.goto("/dashboard/solicitudes");
  await expectSolicitudesListLoaded(page);

  if (solicitudDetailUrl) {
    await page.goto(solicitudDetailUrl);
    await expect(
      page.getByRole("heading", { name: new RegExp(`solicitud de ${clientName}`, "i") }),
    ).toBeVisible();
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

  if (solicitudDetailUrl) {
    await page.goto(solicitudDetailUrl);
    await expectAccessLimitedPage(page);
  }
});
