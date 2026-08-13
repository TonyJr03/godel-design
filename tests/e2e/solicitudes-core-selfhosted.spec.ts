import { expect, type Page, test } from "@playwright/test";

import {
  expectNoPublicSensitiveText,
  expectNoVisibleSensitiveText,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const futureDate = getFutureDateInputValue(30);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function createPublicEncargo(page: Page, label: string) {
  const clientName = `QA Solicitud ${label} ${runLabel}`;

  await page.goto("/solicitud");
  await page.getByRole("tab", { name: /encargo/i }).click();
  await page.getByLabel(/nombre del cliente/i).fill(clientName);
  await page.getByLabel(/tel.fono/i).fill(`558${runId.slice(-7)}`);
  await page
    .getByLabel(/correo electr.nico/i)
    .fill(`qa-solicitud-${label}-${runId}@example.com`);
  await page.getByLabel(/fecha deseada/i).fill(futureDate);
  await page
    .getByLabel(/descripci.n del trabajo/i)
    .fill(`Solicitud QA ${label} ${runId}`);
  await page.getByLabel(/observaciones adicionales/i).fill(`Notas QA ${label}.`);
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(page.getByText(/solicitud enviada correctamente|hemos recibido tu solicitud/i)).toBeVisible({
    timeout: 15_000,
  });
  await expectNoPublicSensitiveText(page);

  const reference = (await page.locator("body").innerText()).match(
    /GD-[A-Z0-9]{4}-[A-Z0-9]{4}/,
  )?.[0];

  expect(reference).toBeTruthy();

  return { clientName, reference: reference as string };
}

async function openSolicitudDetail(page: Page, clientName: string) {
  await page.goto(`/dashboard/solicitudes?q=${encodeURIComponent(clientName)}`);
  const link = page.getByRole("link", {
    name: new RegExp(`abrir solicitud de ${escapeRegExp(clientName)}`, "i"),
  });

  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(
    page.getByRole("heading", {
      name: new RegExp(`solicitud de ${escapeRegExp(clientName)}`, "i"),
    }),
  ).toBeVisible();
}

async function openSolicitudPanel(page: Page, name: RegExp) {
  const openDialog = page.getByRole("dialog");

  if (await openDialog.isVisible().catch(() => false)) {
    await openDialog.getByRole("button", { name: /cerrar/i }).click();
  }

  await page.getByRole("button", { name }).first().click();
  const dialog = page.getByRole("dialog", { name });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function createInternalCliente(page: Page, label: string) {
  const name = `QA Cliente Solicitud ${label} ${runLabel}`;

  await page.goto("/dashboard/clientes");
  await page.getByRole("button", { name: /nuevo cliente/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo cliente/i });
  await dialog.getByLabel(/^nombre/i).fill(name);
  await dialog.getByLabel(/tel.fono/i).fill(`559${runId.slice(-7)}`);
  await dialog
    .getByLabel(/correo electr.nico/i)
    .fill(`qa-cliente-solicitud-${label}-${runId}@example.com`);
  await dialog.getByLabel(/notas/i).fill(`Cliente QA ${label}.`);
  await dialog.getByRole("button", { name: /crear cliente/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  return name;
}

async function selectCliente(panel: ReturnType<Page["getByRole"]>, name: string) {
  const combobox = panel.getByRole("combobox", { name: /cliente existente/i });
  await combobox.fill(name);
  await expect(panel.getByRole("option", { name: new RegExp(escapeRegExp(name), "i") })).toBeVisible({
    timeout: 15_000,
  });
  await combobox.press("Enter");
  await expect(panel.locator('input[name="cliente_id"]')).not.toHaveValue("");
}

async function expectPublicTrackingState(
  page: Page,
  reference: string,
  statusLabel: string,
  kind: "Solicitud" | "Pedido",
) {
  await page.goto(`/estado?ref=${encodeURIComponent(reference)}`);
  await expect(page.getByText(reference, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: statusLabel, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").getByText(kind, { exact: true }).first(),
  ).toBeVisible();
  await expectNoPublicSensitiveText(page);
}

test("self-hosted baseline: public solicitud and auto-review complete", async ({
  page,
}) => {
  test.setTimeout(90_000);

  for (let iteration = 1; iteration <= 3; iteration += 1) {
    await page.context().clearCookies();
    const solicitud = await createPublicEncargo(page, `auto-review-${iteration}`);

    await page.goto(`/estado?ref=${encodeURIComponent(solicitud.reference)}`);
    await expect(page.getByText(solicitud.reference)).toBeVisible();
    await expectNoPublicSensitiveText(page);

    await loginAs(page, "admin");
    await openSolicitudDetail(page, solicitud.clientName);
    await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/iniciando revisi.n/i)).toHaveCount(0);
    await expectNoVisibleSensitiveText(page);
  }
});

test("self-hosted baseline: associate existing cliente completes", async ({
  page,
}) => {
  test.setTimeout(90_000);

  for (let iteration = 1; iteration <= 3; iteration += 1) {
    await page.context().clearCookies();
    const solicitud = await createPublicEncargo(page, `associate-${iteration}`);
    await loginAs(page, "admin");
    const clienteName = await createInternalCliente(page, `associate-${iteration}`);
    await openSolicitudDetail(page, solicitud.clientName);
    await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const panel = await openSolicitudPanel(page, /^cliente$/i);
    await selectCliente(panel, clienteName);
    await panel.getByRole("button", { name: /^asociar cliente$/i }).click();
    await expect(panel).toBeHidden({ timeout: 15_000 });
    const refreshedPanel = await openSolicitudPanel(page, /^cliente(?:\s|$)/i);
    await expect(refreshedPanel.getByText(clienteName, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      refreshedPanel.getByRole("link", { name: /ver cliente/i }),
    ).toBeVisible();
  }
});

test("self-hosted baseline: create cliente from solicitud completes", async ({
  page,
}) => {
  test.setTimeout(90_000);

  for (let iteration = 1; iteration <= 3; iteration += 1) {
    await page.context().clearCookies();
    const solicitud = await createPublicEncargo(page, `create-client-${iteration}`);
    await loginAs(page, "admin");
    await openSolicitudDetail(page, solicitud.clientName);
    await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
      timeout: 15_000,
    });

    const panel = await openSolicitudPanel(page, /^cliente$/i);
    await panel
      .getByRole("button", { name: /crear cliente desde esta solicitud/i })
      .click();
    await expect(panel).toBeHidden({ timeout: 15_000 });
    const refreshedPanel = await openSolicitudPanel(page, /^cliente(?:\s|$)/i);
    await expect(refreshedPanel.getByText(solicitud.clientName, { exact: true })).toBeVisible();
    await expect(refreshedPanel.getByRole("link", { name: /ver cliente/i })).toBeVisible();
    await refreshedPanel.getByRole("link", { name: /ver cliente/i }).click();
    await expect(
      page.getByRole("heading", { name: solicitud.clientName, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(solicitud.clientName, { exact: true })).toBeVisible();
    await page.goto(`/dashboard/clientes?q=${encodeURIComponent(solicitud.clientName)}`);
    await expect(page.locator("tbody").getByText(solicitud.clientName, { exact: true })).toBeVisible();
  }
});

test("self-hosted baseline: solicitud comments keep inline errors and fresh history", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.context().clearCookies();
  const solicitud = await createPublicEncargo(page, "comments");
  await loginAs(page, "admin");
  await openSolicitudDetail(page, solicitud.clientName);
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({ timeout: 15_000 });

  const commentsPanel = await openSolicitudPanel(page, /^comentarios(?:\s|$)/i);
  const composer = commentsPanel.getByRole("textbox", { name: /comentario/i });
  await composer.fill("   ");
  await commentsPanel.getByRole("button", { name: /agregar comentario/i }).click();
  await expect(commentsPanel.getByText(/escribe un comentario antes de enviar/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(commentsPanel).toBeVisible();

  for (let iteration = 1; iteration <= 3; iteration += 1) {
    const comment = `Comentario QA ${iteration} ${runLabel}`;
    await composer.fill(comment);
    await commentsPanel.getByRole("button", { name: /agregar comentario/i }).click();
    await expect(commentsPanel).toBeHidden({ timeout: 15_000 });
    const refreshedPanel = await openSolicitudPanel(page, /^comentarios(?:\s|$)/i);
    await expect(refreshedPanel.getByText(comment, { exact: true })).toBeVisible();
  }
  await expectNoVisibleSensitiveText(page);
});

test("self-hosted baseline: solicitud status advances and approval stay fresh", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.context().clearCookies();
  const solicitud = await createPublicEncargo(page, "status-approval");
  await loginAs(page, "admin");
  await openSolicitudDetail(page, solicitud.clientName);
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({ timeout: 15_000 });

  const reviewPanel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await reviewPanel.getByRole("button", { name: /avanzar a contactada/i }).click();
  await expect(reviewPanel).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/contactada/i).first()).toBeVisible();

  const contactPanel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await contactPanel.getByRole("button", { name: /avanzar a aprobada/i }).click();
  await expect(contactPanel).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/aprobada/i).first()).toBeVisible();
});

