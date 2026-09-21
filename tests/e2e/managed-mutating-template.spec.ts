import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";

const runId = process.env.GODEL_MANAGED_MUTATING_RUN_ID;
const templateName = process.env.GODEL_MANAGED_MUTATING_TEMPLATE_NAME;

if (process.env.GODEL_MANAGED_PRODUCTION_QA !== "1") {
  throw new Error("Managed Production QA marker is required.");
}
if (process.env.GODEL_MANAGED_MUTATING_TEMPLATE_QA !== "1") {
  throw new Error("Managed template mutating QA marker is required.");
}
if (!runId || !/^M4QA-\d{8}T\d{6}Z-[A-Z2-7]{8}$/.test(runId)) {
  throw new Error("Managed mutating run ID is required.");
}
if (templateName !== `M4QA Template ${runId}`) {
  throw new Error("Managed template ownership name is invalid.");
}
if (
  !process.env.GODEL_TEST_ADMIN_EMAIL
  || !process.env.GODEL_TEST_ADMIN_PASSWORD
) {
  throw new Error("Managed template admin credentials are required.");
}

test("edits one inactive managed QA template and its isolated tasks", async ({
  page,
}) => {
  const editedDescription = `M4QA managed template edited ${runId}`;
  const taskA = `M4QA Task A ${runId}`;
  const taskAEdited = `M4QA Task A Edited ${runId}`;
  const taskB = `M4QA Task B ${runId}`;

  await loginAs(page, "admin");
  await page.goto(
    `/dashboard/configuracion/plantillas?q=${encodeURIComponent(templateName)}`,
  );
  const exactTemplateLink = page.getByRole("link", {
    name: `Abrir plantilla ${templateName}`,
    exact: true,
  });
  await expect(exactTemplateLink).toBeVisible();
  await exactTemplateLink.click();

  await expect(
    page.getByRole("heading", { name: templateName, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Inactiva", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Editar plantilla", exact: true }).click();
  const editDialog = page.getByRole("dialog", { name: "Editar plantilla" });
  await expect(editDialog.getByLabel("Nombre", { exact: true }))
    .toHaveValue(templateName);
  await editDialog.getByLabel(/descripci.n/i).fill(editedDescription);
  await editDialog.getByLabel("Estado", { exact: true }).selectOption("false");
  await expect(editDialog.getByLabel("Estado", { exact: true }))
    .toHaveValue("false");
  await editDialog.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(page.getByText(editedDescription, { exact: true })).toBeVisible();
  await expect(page.getByText("Inactiva", { exact: true })).toBeVisible();

  const createTask = async (title: string) => {
    await page.getByLabel("Nueva tarea", { exact: true }).fill(title);
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  };
  await createTask(taskA);
  await createTask(taskB);

  await page.getByRole("button", {
    name: `Editar tarea ${taskA}`,
    exact: true,
  }).click();
  await page.getByLabel(`Editar tarea ${taskA}`, { exact: true }).fill(taskAEdited);
  await page.getByRole("button", {
    name: `Guardar tarea ${taskA}`,
    exact: true,
  }).click();

  await expect(
    page.getByRole("heading", { name: templateName, exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Inactiva", { exact: true })).toBeVisible();
  await expect(page.getByText(editedDescription, { exact: true })).toBeVisible();
  await expect(page.getByText(taskAEdited, { exact: true })).toBeVisible();
  await expect(page.getByText(taskB, { exact: true })).toBeVisible();
});
