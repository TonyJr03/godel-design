import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoTechnicalLeakText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";
import {
  createQaSupabaseClient,
  signOutQaSupabaseClient,
} from "./helpers/supabase";

const diagnosticMode = process.env.D4_DIAGNOSTIC === "1";
const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const futureDate = getFutureDateInputValue(30);
const pedidoTitle = `QA Pedido D4 ${runLabel}`;
const initialComment = `QA D4 Comment Initial ${runLabel}`;
const finalComments = [1, 2, 3].map(
  (index) => `QA D4 Comment ${index} ${runLabel}`,
);
const workerComment = `QA D4 Worker Comment ${runLabel}`;

async function openPedidoPanel(page: Page, name: RegExp, triggerName = name) {
  const openDialog = page.getByRole("dialog");

  if (await openDialog.isVisible().catch(() => false)) {
    const close = openDialog.getByRole("button", { name: /cerrar/i });

    if (await close.isVisible().catch(() => false)) {
      await close.click();
    }
  }

  await page
    .getByRole("button", { name: triggerName })
    .filter({ visible: true })
    .first()
    .click();
  const panel = page.getByRole("dialog", { name });
  await expect(panel).toBeVisible();
  return panel;
}

function paymentRow(panel: Locator, label: string) {
  return panel.getByText(label, { exact: true }).locator("xpath=parent::div");
}

