import { expect, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { createQaEmail, createQaRunId } from "./helpers/qa-data";

const USERS_PATH = "/dashboard/configuracion/usuarios";

test.describe.configure({ mode: "serial" });

test("user-management mutations keep validation local and reload the canonical listing", async ({
  page,
}) => {
  test.slow();
  test.skip(
    process.env.PLAYWRIGHT_EXTERNAL_SERVER !== "1",
    "This compatibility gate runs only through the external production-like runtime.",
  );

  const runId = createQaRunId();
  const fullName = `Usuario QA compatibilidad ${runId}`;
  const phone = `555${runId.slice(-7)}`;

  await loginAs(page, "admin");
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(USERS_PATH);

  await page.getByRole("button", { name: /nuevo usuario/i }).click();
  const createDialog = page.getByRole("dialog", { name: /nuevo usuario/i });

  await createDialog.getByLabel(/correo electr.nico/i).fill(
    createQaEmail("usuario-compatibilidad-invalido", runId),
  );
  await createDialog.getByLabel(/contrase.a temporal/i).fill("Password1");
  await createDialog.getByLabel(/confirmar contrase.a/i).fill("Password1");
  await createDialog.getByLabel(/nombre completo/i).fill(fullName);
  await createDialog
    .getByRole("combobox", { name: /^rol\b/i })
    .selectOption("trabajador");
  await createDialog.getByRole("button", { name: /crear usuario/i }).click();

  await expect(createDialog).toBeVisible();
  await expect(
    createDialog.getByText(/car.cter no alfanum.rico/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(new RegExp(`${USERS_PATH}$`));

  await createDialog.getByLabel(/correo electr.nico/i).fill(
    createQaEmail("usuario-compatibilidad", runId),
  );
  await createDialog.getByLabel(/contrase.a temporal/i).fill("QaCompat1!");
  await createDialog.getByLabel(/confirmar contrase.a/i).fill("QaCompat1!");
  await createDialog.getByLabel(/nombre completo/i).fill(fullName);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20_000 }),
    createDialog.getByRole("button", { name: /crear usuario/i }).click(),
  ]);

  await expect(page).toHaveURL(new RegExp(`${USERS_PATH}$`), {
    timeout: 20_000,
  });
  const userRow = page.getByRole("row").filter({ hasText: fullName });
  await expect(userRow).toBeVisible({ timeout: 20_000 });
  await expect(userRow).toContainText(/trabajador/i);
  await expect(userRow).toContainText(/cambio inicial pendiente/i);

  await userRow.getByRole("button", { name: /editar usuario/i }).click();
  const editDialog = page.getByRole("dialog", { name: /editar usuario/i });
  await editDialog.getByLabel(/tel.fono/i).fill(phone);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20_000 }),
    editDialog.getByRole("button", { name: /guardar cambios/i }).click(),
  ]);

  await expect(page).toHaveURL(new RegExp(`${USERS_PATH}$`), {
    timeout: 20_000,
  });
  await expect(userRow).toBeVisible({ timeout: 20_000 });
  await expect(userRow).toContainText(phone);

  for (const repetition of [2, 3]) {
    const repeatedFullName = `${fullName} ${repetition}`;

    await page.getByRole("button", { name: /nuevo usuario/i }).click();
    const repeatedDialog = page.getByRole("dialog", { name: /nuevo usuario/i });
    await repeatedDialog.getByLabel(/correo electr.nico/i).fill(
      createQaEmail(`usuario-compatibilidad-${repetition}`, runId),
    );
    await repeatedDialog
      .getByLabel(/contrase.a temporal/i)
      .fill(`QaCompat${repetition}!`);
    await repeatedDialog
      .getByLabel(/confirmar contrase.a/i)
      .fill(`QaCompat${repetition}!`);
    await repeatedDialog.getByLabel(/nombre completo/i).fill(repeatedFullName);
    await repeatedDialog
      .getByRole("combobox", { name: /^rol\b/i })
      .selectOption("trabajador");
    await Promise.all([
      page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 20_000,
      }),
      repeatedDialog.getByRole("button", { name: /crear usuario/i }).click(),
    ]);

    await expect(page).toHaveURL(new RegExp(`${USERS_PATH}$`));
    await expect(
      page.getByRole("row").filter({ hasText: repeatedFullName }),
    ).toBeVisible({ timeout: 20_000 });
  }
});
