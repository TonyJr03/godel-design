import { resolve } from "node:path";

import { expect, type Locator, type Page, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaEmail, createQaRunId } from "./helpers/qa-data";

type QaState = {
  encargoReference?: string;
  impresionReference?: string;
  convertedPedidoReference?: string;
  manualEncargoReference?: string;
  manualImpresionReference?: string;
  manualEncargoUrl?: string;
  manualImpresionUrl?: string;
  assignedPedidoUrl?: string;
  unassignedPedidoUrl?: string;
  screenshots: string[];
  notes: string[];
};

const qaState: QaState = {
  screenshots: [],
  notes: [],
};

const runId = createQaRunId();
const futureDate = getFutureDateInputValue(30);
const sensitivePatterns = [
  /\border_number\b/i,
  /\bfile_path\b/i,
  /\bpedido_pagos\b/i,
  /\bstorage\.objects\b/i,
  /\bservice_role\b/i,
  /\bSUPABASE_SERVICE_ROLE_KEY\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
];

test.describe.configure({ mode: "serial" });

async function logout(page: Page) {
  const button = page.getByRole("button", { name: /cerrar sesi.n/i });

  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await expect(page).toHaveURL(/\/login/);
    return;
  }

  await page.context().clearCookies();
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

    throw new Error("No visible element found for locator.");
  }).toPass({ timeout: 10_000 });
}

async function expectBefore(first: Locator, second: Locator) {
  const secondHandle = await second.elementHandle();

  if (!secondHandle) {
    throw new Error(
      "Expected second locator to resolve before comparing DOM order.",
    );
  }

  const isBefore = await first.evaluate((firstElement, secondElement) => {
    return Boolean(
      firstElement.compareDocumentPosition(secondElement as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }, secondHandle);

  await secondHandle.dispose();
  expect(isBefore).toBe(true);
}

async function openPedidoPanel(
  page: Page,
  name: RegExp,
  triggerName = name,
): Promise<Locator> {
  const openDialog = page.getByRole("dialog");

  if ((await openDialog.count()) > 0) {
    const closeButton = openDialog.getByRole("button", { name: /cerrar/i });

    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await expect(openDialog).toBeHidden();
    }
  }

  await clickFirstVisible(page.getByRole("button", { name: triggerName }));

  const dialog = page.getByRole("dialog", { name });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

async function openSolicitudPanel(
  page: Page,
  name: RegExp,
  triggerName = name,
): Promise<Locator> {
  const openDialog = page.getByRole("dialog");

  if ((await openDialog.count()) > 0) {
    const closeButton = openDialog.getByRole("button", { name: /cerrar/i });

    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await expect(openDialog).toBeHidden();
    }
  }

  await expect(async () => {
    const triggers = page.getByRole("button", { name: triggerName });
    const triggerCount = await triggers.count();

    for (let index = 0; index < triggerCount; index += 1) {
      const trigger = triggers.nth(index);

      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        return;
      }
    }

    const moreTriggers = page.getByRole("button", { name: /m.s acciones/i });
    const moreTriggerCount = await moreTriggers.count();

    for (let index = 0; index < moreTriggerCount; index += 1) {
      const moreTrigger = moreTriggers.nth(index);

      if (await moreTrigger.isVisible().catch(() => false)) {
        await moreTrigger.focus();
        await page.keyboard.press("Enter");

        const moreDialog = page.getByRole("dialog", {
          name: /^m.s acciones$/i,
        });

        await expect(moreDialog).toBeVisible();
        await clickFirstVisible(
          moreDialog.getByRole("button", { name: triggerName }),
        );
        return;
      }
    }

    throw new Error("No visible solicitud workspace trigger found.");
  }).toPass({ timeout: 15_000 });

  const dialog = page.getByRole("dialog", { name });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

async function expectStatusMessage(page: Page, message: RegExp) {
  await expect(page.getByText(message).first()).toBeVisible({
    timeout: 15_000,
  });
}

const SOLICITUD_STATUS_BUTTONS: Record<string, RegExp> = {
  contactada: /avanzar a contactada/i,
  aprobada: /avanzar a aprobada/i,
};

const SOLICITUD_STATUS_LABELS: Record<string, RegExp> = {
  en_revision: /^En revisi.n$/i,
  contactada: /^Contactada$/i,
  aprobada: /^Aprobada$/i,
};

const PEDIDO_STATUS_LABELS: Record<string, RegExp> = {
  en_revision: /^En revisi.n$/i,
  en_produccion: /^En producci.n$/i,
  listo_entrega: /^Listo para entrega$/i,
  entregado: /^Entregado$/i,
  cancelado: /^Cancelado$/i,
};

const PEDIDO_STATUS_BUTTONS: Record<string, RegExp> = {
  en_produccion: /pasar a producci.n/i,
  listo_entrega: /marcar como listo para entrega/i,
  entregado: /marcar como entregado/i,
};

function getPedidoHeader(page: Page) {
  return page.locator("article header").first();
}

async function expectCompactPedidoHeader(page: Page, title: string) {
  const header = getPedidoHeader(page);
  const backLink = header.getByRole("link", { name: /volver a pedidos/i });

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(backLink).toBeVisible();
  await expect(backLink).toHaveAttribute("href", "/dashboard/pedidos");
  await expect(
    header.getByRole("button", {
      name: /copiar c.digo de seguimiento/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^resumen operativo$/i }),
  ).toHaveCount(0);
}

async function fillPublicContact(
  page: Page,
  {
    name,
    phone,
    email,
  }: {
    name: string;
    phone: string;
    email: string;
  },
) {
  await page.getByLabel(/nombre del cliente/i).fill(name);
  await page.getByLabel(/tel.fono|telefono/i).fill(phone);
  await page.getByLabel(/correo electr.nico|correo electronico/i).fill(email);
}

async function extractPublicReference(page: Page) {
  const text = await page.locator("body").innerText();
  const reference = text.match(/GD-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];
  expect(reference, "Public reference should be visible").toBeTruthy();
  return reference as string;
}

async function assertNoPublicSensitiveData(page: Page) {
  const bodyText = await page.locator("body").innerText();

  for (const pattern of sensitivePatterns) {
    expect(bodyText).not.toMatch(pattern);
  }
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

async function expectNoDocumentScroll(page: Page) {
  const dimensions = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));

  expect(dimensions.scrollHeight).toBeLessThanOrEqual(
    dimensions.innerHeight + 2,
  );
}