test("self-hosted baseline: solicitud rejection confirmation closes the flow", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.context().clearCookies();
  const solicitud = await createPublicEncargo(page, "status-rejection");
  await loginAs(page, "admin");
  await openSolicitudDetail(page, solicitud.clientName);
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({ timeout: 15_000 });

  const panel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await panel.getByRole("button", { name: /rechazar solicitud/i }).click();
  await expect(panel.getByText(/rechazar esta solicitud/i)).toBeVisible();
  await panel.getByRole("button", { name: /^cancelar$/i }).press("Escape");
  await expect(panel.getByRole("button", { name: /rechazar solicitud/i })).toBeFocused();
  await panel.getByRole("button", { name: /rechazar solicitud/i }).click();
  await panel.getByRole("button", { name: /s., rechazar solicitud/i }).click();
  await expect(panel).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(/rechazada/i).first()).toBeVisible();
  const closedPanel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await expect(closedPanel.getByText(/no admite m.s cambios/i)).toBeVisible();
});

test("self-hosted baseline: solicitud conversion validates and completes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.context().clearCookies();
  const solicitud = await createPublicEncargo(page, "conversion");
  const title = `Pedido QA conversion ${runLabel}`;
  await loginAs(page, "admin");
  await openSolicitudDetail(page, solicitud.clientName);
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({ timeout: 15_000 });

  let panel = await openSolicitudPanel(page, /^cliente$/i);
  await panel.getByRole("button", { name: /crear cliente desde esta solicitud/i }).click();
  await expect(panel).toBeHidden({ timeout: 15_000 });

  panel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await panel.getByRole("button", { name: /avanzar a contactada/i }).click();
  await expect(panel).toBeHidden({ timeout: 15_000 });
  panel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await panel.getByRole("button", { name: /avanzar a aprobada/i }).click();
  await expect(panel).toBeHidden({ timeout: 15_000 });

  const conversion = await openSolicitudPanel(page, /^conversi.n(?:\s|$)/i);
  await conversion.getByLabel(/t.tulo del pedido/i).fill("");
  await conversion.getByRole("button", { name: /convertir en pedido/i }).click();
  await expect(conversion.getByLabel(/t.tulo del pedido/i)).not.toHaveJSProperty("validationMessage", "");
  await expect(conversion).toBeVisible();

  await conversion.getByLabel(/t.tulo del pedido/i).fill(title);
  await conversion.getByLabel(/descripci.n del pedido/i).fill(`Descripción ${title}`);
  await conversion.getByLabel(/precio del pedido/i).fill("100");
  await conversion.getByRole("button", { name: /convertir en pedido/i }).click();
  await expect(conversion).toBeHidden({ timeout: 15_000 });
  const convertedPanel = await openSolicitudPanel(page, /^conversi.n(?:\s|$)/i);
  await expect(convertedPanel.getByText(/solicitud ya fue convertida/i)).toBeVisible();
  await expect(convertedPanel.getByRole("link", { name: /ver pedido/i })).toBeVisible();
  await expect(convertedPanel.getByRole("button", { name: /convertir en pedido/i })).toHaveCount(0);
});

