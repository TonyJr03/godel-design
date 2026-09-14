import { expect, type Locator, type Page } from "@playwright/test";

const technicalLeakPatterns = [
  /\bauth\.users\b/i,
  /\bbucket\b/i,
  /\bcreateSignedUrl\b/i,
  /\bfile_path\b/i,
  /\bgodel-files\b/i,
  /\bPostgres\b/i,
  /\bservice_role\b/i,
  /\bsigned URL\b/i,
  /\bsignedUrl\b/i,
  /\bSQL\b/i,
  /\bstack trace\b/i,
  /\bstorage\.objects\b/i,
  /\bSUPABASE_SERVICE_ROLE_KEY\b/i,
];

const internalSensitivePatterns = [
  ...technicalLeakPatterns,
  /\bcliente_id\b/i,
  /\border_number\b/i,
  /\bpassword\b/i,
  /\bperfil_id\b/i,
];

const publicSensitivePatterns = [
  /\bauth\.users\b/i,
  /\bbucket\b/i,
  /\bcliente_id\b/i,
  /\bconverted_order_id\b/i,
  /\bcomentarios? internos?\b/i,
  /\bhistorial interno\b/i,
  /\bfile_path\b/i,
  /\b(?:solicitud|pedido)_historial\b/i,
  /\b(?:solicitud|pedido)_comentarios\b/i,
  /\border_number\b/i,
  /\bpayment_status\b/i,
  /\bpedido_id\b/i,
  /\bservice_role\b/i,
  /\bsolicitud_id\b/i,
  /\bSQLSTATE\b/i,
  /\bsupabase\b/i,
  /\bSUPABASE_SERVICE_ROLE_KEY\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
];

type InternalSensitiveOptions = {
  allowMetadata?: boolean;
};

async function expectTextNotToMatch(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    expect(text).not.toMatch(pattern);
  }
}

function getInternalSensitivePatterns({
  allowMetadata = false,
}: InternalSensitiveOptions = {}) {
  return allowMetadata
    ? internalSensitivePatterns
    : [...internalSensitivePatterns, /\bmetadata\b/i];
}

export async function expectNoTechnicalLeakText(page: Page) {
  await expectNoTechnicalLeakTextIn(page.locator("body"));
}

export async function expectNoTechnicalLeakTextIn(locator: Locator) {
  await expectTextNotToMatch(await locator.innerText(), technicalLeakPatterns);
}

export async function expectNoStorageLeakText(page: Page) {
  await expectNoTechnicalLeakText(page);
}

export async function expectNoStorageLeakTextIn(locator: Locator) {
  await expectNoTechnicalLeakTextIn(locator);
}

export async function expectNoPublicSensitiveText(page: Page) {
  await expectTextNotToMatch(
    await page.locator("body").innerText(),
    publicSensitivePatterns,
  );
}

export async function expectNoInternalSensitiveText(
  page: Page,
  options?: InternalSensitiveOptions,
) {
  await expectTextNotToMatch(
    await page.locator("body").innerText(),
    getInternalSensitivePatterns(options),
  );
}

export async function expectNoVisibleSensitiveText(page: Page) {
  await expectNoInternalSensitiveText(page);
}

export async function expectAccessLimitedPage(page: Page) {
  await expect(page).toHaveURL(/\/sin-permisos(?:[/?#].*)?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /esta secci.n no est. disponible para tu usuario/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/tu sesi.n sigue activa/i).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /volver al dashboard/i }),
  ).toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("button", { name: /reintentar/i })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: /reintentar/i })).toHaveCount(0);
  await expectNoInternalSensitiveText(page);
}
