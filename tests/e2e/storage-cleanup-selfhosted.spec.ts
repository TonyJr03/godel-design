import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

import { expect, type Locator, type Page, type Request, test } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import { createQaRunId } from "./helpers/qa-data";
import { createQaSupabaseClient, signOutQaSupabaseClient } from "./helpers/supabase";

const runId = createQaRunId();

function createPdfBuffer() {
  return Buffer.concat([Buffer.from("%PDF-1.7\n% Godel cleanup QA\n"), Buffer.alloc(131_063)]);
}

function isNextActionPost(request: Request) {
  return request.method() === "POST"
    && !new URL(request.url()).pathname.startsWith("/storage/")
    && Object.hasOwn(request.headers(), "next-action");
}

async function createPublicSolicitud(
  page: Page,
  clientName: string,
  fileName: string,
  complete = true,
) {
  await page.goto("/solicitud");
  await page.locator('select[name="service_id"]').first().selectOption({ label: "Otro" });
  await page.getByLabel(/nombre del cliente/i).fill(clientName);
  await page.getByLabel(/tel.fono/i).fill(`555${runId.slice(-6)}`);
  await page.getByLabel(/correo electr.nico/i).fill(`e-${runId}@example.com`);
  await page.getByLabel(/descripci.n del trabajo/i).fill("QA cleanup");
  await page.getByLabel(/observaciones adicionales/i).fill("QA");
  await page.getByLabel(/seleccionar archivos/i).setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: createPdfBuffer(),
  });
  await page.getByRole("button", { name: /enviar solicitud/i }).click();

  if (complete) {
    await expect(page.getByText(/^recibido/i)).toBeVisible({ timeout: 45_000 });
  } else {
    await expect(page.getByRole("heading", { name: /estado de archivos/i })).toBeVisible();
  }

  return (await page.locator("code").first().textContent())!.trim();
}

async function findSolicitudId(publicReference: string, clientName: string) {
  const supabase = await createQaSupabaseClient("admin");
  const { data, error } = await supabase
    .from("solicitudes")
    .select("id")
    .eq("public_reference", publicReference)
    .eq("client_name", clientName)
    .single();
  await signOutQaSupabaseClient(supabase);

  expect(error).toBeNull();
  expect(data?.id).toBeTruthy();
  return data!.id;
}

async function listSolicitudFiles(solicitudId: string, fileName: string) {
  const supabase = await createQaSupabaseClient("admin");
  const { data, error } = await supabase
    .from("archivos")
    .select("id, file_name, solicitud_id")
    .eq("solicitud_id", solicitudId)
    .eq("file_name", fileName);
  await signOutQaSupabaseClient(supabase);

  expect(error).toBeNull();
  return data ?? [];
}

async function runQaSql(scriptName: string, publicReference: string, fileName: string, marker: string) {
  const sql = await readFile(`scripts/sql/${scriptName}`, "utf8");
  const process = spawn(
    "docker",
    [
      "compose",
      "--env-file",
      "infra/supabase/.env",
      "-f",
      "infra/supabase/docker-compose.yml",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      `qa_public_reference=${publicReference}`,
      "-v",
      `qa_file_name=${fileName}`,
      "-f",
      "-",
    ],
    { windowsHide: true },
  );
  let output = "";
  let errorOutput = "";
  process.stdout.on("data", (chunk) => {
    output += chunk;
  });
  process.stderr.on("data", (chunk) => {
    errorOutput += chunk;
  });
  process.stdin.end(sql);

  const exitCode = await new Promise<number>((resolve, reject) => {
    process.once("error", reject);
    process.once("close", resolve);
  });

  expect(exitCode, errorOutput).toBe(0);
  expect(output).toContain(marker);
}

async function openSolicitudFiles(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: /archivos/i }).first().click();
  const dialog = page.getByRole("dialog", { name: /^archivos$/i });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectFunctionalSignedDownload(page: Page, downloadHref: string) {
  const firstHop = await page.context().request.get(downloadHref, { maxRedirects: 0 });
  expect(firstHop.status()).toBeGreaterThanOrEqual(300);
  expect(firstHop.status()).toBeLessThan(400);

  const location = firstHop.headers().location;
  expect(location).toBeTruthy();

  const signedLocation = new URL(location!, new URL(page.url()).origin);
  const browserOrigin = new URL(page.url()).origin;
  const isInternalOnlyOrigin = signedLocation.hostname === "api-gw" || signedLocation.port === "8000";
  expect(signedLocation.pathname.startsWith("/storage/v1/")).toBe(true);
  expect(signedLocation.origin).toBe(browserOrigin);
  expect(isInternalOnlyOrigin).toBe(false);

  const signedResponse = await page.context().request.get(signedLocation.toString());
  const contentType = signedResponse.headers()["content-type"] ?? "";
  const body = await signedResponse.body();
  expect(signedResponse.ok()).toBe(true);
  expect(body.byteLength).toBeGreaterThan(0);
  expect(contentType).not.toMatch(/text\/html/i);
  expect(contentType).toMatch(/pdf/i);
  expect(body.subarray(0, 4).toString()).toBe("%PDF");
}

