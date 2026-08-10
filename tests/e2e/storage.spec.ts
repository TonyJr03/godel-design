import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectNoStorageLeakText,
  expectNoStorageLeakTextIn,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";
import { createQaRunId } from "./helpers/qa-data";

const NON_EXISTENT_UUID = "00000000-0000-4000-8000-000000000000";
const runId = createQaRunId();
const minimumPngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

async function openFirstInternalDetail(
  page: Page,
  listPath: string,
  linkName: RegExp,
  missingFixtureReason: string,
) {
  await page.goto(listPath);

  const detailLink = page.getByRole("link", { name: linkName }).first();

  if (!(await detailLink.isVisible().catch(() => false))) {
    test.skip(true, missingFixtureReason);
    return false;
  }

  await detailLink.click();
  return true;
}

async function expectDownloadLinksUseInternalRoute(
  section: Locator,
  routePattern: RegExp,
) {
  const downloadLinks = section.getByRole("link", { name: /descargar/i });
  const linkCount = await downloadLinks.count();

  for (let index = 0; index < linkCount; index += 1) {
    const href = await downloadLinks.nth(index).getAttribute("href");

    expect(href).toBeTruthy();
    expect(href).toMatch(routePattern);
    expect(href).not.toMatch(/file_path|bucket|godel-files|signed|supabase/i);
  }
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

async function expectNoDownloadSurface(page: Page) {
  const hrefs = await page.locator("a").evaluateAll((links) =>
    links
      .map((link) => link.getAttribute("href") ?? "")
      .filter((href) => href.length > 0),
  );

  expect(hrefs.some((href) => /\/archivos\/.+\/download/i.test(href))).toBe(
    false,
  );
}

async function openSolicitudPanel(
  page: Page,
  name: RegExp,
  triggerName = name,
): Promise<Locator> {
  const currentDialog = page.getByRole("dialog");

  if ((await currentDialog.count()) > 0) {
    const closeButton = currentDialog.getByRole("button", { name: /cerrar/i });

    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
      await expect(currentDialog).toBeHidden();
    }
  }

  const triggers = page.getByRole("button", { name: triggerName });

  await expect(async () => {
    const count = await triggers.count();

    for (let index = 0; index < count; index += 1) {
      const trigger = triggers.nth(index);

      if (await trigger.isVisible().catch(() => false)) {
        await trigger.click();
        return;
      }
    }

    throw new Error("No visible solicitud workspace trigger found.");
  }).toPass();

  const dialog = page.getByRole("dialog", { name });

  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);

  return dialog;
}

test("admin sees safe pedido storage panel when a pedido exists", async ({
  page,
}) => {
  await loginAs(page, "admin");

  const opened = await openFirstInternalDetail(
    page,
    "/dashboard/pedidos",
    /ver pedido/i,
    "No stable pedido fixture was available for storage section QA.",
  );

  if (!opened) {
    return;
  }

  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toBeVisible();

  await page.getByRole("button", { name: /archivos/i }).click();

  const storageDialog = page.getByRole("dialog", { name: /^archivos$/i });

  await expect(storageDialog).toBeVisible();
  await expectNoStorageLeakTextIn(storageDialog);
  await expect(
    storageDialog.getByRole("heading", { name: /^subir nuevo archivo$/i }),
  ).toHaveCount(0);
  await expect(
    storageDialog.getByText(
      /agrega archivos internos, avances o entregables seg.n el estado actual/i,
    ),
  ).toHaveCount(0);
  const filesListTitle = storageDialog.getByRole("heading", {
    name: /^archivos asociados$/i,
  });

  await expect(filesListTitle).toBeVisible();

  const downloadLinks = storageDialog.getByRole("link", { name: /descargar/i });

  if ((await downloadLinks.count()) > 0) {
    await expectDownloadLinksUseInternalRoute(
      storageDialog,
      /\/dashboard\/pedidos\/[^/]+\/archivos\/[^/]+\/download$/,
    );
  } else {
    await expect(
      storageDialog.getByText(/no hay archivos asociados a este pedido/i),
    ).toBeVisible();
  }

  const fileInput = storageDialog.getByLabel(/^archivos$/i);

  if (await fileInput.isVisible().catch(() => false)) {
    await expectBefore(filesListTitle, fileInput);
    await expect(
      storageDialog.getByText(/los archivos se guardar.n como/i),
    ).toHaveCount(0);
    const filesListSection = filesListTitle.locator(
      "xpath=ancestor::section[1]",
    );
    await filesListSection.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(fileInput).toBeVisible();

    const qaFileName = `qa-storage-panel-${runId}.png`;

    await fileInput.setInputFiles({
      name: qaFileName,
      mimeType: "image/png",
      buffer: minimumPngBuffer,
    });
    await storageDialog
      .getByRole("button", { name: /^subir archivos$/i })
      .click();
    await expect(storageDialog).toBeVisible();
    await expect(
      storageDialog.getByText(/completado/i),
    ).toBeVisible({ timeout: 15_000 });
    await expect(storageDialog.getByText(qaFileName)).toBeVisible({
      timeout: 15_000,
    });
    await expectBefore(filesListTitle, fileInput);
    await expectDownloadLinksUseInternalRoute(
      storageDialog,
      /\/dashboard\/pedidos\/[^/]+\/archivos\/[^/]+\/download$/,
    );
  } else {
    await expect(
      storageDialog.getByText(
        /no admite nuevas subidas|no admite nuevas subidas de archivos/i,
      ),
    ).toBeVisible();
  }
});

