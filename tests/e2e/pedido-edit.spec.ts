import { expect, type Locator, type Page, test } from "@playwright/test";

import type { Database } from "@/types/database";
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
const initialDeliveryDate = getFutureDateInputValue(30);
const updatedDeliveryDate = getFutureDateInputValue(45);
const pastDeliveryDate = getFutureDateInputValue(-1);
const initialTitle = `QA Pedido Edicion ${runId}`;
const updatedTitle = `QA Pedido Editado ${runId}`;
const initialDescription = `Descripcion inicial para edicion ${runLabel}`;
const updatedDescription = `Descripcion editada por admin ${runLabel}`;
const supervisorDescription = `Descripcion editada por supervisor ${runLabel}`;
let pedidoDetailUrl = "";
let workerWasAssigned = false;

type QaSupabaseClient = Awaited<ReturnType<typeof createQaSupabaseClient>>;
type ServiceTypeRow = Pick<
  Database["public"]["Tables"]["tipos_servicio"]["Row"],
  "id" | "name" | "workflow_type" | "is_publicly_available"
>;
type PedidoEditAssertion = Pick<
  Database["public"]["Tables"]["pedidos"]["Row"],
  | "id"
  | "service_id"
  | "workflow_type"
  | "title"
  | "description"
  | "priority"
  | "estimated_delivery_date"
>;
type PedidoHistoryAssertion = Pick<
  Database["public"]["Tables"]["pedido_historial"]["Row"],
  "id" | "action" | "summary" | "metadata"
>;
type WorkerProfileAssertion = Pick<
  Database["public"]["Tables"]["perfiles"]["Row"],
  "id" | "full_name" | "role" | "is_active"
>;

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

function getPedidoIdFromCurrentUrl(page: Page) {
  const pedidoId = page.url().match(/\/dashboard\/pedidos\/([0-9a-f-]+)/i)
    ?.[1] ?? "";

  expect(pedidoId).toMatch(/^[0-9a-f-]{36}$/i);

  return pedidoId;
}

async function getPedidoAssertion(
  supabase: QaSupabaseClient,
  pedidoId: string,
) {
  const { data, error } = await supabase
    .from("pedidos")
    .select(
      "id, service_id, workflow_type, title, description, priority, estimated_delivery_date",
    )
    .eq("id", pedidoId)
    .maybeSingle<PedidoEditAssertion>();

  expect(error).toBeNull();
  expect(data).not.toBeNull();

  return data as PedidoEditAssertion;
}

async function getPedidoUpdateHistoryRows(
  supabase: QaSupabaseClient,
  pedidoId: string,
) {
  const { data, error } = await supabase
    .from("pedido_historial")
    .select("id, action, summary, metadata")
    .eq("pedido_id", pedidoId)
    .eq("action", "pedido_actualizado")
    .order("created_at", { ascending: true })
    .returns<PedidoHistoryAssertion[]>();

  expect(error).toBeNull();

  return data ?? [];
}

async function getAssignableWorkerProfile() {
  const workerSupabase = await createQaSupabaseClient("worker");

  try {
    const { data: auth, error: authError } = await workerSupabase.auth.getUser();

    expect(authError).toBeNull();
    expect(auth.user).not.toBeNull();

    const { data, error } = await workerSupabase
      .from("perfiles")
      .select("id, full_name, role, is_active")
      .eq("id", auth.user!.id)
      .maybeSingle<WorkerProfileAssertion>();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.role).toBe("trabajador");
    expect(data?.is_active).toBe(true);

    return data as WorkerProfileAssertion;
  } finally {
    await signOutQaSupabaseClient(workerSupabase);
  }
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

async function closeOpenPedidoDialog(page: Page, acceptUnsaved = false) {
  const openDialog = page.getByRole("dialog");

  if ((await openDialog.count()) === 0) {
    return;
  }

  if (acceptUnsaved) {
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toMatch(/cambios sin guardar/i);
      await dialog.accept();
    });
  }

  const closeButton = openDialog.getByRole("button", { name: /cerrar/i });

  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
    await expect(openDialog).toBeHidden();
  }
}

