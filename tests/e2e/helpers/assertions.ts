import { expect, type Page } from "@playwright/test";

const internalSensitivePatterns = [
  /\bauth\.users\b/i,
  /\bbucket\b/i,
  /\bcliente_id\b/i,
  /\bcreateSignedUrl\b/i,
  /\bfile_path\b/i,
  /\bgodel-files\b/i,
  /\bmetadata\b/i,
  /\border_number\b/i,
  /\bpassword\b/i,
  /\bperfil_id\b/i,
  /\bPostgres\b/i,
  /\bservice_role\b/i,
  /\bsigned URL\b/i,
  /\bsignedUrl\b/i,
  /\bSQL\b/i,
  /\bstack trace\b/i,
  /\bstorage\.objects\b/i,
  /\bSUPABASE_SERVICE_ROLE_KEY\b/i,
];

export async function expectNoVisibleSensitiveText(page: Page) {
  const bodyText = await page.locator("body").innerText();

  for (const pattern of internalSensitivePatterns) {
    expect(bodyText).not.toMatch(pattern);
  }
}

export async function expectAccessLimitedPage(page: Page) {
  await expect(page).toHaveURL(/\/sin-permisos/);
  await expect(
    page.getByText(/esta secci.n no est. disponible|acceso limitado/i).first(),
  ).toBeVisible();
  await expectNoVisibleSensitiveText(page);
}