test("admin sees safe solicitud storage section when a solicitud exists", async ({
  page,
}) => {
  await loginAs(page, "admin");

  const opened = await openFirstInternalDetail(
    page,
    "/dashboard/solicitudes",
    /ver solicitud/i,
    "No stable solicitud fixture was available for storage section QA.",
  );

  if (!opened) {
    return;
  }

  await expect(
    page.getByRole("heading", { name: /solicitud de/i }),
  ).toBeVisible();

  const storageDialog = await openSolicitudPanel(
    page,
    /^archivos$/i,
    /archivos/i,
  );

  await expectNoStorageLeakTextIn(storageDialog);
  await expect(
    storageDialog.getByRole("heading", { name: /archivos de la solicitud/i }),
  ).toHaveCount(0);
  await expect(storageDialog.getByLabel(/^archivos$/i)).toHaveCount(0);
  await expect(
    storageDialog.getByRole("heading", { name: /subir/i }),
  ).toHaveCount(0);

  const downloadLinks = storageDialog.getByRole("link", { name: /descargar/i });

  if ((await downloadLinks.count()) > 0) {
    await expectDownloadLinksUseInternalRoute(
      storageDialog,
      /\/dashboard\/solicitudes\/[^/]+\/archivos\/[^/]+\/download$/,
    );
  } else {
    await expect(
      storageDialog.getByText(/no hay archivos asociados|todav.a no hay archivos/i),
    ).toBeVisible();
  }
});

test("public solicitud rejects blocked file upload safely", async ({ page }) => {
  await page.goto("/solicitud");
  await page.getByRole("tab", { name: /impresi.n/i }).click();

  await page.getByLabel(/nombre del cliente/i).fill("Cliente QA Storage");
  await page.getByLabel(/tel.fono|telefono/i).fill("5551999");
  await page.getByLabel(/correo electr.nico|correo electronico/i).fill(
    "qa.storage.invalid@example.com",
  );
  await page.getByLabel(/cantidad de copias/i).fill("1");
  await page.getByLabel(/modo de color/i).selectOption("color");
  await page.getByLabel(/tama.o de papel/i).selectOption("carta");
  await page.getByLabel(/caras/i).selectOption("una_cara");
  await page.locator('input[name="files"]').setInputFiles({
    name: "blocked-storage.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg></svg>"),
  });

  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  await expect(page.getByText(/revisa los archivos adjuntos/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/blocked-storage\.svg/i)).toBeVisible();
  await expect(page.getByText(/hemos recibido tu solicitud/i)).toHaveCount(0);
  await expectNoStorageLeakText(page);
});

test("download routes reject invalid identifiers safely", async ({ page }) => {
  await loginAs(page, "admin");

  await page.goto("/dashboard/pedidos/not-a-uuid/archivos/not-a-uuid/download");
  await expect(page.locator("body")).toContainText(/archivo no disponible/i);
  await expectNoStorageLeakText(page);

  await page.goto(
    "/dashboard/solicitudes/not-a-uuid/archivos/not-a-uuid/download",
  );
  await expect(page.locator("body")).toContainText(/archivo no disponible/i);
  await expectNoStorageLeakText(page);
});

test("worker gets safe response for solicitud download route", async ({
  page,
}) => {
  await loginAs(page, "worker");

  await page.goto(
    `/dashboard/solicitudes/${NON_EXISTENT_UUID}/archivos/${NON_EXISTENT_UUID}/download`,
  );

  await expect(page.locator("body")).toContainText(
    /archivo no disponible|esta secci.n no est. disponible|acceso limitado/i,
  );
  await expectNoStorageLeakText(page);
});

test("public tracking has no storage download surface or metadata", async ({
  page,
}) => {
  await page.goto("/estado?ref=BAD-CODE");

  await expect(page.getByText(/c.digo inv.lido/i)).toBeVisible();
  await expectNoDownloadSurface(page);
  await expectNoStorageLeakText(page);
});