async function createEncargo(page: Page) {
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill("500");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(pedidoTitle);
  await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(
    `Encargo D4 ${runLabel}.`,
  );
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const link = page.getByRole("link").filter({ hasText: pedidoTitle }).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(
    page.getByRole("heading", { level: 1, name: pedidoTitle, exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^En revisi.n$/i).first()).toBeVisible({
    timeout: 15_000,
  });
  return page.url();
}

async function getQaProfileName(role: "admin" | "worker") {
  const supabase = await createQaSupabaseClient(role);
  const { data: auth, error: authError } = await supabase.auth.getUser();

  expect(authError).toBeNull();
  expect(auth.user).not.toBeNull();

  const { data: profile, error: profileError } = await supabase
    .from("perfiles")
    .select("full_name, role, is_active")
    .eq("id", auth.user!.id)
    .maybeSingle();

  await signOutQaSupabaseClient(supabase);
  expect(profileError).toBeNull();
  expect(profile?.is_active).toBe(true);
  expect(profile?.full_name).toBeTruthy();
  return profile!.full_name;
}

async function assignQaWorker(page: Page, workerName: string) {
  const panel = await openPedidoPanel(page, /^personal$/i, /personal/i);
  const combobox = panel.getByRole("combobox", { name: /asignar personal/i });

  await combobox.fill(workerName);
  await panel.getByRole("option", { name: new RegExp(workerName, "i") }).click();
  const navigation = page.waitForNavigation({
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await panel.getByRole("button", { name: /asignar personal/i }).click();
  await navigation;
}

async function submitPaymentAndNavigate(
  page: Page,
  detailUrl: string,
  cash: string,
  transfer: string,
) {
  const panel = await openPedidoPanel(page, /^pagos$/i, /pagos/i);

  await panel.getByLabel(/pagado en efectivo/i).fill(cash);
  await panel.getByLabel(/pagado por transferencia/i).fill(transfer);
  const navigation = page.waitForNavigation({
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await panel.getByRole("button", { name: /actualizar pago/i }).click();
  await navigation;
  await expect(page).toHaveURL(detailUrl);
  return openPedidoPanel(page, /^pagos$/i, /pagos/i);
}

async function submitCommentAndNavigate(page: Page, detailUrl: string, content: string) {
  const panel = await openPedidoPanel(page, /^comentarios$/i, /comentarios/i);

  await panel.getByRole("textbox", { name: /comentario/i }).fill(content);
  const navigation = page.waitForNavigation({
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await panel.getByRole("button", { name: /agregar comentario/i }).click();
  await navigation;
  await expect(page).toHaveURL(detailUrl);
  return openPedidoPanel(page, /^comentarios$/i, /comentarios/i);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectMinimumInteractiveTargetSize(panel: Locator) {
  const targets = panel.locator("button, input, textarea");
  const count = await targets.count();

  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);

    if (!(await target.isVisible().catch(() => false))) {
      continue;
    }

    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(40);
  }
}

test("self-hosted D.4 diagnostic: payment and comment current patterns", async ({
  page,
}) => {
  test.setTimeout(180_000);
  test.skip(!diagnosticMode, "Diagnostic only: current pattern was captured before fallback.");

  await loginAs(page, "admin");
  const detailUrl = await createEncargo(page);
  let paymentPanel = await openPedidoPanel(page, /^pagos$/i, /pagos/i);

  await expect(paymentRow(paymentPanel, "Total")).toContainText(/500/);
  await expect(paymentRow(paymentPanel, "Pagado en efectivo")).toContainText(/0/);
  await expect(paymentRow(paymentPanel, "Pagado por transferencia")).toContainText(/0/);
  await expect(paymentRow(paymentPanel, "Total pagado")).toContainText(/0/);
  await expect(paymentRow(paymentPanel, "Pendiente")).toContainText(/500/);
  await expect(paymentRow(paymentPanel, "Estado")).toContainText(/sin pagar/i);

  await paymentPanel.getByLabel(/pagado en efectivo/i).fill("501");
  await paymentPanel.getByLabel(/pagado por transferencia/i).fill("0");
  await paymentPanel.getByRole("button", { name: /actualizar pago/i }).click();
  await expect(
    paymentPanel.getByText(/total pagado no puede superar el total/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(paymentPanel.locator("form")).toHaveAttribute("aria-busy", "false");
  await expect(page).toHaveURL(detailUrl);

  await paymentPanel.getByLabel(/pagado en efectivo/i).fill("100");
  const paymentSuccess = paymentPanel.getByText(/pago actualizado correctamente/i);
  await paymentPanel.getByRole("button", { name: /actualizar pago/i }).click();
  const paymentActionState = await paymentSuccess
    .isVisible({ timeout: 8_000 })
    .catch(() => false);
  const paymentPending = await paymentPanel.locator("form").getAttribute("aria-busy");

  if (!paymentActionState || paymentPending !== "false") {
    await page.goto(detailUrl);
    paymentPanel = await openPedidoPanel(page, /^pagos$/i, /pagos/i);
  }

  await expect(paymentRow(paymentPanel, "Pagado en efectivo")).toContainText(/100/);
  await expect(paymentRow(paymentPanel, "Pendiente")).toContainText(/400/);
  await expect(paymentRow(paymentPanel, "Estado")).toContainText(/pago parcial/i);

  let commentsPanel = await openPedidoPanel(page, /^comentarios$/i, /comentarios/i);
  const textarea = commentsPanel.getByRole("textbox", { name: /comentario/i });
  await textarea.fill("   ");
  await commentsPanel.getByRole("button", { name: /agregar comentario/i }).click();
  await expect(
    commentsPanel.getByText(/escribe un comentario antes de enviarlo/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(commentsPanel.locator("form")).toHaveAttribute("aria-busy", "false");
  await expect(page).toHaveURL(detailUrl);

  await textarea.fill(initialComment);
  const commentSuccess = commentsPanel.getByText(/comentario agregado correctamente/i);
  await commentsPanel.getByRole("button", { name: /agregar comentario/i }).click();
  const commentActionState = await commentSuccess
    .isVisible({ timeout: 8_000 })
    .catch(() => false);
  const commentPending = await commentsPanel.locator("form").getAttribute("aria-busy");

  if (!commentActionState || commentPending !== "false") {
    await page.goto(detailUrl);
    commentsPanel = await openPedidoPanel(page, /^comentarios$/i, /comentarios/i);
  }

  await expect(commentsPanel.getByText(initialComment, { exact: true })).toBeVisible();
  await expectNoTechnicalLeakText(page);
  console.info(
    `[D4 initial matrix] payment=mutation persisted, ActionState=${paymentActionState}, pending=${paymentPending}, fresh=${paymentActionState && paymentPending === "false"}; comment=mutation persisted, ActionState=${commentActionState}, pending=${commentPending}, fresh=${commentActionState && commentPending === "false"}`,
  );
});

test("self-hosted D.4: payment validation and three fresh canonical updates", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  await loginAs(page, "admin");
  const detailUrl = await createEncargo(page);
  let panel = await openPedidoPanel(page, /^pagos$/i, /pagos/i);

  await panel.getByLabel(/pagado en efectivo/i).fill("501");
  await panel.getByLabel(/pagado por transferencia/i).fill("0");
  await panel.getByRole("button", { name: /actualizar pago/i }).click();
  await expect(
    panel.getByText(/total pagado no puede superar el total/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(panel.locator("form")).toHaveAttribute("aria-busy", "false");

  panel = await submitPaymentAndNavigate(page, detailUrl, "100", "0");
  await expect(paymentRow(panel, "Pagado en efectivo")).toContainText(/100/);
  await expect(paymentRow(panel, "Pendiente")).toContainText(/400/);
  await expect(paymentRow(panel, "Estado")).toContainText(/pago parcial/i);

  panel = await submitPaymentAndNavigate(page, detailUrl, "100", "100");
  await expect(paymentRow(panel, "Total pagado")).toContainText(/200/);
  await expect(paymentRow(panel, "Pendiente")).toContainText(/300/);
  await expect(paymentRow(panel, "Estado")).toContainText(/pago parcial/i);

  panel = await submitPaymentAndNavigate(page, detailUrl, "300", "200");
  await expect(paymentRow(panel, "Total pagado")).toContainText(/500/);
  await expect(paymentRow(panel, "Pendiente")).toContainText(/0\.00/);
  await expect(paymentRow(panel, "Estado").getByText(/^Pagado$/i)).toBeVisible();
  await expect(paymentRow(panel, "Pagado completamente el")).toBeVisible();
  await expect(panel.locator("form[aria-busy='true']")).toHaveCount(0);
  await expectNoTechnicalLeakText(page);

  await page.setViewportSize({ width: 1366, height: 768 });
  const updateButton = panel.getByRole("button", { name: /actualizar pago/i });
  await updateButton.focus();
  await expect(updateButton).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectMinimumInteractiveTargetSize(panel);
  await page.screenshot({ path: testInfo.outputPath("d4-payment-desktop.png"), fullPage: true });
});

test("self-hosted D.4: comments retain order, author and timestamp after canonical navigation", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);

  const adminName = await getQaProfileName("admin");
  await loginAs(page, "admin");
  const detailUrl = await createEncargo(page);
  let panel = await openPedidoPanel(page, /^comentarios$/i, /comentarios/i);
  const textarea = panel.getByRole("textbox", { name: /comentario/i });

  await textarea.fill("   ");
  await panel.getByRole("button", { name: /agregar comentario/i }).click();
  await expect(
    panel.getByText(/escribe un comentario antes de enviarlo/i).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(panel.locator("form")).toHaveAttribute("aria-busy", "false");

  for (const comment of finalComments) {
    panel = await submitCommentAndNavigate(page, detailUrl, comment);
    await expect(panel.getByText(comment, { exact: true })).toBeVisible();
  }

  const commentRows = panel.locator("li");
  await expect(commentRows).toHaveCount(3);
  for (const comment of finalComments) {
    const row = commentRows.filter({ hasText: comment });
    await expect(row.getByText(adminName, { exact: true })).toBeVisible();
    await expect(row.locator("time")).toBeVisible();
  }
  const orderedContents = await commentRows.locator("p.mt-3").allTextContents();
  expect(orderedContents).toEqual(finalComments);
  await expect(panel.locator("form[aria-busy='true']")).toHaveCount(0);
  await expectNoTechnicalLeakText(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole("textbox", { name: /comentario/i }).fill(
    "Texto QA visual con varias líneas para comprobar el crecimiento del compositor.\nSegunda línea.",
  );
  await expectNoHorizontalOverflow(page);
  await expectMinimumInteractiveTargetSize(panel);
  await expect(panel.locator("form[aria-busy='true']")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("d4-comments-mobile.png"), fullPage: true });
  await panel.getByRole("textbox", { name: /comentario/i }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("d4-comments-mobile-composer.png"), fullPage: true });
  await panel.getByRole("button", { name: /agregar comentario/i }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("d4-comments-mobile-submit.png"), fullPage: true });
});

test("self-hosted D.4: payment and comments respect the focused role contracts", async ({ page }) => {
  test.setTimeout(180_000);

  const workerName = await getQaProfileName("worker");
  await loginAs(page, "admin");
  const detailUrl = await createEncargo(page);
  await assignQaWorker(page, workerName);

  await loginAs(page, "supervisor");
  await page.goto(detailUrl);
  let panel = await openPedidoPanel(page, /^pagos$/i, /pagos/i);
  await expect(panel.getByLabel(/pagado en efectivo/i)).toBeVisible();
  await expect(panel.getByRole("button", { name: /actualizar pago/i })).toBeVisible();

  await loginAs(page, "worker");
  await page.goto(detailUrl);
  panel = await openPedidoPanel(page, /^pagos$/i, /pagos/i);
  await expect(paymentRow(panel, "Total")).toContainText(/500/);
  await expect(panel.getByLabel(/pagado en efectivo/i)).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /actualizar pago/i })).toHaveCount(0);

  panel = await submitCommentAndNavigate(page, detailUrl, workerComment);
  const workerRow = panel.locator("li").filter({ hasText: workerComment });
  await expect(workerRow.getByText(workerName, { exact: true })).toBeVisible();
  await expect(workerRow.locator("time")).toBeVisible();
  await expectNoTechnicalLeakText(page);

  await loginAs(page, "supervisor");
  await page.goto(detailUrl);
  panel = await openPedidoPanel(page, /^comentarios$/i, /comentarios/i);
  await expect(panel.getByRole("textbox", { name: /comentario/i })).toBeVisible();
  await expectNoTechnicalLeakText(page);
});