test("self-hosted baseline: solicitud conversion completes three public flows", async ({
  page,
}) => {
  test.setTimeout(240_000);

  for (let iteration = 1; iteration <= 3; iteration += 1) {
    await page.context().clearCookies();
    const solicitud = await createPublicEncargo(page, `conversion-${iteration}`);
    const title = `Pedido QA conversion ${iteration} ${runLabel}`;

    await loginAs(page, "admin");
    await openSolicitudDetail(page, solicitud.clientName);
    const solicitudPathname = new URL(page.url()).pathname;
    await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
      timeout: 15_000,
    });

    let panel = await openSolicitudPanel(page, /^cliente$/i);
    await panel
      .getByRole("button", { name: /crear cliente desde esta solicitud/i })
      .click();
    await expect(panel).toBeHidden({ timeout: 15_000 });

    panel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
    await panel.getByRole("button", { name: /avanzar a contactada/i }).click();
    await expect(panel).toBeHidden({ timeout: 15_000 });
    panel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
    await panel.getByRole("button", { name: /avanzar a aprobada/i }).click();
    await expect(panel).toBeHidden({ timeout: 15_000 });

    const conversion = await openSolicitudPanel(page, /^conversi.n(?:\s|$)/i);
    await conversion.getByLabel(/t.tulo del pedido/i).fill(title);
    await conversion
      .getByLabel(/descripci.n del pedido/i)
      .fill(`Descripcion ${title}`);
    await conversion.getByLabel(/precio del pedido/i).fill("100");
    await conversion
      .getByRole("button", { name: /convertir en pedido/i })
      .click();
    await expect(conversion).toBeHidden({ timeout: 15_000 });
    await expect(page).toHaveURL(
      new RegExp(`${escapeRegExp(solicitudPathname)}$`),
    );
    await expect(page.getByText(/convertida/i).first()).toBeVisible();

    const convertedPanel = await openSolicitudPanel(
      page,
      /^conversi.n(?:\s|$)/i,
    );
    await expect(
      convertedPanel.getByText(/solicitud ya fue convertida/i),
    ).toBeVisible();
    await expect(
      convertedPanel.getByRole("button", { name: /convertir en pedido/i }),
    ).toHaveCount(0);
    const pedidoLink = convertedPanel.getByRole("link", { name: /ver pedido/i });

    await expect(pedidoLink).toBeVisible();
    await pedidoLink.click();
    await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/);
    await expect(
      page.getByRole("heading", { level: 1, name: title, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/error de aplicaci.n/i)).toHaveCount(0);
    await expectNoVisibleSensitiveText(page);
  }
});

