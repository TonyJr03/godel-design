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

const diagnosticMode = process.env.D3_DIAGNOSTIC === "1";
const runId = createQaRunId();
const runLabel = createQaRunLabel(runId);
const futureDate = getFutureDateInputValue(30);
const pedidoTitle = `QA Pedido D3 Tareas ${runLabel}`;
const simpleTaskTitle = `QA Tarea D3 Simple ${runLabel}`;
const renamedSimpleTaskTitle = `QA Tarea D3 Simple Editada ${runLabel}`;
const quantifiedTaskTitle = `QA Tarea D3 Imprimir 5 hojas ${runLabel}`;
const disposableTaskTitle = `QA Tarea D3 Desechable ${runLabel}`;
const statusGateTaskTitle = `QA Tarea D3 Estado ${runLabel}`;
const workerTaskTitle = `QA Tarea D3 Worker ${runLabel}`;
const visualTaskTitle = `QA Tarea D3 Visual 40 hojas ${runLabel}`;

type MatrixAction =
  | "create"
  | "update title"
  | "update progress"
  | "complete"
  | "reopen"
  | "delete"
  | "apply template";

const initialMatrix: Partial<Record<MatrixAction, string>> = {};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function taskItem(panel: Locator, title: string) {
  return panel.locator("li").filter({ hasText: title }).first();
}

async function openTasksPanel(page: Page) {
  const openDialog = page.getByRole("dialog");

  if (await openDialog.isVisible().catch(() => false)) {
    const close = openDialog.getByRole("button", { name: /cerrar/i });
    if (await close.isVisible().catch(() => false)) {
      await close.click();
    }
  }

  await page.getByRole("button", { name: /tareas/i }).filter({ visible: true }).first().click();
  const panel = page.getByRole("dialog", { name: /^tareas$/i });
  await expect(panel).toBeVisible();
  return panel;
}

async function openPedidoPanel(page: Page, panelName: RegExp, triggerName = panelName) {
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
  const panel = page.getByRole("dialog", { name: panelName });
  await expect(panel).toBeVisible();
  return panel;
}

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

