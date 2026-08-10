import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { loginAs } from "./helpers/auth";
import { getFutureDateInputValue } from "./helpers/date";
import { createQaRunId } from "./helpers/qa-data";

const MEBIBYTE = 1024 * 1024;
const FIXTURE_PREFIX = "PPO-03D.2 managed QA";
const BUCKET = "godel-files";

function readEnvFile(fileName: string) {
  const values = new Map<string, string>();
  if (!existsSync(fileName)) return values;

  for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values.set(
      line.slice(0, index).trim(),
      line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""),
    );
  }

  return values;
}

function readManagedEnv(name: string) {
  return process.env[name]
    ?? readEnvFile(resolve(process.cwd(), "compose.env.local")).get(name)
    ?? readEnvFile(resolve(process.cwd(), ".env.local")).get(name);
}

function createPdfBuffer(size: number) {
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n% PPO-03D.2 managed QA\n"),
    Buffer.alloc(Math.max(0, size - 34)),
  ]);
}

function getManagedConfig() {
  const url = readManagedEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = readManagedEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const email = readManagedEnv("GODEL_MANAGED_TEST_ADMIN_EMAIL");
  const password = readManagedEnv("GODEL_MANAGED_TEST_ADMIN_PASSWORD");

  if (!url || !key || !email || !password) {
    throw new Error("PPO03D2_MANAGED_CONFIG_MISSING");
  }
  if (["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("PPO03D2_MANAGED_CONFIG_POINTS_TO_LOCAL");
  }

  return { url, key, email, password };
}

function getStorageHostname(supabaseUrl: string) {
  const hostname = new URL(supabaseUrl).hostname;
  return hostname.endsWith(".supabase.co")
    ? hostname.replace(".supabase.co", ".storage.supabase.co")
    : hostname;
}

function getTusObjectName(uploadMetadata: string | undefined) {
  if (!uploadMetadata) return null;

  for (const entry of uploadMetadata.split(",")) {
    const [key, encodedValue] = entry.trim().split(" ", 2);
    if (key !== "objectName" || !encodedValue) continue;

    const objectName = Buffer.from(encodedValue, "base64").toString("utf8");
    return objectName.startsWith("cargas/v1/") ? objectName : null;
  }

  return null;
}

test.describe.configure({ mode: "serial" });

test("pedido uploads a managed Storage through the production uploader and cleans its fixture", async ({ page }, testInfo) => {
  test.setTimeout(1_200_000);
  expect(process.env.GODEL_E2E_TARGET).toBe("managed");

  const config = getManagedConfig();
  const supabase = createClient<Database>(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });
  expect(signInError).toBeNull();

  const title = `${FIXTURE_PREFIX} ${createQaRunId()}`;
  const fileName = "ppo-03d2-managed-7mb.pdf";
  let pedidoId: string | null = null;
  let reservedObjectPath: string | null = null;
  let tusMetadataInvalid = false;
  let cleanupVerified = false;
  const tusRequests: Array<{ method: string; hostname: string; hasAuthorization: boolean }> = [];
  const nextPostLengths: number[] = [];
  const pageErrors: string[] = [];
  const appOrigin = new URL(testInfo.project.use.baseURL as string).origin;

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.includes("/storage/v1/upload/resumable")) {
      tusRequests.push({
        method: request.method(),
        hostname: url.hostname,
        hasAuthorization: Boolean(request.headers().authorization),
      });

      if (
        request.method() === "POST" &&
        url.pathname === "/storage/v1/upload/resumable"
      ) {
        const objectName = getTusObjectName(request.headers()["upload-metadata"]);
        if (objectName) {
          reservedObjectPath = objectName;
        } else {
          tusMetadataInvalid = true;
        }
      }
    }
    if (url.origin === appOrigin && request.method() === "POST") {
      nextPostLengths.push(Number(request.headers()["content-length"] ?? 0));
    }
  });

  try {
    await loginAs(page, "admin");
    await page.goto("/dashboard/pedidos");
    await page.getByRole("button", { name: /nuevo pedido/i }).click();

    const dialog = page.getByRole("dialog", { name: /nuevo pedido/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: /encargo/i }).click();
    await dialog.getByRole("textbox", { name: /descripci.n/i }).fill(
      "Pedido descartable para el gate administrado del uploader productivo.",
    );
    await dialog.getByLabel(/prioridad/i).selectOption("normal");
    await dialog.locator('input[name="estimated_delivery_date"]').fill(
      getFutureDateInputValue(30),
    );
    await dialog.locator('input[name="total_amount"]').fill("0");
    await dialog.getByLabel(/t.tulo del trabajo/i).fill(title);
    await dialog.getByRole("button", { name: /crear pedido/i }).click();
    await expect(dialog).toBeHidden({ timeout: 120_000 });

    await expect.poll(async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id")
        .eq("title", title);
      return error ? -1 : (data?.length ?? 0);
    }, {
      timeout: 120_000,
    }).toBe(1);

    const { data: createdPedidos, error: createdPedidosError } = await supabase
      .from("pedidos")
      .select("id")
      .eq("title", title);
    expect(createdPedidosError).toBeNull();
    expect(createdPedidos).toHaveLength(1);
    pedidoId = createdPedidos?.[0]?.id ?? null;
    expect(pedidoId).not.toBeNull();

    await page.goto(`/dashboard/pedidos/${pedidoId}`);
    await expect(page).toHaveURL(/\/dashboard\/pedidos\/([0-9a-f-]+)$/i, {
      timeout: 120_000,
    });
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole("button", { name: /^archivos/i }).click();
    const filesDialog = page.getByRole("dialog", { name: /^archivos$/i });
    await expect(filesDialog).toBeVisible();
    await filesDialog.getByLabel(/^archivos$/i).setInputFiles({
      name: fileName,
      mimeType: "application/pdf",
      buffer: createPdfBuffer(7 * MEBIBYTE),
    });
    await filesDialog.getByRole("button", { name: /^subir archivos$/i }).click();

    await expect(filesDialog.getByText(fileName)).toBeVisible({ timeout: 120_000 });
    await expect(filesDialog.getByText(/^completado/i)).toBeVisible({ timeout: 720_000 });
    await expect(filesDialog.getByText(/1 archivo subido correctamente/i)).toBeVisible({
      timeout: 120_000,
    });
    await expect(filesDialog.getByRole("link", { name: /^descargar$/i })).toHaveCount(1, {
      timeout: 120_000,
    });

    await page.setViewportSize({ width: 1366, height: 768 });
    await page.screenshot({ path: testInfo.outputPath("pedido-upload-managed-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("pedido-upload-managed-mobile.png"), fullPage: true });

    const expectedStorageHostname = getStorageHostname(config.url);
    expect(tusRequests.some((request) => request.method === "POST")).toBe(true);
    expect(tusRequests.some((request) => request.method === "PATCH")).toBe(true);
    expect(tusMetadataInvalid).toBe(false);
    expect(reservedObjectPath).not.toBeNull();
    expect(tusRequests.every((request) => request.hostname === expectedStorageHostname)).toBe(true);
    expect(tusRequests.some((request) => request.hasAuthorization)).toBe(true);
    expect(Math.max(...nextPostLengths, 0)).toBeLessThan(128 * 1024);
    expect(pageErrors).toEqual([]);

    const { data: metadata, error: metadataError } = await supabase
      .from("archivos")
      .select("id, file_path")
      .eq("pedido_id", pedidoId!)
      .eq("file_name", fileName);
    expect(metadataError).toBeNull();
    expect(metadata).toHaveLength(1);

    console.log(`managed_tus_post=${tusRequests.filter((request) => request.method === "POST").length}`);
    console.log(`managed_tus_patch=${tusRequests.filter((request) => request.method === "PATCH").length}`);
    console.log(`managed_next_post_max_content_length=${Math.max(...nextPostLengths, 0)}`);
  } finally {
    const pathsToCleanup = new Set<string>();
    if (reservedObjectPath) {
      pathsToCleanup.add(reservedObjectPath);
    }

    if (pedidoId) {
      const { data: metadata, error: lookupError } = await supabase
        .from("archivos")
        .select("file_path")
        .eq("pedido_id", pedidoId);
      if (lookupError) throw new Error("PPO03D2_CLEANUP_METADATA_LOOKUP_FAILED");

      for (const file of metadata ?? []) pathsToCleanup.add(file.file_path);
    }

    if (pathsToCleanup.size > 0) {
      const { error: removeError } = await supabase
        .storage
        .from(BUCKET)
        .remove([...pathsToCleanup]);
      if (removeError) throw new Error("PPO03D2_CLEANUP_STORAGE_FAILED");
    }

    if (pedidoId) {

      const { error: deleteError } = await supabase.from("pedidos").delete().eq("id", pedidoId);
      if (deleteError) throw new Error("PPO03D2_CLEANUP_PEDIDO_FAILED");

      const [{ data: remainingPedido, error: pedidoError }, { data: remainingMetadata, error: metadataError }] = await Promise.all([
        supabase.from("pedidos").select("id").eq("id", pedidoId).maybeSingle(),
        supabase.from("archivos").select("id").eq("pedido_id", pedidoId),
      ]);
      if (pedidoError || metadataError || remainingPedido || (remainingMetadata?.length ?? 0) > 0) {
        throw new Error("PPO03D2_CLEANUP_RESIDUE");
      }
      cleanupVerified = true;
    }
    await supabase.auth.signOut();
  }

  expect(cleanupVerified).toBe(true);
});
