import { expect, type Locator, type Page, test } from "@playwright/test";

import { expectNoTechnicalLeakText } from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId, createQaRunLabel } from "./helpers/qa-data";
import {
  createQaSupabaseClient,
  signOutQaSupabaseClient,
} from "./helpers/supabase";

test.describe.configure({ mode: "serial" });

const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const futureDate = getFutureDateInputValue(30);
const title = `QA Pedido D2 Personal ${runLabel}`;

async function getQaWorkerName() {
  const supabase = await createQaSupabaseClient("worker");
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
  expect(profile?.role).toBe("trabajador");
  expect(profile?.is_active).toBe(true);
  expect(profile?.full_name).toBeTruthy();

  return profile!.full_name;
}

async function createEncargo(page: Page) {
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill("500");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
  await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(
    `Encargo de Personal ${runLabel}.`,
  );
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const pedidoLink = page.getByRole("link").filter({ hasText: title }).first();
  await expect(pedidoLink).toBeVisible({ timeout: 15_000 });
  await pedidoLink.click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/, {
    timeout: 15_000,
  });
  await expect(page.getByText(/^En revisi.n$/i).first()).toBeVisible({
    timeout: 15_000,
  });
}

async function openPersonnelPanel(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /personal/i }).first().click();

  const dialog = page.getByRole("dialog", { name: /^personal$/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function selectWorker(panel: Locator, workerName: string) {
  const combobox = panel.getByRole("combobox", { name: /asignar personal/i });
  await combobox.fill(workerName);
  await panel
    .getByRole("option", { name: new RegExp(workerName, "i") })
    .click();
  await expect(
    combobox
      .locator("xpath=ancestor::form[1]")
      .locator('input[name="assigned_profile_id"]'),
  ).toHaveValue(/^[0-9a-f-]{36}$/i);
}

async function assignWorker(page: Page, workerName: string) {
  const panel = await openPersonnelPanel(page);
  await selectWorker(panel, workerName);
  const navigation = page.waitForNavigation({
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await panel.getByRole("button", { name: /asignar personal/i }).click();
  await navigation;
  await expect(page.getByRole("button", { name: /personal.*1/i }).first())
    .toBeVisible();
}

async function removeWorker(page: Page, workerName: string) {
  const panel = await openPersonnelPanel(page);
  const assignmentRow = panel.locator("li").filter({ hasText: workerName }).first();
  await expect(assignmentRow).toBeVisible();
  const navigation = page.waitForNavigation({
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await assignmentRow.getByRole("button", { name: /^quitar$/i }).click();
  await navigation;
  await expect(
    page.getByRole("button", {
      name: /personal.*sin personal asignado/i,
    }).first(),
  ).toBeVisible();
}

async function expectWorkerPersonalReadOnly(page: Page, workerName: string) {
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  const panel = await openPersonnelPanel(page);
  await expect(panel.getByText(workerName, { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("combobox", { name: /asignar personal/i }),
  ).toHaveCount(0);
  await expect(panel.getByRole("button", { name: /^quitar$/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(0);
}

test("self-hosted D.2: Personal assignment and removal keep a fresh canonical detail", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const workerName = await getQaWorkerName();
  await loginAs(page, "admin");
  await createEncargo(page);
  const detailUrl = page.url();

  let panel = await openPersonnelPanel(page);
  const validationCombobox = panel.getByRole("combobox", {
    name: /asignar personal/i,
  });
  await panel.getByRole("button", { name: /asignar personal/i }).click();
  await expect(validationCombobox).toBeFocused();
  await expect(validationCombobox).toHaveJSProperty(
    "validationMessage",
    "Selecciona una opcion de la lista.",
  );
  await panel.getByRole("button", { name: /cerrar/i }).click();

  for (let iteration = 1; iteration <= 3; iteration += 1) {
    await assignWorker(page, workerName);
    panel = await openPersonnelPanel(page);
    await expect(
      panel.locator("li").filter({ hasText: workerName }).first(),
    ).toBeVisible();
    await expectNoTechnicalLeakText(page);
    await panel.getByRole("button", { name: /cerrar/i }).click();

    if (iteration === 3) {
      await loginAs(page, "worker");
      await page.goto(detailUrl);
      await expectWorkerPersonalReadOnly(page, workerName);
      await loginAs(page, "admin");
      await page.goto(detailUrl);
    }

    await removeWorker(page, workerName);
    panel = await openPersonnelPanel(page);
    await expect(panel.getByText(/no hay personal asignado/i)).toBeVisible();
    await expectNoTechnicalLeakText(page);
    await panel.getByRole("button", { name: /cerrar/i }).click();
  }

  await loginAs(page, "worker");
  const removedWorkerResponse = await page.goto(detailUrl);
  // Next streamingly renders this segment-level notFound() response as 200.
  expect(removedWorkerResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /no encontramos este recurso interno/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 1, name: title, exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator("main").getByText(workerName, { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: /asignar personal/i }),
  ).toHaveCount(0);
  await expectNoTechnicalLeakText(page);

  await loginAs(page, "supervisor");
  await page.goto(detailUrl);
  panel = await openPersonnelPanel(page);
  await expect(
    panel.getByRole("combobox", { name: /asignar personal/i }),
  ).toBeVisible();
  await expectNoTechnicalLeakText(page);
});
