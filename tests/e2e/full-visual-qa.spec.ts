import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, type Page, test } from "@playwright/test";

type Role = "admin" | "supervisor" | "worker";

type Credentials = {
  email: string;
  password: string;
};

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

const runId = new Date()
  .toISOString()
  .replace(/\D/g, "")
  .slice(0, 14);
const futureDate = "2026-12-18";
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

function readLocalEnv(name: string) {
  if (process.env[name]) {
    return process.env[name];
  }

  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) {
    return undefined;
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));

  if (!line) {
    return undefined;
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

function getCredentials(role: Role): Credentials | null {
  const prefixes = {
    admin: "GODEL_TEST_ADMIN",
    supervisor: "GODEL_TEST_SUPERVISOR",
    worker: "GODEL_TEST_WORKER",
  } satisfies Record<Role, string>;
  const prefix = prefixes[role];
  const email = readLocalEnv(`${prefix}_EMAIL`);
  const password = readLocalEnv(`${prefix}_PASSWORD`);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

async function loginAs(page: Page, role: Role) {
  const credentials = getCredentials(role);

  if (!credentials) {
    test.skip(true, `QA credentials for ${role} are not configured.`);
    return;
  }

  await page.goto("/login");
  await page.getByLabel(/correo/i).fill(credentials.email);
  await page.getByLabel(/contrase.a|contrasena/i).fill(credentials.password);
  await page.getByRole("button", { name: /entrar al workspace/i }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function logout(page: Page) {
  const button = page.getByRole("button", { name: /cerrar sesi.n/i });

  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await expect(page).toHaveURL(/\/login/);
    return;
  }

  await page.context().clearCookies();
}

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

async function openSolicitudDetail(page: Page, query: string) {
  await page.goto(`/dashboard/solicitudes?q=${encodeURIComponent(query)}`);
  await page.getByRole("link", { name: /ver solicitud/i }).first().click();
  await expect(page.getByRole("heading", { name: /solicitud de/i })).toBeVisible();
}

async function openPedidoDetailFromSearch(page: Page, query: string) {
  await page.goto(`/dashboard/pedidos?q=${encodeURIComponent(query)}`);
  await page.getByRole("link", { name: /ver pedido/i }).first().click();
  await expect(page.getByRole("heading", { name: /detalle del pedido/i })).toBeVisible();
}

async function updateSolicitudStatus(page: Page, status: string) {
  const form = page.locator("form").filter({
    has: page.getByLabel(/siguiente estado/i),
  }).first();

  await form.getByLabel(/siguiente estado/i).selectOption(status);
  await form.getByRole("button", { name: /actualizar estado/i }).click();
  await expectStatusMessage(page, /estado actualizado correctamente/i);
  await page.reload();
}

async function updatePedidoStatus(page: Page, status: string) {
  const section = sectionByHeading(page, /estado del pedido/i);
  const statusLabels: Record<string, RegExp> = {
    creado: /estado actual:\s*creado/i,
    en_revision: /estado actual:\s*en revisi.n/i,
    en_produccion: /estado actual:\s*en producci.n/i,
    listo_entrega: /estado actual:\s*listo para entrega/i,
    entregado: /estado actual:\s*entregado/i,
    cancelado: /estado actual:\s*cancelado/i,
  };

  await section.getByLabel(/^estado$/i).selectOption(status);
  await section.getByRole("button", { name: /actualizar estado/i }).click();
  await expect(sectionByHeading(page, /estado del pedido/i).getByText(statusLabels[status])).toBeVisible({
    timeout: 15_000,
  });
  await page.reload();
}

async function updatePayment(page: Page, cash: string, transfer = "0") {
  const section = sectionByHeading(page, /pago/i);

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
  await page.goto("/dashboard/pedidos/nuevo");
  await expect(page.getByRole("heading", { name: /nuevo pedido/i })).toBeVisible();

  if (workflow === "impresion") {
    await page.getByRole("tab", { name: /impresi.n/i }).click();
    await page.getByLabel(/cantidad de copias/i).fill("8");
    await page.getByLabel(/modo de color/i).selectOption("color");
    await page.getByLabel(/tama.o de papel/i).selectOption("carta");
    await page.getByLabel(/caras/i).selectOption("una_cara");
    await page.getByLabel(/observaciones/i).fill(`QA impresion ${runId}`);
  } else {
    await page.getByRole("tab", { name: /encargo/i }).click();
    await page
      .getByRole("textbox", { name: /descripci.n/i })
      .fill(`Descripcion QA ${runId}`);
  }

  await page.getByLabel(/prioridad/i).selectOption("normal");
  await page.getByLabel(/fecha estimada de entrega/i).fill(futureDate);
  await page.getByLabel(/monto total a pagar/i).fill(total);
  await page.getByLabel(/t.tulo del trabajo/i).fill(title);
  await page.getByRole("button", { name: /crear pedido/i }).click();
  await expectStatusMessage(page, /pedido creado correctamente/i);

  const reference = await extractPublicReference(page);
  await page.getByRole("link", { name: /ver detalle del pedido/i }).click();
  await expect(page.getByRole("heading", { name: /detalle del pedido/i })).toBeVisible();

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

async function expectPedidoStatusBlocked(page: Page, status: string) {
  const option = sectionByHeading(page, /estado del pedido/i).locator(
    `option[value="${status}"]`,
  );

  if ((await option.count()) === 0) {
    return;
  }

  await expect(option).toBeDisabled();
}

async function selectFirstAssignableWorker(page: Page) {
  const section = sectionByHeading(page, /personal asignado/i);
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
  test.setTimeout(300_000);

  const encargoName = `Cliente QA Encargo Playwright ${runId}`;
  const impresionName = `Cliente QA Impresion Playwright ${runId}`;
  const manualEncargoTitle = `Pedido QA Encargo Playwright ${runId}`;
  const manualImpresionTitle = `Pedido QA Impresion Playwright ${runId}`;

  await page.goto("/solicitud");
  await fillPublicContact(page, {
    name: encargoName,
    phone: "5551001",
    email: `qa.encargo.${runId}@example.com`,
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
    email: `qa.impresion.${runId}@example.com`,
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
  await expect(page.getByRole("link", { name: /solicitudes/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /pedidos/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /usuarios/i })).toBeVisible();
  await captureViewport(page, "admin-dashboard-desktop", { width: 1366, height: 768 });
  await captureViewport(page, "admin-dashboard-mobile", { width: 390, height: 844 });
  await page.setViewportSize({ width: 1366, height: 768 });

  await openSolicitudDetail(page, encargoName);
  await updateSolicitudStatus(page, "en_revision");
  await updateSolicitudStatus(page, "contactada");
  await updateSolicitudStatus(page, "aprobada");
  await page.getByRole("button", { name: /crear cliente desde esta solicitud/i }).click();
  await expectStatusMessage(page, /cliente creado y asociado correctamente/i);
  await page.reload();
  await page.getByLabel(/t.tulo del pedido/i).fill(`Pedido convertido QA ${runId}`);
  await page.getByLabel(/prioridad/i).selectOption("normal");
  await page.getByLabel(/monto total a pagar/i).fill("1200");
  await page.getByLabel(/fecha estimada de entrega/i).fill(futureDate);
  await page.getByLabel(/descripci.n del pedido/i).fill(
    `Pedido convertido desde solicitud QA ${runId}`,
  );
  await page.getByRole("button", { name: /convertir en pedido/i }).click();
  await expectStatusMessage(page, /pedido creado correctamente/i);
  await page.getByRole("link", { name: /^ver pedido$/i }).click();
  await expect(page.getByRole("heading", { name: /detalle del pedido/i })).toBeVisible();
  qaState.convertedPedidoReference = await extractPublicReference(page);
  expect(qaState.convertedPedidoReference).toBe(qaState.encargoReference);
  await expect(page.getByText(/pedido convertido qa/i)).toBeVisible();

  const manualEncargo = await createManualPedido(
    page,
    "encargo",
    manualEncargoTitle,
    "1000",
  );
  qaState.manualEncargoReference = manualEncargo.reference;
  qaState.manualEncargoUrl = manualEncargo.url;
  qaState.assignedPedidoUrl = manualEncargo.url;

  await expectPedidoStatusBlocked(page, "en_produccion");
  await expect(page.getByText(/revisarse antes de pasar/i)).toBeVisible();
  await updatePedidoStatus(page, "en_revision");
  await expectPedidoStatusBlocked(page, "en_produccion");
  await expect(page.getByText(/tarea/i).first()).toBeVisible();

  const taskSection = sectionByHeading(page, /tareas del pedido/i);
  await taskSection.getByLabel(/nueva tarea/i).fill("Imprimir 10 paginas");
  await taskSection.getByRole("button", { name: /crear tarea/i }).click();
  await expectStatusMessage(page, /tarea creada correctamente/i);
  await page.reload();
  await updatePedidoStatus(page, "en_produccion");
  await expectPedidoStatusBlocked(page, "listo_entrega");
  await page.getByLabel(/actualizar progreso/i).fill("10");
  await page
    .locator("form")
    .filter({ has: page.getByLabel(/actualizar progreso/i) })
    .getByRole("button", { name: /guardar/i })
    .click();
  await expectStatusMessage(page, /progreso actualizado correctamente/i);
  await page.reload();
  await updatePedidoStatus(page, "listo_entrega");
  await expect(page.getByText(/pago pendiente/i)).toBeVisible();
  await expectPedidoStatusBlocked(page, "entregado");
  await updatePayment(page, "500", "0");
  await expect(page.getByText(/pago pendiente/i)).toBeVisible();
  await updatePayment(page, "500", "500");
  await updatePedidoStatus(page, "entregado");
  await expect(page.getByText(/este pedido est. cerrado/i)).toBeVisible();

  const manualImpresion = await createManualPedido(
    page,
    "impresion",
    manualImpresionTitle,
    "500",
  );
  qaState.manualImpresionReference = manualImpresion.reference;
  qaState.manualImpresionUrl = manualImpresion.url;
  qaState.unassignedPedidoUrl = manualImpresion.url;
  await expect(page.getByText(/no requiere tareas/i)).toBeVisible();
  await updatePedidoStatus(page, "en_revision");
  await updatePedidoStatus(page, "en_produccion");
  await updatePedidoStatus(page, "listo_entrega");

  await page.locator('input[name="file"]').setInputFiles(
    resolve(process.cwd(), "tests/e2e/fixtures/sample-print-request.pdf"),
  );
  await page.getByRole("button", { name: /subir archivo/i }).click();
  await expectStatusMessage(page, /archivo subido correctamente/i);
  await page.reload();
  await expect(page.getByText(/sample-print-request\.pdf/i).first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/file_path/i);

  await page.goto(qaState.manualEncargoUrl);
  await selectFirstAssignableWorker(page);

  await logout(page);
  await loginAs(page, "supervisor");
  await expect(page.getByRole("link", { name: /pedidos/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /usuarios/i })).toHaveCount(0);
  await page.goto("/dashboard/usuarios");
  await expect(page.getByText(/esta secci.n no est. disponible|acceso limitado/i).first()).toBeVisible();
  await openPedidoDetailFromSearch(page, manualImpresionTitle);
  await expect(page.getByRole("heading", { name: /detalle del pedido/i })).toBeVisible();

  await logout(page);
  await loginAs(page, "worker");
  await expect(page.getByRole("link", { name: /pedidos/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /solicitudes/i })).toHaveCount(0);
  await page.goto("/dashboard/pedidos/nuevo");
  await expect(page.getByText(/no tienes permiso para crear pedidos/i)).toBeVisible();
  await page.goto(qaState.assignedPedidoUrl as string);
  await expect(page.getByRole("heading", { name: /detalle del pedido/i })).toBeVisible();
  await page.goto(qaState.unassignedPedidoUrl as string);
  await expect(page.getByText(/404|no se encontr|no tienes acceso/i)).toBeVisible();

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