async function openPedidoPanel(
  page: Page,
  name: RegExp,
  triggerName = name,
): Promise<Locator> {
  await closeOpenPedidoDialog(page);
  await clickFirstVisible(page.getByRole("button", { name: triggerName }));

  const dialog = page.getByRole("dialog", { name });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

async function createManualPedido(page: Page, serviceId?: string) {
  await page.goto("/dashboard/pedidos");
  await page.getByRole("button", { name: /nuevo pedido/i }).click();

  const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });

  await expect(dialog).toBeVisible();
  await dialog.getByRole("tab", { name: /encargo/i }).click();
  if (serviceId) {
    await dialog.locator('select[name="service_id"]').selectOption(serviceId);
  }
  await dialog.getByLabel(/prioridad/i).selectOption("normal");
  await dialog
    .locator('input[name="estimated_delivery_date"]')
    .fill(initialDeliveryDate);
  await dialog.locator('input[name="total_amount"]').fill("500");
  await dialog.getByLabel(/t.tulo del trabajo/i).fill(initialTitle);
  await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(
    initialDescription,
  );
  await dialog.getByRole("button", { name: /crear pedido/i }).click();
  await expect(dialog).toBeHidden({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/dashboard\/pedidos(?:[/?#].*)?$/);

  const createdPedidoLink = page
    .getByRole("link")
    .filter({ hasText: initialTitle })
    .first();

  await expect(createdPedidoLink).toBeVisible();
  await createdPedidoLink.click();
  await expect(page).toHaveURL(/\/dashboard\/pedidos\/[^/]+$/, {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: initialTitle,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText(/^En revisi.n$/i).first()).toBeVisible({
    timeout: 15_000,
  });

  return page.url();
}

function getPedidoHeader(page: Page) {
  return page.locator("article header").first();
}

function getWorkspaceRail(page: Page) {
  return page.getByRole("complementary", {
    name: /acciones del workspace/i,
  });
}

async function openEditDialog(page: Page) {
  await closeOpenPedidoDialog(page);
  await getPedidoHeader(page)
    .getByRole("button", { name: /editar pedido/i })
    .click();

  const dialog = page.getByRole("dialog", { name: /^editar pedido$/i });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

async function submitEditDialog(dialog: Locator) {
  await dialog.getByRole("button", { name: /guardar cambios/i }).click();
}

async function expectEditFormValues(
  dialog: Locator,
  values: {
    title: string;
    description: string;
    priority: string;
    deliveryDate: string;
    totalAmount: string;
  },
) {
  await expect(dialog.getByLabel(/t.tulo/i)).toHaveValue(values.title);
  await expect(dialog.getByLabel(/descripci.n/i)).toHaveValue(
    values.description,
  );
  await expect(dialog.getByLabel(/prioridad/i)).toHaveValue(values.priority);
  await expect(
    dialog.locator('input[name="estimated_delivery_date"]'),
  ).toHaveValue(values.deliveryDate);
  await expect(dialog.locator('input[name="total_amount"]')).toHaveValue(
    values.totalAmount,
  );
}

async function getUpdateHistoryEvents(page: Page) {
  const historyDialog = await openPedidoPanel(page, /^historial$/i, /historial/i);

  return historyDialog
    .getByText(/^Pedido actualizado$/i)
    .locator("xpath=ancestor::li[1]");
}

async function expectUpdateHistoryCount(page: Page, count: number) {
  const updateEvents = await getUpdateHistoryEvents(page);

  await expect(updateEvents).toHaveCount(count);
  return updateEvents;
}

async function expectNoTechnicalPedidoFieldNames(updateEvents: Locator) {
  const text = (await updateEvents.allInnerTexts()).join("\n");

  expect(text).not.toMatch(
    /\b(?:service_id|title|description|estimated_delivery_date|total_amount)\b/i,
  );
}

async function updatePayment(page: Page, cash: string, transfer = "0") {
  const paymentDialog = await openPedidoPanel(page, /^pagos$/i, /pagos/i);

  await paymentDialog.getByLabel(/pagado en efectivo/i).fill(cash);
  await paymentDialog.getByLabel(/pagado por transferencia/i).fill(transfer);
  const navigation = page.waitForNavigation({
    timeout: 15_000,
    waitUntil: "domcontentloaded",
  });
  await paymentDialog.getByRole("button", { name: /actualizar pago/i }).click();
  await navigation;

  const refreshedPaymentDialog = await openPedidoPanel(page, /^pagos$/i, /pagos/i);
  await expect(refreshedPaymentDialog.getByLabel(/pagado en efectivo/i)).toHaveValue(
    cash,
  );
  await expect(
    refreshedPaymentDialog.getByLabel(/pagado por transferencia/i),
  ).toHaveValue(transfer);
}

async function updatePedidoStatus(page: Page, status: string, label: RegExp) {
  const statusDialog = await openPedidoPanel(page, /^estado$/i, /^estado/i);
  const statusButtons: Record<string, RegExp> = {
    en_revision: /pasar a producci.n/i,
    en_produccion: /pasar a producci.n/i,
    listo_entrega: /marcar como listo para entrega/i,
    entregado: /marcar como entregado/i,
  };

  await expect(statusDialog.locator('select[name="status"]')).toHaveCount(0);

  if (status === "cancelado") {
    await statusDialog.getByRole("button", { name: /cancelar pedido/i }).click();
    await expect(statusDialog.getByText(/cancelar este pedido/i)).toBeVisible();
    await expect(statusDialog.getByRole("button", { name: /^cancelar$/i }))
      .toBeVisible();
    await statusDialog.getByRole("button", { name: /^cancelar$/i }).click();
    await expect(statusDialog.getByText(/cancelar este pedido/i)).toHaveCount(0);
    await expect(
      statusDialog.getByRole("button", { name: /cancelar pedido/i }),
    ).toBeVisible();
    await statusDialog.getByRole("button", { name: /cancelar pedido/i }).click();
    await statusDialog
      .getByRole("button", { name: /s.?, cancelar pedido/i })
      .click();
  } else {
    const buttonName = statusButtons[status];

    if (!buttonName) {
      throw new Error(`Unsupported pedido status transition: ${status}`);
    }

    await statusDialog.getByRole("button", { name: buttonName }).click();
  }

  await expect(statusDialog).toBeHidden({ timeout: 15_000 });
  await expect(page.getByText(label).first()).toBeVisible({
    timeout: 15_000,
  });

  if (status === "cancelado") {
    const closedStatusDialog = await openPedidoPanel(page, /^estado$/i, /^estado/i);

    await expect(
      closedStatusDialog.getByRole("button", { name: /cancelar pedido/i }),
    ).toHaveCount(0);
    await expect(
      closedStatusDialog.getByRole("button", { name: /avanzar|marcar|pasar/i }),
    ).toHaveCount(0);
    await expect(closedStatusDialog.getByText(/zona delicada/i)).toHaveCount(0);
  }
}

async function assignTrabajador(page: Page, workerName: string) {
  const personnelDialog = await openPedidoPanel(page, /^personal$/i, /personal/i);
  const workerSearch = personnelDialog.getByRole("combobox", {
    name: /asignar personal/i,
  });

  await expect(workerSearch).toBeVisible();
  await workerSearch.fill(workerName);
  await expect(
    personnelDialog.getByRole("option", { name: new RegExp(workerName, "i") }),
  ).toBeVisible({ timeout: 15_000 });
  await personnelDialog
    .getByRole("option", { name: new RegExp(workerName, "i") })
    .click();
  await personnelDialog
    .getByRole("button", { name: /asignar personal/i })
    .click();
  await expect(
    personnelDialog,
  ).toBeHidden({ timeout: 15_000 });

  const refreshedPersonnelDialog = await openPedidoPanel(
    page,
    /^personal$/i,
    /personal/i,
  );
  await expect(
    refreshedPersonnelDialog.locator("li").filter({ hasText: workerName }).first(),
  ).toBeVisible();
  await refreshedPersonnelDialog.getByRole("button", { name: /cerrar/i }).click();
}

test("admin edits order data and records one sanitized history event", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const supabase = await createQaSupabaseClient("admin");
  const services = await listQaServiceTypes(supabase);
  const encargoServices = services.filter(
    (service) => service.workflow_type === "encargo",
  );
  const initialService = encargoServices[0];
  const updatedService = encargoServices.find(
    (service) => service.id !== initialService?.id,
  );
  const printService = services.find(
    (service) => service.workflow_type === "impresion",
  );
  const workerProfile = await getAssignableWorkerProfile();

  if (!initialService || !updatedService || !printService) {
    throw new Error(
      "At least two encargo services and one print service are required.",
    );
  }

  await loginAs(page, "admin");
  pedidoDetailUrl = await createManualPedido(page, initialService.id);
  const pedidoId = getPedidoIdFromCurrentUrl(page);
  await expectNoTechnicalLeakText(page);

  await expect(
    getPedidoHeader(page).getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(1);
  await expect(
    getWorkspaceRail(page).getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(0);

  let editDialog = await openEditDialog(page);

  await expectEditFormValues(editDialog, {
    title: initialTitle,
    description: initialDescription,
    priority: "normal",
    deliveryDate: initialDeliveryDate,
    totalAmount: "500",
  });
  await expect(
    editDialog.locator('input[name="estimated_delivery_date"]'),
  ).not.toHaveAttribute("min");
  const initialServiceSelect = editDialog.locator('select[name="service_id"]');

  await expect(initialServiceSelect).toHaveValue(initialService.id);
  await expect(
    initialServiceSelect.locator(`option[value="${updatedService.id}"]`),
  ).toHaveText(updatedService.name);
  await expect(
    initialServiceSelect.locator("option").evaluateAll((options) =>
      options.map((option) => option.textContent ?? "").join("\n"),
    ),
  ).resolves.not.toMatch(/oculto p.blicamente/i);

  await editDialog.getByLabel(/t.tulo/i).fill(`${initialTitle} sin guardar`);
  page.once("dialog", async (dialog) => {
    expect(dialog.message()).toMatch(/cambios sin guardar/i);
    await dialog.dismiss();
  });
  await editDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(editDialog).toBeVisible();

  await editDialog.getByLabel(/t.tulo/i).fill("   ");
  await submitEditDialog(editDialog);
  await expect(
    editDialog.getByText(/el t.tulo del pedido es obligatorio/i),
  ).toBeVisible();

  await editDialog.getByLabel(/t.tulo/i).fill(updatedTitle);
  await editDialog
    .locator('input[name="estimated_delivery_date"]')
    .fill(pastDeliveryDate);
  await submitEditDialog(editDialog);
  await expect(
    editDialog.getByText(
      /la fecha estimada de entrega no puede estar en el pasado/i,
    ),
  ).toBeVisible();
  await expectNoTechnicalLeakText(page);

  await editDialog.getByLabel(/t.tulo/i).fill(updatedTitle);
  await editDialog.getByLabel(/descripci.n/i).fill(updatedDescription);
  await editDialog
    .locator('select[name="service_id"]')
    .selectOption(updatedService.id);
  await editDialog.getByLabel(/prioridad/i).selectOption("alta");
  await editDialog
    .locator('input[name="estimated_delivery_date"]')
    .fill(updatedDeliveryDate);
  await editDialog.locator('input[name="total_amount"]').fill("650");
  await submitEditDialog(editDialog);
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: updatedTitle,
      exact: true,
    }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(getPedidoHeader(page).getByText(/^Alta$/i)).toBeVisible();
  await expect(getPedidoHeader(page).getByText(updatedService.name)).toBeVisible();
  await expectNoTechnicalLeakText(page);

  let pedidoAssertion = await getPedidoAssertion(supabase, pedidoId);

  expect(pedidoAssertion.service_id).toBe(updatedService.id);
  expect(pedidoAssertion.workflow_type).toBe("encargo");
  expect(pedidoAssertion.title).toBe(updatedTitle);
  expect(pedidoAssertion.description).toBe(updatedDescription);
  expect(pedidoAssertion.priority).toBe("alta");
  expect(pedidoAssertion.estimated_delivery_date).toBe(updatedDeliveryDate);

  await expect(
    getPedidoHeader(page).getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(1);
  await expect(
    getWorkspaceRail(page).getByRole("button", { name: /editar pedido/i }),
  ).toHaveCount(0);

  editDialog = await openEditDialog(page);
  await expectEditFormValues(editDialog, {
    title: updatedTitle,
    description: updatedDescription,
    priority: "alta",
    deliveryDate: updatedDeliveryDate,
    totalAmount: "650",
  });
  await expect(editDialog.locator('select[name="service_id"]')).toHaveValue(
    updatedService.id,
  );
  await submitEditDialog(editDialog);
  await expect(editDialog).toBeHidden({ timeout: 15_000 });

  const updateEvents = await expectUpdateHistoryCount(page, 1);
  const updateEvent = updateEvents.first();

  await expect(updateEvent).toContainText(
    /Datos del pedido actualizados:\s*servicio,\s*t.tulo,\s*descripci.n,\s*prioridad,\s*fecha estimada,\s*precio\./i,
  );
  await expect(updateEvent).toContainText(/servicio/i);
  await expect(updateEvent).not.toContainText(initialDescription);
  await expect(updateEvent).not.toContainText(updatedDescription);
  await expectNoTechnicalPedidoFieldNames(updateEvents);
  await expectNoTechnicalLeakText(page);

  const historyRows = await getPedidoUpdateHistoryRows(supabase, pedidoId);

  expect(historyRows).toHaveLength(1);
  expect(historyRows[0]?.summary).toContain("servicio");
  expect(historyRows[0]?.metadata).toMatchObject({
    changed_fields: [
      "service_id",
      "title",
      "description",
      "priority",
      "estimated_delivery_date",
      "total_amount",
    ],
  });

  const { error: incompatibleError } = await supabase.rpc(
    "actualizar_datos_pedido",
    {
      p_pedido_id: pedidoId,
      p_service_id: printService.id,
      p_title: updatedTitle,
      p_description: updatedDescription,
      p_priority: "alta",
      p_estimated_delivery_date: updatedDeliveryDate,
      p_total_amount: 650,
    },
  );

  expect(incompatibleError?.message).toContain(
    "El servicio seleccionado no corresponde al tipo de trabajo del pedido",
  );
  pedidoAssertion = await getPedidoAssertion(supabase, pedidoId);
  expect(pedidoAssertion.service_id).toBe(updatedService.id);
  expect(pedidoAssertion.workflow_type).toBe("encargo");
  await expect(getPedidoUpdateHistoryRows(supabase, pedidoId)).resolves
    .toHaveLength(1);

  await assignTrabajador(page, workerProfile.full_name);
  workerWasAssigned = true;
  await signOutQaSupabaseClient(supabase);
});

test("supervisor can edit an active order", async ({ page }) => {
  test.skip(!pedidoDetailUrl, "Admin setup did not create an order.");

  await loginAs(page, "supervisor");
  await page.goto(pedidoDetailUrl);
  await expect(
    page.getByRole("heading", { level: 1, name: updatedTitle, exact: true }),
  ).toBeVisible();

  const editDialog = await openEditDialog(page);

  await editDialog.getByLabel(/descripci.n/i).fill(supervisorDescription);
  await submitEditDialog(editDialog);
  await expect(editDialog).toBeHidden({ timeout: 15_000 });
  await expectNoTechnicalLeakText(page);

  const reopenedDialog = await openEditDialog(page);

  await expect(reopenedDialog.getByLabel(/descripci.n/i)).toHaveValue(
    supervisorDescription,
  );
  await reopenedDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(reopenedDialog).toBeHidden();

  const updateEvents = await expectUpdateHistoryCount(page, 2);
  const supervisorUpdateEvent = updateEvents.filter({
    hasText: /Datos del pedido actualizados:\s*descripción\./i,
  });

  await expect(supervisorUpdateEvent).toHaveCount(1);
  await expect(supervisorUpdateEvent).not.toContainText(supervisorDescription);
  await expectNoTechnicalPedidoFieldNames(updateEvents);
});

test("assigned worker can read but cannot edit order data", async ({ page }) => {
  test.skip(!pedidoDetailUrl, "Admin setup did not create an order.");
  test.skip(!workerWasAssigned, "Admin setup did not assign a worker.");

  const supabase = await createQaSupabaseClient("worker");

  await loginAs(page, "worker");
  await page.goto(pedidoDetailUrl);
  const pedidoId = getPedidoIdFromCurrentUrl(page);
  await expect(
    page.getByRole("heading", { level: 1, name: updatedTitle, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /editar pedido/i })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("dialog", { name: /^editar pedido$/i }),
  ).toHaveCount(0);
  const pedidoAssertion = await getPedidoAssertion(supabase, pedidoId);
  const { error } = await supabase.rpc("actualizar_datos_pedido", {
    p_pedido_id: pedidoId,
    p_service_id: pedidoAssertion.service_id ?? "",
    p_title: pedidoAssertion.title,
    p_description: pedidoAssertion.description,
    p_priority: pedidoAssertion.priority,
    p_estimated_delivery_date: pedidoAssertion.estimated_delivery_date,
    p_total_amount: 650,
  });

  expect(error?.message).toContain(
    "No tienes permiso para actualizar datos de pedidos",
  );
  await expectNoTechnicalLeakText(page);
  await signOutQaSupabaseClient(supabase);
});

test("admin cannot lower total below paid amount and cannot edit closed order", async ({
  page,
}) => {
  test.setTimeout(120_000);
  test.skip(!pedidoDetailUrl, "Admin setup did not create an order.");

  const supabase = await createQaSupabaseClient("admin");

  await loginAs(page, "admin");
  await page.goto(pedidoDetailUrl);
  const pedidoId = getPedidoIdFromCurrentUrl(page);
  await updatePayment(page, "300");

  let editDialog = await openEditDialog(page);

  await editDialog.locator('input[name="total_amount"]').fill("200");
  await submitEditDialog(editDialog);
  await expect(
    editDialog.getByText(
      /el precio total no puede ser menor que el monto ya pagado/i,
    ),
  ).toBeVisible({ timeout: 15_000 });
  await expectNoTechnicalLeakText(page);
  await closeOpenPedidoDialog(page, true);

  const updateEventsAfterFailedPrice = await expectUpdateHistoryCount(page, 2);

  await expectNoTechnicalPedidoFieldNames(updateEventsAfterFailedPrice);

  editDialog = await openEditDialog(page);
  await editDialog.locator('input[name="total_amount"]').fill("700");
  await submitEditDialog(editDialog);
  await expect(editDialog).toBeHidden({ timeout: 15_000 });

  const reopenedDialog = await openEditDialog(page);
  await expect(reopenedDialog.locator('input[name="total_amount"]')).toHaveValue(
    "700",
  );
  await reopenedDialog.getByRole("button", { name: /cerrar/i }).click();
  await expect(reopenedDialog).toBeHidden();

  const updateEventsAfterPrice = await expectUpdateHistoryCount(page, 3);
  const priceUpdateEvent = updateEventsAfterPrice.filter({
    hasText: /Datos del pedido actualizados:\s*precio\./i,
  });

  await expect(priceUpdateEvent).toHaveCount(1);
  await expectNoTechnicalPedidoFieldNames(updateEventsAfterPrice);
  await updatePedidoStatus(page, "cancelado", /^Cancelado$/i);

  await expect(
    page.getByRole("heading", { level: 1, name: updatedTitle, exact: true }),
  ).toBeVisible();
  await expect(getPedidoHeader(page).getByText(/^Cancelado$/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /editar pedido/i })).toHaveCount(
    0,
  );
  const closedPedido = await getPedidoAssertion(supabase, pedidoId);
  const { error: closedError } = await supabase.rpc(
    "actualizar_datos_pedido",
    {
      p_pedido_id: pedidoId,
      p_service_id: closedPedido.service_id ?? "",
      p_title: updatedTitle,
      p_description: supervisorDescription,
      p_priority: closedPedido.priority,
      p_estimated_delivery_date: closedPedido.estimated_delivery_date,
      p_total_amount: 700,
    },
  );

  expect(closedError?.message).toContain(
    "No se pueden editar datos de un pedido cerrado",
  );
  await expect(getWorkspaceRail(page)).toBeVisible();
  await expectNoTechnicalLeakText(page);
  await signOutQaSupabaseClient(supabase);
});
