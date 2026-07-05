import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  expectNoStorageLeakText,
  expectNoStorageLeakTextIn,
} from "./helpers/assertions";
import { loginAs } from "./helpers/auth";

const NON_EXISTENT_UUID = "00000000-0000-4000-8000-000000000000";

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

test("admin sees safe pedido storage section when a pedido exists", async ({
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

  await expect(
    page.getByRole("heading", { name: /detalle del pedido/i }),
  ).toBeVisible();

  const storageSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: /archivos del pedido/i }),
  }).first();

  await expect(storageSection).toBeVisible();
  await expectNoStorageLeakTextIn(storageSection);
  await expectDownloadLinksUseInternalRoute(
    storageSection,
    /\/dashboard\/pedidos\/[^/]+\/archivos\/[^/]+\/download$/,
  );
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

  const storageSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: /archivos de la solicitud/i }),
  }).first();

  await expect(storageSection).toBeVisible();
  await expectNoStorageLeakTextIn(storageSection);
  await expectDownloadLinksUseInternalRoute(
    storageSection,
    /\/dashboard\/solicitudes\/[^/]+\/archivos\/[^/]+\/download$/,
  );
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