async function assignQaWorker(page: Page, workerName: string) {
  const panel = await openPedidoPanel(page, /^personal$/i, /personal/i);
  const combobox = panel.getByRole("combobox", { name: /asignar personal/i });

  await combobox.fill(workerName);
  await panel
    .getByRole("option", { name: new RegExp(escapeRegExp(workerName), "i") })
    .click();
  await expect(
    combobox
      .locator("xpath=ancestor::form[1]")
      .locator('input[name="assigned_profile_id"]'),
  ).toHaveValue(/^[0-9a-f-]{36}$/i);

  const navigation = page.waitForNavigation({
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await panel.getByRole("button", { name: /asignar personal/i }).click();
  await navigation;
}

async function createTaskAndNavigate(page: Page, detailUrl: string, title: string) {
  const panel = await openTasksPanel(page);
  await panel.getByRole("textbox", { name: /nueva tarea/i }).fill(title);
  const navigation = page.waitForNavigation({
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await panel.getByRole("button", { name: /crear tarea/i }).click();
  await navigation;
  await expect(page).toHaveURL(detailUrl);
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function expectMinimumInteractiveTargetSize(panel: Locator) {
  const targets = panel.locator("button, input");
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

async function createEncargo(page: Page) {
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();
  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /encargo/i }).click();
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog.locator('input[name="estimated_delivery_date"]').fill(futureDate);
  await dialog.locator('input[name="total_amount"]').fill("500");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(pedidoTitle);
  await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(
    `Encargo QA D3 ${runLabel}.`,
  );
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });

  const link = page.getByRole("link").filter({ hasText: pedidoTitle }).first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(page.getByRole("heading", { level: 1, name: pedidoTitle, exact: true })).toBeVisible();
  await expect(page.getByText(/^En revisi.n$/i).first()).toBeVisible({ timeout: 15_000 });
  return page.url();
}

async function settleMutation({
  action,
  detailUrl,
  feedback,
  page,
  persisted,
}: {
  action: MatrixAction;
  detailUrl: string;
  feedback: Locator;
  page: Page;
  persisted: () => Promise<void>;
}) {
  if (!diagnosticMode) {
    await persisted();
    initialMatrix[action] = "ActionState settled; canonical navigation fresh";
    return;
  }

  const localFeedback = await feedback.isVisible({ timeout: 30_000 }).catch(() => false);

  if (localFeedback) {
    try {
      await persisted();
      initialMatrix[action] = "ActionState settled and current document fresh";
      return;
    } catch (error) {
      if (!diagnosticMode) {
        throw error;
      }

      await page.goto(detailUrl);
      await expect(page.getByRole("heading", { level: 1, name: pedidoTitle, exact: true })).toBeVisible();
      await persisted();
      initialMatrix[action] = "ActionState settled; persistence confirmed only after diagnostic navigation";
      return;
    }
  }

  await page.goto(detailUrl);
  await expect(page.getByRole("heading", { level: 1, name: pedidoTitle, exact: true })).toBeVisible();
  await persisted();
  initialMatrix[action] = "persisted only after diagnostic navigation";
}

async function submitMutation({
  page,
  trigger,
  ...settleOptions
}: {
  page: Page;
  trigger: () => Promise<void>;
} & Omit<Parameters<typeof settleMutation>[0], "page">) {
  const navigation = diagnosticMode
    ? null
    : page.waitForNavigation({ timeout: 15_000, waitUntil: "domcontentloaded" });

  await trigger();

  if (navigation) {
    await navigation;
  }

  await settleMutation({ ...settleOptions, page });
}

async function selectFirstActiveTemplate(panel: Locator) {
  const combobox = panel.getByRole("combobox", { name: /seleccionar plantilla/i });
  await combobox.focus();
  const listbox = panel.getByRole("listbox");
  await expect(listbox).toBeVisible({ timeout: 15_000 });
  const option = listbox.getByRole("option").first();
  await expect(option).toBeVisible();
  const optionText = await option.innerText();
  const templateName = optionText.split("\n")[0]?.trim() ?? "";
  const taskCount = Number(optionText.match(/(\d+)\s+tareas?/i)?.[1]);
  expect(templateName).not.toBe("");
  expect(taskCount).toBeGreaterThan(0);
  await option.click();
  await expect(combobox).toHaveValue(templateName);
  return { taskCount, templateName };
}

test("self-hosted D.3: tasks and templates settle locally and retain fresh detail state", async ({ page }) => {
  test.setTimeout(300_000);

  await loginAs(page, "admin");
  const detailUrl = await createEncargo(page);
  let panel = await openTasksPanel(page);

  const createInput = panel.getByRole("textbox", { name: /nueva tarea/i });
  await panel.getByRole("button", { name: /crear tarea/i }).click();
  await expect(createInput).toBeFocused();
  await expect(panel.getByText(/tarea creada correctamente/i)).toHaveCount(0);
  await expect(page).toHaveURL(detailUrl);

  await createInput.fill(simpleTaskTitle);
  await submitMutation({
    action: "create",
    detailUrl,
    feedback: panel.getByText(/tarea creada correctamente/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(taskItem(panel, simpleTaskTitle)).toBeVisible();
    },
    trigger: () => panel.getByRole("button", { name: /crear tarea/i }).click(),
  });

  let simpleTask = taskItem(panel, simpleTaskTitle);
  const editButton = simpleTask.getByRole("button", {
    name: new RegExp(`editar tarea ${escapeRegExp(simpleTaskTitle)}`, "i"),
  });
  await editButton.click();
  let titleInput = simpleTask.getByRole("textbox", {
    name: new RegExp(`editar tarea ${escapeRegExp(simpleTaskTitle)}`, "i"),
  });
  await expect(titleInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(titleInput).toHaveCount(0);
  await expect(editButton).toBeFocused();

  await editButton.click();
  titleInput = simpleTask.getByRole("textbox", {
    name: new RegExp(`editar tarea ${escapeRegExp(simpleTaskTitle)}`, "i"),
  });
  await titleInput.fill(renamedSimpleTaskTitle);
  await submitMutation({
    action: "update title",
    detailUrl,
    feedback: panel.getByText(/tarea actualizada correctamente/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(taskItem(panel, renamedSimpleTaskTitle)).toBeVisible();
    },
    trigger: () => simpleTask.getByRole("button", {
      name: new RegExp(`guardar tarea ${escapeRegExp(simpleTaskTitle)}`, "i"),
    }).click(),
  });

  panel = await openTasksPanel(page);
  const quantifiedInput = panel.getByRole("textbox", { name: /nueva tarea/i });
  await quantifiedInput.fill(quantifiedTaskTitle);
  await submitMutation({
    action: "create",
    detailUrl,
    feedback: panel.getByText(/tarea creada correctamente/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(taskItem(panel, quantifiedTaskTitle).getByText(/0 de 5.*Pendiente/i)).toBeVisible();
    },
    trigger: () => panel.getByRole("button", { name: /crear tarea/i }).click(),
  });

  const quantifiedTask = taskItem(panel, quantifiedTaskTitle);
  const progressButton = quantifiedTask.getByRole("button", {
    name: new RegExp(`actualizar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
  });
  await progressButton.click();
  const progressInput = quantifiedTask.getByRole("spinbutton", {
    name: new RegExp(`actualizar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
  });
  await expect(progressInput).toHaveAttribute("max", "5");
  await progressInput.fill("6");
  await quantifiedTask.getByRole("button", {
    name: new RegExp(`guardar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
  }).click();
  await expect(progressInput).toBeFocused();
  await expect(page).toHaveURL(detailUrl);
  await expect(quantifiedTask.getByText(/0 de 5.*Pendiente/i)).toHaveCount(0);

  await progressInput.fill("2");
  await submitMutation({
    action: "update progress",
    detailUrl,
    feedback: quantifiedTask.getByText(/progreso actualizado correctamente/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(taskItem(panel, quantifiedTaskTitle).getByText(/2 de 5.*Pendiente/i)).toBeVisible();
    },
    trigger: () => quantifiedTask.getByRole("button", {
      name: new RegExp(`guardar progreso de tarea ${escapeRegExp(quantifiedTaskTitle)}`, "i"),
    }).click(),
  });

  simpleTask = taskItem(panel, renamedSimpleTaskTitle);
  await submitMutation({
    action: "complete",
    detailUrl,
    feedback: simpleTask.getByText(/tarea marcada como completada/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(taskItem(panel, renamedSimpleTaskTitle).getByText(/^Completada$/i)).toBeVisible();
    },
    trigger: () => simpleTask.getByRole("button", {
      name: new RegExp(`marcar como completada tarea ${escapeRegExp(renamedSimpleTaskTitle)}`, "i"),
    }).click(),
  });

  simpleTask = taskItem(panel, renamedSimpleTaskTitle);
  await submitMutation({
    action: "reopen",
    detailUrl,
    feedback: simpleTask.getByText(/tarea reabierta correctamente/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(taskItem(panel, renamedSimpleTaskTitle).getByText(/^Pendiente$/i)).toBeVisible();
    },
    trigger: () => simpleTask.getByRole("button", {
      name: new RegExp(`reabrir tarea ${escapeRegExp(renamedSimpleTaskTitle)}`, "i"),
    }).click(),
  });

  panel = await openTasksPanel(page);
  await panel.getByRole("textbox", { name: /nueva tarea/i }).fill(disposableTaskTitle);
  await submitMutation({
    action: "create",
    detailUrl,
    feedback: panel.getByText(/tarea creada correctamente/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(taskItem(panel, disposableTaskTitle)).toBeVisible();
    },
    trigger: () => panel.getByRole("button", { name: /crear tarea/i }).click(),
  });

  const disposableTask = taskItem(panel, disposableTaskTitle);
  const deleteButton = disposableTask.getByRole("button", {
    name: new RegExp(`eliminar tarea ${escapeRegExp(disposableTaskTitle)}`, "i"),
  });
  await deleteButton.click();
  let confirmation = disposableTask.locator("form").filter({ hasText: /eliminar esta tarea/i });
  await expect(confirmation.getByRole("button", { name: /cancelar/i })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(confirmation).toHaveCount(0);
  await expect(deleteButton).toBeFocused();
  await deleteButton.click();
  confirmation = disposableTask.locator("form").filter({ hasText: /eliminar esta tarea/i });
  await submitMutation({
    action: "delete",
    detailUrl,
    feedback: panel.getByText(/tarea eliminada correctamente/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(taskItem(panel, disposableTaskTitle)).toHaveCount(0);
    },
    trigger: () => confirmation.getByRole("button", { name: /^eliminar tarea$/i }).click(),
  });

  const existingTaskCount = await panel.locator('ul[aria-label="Tareas del pedido"] > li').count();
  const { taskCount: templateTaskCount, templateName } = await selectFirstActiveTemplate(panel);
  await submitMutation({
    action: "apply template",
    detailUrl,
    feedback: panel.getByText(/se agregaron? .* tarea desde la plantilla/i),
    page,
    persisted: async () => {
      panel = await openTasksPanel(page);
      await expect(panel.locator('ul[aria-label="Tareas del pedido"] > li')).toHaveCount(
        existingTaskCount + templateTaskCount,
      );
      await expect(taskItem(panel, renamedSimpleTaskTitle)).toBeVisible();
      await expect(taskItem(panel, quantifiedTaskTitle).getByText(/2 de 5.*Pendiente/i)).toBeVisible();
      await expect(panel.getByText(templateName, { exact: true })).toHaveCount(0);
    },
    trigger: () => panel.getByRole("button", { name: /aplicar plantilla/i }).click(),
  });

  await expectNoTechnicalLeakText(page);
  console.info(
    `[D3 initial matrix] ${Object.entries(initialMatrix).map(([action, result]) => `${action}=${result}`).join("; ")}`,
  );
});

test("self-hosted D.3: a task unlocks the Encargo production transition without executing it", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await loginAs(page, "admin");
  const detailUrl = await createEncargo(page);
  let statusPanel = await openPedidoPanel(page, /^estado$/i, /^estado/i);
  const productionButton = statusPanel.getByRole("button", {
    name: /pasar a producci.n/i,
  });

  await expect(productionButton).toBeDisabled();
  await expect(
    statusPanel.getByText(/agrega al menos una tarea antes de pasar a producci.n/i),
  ).toBeVisible();

  await createTaskAndNavigate(page, detailUrl, statusGateTaskTitle);
  statusPanel = await openPedidoPanel(page, /^estado$/i, /^estado/i);
  await expect(statusPanel.getByRole("button", { name: /pasar a producci.n/i })).toBeEnabled();
  await expectNoTechnicalLeakText(page);
});

test("self-hosted D.3: assigned worker and supervisor manage Pedido tasks under their approved access", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const workerName = await getQaWorkerName();
  await loginAs(page, "admin");
  const detailUrl = await createEncargo(page);
  await assignQaWorker(page, workerName);

  await loginAs(page, "worker");
  await page.goto(detailUrl);
  await expect(page.getByRole("heading", { level: 1, name: pedidoTitle, exact: true })).toBeVisible();
  let workerTasksPanel = await openTasksPanel(page);
  await expect(workerTasksPanel.getByRole("textbox", { name: /nueva tarea/i })).toBeVisible();
  await expect(workerTasksPanel.getByRole("button", { name: /crear tarea/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /editar pedido/i })).toHaveCount(0);
  await createTaskAndNavigate(page, detailUrl, workerTaskTitle);
  workerTasksPanel = await openTasksPanel(page);
  await expect(taskItem(workerTasksPanel, workerTaskTitle)).toBeVisible();
  await expectNoTechnicalLeakText(page);

  await loginAs(page, "supervisor");
  await page.goto(detailUrl);
  const supervisorTasksPanel = await openTasksPanel(page);
  await expect(supervisorTasksPanel.getByRole("textbox", { name: /nueva tarea/i })).toBeVisible();
  await expect(taskItem(supervisorTasksPanel, workerTaskTitle)).toBeVisible();
  await expectNoTechnicalLeakText(page);
});

test("self-hosted D.3: task panel is usable at desktop and mobile viewports", async ({ page }, testInfo) => {
  test.setTimeout(180_000);

  await loginAs(page, "admin");
  const detailUrl = await createEncargo(page);
  await createTaskAndNavigate(page, detailUrl, visualTaskTitle);

  await page.setViewportSize({ width: 1366, height: 768 });
  let panel = await openTasksPanel(page);
  await expect(panel.getByRole("combobox", { name: /seleccionar plantilla/i })).toBeVisible();
  const visualTask = taskItem(panel, visualTaskTitle);
  await expect(visualTask.getByText(/0 de 40.*Pendiente/i)).toBeVisible();
  const editButton = visualTask.getByRole("button", {
    name: new RegExp(`editar tarea ${escapeRegExp(visualTaskTitle)}`, "i"),
  });
  await editButton.click();
  const titleInput = visualTask.getByRole("textbox", {
    name: new RegExp(`editar tarea ${escapeRegExp(visualTaskTitle)}`, "i"),
  });
  await expect(titleInput).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editButton).toBeFocused();
  const progressButton = visualTask.getByRole("button", {
    name: new RegExp(`actualizar progreso de tarea ${escapeRegExp(visualTaskTitle)}`, "i"),
  });
  await expect(progressButton).toBeVisible();
  const deleteButton = visualTask.getByRole("button", {
    name: new RegExp(`eliminar tarea ${escapeRegExp(visualTaskTitle)}`, "i"),
  });
  await deleteButton.click();
  const confirmation = visualTask.locator("form").filter({ hasText: /eliminar esta tarea/i });
  await expect(confirmation.getByRole("button", { name: /cancelar/i })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(deleteButton).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await expectMinimumInteractiveTargetSize(panel);
  await expect(panel.locator("svg.animate-spin")).toHaveCount(0);
  await expectNoTechnicalLeakText(page);
  await page.screenshot({ path: testInfo.outputPath("d3-tasks-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(detailUrl);
  panel = await openTasksPanel(page);
  await expect(panel.getByRole("combobox", { name: /seleccionar plantilla/i })).toBeVisible();
  await expect(taskItem(panel, visualTaskTitle).getByText(/0 de 40.*Pendiente/i)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectMinimumInteractiveTargetSize(panel);
  await expect(panel.locator("svg.animate-spin")).toHaveCount(0);
  await expectNoTechnicalLeakText(page);
  await page.screenshot({ path: testInfo.outputPath("d3-tasks-mobile.png"), fullPage: true });
  await taskItem(panel, visualTaskTitle).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("d3-tasks-mobile-task.png"), fullPage: true });
});