async function openSolicitudDetail(page: Page, query: string) {
  await page.goto(`/dashboard/solicitudes?q=${encodeURIComponent(query)}`);
  await page
    .getByRole("link", {
      name: new RegExp(`abrir solicitud de ${escapeRegExp(query)}`, "i"),
    })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: /solicitud de/i })).toBeVisible();
}

async function openPedidoDetailFromSearch(
  page: Page,
  query: string,
  expectedTitle?: string,
) {
  await page.goto(`/dashboard/pedidos?q=${encodeURIComponent(query)}`);
  await page.getByRole("link", { name: /abrir pedido/i }).first().click();
  const heading = expectedTitle
    ? page.getByRole("heading", {
        level: 1,
        name: expectedTitle,
        exact: true,
      })
    : page.locator("h1");

  await expect(heading).toBeVisible();
}

async function updateSolicitudStatus(page: Page, status: string) {
  const section = await openSolicitudPanel(page, /^estado$/i, /^estado/i);

  await expect(section.locator('select[name="status"]')).toHaveCount(0);

  if (status === "en_revision") {
    await expect(
      section.getByText(SOLICITUD_STATUS_LABELS.en_revision).first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.reload();
    return;
  }

  const buttonName = SOLICITUD_STATUS_BUTTONS[status];

  if (!buttonName) {
    throw new Error(`Unsupported solicitud status transition: ${status}`);
  }

  await section.getByRole("button", { name: buttonName }).click();
  await expect(section.getByText(SOLICITUD_STATUS_LABELS[status]).first())
    .toBeVisible({ timeout: 15_000 });
}

async function updatePedidoStatus(page: Page, status: string) {
  const section = await openPedidoPanel(page, /^estado$/i, /^estado/i);

  await expect(section.locator('select[name="status"]')).toHaveCount(0);

  if (status === "en_revision") {
    await expect(
      section.getByText(PEDIDO_STATUS_LABELS.en_revision).first(),
    ).toBeVisible({ timeout: 15_000 });
    await page.reload();
    return;
  }

  const buttonName = PEDIDO_STATUS_BUTTONS[status];

  if (!buttonName) {
    throw new Error(`Unsupported pedido status transition: ${status}`);
  }

  await section.getByRole("button", { name: buttonName }).click();
  await expect(section.getByText(PEDIDO_STATUS_LABELS[status]).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function updatePayment(page: Page, cash: string, transfer = "0") {
  const section = await openPedidoPanel(page, /^pagos$/i, /pagos/i);

  await section.getByLabel(/pagado en efectivo/i).fill(cash);
  await section.getByLabel(/pagado por transferencia/i).fill(transfer);
  await section.getByRole("button", { name: /actualizar pago/i }).click();
  await expectStatusMessage(page, /pago actualizado correctamente/i);
  await page.reload();
}

async function createManualPedido(
  page: Page,
  workflow: "encargo" | "impresion",
  title: string,
  total: string,
) {
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

  await expect(dialog).toBeVisible();

  if (workflow === "impresion") {
    await dialog.getByRole("tab", { name: /impresi.n/i }).click();
    await dialog.getByLabel(/cantidad de copias/i).fill("8");
    await dialog.getByLabel(/modo de color/i).selectOption("color");
    await dialog.getByLabel(/tama.o de papel/i).selectOption("carta");
    await dialog.getByLabel(/caras/i).selectOption("una_cara");
    await dialog.getByLabel(/observaciones/i).fill(`QA impresion ${runId}`);
  } else {
    await dialog.getByRole("tab", { name: /encargo/i }).click();
    await dialog
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Descripcion QA ${runId}`);
  }

  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill(total);
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard\/pedidos(?:[/?#].*)?$/);

  const createdPedidoLink = page
    .getByRole("link")
    .filter({ hasText: title })
    .first();

  await expect(createdPedidoLink).toBeVisible();
  await createdPedidoLink.click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/, {
    timeout: 15_000,
  });

  const reference = await extractPublicReference(page);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: title,
      exact: true,
    }),
  ).toBeVisible();
  await updatePedidoStatus(page, "en_revision");

  return {
    reference,
    url: page.url(),
  };
}

async function captureViewport(page: Page, name: string, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.screenshot({ path: `test-results/beta-1-8-3-${name}.png`, fullPage: true });
  qaState.screenshots.push(`test-results/beta-1-8-3-${name}.png`);
}

async function captureNamedScreenshot(
  page: Page,
  path: string,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.screenshot({ path, fullPage: true });
  qaState.screenshots.push(path);
}

async function getRequiredBox(locator: Locator) {
  const box = await locator.boundingBox();

  expect(box).not.toBeNull();

  return box as NonNullable<typeof box>;
}

async function expectBadgeInTopRight(button: Locator) {
  const badge = button.locator("[data-workspace-action-badge]");

  await expect(badge).toBeVisible();

  const buttonBox = await getRequiredBox(button);
  const badgeBox = await getRequiredBox(badge);
  const badgeCenterX = badgeBox.x + badgeBox.width / 2;
  const badgeCenterY = badgeBox.y + badgeBox.height / 2;

  expect(badgeCenterX).toBeGreaterThan(buttonBox.x + buttonBox.width * 0.6);
  expect(badgeCenterY).toBeLessThan(buttonBox.y + buttonBox.height * 0.4);
}

async function expectSingleRow(locator: Locator) {
  const rows = await locator.evaluate((element) => {
    const buttons = Array.from(element.querySelectorAll<HTMLElement>("button"))
      .filter((button) => button.offsetParent !== null);

    return Array.from(
      new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top))),
    ).length;
  });

  expect(rows).toBe(1);
}

async function expectBackLinkVariant(
  page: Page,
  variant: "text" | "button",
) {
  const header = getPedidoHeader(page);
  const backLink = header.getByRole("link", { name: /volver a pedidos/i });

  await expect(backLink).toBeVisible();
  await expect(backLink).toHaveAttribute("href", "/dashboard/pedidos");

  const metrics = await backLink.evaluate((element) => {
    const link = element as HTMLElement;
    const style = getComputedStyle(link);
    const box = link.getBoundingClientRect();
    const orderNumber =
      link.parentElement?.querySelector("p")?.getBoundingClientRect() ?? null;

    return {
      borderTopWidth: style.borderTopWidth,
      width: box.width,
      orderNumberY: orderNumber?.y ?? null,
      linkY: box.y,
    };
  });

  if (variant === "text") {
    expect(metrics.borderTopWidth).toBe("0px");
    expect(metrics.width).toBeLessThan(page.viewportSize()!.width * 0.75);
    expect(metrics.orderNumberY).not.toBeNull();
    expect(metrics.linkY).toBeLessThan(metrics.orderNumberY as number);
    return;
  }

  expect(metrics.borderTopWidth).not.toBe("0px");
}

async function getVisibleToolbarButtonLabels(toolbar: Locator) {
  return toolbar
    .getByRole("button")
    .evaluateAll((buttons) =>
      buttons
        .filter((button) => (button as HTMLElement).offsetParent !== null)
        .map((button) => button.getAttribute("aria-label") ?? button.textContent ?? ""),
    );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectPedidoStatusBlocked(page: Page, status: string) {
  const section = await openPedidoPanel(page, /^estado$/i, /^estado/i);
  const buttonName = PEDIDO_STATUS_BUTTONS[status];

  if (!buttonName) {
    throw new Error(`Unsupported blocked pedido status: ${status}`);
  }

  await expect(section.locator('select[name="status"]')).toHaveCount(0);
  await expect(section.getByRole("button", { name: buttonName }))
    .toBeDisabled();
}

async function selectFirstAssignableWorker(page: Page) {
  const section = await openPedidoPanel(page, /^personal$/i, /personal/i);
  const select = section.getByLabel(/asignar personal/i);
  const value = await select.evaluate((element) => {
    const htmlSelect = element as HTMLSelectElement;
    const options = Array.from(htmlSelect.options).filter(
      (option) => !option.disabled && option.value,
    );

    return (
      options.find((option) => /trabajador/i.test(option.textContent ?? ""))
        ?.value ??
      options[0]?.value ??
      ""
    );
  });

  if (!value) {
    qaState.notes.push("No habia trabajador disponible para asignar desde UI.");
    return false;
  }

  await select.selectOption(value);
  await section.getByRole("button", { name: /asignar personal/i }).click();
  await expectStatusMessage(page, /personal asignado correctamente|usuario ya estaba asignado/i);
  await page.reload();
  return true;
}

test("Beta 1.8.3 visual QA end-to-end", async ({ page }) => {
  test.setTimeout(420_000);

  const encargoName = `Cliente QA Encargo Playwright ${runId}`;
  const impresionName = `Cliente QA Impresion Playwright ${runId}`;
  const convertedPedidoTitle = `Pedido convertido QA ${runId}`;
  const manualEncargoTitle = `Pedido QA Encargo Playwright ${runId}`;
  const manualImpresionTitle = `Pedido QA Impresion Playwright ${runId}`;
  const visualTaskTitle = "Imprimir 10 paginas";

  await page.goto("/solicitud");
  await fillPublicContact(page, {
    name: encargoName,
    phone: "5551001",
    email: createQaEmail("qa-encargo", runId),
  });
  await page.getByLabel(/tipo de servicio/i).selectOption("Personalizacion");
  await page.getByLabel(/fecha deseada/i).fill(futureDate);
  await page.getByLabel(/descripci.n del trabajo/i).fill(
    `Agenda personalizada QA ${runId}`,
  );
  await page.getByLabel(/observaciones adicionales/i).fill(
    "Solicitud creada por Playwright.",
  );
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(page.getByText(/hemos recibido tu solicitud/i)).toBeVisible({
    timeout: 15_000,
  });
  qaState.encargoReference = await extractPublicReference(page);
  await assertNoPublicSensitiveData(page);

  await page.goto("/solicitud");
  await page.getByRole("tab", { name: /impresi.n/i }).click();
  await fillPublicContact(page, {
    name: impresionName,
    phone: "5551002",
    email: createQaEmail("qa-impresion", runId),
  });
  await page.getByLabel(/cantidad de copias/i).fill("5");
  await page.getByLabel(/modo de color/i).selectOption("color");
  await page.getByLabel(/tama.o de papel/i).selectOption("carta");
  await page.getByLabel(/caras/i).selectOption("una_cara");
  await page.getByLabel(/observaciones/i).fill(`Documento QA ${runId}`);
  await page.locator('input[name="files"]').setInputFiles(
    resolve(process.cwd(), "tests/e2e/fixtures/sample-print-request.pdf"),
  );
  await page.getByRole("button", { name: /enviar solicitud/i }).click();
  await expect(page.getByText(/hemos recibido tu solicitud/i)).toBeVisible({
    timeout: 15_000,
  });
  qaState.impresionReference = await extractPublicReference(page);
  await expect(page.getByText(/archivo/i).first()).toBeVisible();
  await assertNoPublicSensitiveData(page);

  for (const reference of [qaState.encargoReference, qaState.impresionReference]) {
    await page.goto(`/estado?ref=${reference}`);
    await expect(page.getByText(reference as string)).toBeVisible();
    await expect(page.getByText(/resultado encontrado/i)).toBeVisible();
    await assertNoPublicSensitiveData(page);
  }

  await page.goto("/estado?ref=BAD-CODE");
  await expect(page.getByText(/c.digo inv.lido/i)).toBeVisible();
  await page.goto("/estado?ref=GD-ZZZZ-ZZZZ");
  await expect(page.getByText(/c.digo no encontrado/i)).toBeVisible();

  await loginAs(page, "admin");
  await expect(page.getByRole("link", { name: /^solicitudes$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^pedidos$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /^configuraci.n$/i })).toBeVisible();
  await captureNamedScreenshot(
    page,
    "test-results/beta-2-shell-dashboard-desktop-expanded-1366.png",
    { width: 1366, height: 768 },
  );
  await page.getByRole("button", { name: /contraer barra lateral/i }).click();
  await captureNamedScreenshot(
    page,
    "test-results/beta-2-shell-dashboard-desktop-collapsed-1366.png",
    { width: 1366, height: 768 },
  );
  await page.getByRole("button", { name: /expandir barra lateral/i }).click();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/dashboard");
  await page.locator("summary").filter({ hasText: /men/i }).click();
  await captureNamedScreenshot(
    page,
    "test-results/beta-2-shell-dashboard-mobile-menu-375.png",
    { width: 375, height: 812 },
  );
  await page.goto("/dashboard");
  await captureViewport(page, "admin-dashboard-desktop", { width: 1366, height: 768 });
  await captureViewport(page, "admin-dashboard-tablet-1024", { width: 1024, height: 768 });
  await captureViewport(page, "admin-dashboard-mobile", { width: 390, height: 844 });
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSolicitudDetail(page, encargoName);
  await expectNoHorizontalOverflow(page);
  await expectNoDocumentScroll(page);
  await captureViewport(page, "solicitud-workspace-desktop-1440", {
    width: 1440,
    height: 900,
  });
  await captureViewport(page, "solicitud-workspace-desktop-1366", {
    width: 1366,
    height: 768,
  });
  await expectNoHorizontalOverflow(page);
  await expectNoDocumentScroll(page);
  await captureViewport(page, "solicitud-workspace-tablet-900", {
    width: 900,
    height: 1000,
  });
  await captureViewport(page, "solicitud-workspace-tablet-780", {
    width: 780,
    height: 1000,
  });
  await captureViewport(page, "solicitud-workspace-mobile-375", {
    width: 375,
    height: 812,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await updateSolicitudStatus(page, "en_revision");
  await updateSolicitudStatus(page, "contactada");
  await updateSolicitudStatus(page, "aprobada");
  const solicitudClientePanel = await openSolicitudPanel(
    page,
    /^cliente$/i,
    /cliente/i,
  );

  await solicitudClientePanel
    .getByRole("button", { name: /crear cliente desde esta solicitud/i })
    .click();
  await expect(
    solicitudClientePanel.getByText(/cliente creado y asociado correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: /cliente.*cliente asociado/i }).first(),
  ).toBeVisible();
  await captureViewport(page, "solicitud-cliente-success", {
    width: 1440,
    height: 900,
  });
  await page.setViewportSize({ width: 375, height: 812 });
  const solicitudCommentsPanel = await openSolicitudPanel(
    page,
    /^comentarios$/i,
    /comentarios/i,
  );

  await expect(
    solicitudCommentsPanel.getByRole("heading", { name: /^comenta$/i }),
  ).toBeVisible();
  await captureViewport(page, "solicitud-comentarios-panel-mobile", {
    width: 375,
    height: 812,
  });
  await solicitudCommentsPanel.getByRole("button", { name: /cerrar/i }).click();
  await page.setViewportSize({ width: 1366, height: 768 });
  const solicitudConversionPanel = await openSolicitudPanel(
    page,
    /^conversi.n$/i,
    /conversi.n/i,
  );

  await solicitudConversionPanel
    .getByLabel(/t.tulo del pedido/i)
    .fill(convertedPedidoTitle);
  await solicitudConversionPanel.getByLabel(/prioridad/i).selectOption("normal");
  await solicitudConversionPanel.getByLabel(/precio del pedido/i).fill("1200");
  await solicitudConversionPanel
    .locator('input[name="estimated_delivery_date"]')
    .fill(futureDate);
  await solicitudConversionPanel.getByLabel(/descripci.n del pedido/i).fill(
    `Pedido convertido desde solicitud QA ${runId}`,
  );
  await solicitudConversionPanel
    .getByRole("button", { name: /convertir en pedido/i })
    .click();
  await expect(
    solicitudConversionPanel.getByText(/pedido creado correctamente/i),
  ).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await captureViewport(page, "solicitud-convertida", {
    width: 1440,
    height: 900,
  });
  await openSolicitudPanel(page, /^conversi.n$/i, /conversi.n/i);
  await page.getByRole("link", { name: /^ver pedido$/i }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: convertedPedidoTitle,
      exact: true,
    }),
  ).toBeVisible();
  qaState.convertedPedidoReference = await extractPublicReference(page);
  expect(qaState.convertedPedidoReference).toBe(qaState.encargoReference);
  await expectCompactPedidoHeader(page, convertedPedidoTitle);
  await expect(page.getByText(/pedido convertido qa/i)).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await openSolicitudDetail(page, impresionName);
  await expect(
    page.getByRole("heading", { name: /^datos de impresi.n solicitada$/i }),
  ).toBeVisible();
  const solicitudFilesPanel = await openSolicitudPanel(
    page,
    /^archivos$/i,
    /archivos/i,
  );

  await expect(
    solicitudFilesPanel.getByRole("link", { name: /descargar/i }).first(),
  ).toBeVisible();
  await captureViewport(page, "solicitud-impresion-archivos", {
    width: 1440,
    height: 900,
  });
  await solicitudFilesPanel.getByRole("button", { name: /cerrar/i }).click();

  const manualEncargo = await createManualPedido(
    page,
    "encargo",
    manualEncargoTitle,
    "1000",
  );
  qaState.manualEncargoReference = manualEncargo.reference;
  qaState.manualEncargoUrl = manualEncargo.url;
  qaState.assignedPedidoUrl = manualEncargo.url;

  await expectCompactPedidoHeader(page, manualEncargoTitle);
  await expectBackLinkVariant(page, "button");
  await captureViewport(page, "pedido-header-volver-desktop", {
    width: 1440,
    height: 900,
  });
  await expect(
    page.getByRole("heading", { name: /^trabajo solicitado$/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^tareas del pedido$/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /^archivos asociados$/i }),
  ).toBeVisible();
  const workspaceRail = page.getByRole("complementary", {
    name: /acciones del workspace/i,
  });
  const railTasksButton = workspaceRail.getByRole("button", {
    name: /tareas.*sin tareas registradas/i,
  });
  await expect(railTasksButton).toBeVisible();
  await expect(railTasksButton.getByText(/^Tareas$/i)).toHaveCount(0);
  await expect(railTasksButton.locator("svg")).toBeVisible();
  await expect(
    workspaceRail.getByRole("button", { name: /pagos.*pago pendiente/i }),
  ).toBeVisible();
  await expectPedidoStatusBlocked(page, "en_produccion");
  await updatePedidoStatus(page, "en_revision");
  await expectPedidoStatusBlocked(page, "en_produccion");

  const taskSection = await openPedidoPanel(page, /^tareas$/i, /tareas/i);
  const taskTemplateHeading = taskSection.getByRole("heading", {
    name: /cargar tareas predeterminadas/i,
  });
  const registeredTasksHeading = taskSection.getByRole("heading", {
    name: /^tareas registradas$/i,
  });
  const newTaskHeading = taskSection.getByRole("heading", {
    name: /^nueva tarea$/i,
  });

  await expect(taskTemplateHeading).toBeVisible();
  await expect(registeredTasksHeading).toBeVisible();
  await expect(newTaskHeading).toBeVisible();
  await expect(taskSection.getByText(/escribe cada paso del trabajo/i))
    .toHaveCount(0);
  await expect(taskSection.getByText(/dise.ar el logo/i)).toHaveCount(0);
  await expect(taskSection.getByText(/imprimir 40 p.ginas/i)).toHaveCount(0);
  await expect(taskSection.getByText(/encuadernar 2 libretas/i)).toHaveCount(0);
  await expect(
    taskSection.getByText(/las tareas de la plantilla se agregar.n al final/i),
  ).toHaveCount(0);
  await expect(taskSection.getByText(/si aplicas la misma plantilla/i))
    .toHaveCount(0);
  await expectBefore(taskTemplateHeading, newTaskHeading);
  await expectBefore(newTaskHeading, registeredTasksHeading);
  await taskSection
    .getByRole("textbox", { name: /nueva tarea/i })
    .fill(visualTaskTitle);
  await taskSection.getByRole("button", { name: /crear tarea/i }).click();
  await expectStatusMessage(page, /tarea creada correctamente/i);
  await page.reload();
  await updatePedidoStatus(page, "en_produccion");
  await expectPedidoStatusBlocked(page, "listo_entrega");
  const progressPanel = await openPedidoPanel(page, /^tareas$/i, /tareas/i);
  const task = progressPanel
    .locator("li")
    .filter({ hasText: visualTaskTitle })
    .first();
  const progressButton = task.getByRole("button", {
    name: new RegExp(
      `actualizar progreso de tarea ${escapeRegExp(visualTaskTitle)}`,
      "i",
    ),
  });

  await expect(task).toBeVisible();
  await expect(
    task.getByText(/0\s+de\s+10\s+(?:\S+\s+)?Pendiente/i),
  ).toBeVisible();
  await expect(progressButton).toBeVisible();
  await progressButton.click();

  const progressInput = task.getByRole("spinbutton", {
    name: new RegExp(
      `actualizar progreso de tarea ${escapeRegExp(visualTaskTitle)}`,
      "i",
    ),
  });

  await expect(progressInput).toBeVisible();
  await expect(progressInput).toHaveValue("0");
  await expect(progressInput).toHaveAttribute("max", "10");
  await progressInput.fill("10");
  await task
    .getByRole("button", {
      name: new RegExp(
        `guardar progreso de tarea ${escapeRegExp(visualTaskTitle)}`,
        "i",
      ),
    })
    .click();
  await expectStatusMessage(page, /progreso actualizado correctamente/i);
  await expect(async () => {
    await expect(task.getByRole("spinbutton")).toHaveCount(0);
    await expect(
      task.getByText(/10\s+de\s+10\s+(?:\S+\s+)?Completada/i),
    ).toBeVisible();
    await expect(
      task.getByRole("button", {
        name: new RegExp(
          `reabrir tarea ${escapeRegExp(visualTaskTitle)}`,
          "i",
        ),
      }),
    ).toBeVisible();
  }).toPass({ timeout: 15_000 });
  await page.reload();
  await updatePedidoStatus(page, "listo_entrega");
  await expect(
    (await openPedidoPanel(page, /^pagos$/i, /pagos/i)).getByText(
      /sin pagar|pago pendiente/i,
    ),
  ).toBeVisible();
  await expectPedidoStatusBlocked(page, "entregado");
  await updatePayment(page, "500", "0");
  await expect(
    workspaceRail.getByRole("button", { name: /pagos.*pago pendiente/i }),
  ).toBeVisible();
  await expect(
    (await openPedidoPanel(page, /^pagos$/i, /pagos/i)).getByText(
      /pago parcial/i,
    ),
  ).toBeVisible();
  await updatePayment(page, "500", "500");
  await expect(
    workspaceRail.getByRole("button", { name: /pagos.*pago completado/i }),
  ).toBeVisible();
  await updatePedidoStatus(page, "entregado");
  await expect(
    (await openPedidoPanel(page, /^estado$/i, /^estado/i)).getByText(
      /este pedido fue entregado y no admite/i,
    ),
  ).toBeVisible();

  const manualImpresion = await createManualPedido(
    page,
    "impresion",
    manualImpresionTitle,
    "500",
  );
  qaState.manualImpresionReference = manualImpresion.reference;
  qaState.manualImpresionUrl = manualImpresion.url;
  qaState.unassignedPedidoUrl = manualImpresion.url;
  await expectCompactPedidoHeader(page, manualImpresionTitle);
  await expect(
    page.getByText(/flujo directo de impresi.n|este tipo de pedido no requiere tareas/i),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /descripci.n y especificaciones/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /archivos asociados/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^tareas/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^estado/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^archivos/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^pagos/i })).toBeVisible();
  await updatePedidoStatus(page, "en_revision");
  await updatePedidoStatus(page, "en_produccion");
  await updatePedidoStatus(page, "listo_entrega");

  const filesPanel = await openPedidoPanel(page, /^archivos$/i, /archivos/i);
  await expect(
    filesPanel.getByRole("heading", { name: /^subir nuevo archivo$/i }),
  ).toHaveCount(0);
  await expect(
    filesPanel.getByText(
      /agrega archivos internos, avances o entregables seg.n el estado actual/i,
    ),
  ).toHaveCount(0);
  const filesListHeading = filesPanel.getByRole("heading", {
    name: /^archivos asociados$/i,
  });
  const uploadInput = filesPanel.getByLabel(/^archivos$/i);

  await expect(filesListHeading).toBeVisible();
  await expectBefore(filesListHeading, uploadInput);
  await expect(
    filesPanel.getByText(/los archivos se guardar.n como/i),
  ).toHaveCount(0);
  await uploadInput.setInputFiles(
    resolve(process.cwd(), "tests/e2e/fixtures/sample-print-request.pdf"),
  );
  await filesPanel.getByRole("button", { name: /subir archivos/i }).click();
  await expect(filesPanel).toBeVisible();
  await expect(
    filesPanel.getByText(/completado/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    filesPanel.getByText(/sample-print-request\.pdf/i).first(),
  ).toBeVisible();
  await captureViewport(page, "pedido-archivos-panel-desktop", {
    width: 1440,
    height: 1000,
  });
  await filesPanel.getByRole("button", { name: /cerrar/i }).click();
  await expect(filesPanel).toBeHidden();

  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto(qaState.manualImpresionUrl as string);
  await expectNoHorizontalOverflow(page);
  await expectBackLinkVariant(page, "text");
  const tabletBadgeToolbar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });
  const tabletFilesButton = tabletBadgeToolbar.getByRole("button", {
    name: /archivos.*1/i,
  });

  await expect(tabletFilesButton).toBeVisible();
  await expectBadgeInTopRight(tabletFilesButton);
  await expectSingleRow(tabletBadgeToolbar);
  await captureViewport(page, "pedido-toolbar-tablet-badge-volver", {
    width: 900,
    height: 1000,
  });

  await page.setViewportSize({ width: 780, height: 1000 });
  await page.goto(qaState.manualEncargoUrl as string);
  await expectNoHorizontalOverflow(page);
  await expectBackLinkVariant(page, "text");
  const narrowTabletToolbar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });

  await expect(async () => {
    const labels = await getVisibleToolbarButtonLabels(narrowTabletToolbar);

    expect(labels.some((label) => /^estado/i.test(label))).toBe(true);
    expect(labels.some((label) => /^tareas/i.test(label))).toBe(true);
    expect(labels.some((label) => /^archivos/i.test(label))).toBe(true);
    expect(labels.some((label) => /m.s acciones/i.test(label))).toBe(true);
  }).toPass();
  await expectSingleRow(narrowTabletToolbar);
  await captureViewport(page, "pedido-toolbar-tablet-narrow", {
    width: 780,
    height: 1000,
  });

  const narrowDirectLabels = (await getVisibleToolbarButtonLabels(
    narrowTabletToolbar,
  )).filter((label) => !/m.s acciones/i.test(label));

  await narrowTabletToolbar
    .getByRole("button", { name: /m.s acciones/i })
    .click();
  const narrowMoreDialog = page.getByRole("dialog", {
    name: /^m.s acciones$/i,
  });

  await expect(narrowMoreDialog).toBeVisible();
  for (const label of narrowDirectLabels) {
    const baseLabel = label.split(" - ")[0] ?? label;

    await expect(
      narrowMoreDialog.getByRole("button", {
        name: new RegExp(`^${escapeRegExp(baseLabel)}`, "i"),
      }),
    ).toHaveCount(0);
  }
  await expect(
    narrowMoreDialog.getByRole("button", { name: /informaci.n/i }),
  ).toBeVisible();
  await captureViewport(page, "pedido-toolbar-more-remaining-tablet", {
    width: 780,
    height: 1000,
  });
  await narrowMoreDialog.getByRole("button", { name: /cerrar/i }).click();

  await page.setViewportSize({ width: 1270, height: 1000 });
  await page.goto(qaState.manualEncargoUrl as string);
  await expectNoHorizontalOverflow(page);
  const wideTabletToolbar = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });

  await expect(async () => {
    const wideLabels = await getVisibleToolbarButtonLabels(wideTabletToolbar);
    const wideDirectLabels = wideLabels.filter(
      (label) => !/m.s acciones/i.test(label),
    );

    expect(wideDirectLabels.length).toBeGreaterThan(narrowDirectLabels.length);
    expect(wideDirectLabels[0]).toMatch(/^estado/i);
    expect(wideDirectLabels[1]).toMatch(/^tareas/i);
    expect(wideDirectLabels[2]).toMatch(/^archivos/i);
  }).toPass();
  await expectSingleRow(wideTabletToolbar);
  await captureViewport(page, "pedido-toolbar-tablet-wide", {
    width: 1270,
    height: 1000,
  });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(qaState.manualImpresionUrl as string);
  await expectNoHorizontalOverflow(page);
  await expectBackLinkVariant(page, "text");
  const mobileBadgeWorkspaceNav = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });
  const mobileFilesButton = mobileBadgeWorkspaceNav.getByRole("button", {
    name: /archivos.*1/i,
  });

  await expect(mobileFilesButton).toBeVisible();
  await expectBadgeInTopRight(mobileFilesButton);
  await captureViewport(page, "pedido-toolbar-mobile-badge-volver", {
    width: 375,
    height: 812,
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(qaState.manualEncargoUrl as string);

  const commentsPanel = await openPedidoPanel(
    page,
    /^comentarios$/i,
    /comentarios/i,
  );
  await expect(
    commentsPanel.getByRole("heading", { name: /^agregar comentario$/i }),
  ).toHaveCount(0);
  await expect(
    commentsPanel.getByText(
      /registra una nota interna para el equipo que trabaja en este pedido/i,
    ),
  ).toHaveCount(0);
  const commentsListHeading = commentsPanel.getByRole("heading", {
    name: /^conversaci.n interna$/i,
  });
  const commentsComposerHeading = commentsPanel.getByRole("heading", {
    name: /^comenta$/i,
  });
  const commentsTextbox = commentsPanel.getByLabel(/^comentario$/i);

  await expect(commentsListHeading).toBeVisible();
  await expect(commentsComposerHeading).toBeVisible();
  await expectBefore(commentsListHeading, commentsComposerHeading);
  await expectBefore(commentsComposerHeading, commentsTextbox);
  const visualComment =
    `Comentario QA visual ${runId} con una linea suficientemente larga ` +
    "para revisar wrapping sin overflow en el panel contextual.";
  await commentsTextbox.fill(visualComment);
  await commentsPanel
    .getByRole("button", { name: /agregar comentario/i })
    .click();
  await expect(commentsPanel).toBeVisible();
  await expect(
    commentsPanel.getByText(/comentario agregado correctamente/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(commentsPanel.getByText(visualComment)).toBeVisible();
  await captureViewport(page, "pedido-comentarios-panel-mobile", {
    width: 375,
    height: 812,
  });
  await commentsPanel.getByRole("button", { name: /cerrar/i }).click();
  await expect(commentsPanel).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  const personalPanel = await openPedidoPanel(page, /^personal$/i, /personal/i);
  await expect(
    personalPanel.getByText(/no hay personal asignado|asignado el/i),
  ).toBeVisible();
  await captureViewport(page, "pedido-personal-panel-desktop", {
    width: 1440,
    height: 900,
  });
  await personalPanel.getByRole("button", { name: /cerrar/i }).click();

  const historyPanel = await openPedidoPanel(page, /^historial$/i, /historial/i);
  await expect(
    historyPanel.getByRole("heading", { name: /^historial$/i }),
  ).toBeVisible();
  await historyPanel.getByRole("button", { name: /cerrar/i }).click();

  await expect(
    page.getByRole("button", { name: /^informaci.n$/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /informaci.n.*sin cliente asociado/i }),
  ).toHaveCount(0);
  const informationPanel = await openPedidoPanel(
    page,
    /^informaci.n$/i,
    /informaci.n/i,
  );
  await expect(
    informationPanel.getByRole("heading", { name: /^cliente$/i }),
  ).toBeVisible();
  await expect(
    informationPanel.getByText(/este pedido no tiene cliente asociado/i),
  ).toBeVisible();
  await captureViewport(page, "pedido-informacion-no-cliente-neutral-desktop", {
    width: 1440,
    height: 900,
  });
  await informationPanel.getByRole("button", { name: /cerrar/i }).click();

  await page.setViewportSize({ width: 900, height: 1000 });
  await page.goto(qaState.manualImpresionUrl as string);
  await expectNoHorizontalOverflow(page);
  const tabletWorkspaceNav = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });
  await expect(
    tabletWorkspaceNav.getByRole("button", { name: /^estado/i }),
  ).toBeVisible();
  await expect(
    tabletWorkspaceNav.getByRole("button", { name: /archivos/i }),
  ).toBeVisible();
  await tabletWorkspaceNav.getByRole("button", { name: /m.s/i }).click();
  const tabletMoreDialog = page.getByRole("dialog", {
    name: /^m.s acciones$/i,
  });
  await expect(tabletMoreDialog).toBeVisible();
  await tabletMoreDialog.getByRole("button", { name: /cerrar/i }).click();

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(qaState.manualImpresionUrl as string);
  await expectNoHorizontalOverflow(page);
  const mobileWorkspaceNav = page.getByRole("navigation", {
    name: /acciones del workspace/i,
  });
  await expect(
    mobileWorkspaceNav.getByRole("button", { name: /^estado/i }),
  ).toBeVisible();
  const mobileMoreButton = mobileWorkspaceNav.getByRole("button", {
    name: /m.s/i,
  });

  await mobileMoreButton.focus();
  await page.keyboard.press("Enter");
  const mobileMoreDialog = page.getByRole("dialog", {
    name: /^m.s acciones$/i,
  });
  await expect(mobileMoreDialog).toBeVisible();
  await mobileMoreDialog.getByRole("button", { name: /informaci.n/i }).click();
  const mobileInfoDialog = page.getByRole("dialog", {
    name: /^informaci.n$/i,
  });
  await expect(mobileInfoDialog).toBeVisible();
  await mobileInfoDialog.getByRole("button", { name: /volver/i }).click();
  await expect(mobileMoreDialog).toBeVisible();
  await mobileMoreDialog.getByRole("button", { name: /cerrar/i }).click();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(qaState.manualImpresionUrl as string);
  await expectNoDocumentScroll(page);
  await expect(
    page.getByRole("heading", { name: /^aportes al pedido$/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /^subir archivo$/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /^agregar comentario$/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: /^resumen operativo$/i }),
  ).toHaveCount(0);
  await captureViewport(page, "pedido-main-no-aportes-tablet", {
    width: 900,
    height: 1000,
  });
  await expect(page.locator("body")).not.toContainText(/file_path/i);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(qaState.manualEncargoUrl);
  await selectFirstAssignableWorker(page);

  await logout(page);
  await loginAs(page, "supervisor");
  await expect(page.getByRole("link", { name: /^pedidos$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /usuarios/i })).toHaveCount(0);
  await page.goto("/dashboard/configuracion/usuarios");
  await expect(page.getByText(/esta secci.n no est. disponible|acceso limitado/i).first()).toBeVisible();
  await openPedidoDetailFromSearch(page, manualImpresionTitle, manualImpresionTitle);

  await logout(page);
  await loginAs(page, "worker");
  await expect(page.getByRole("link", { name: /^pedidos$/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /solicitudes/i })).toHaveCount(0);
  await page.goto("/dashboard/pedidos/nuevo");
  await expect(page.getByText(/no encontramos este recurso interno/i)).toBeVisible();
  await page.goto(qaState.assignedPedidoUrl as string);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: manualEncargoTitle,
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(qaState.unassignedPedidoUrl as string);
  await expect(page.getByText(/404|no encontramos|no tienes acceso/i)).toBeVisible();

  for (const reference of [
    qaState.convertedPedidoReference,
    qaState.manualEncargoReference,
    qaState.manualImpresionReference,
  ]) {
    await page.goto(`/estado?ref=${reference}`);
    await expect(page.getByText(reference as string)).toBeVisible();
    await expect(page.getByText(/pedido/i).first()).toBeVisible();
    await assertNoPublicSensitiveData(page);
  }

  console.log(
    "BETA_183_SUMMARY",
    JSON.stringify({
      encargoReference: qaState.encargoReference,
      impresionReference: qaState.impresionReference,
      convertedPedidoReference: qaState.convertedPedidoReference,
      manualEncargoReference: qaState.manualEncargoReference,
      manualImpresionReference: qaState.manualImpresionReference,
      screenshots: qaState.screenshots,
      notes: qaState.notes,
    }),
  );
});