test("self-hosted baseline: public tracking covers the solicitud lifecycle", async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.context().clearCookies();
  const initial = await createPublicEncargo(page, "tracking-initial");
  await expectPublicTrackingState(
    page,
    initial.reference,
    "Solicitud recibida",
    "Solicitud",
  );

  await page.context().clearCookies();
  const review = await createPublicEncargo(page, "tracking-review");
  await loginAs(page, "admin");
  await openSolicitudDetail(page, review.clientName);
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
    timeout: 15_000,
  });
  await expectPublicTrackingState(page, review.reference, "En revisión", "Solicitud");

  await page.context().clearCookies();
  const approved = await createPublicEncargo(page, "tracking-approved");
  await loginAs(page, "admin");
  await openSolicitudDetail(page, approved.clientName);
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
    timeout: 15_000,
  });
  let statusPanel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await statusPanel
    .getByRole("button", { name: /avanzar a contactada/i })
    .click();
  await expect(statusPanel).toBeHidden({ timeout: 15_000 });
  statusPanel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await statusPanel
    .getByRole("button", { name: /avanzar a aprobada/i })
    .click();
  await expect(statusPanel).toBeHidden({ timeout: 15_000 });
  await expectPublicTrackingState(page, approved.reference, "Aprobada", "Solicitud");

  await page.context().clearCookies();
  const converted = await createPublicEncargo(page, "tracking-converted");
  await loginAs(page, "admin");
  await openSolicitudDetail(page, converted.clientName);
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
    timeout: 15_000,
  });
  const clientePanel = await openSolicitudPanel(page, /^cliente$/i);
  await clientePanel
    .getByRole("button", { name: /crear cliente desde esta solicitud/i })
    .click();
  await expect(clientePanel).toBeHidden({ timeout: 15_000 });
  statusPanel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await statusPanel
    .getByRole("button", { name: /avanzar a contactada/i })
    .click();
  await expect(statusPanel).toBeHidden({ timeout: 15_000 });
  statusPanel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await statusPanel
    .getByRole("button", { name: /avanzar a aprobada/i })
    .click();
  await expect(statusPanel).toBeHidden({ timeout: 15_000 });
  const conversionPanel = await openSolicitudPanel(
    page,
    /^conversi.n(?:\s|$)/i,
  );
  const convertedTitle = `Pedido QA tracking ${runLabel}`;

  await conversionPanel.getByLabel(/t.tulo del pedido/i).fill(convertedTitle);
  await conversionPanel
    .getByLabel(/descripci.n del pedido/i)
    .fill(`Descripcion ${convertedTitle}`);
  await conversionPanel.getByLabel(/precio del pedido/i).fill("100");
  await conversionPanel
    .getByRole("button", { name: /convertir en pedido/i })
    .click();
  await expect(conversionPanel).toBeHidden({ timeout: 15_000 });
  await expectPublicTrackingState(
    page,
    converted.reference,
    "Solicitud recibida",
    "Pedido",
  );

  await page.context().clearCookies();
  const rejected = await createPublicEncargo(page, "tracking-rejected");
  await loginAs(page, "admin");
  await openSolicitudDetail(page, rejected.clientName);
  await expect(page.getByText(/en revisi.n/i).first()).toBeVisible({
    timeout: 15_000,
  });
  statusPanel = await openSolicitudPanel(page, /^estado(?:\s|$)/i);
  await statusPanel.getByRole("button", { name: /rechazar solicitud/i }).click();
  await statusPanel
    .getByRole("button", { name: /s., rechazar solicitud/i })
    .click();
  await expect(statusPanel).toBeHidden({ timeout: 15_000 });
  await expectPublicTrackingState(page, rejected.reference, "No aprobada", "Solicitud");
});