async function expectCommittedDownload(page: Page, solicitudId: string, fileName: string) {
  await page.goto(`/dashboard/solicitudes/${solicitudId}`);
  const filesDialog = await openSolicitudFiles(page);
  await expect(filesDialog.getByText(fileName)).toBeVisible();
  const downloadHref = await filesDialog
    .getByRole("link", { name: /^descargar$/i })
    .getAttribute("href");
  expect(downloadHref).toBeTruthy();
  await expectFunctionalSignedDownload(page, downloadHref!);
}

async function runMaintenanceCleanup(page: Page) {
  await page.goto("/dashboard/configuracion/mantenimiento");
  const cleanupButton = page.getByRole("button", { name: /limpiar cargas expiradas/i });
  const dialog = page.getByRole("dialog", { name: /confirmar mantenimiento/i });

  await cleanupButton.click();
  await dialog.getByRole("button", { name: /confirmar mantenimiento/i }).click();
  await expect(page.getByText(/mantenimiento completado|no hay cargas expiradas/i)).toBeVisible({
    timeout: 20_000,
  });
  await dialog.getByRole("button", { name: /cerrar/i }).click();
}

test("self-hosted physical cleanup removes only the target staged TUS object", async ({ page, browser }) => {
  test.setTimeout(240_000);

  const committedClient = `QA SH-03.3E Committed ${runId}`;
  const committedFileName = `qa-sh03e-committed-${runId}.pdf`;
  const committedReference = await createPublicSolicitud(page, committedClient, committedFileName);
  const committedSolicitudId = await findSolicitudId(committedReference, committedClient);
  expect(await listSolicitudFiles(committedSolicitudId, committedFileName)).toHaveLength(1);

  let tusUploadCompleted = false;
  let finalizeBlocked = false;
  let blockFinalize = true;
  page.on("requestfinished", (request) => {
    if (
      request.method() === "PATCH"
      && new URL(request.url()).pathname.includes("/storage/v1/upload/resumable")
    ) {
      tusUploadCompleted = true;
    }
  });
  await page.route("**/*", async (route) => {
    if (blockFinalize && tusUploadCompleted && !finalizeBlocked && isNextActionPost(route.request())) {
      finalizeBlocked = true;
      await route.abort("failed");
      return;
    }

    await route.continue();
  });

  const expiredClient = `QA SH-03.3E Expired ${runId}`;
  const expiredFileName = `qa-sh03e-expired-${runId}.pdf`;
  const expiredReference = await createPublicSolicitud(page, expiredClient, expiredFileName, false);
  const expiredSolicitudId = await findSolicitudId(expiredReference, expiredClient);
  await expect(page.getByRole("button", { name: /reintentar/i })).toBeVisible({ timeout: 45_000 });
  expect(tusUploadCompleted).toBe(true);
  expect(finalizeBlocked).toBe(true);
  expect(await listSolicitudFiles(expiredSolicitudId, expiredFileName)).toHaveLength(0);
  await page.unroute("**/*");

  await runQaSql(
    "sh-03-3e-expire-upload-fixture.sql",
    expiredReference,
    expiredFileName,
    "SH_03_3E_EXPIRE_FIXTURE_OK",
  );
  await runQaSql(
    "sh-03-3e-verify-staged-fixture.sql",
    expiredReference,
    expiredFileName,
    "SH_03_3E_STAGED_TARGET_OK",
  );

  blockFinalize = false;
  const firstAdminContext = await browser.newContext();
  const firstAdminPage = await firstAdminContext.newPage();
  await loginAs(firstAdminPage, "admin");
  await expectCommittedDownload(firstAdminPage, committedSolicitudId, committedFileName);
  await runMaintenanceCleanup(firstAdminPage);
  await runQaSql(
    "sh-03-3e-verify-cleanup-fixture.sql",
    expiredReference,
    expiredFileName,
    "SH_03_3E_CLEANUP_TARGET_OK",
  );
  expect(await listSolicitudFiles(expiredSolicitudId, expiredFileName)).toHaveLength(0);
  expect(await listSolicitudFiles(committedSolicitudId, committedFileName)).toHaveLength(1);
  await firstAdminContext.close();

  const secondAdminContext = await browser.newContext();
  const secondAdminPage = await secondAdminContext.newPage();
  await loginAs(secondAdminPage, "admin");
  await expectCommittedDownload(secondAdminPage, committedSolicitudId, committedFileName);
  await runMaintenanceCleanup(secondAdminPage);
  await runQaSql(
    "sh-03-3e-verify-cleanup-fixture.sql",
    expiredReference,
    expiredFileName,
    "SH_03_3E_CLEANUP_TARGET_OK",
  );
  expect(await listSolicitudFiles(committedSolicitudId, committedFileName)).toHaveLength(1);
  await secondAdminContext.close();

  const finalAdminContext = await browser.newContext();
  const finalAdminPage = await finalAdminContext.newPage();
  await loginAs(finalAdminPage, "admin");
  await expectCommittedDownload(finalAdminPage, committedSolicitudId, committedFileName);
  await finalAdminContext.close();
});
