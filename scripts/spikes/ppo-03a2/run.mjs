import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const execAsync = promisify(exec);
const MEBIBYTE = 1024 * 1024;
const TUS_CHUNK_SIZE = 6 * MEBIBYTE;
const INTERNAL_PAYLOAD_SIZE = 13 * MEBIBYTE;
const PUBLIC_PAYLOAD_SIZE = 7 * MEBIBYTE;
const BUCKET = "godel-files";
const TUS_BUNDLE_PATH = resolve(
  process.cwd(),
  "node_modules/tus-js-client/dist/tus.js",
);

function fail(message) {
  throw new Error(message);
}

function readEnvValue(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return undefined;
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(name + "="));

  if (!line) {
    return undefined;
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

function readEnvFileValue(fileName, name) {
  const envPath = resolve(process.cwd(), fileName);

  if (!existsSync(envPath)) {
    return undefined;
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(name + "="));

  if (!line) {
    return undefined;
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

function parseEnvOutput(output) {
  const trimmed = output.trim();
  const apiUrlMatch = output.match(/"API_URL"\s*:\s*"([^"]+)"/);
  const publishableKeyMatch = output.match(
    /"PUBLISHABLE_KEY"\s*:\s*"([^"]+)"/,
  );

  if (apiUrlMatch && publishableKeyMatch) {
    return new Map([
      ["API_URL", apiUrlMatch[1]],
      ["PUBLISHABLE_KEY", publishableKeyMatch[1]],
    ]);
  }

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    return new Map(Object.entries(parsed));
  }

  return new Map(
    output
      .split(/\r?\n/)
      .map((line) => {
        const separator = line.indexOf("=");
        return separator === -1
          ? null
          : [
              line.slice(0, separator),
              line
                .slice(separator + 1)
                .trim()
                .replace(/^['"]|['"]$/g, ""),
            ];
      })
      .filter(Boolean),
  );
}

async function getLocalConfig() {
  const { stdout, stderr } = await execAsync(
    "cmd.exe /d /s /c \"npx.cmd supabase status --output env\"",
    {
    cwd: process.cwd(),
    windowsHide: true,
    },
  );
  const values = parseEnvOutput(stdout + "\n" + stderr);
  const url = values.get("API_URL");
  const key = values.get("PUBLISHABLE_KEY");

  if (!url || !key || !/^https?:\/\//i.test(url)) {
    fail("Supabase local no entregó la configuración pública esperada.");
  }

  return { label: "local", url, key };
}

function getManagedConfig() {
  const url =
    readEnvFileValue("compose.env.local", "NEXT_PUBLIC_SUPABASE_URL") ??
    readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const key =
    readEnvFileValue("compose.env.local", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") ??
    readEnvValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (!url || !key) {
    fail("Falta configuración pública para Supabase administrado.");
  }

  const hostname = new URL(url).hostname;

  if (hostname === "127.0.0.1" || hostname === "localhost") {
    fail("La configuración administrada no puede apuntar a Supabase local.");
  }

  return { label: "managed", url, key };
}

function getQaCredentials() {
  const email = readEnvValue("GODEL_TEST_ADMIN_EMAIL");
  const password = readEnvValue("GODEL_TEST_ADMIN_PASSWORD");

  if (!email || !password) {
    fail("Faltan las credenciales QA de admin para el spike.");
  }

  return { email, password };
}

function getTusEndpoint(supabaseUrl) {
  const url = new URL(supabaseUrl);

  if (
    url.hostname.endsWith(".supabase.co") &&
    !url.hostname.includes(".storage.supabase.co")
  ) {
    return (
      url.protocol +
      "//" +
      url.hostname.replace(".supabase.co", ".storage.supabase.co") +
      "/storage/v1/upload/resumable"
    );
  }

  return url.origin + "/storage/v1/upload/resumable";
}

function sanitizeDestination(endpoint, label) {
  const protocol = new URL(endpoint).protocol;
  return protocol + "//" + label + "-storage/storage/v1/upload/resumable";
}

function getPedidoFolder(status) {
  if (
    status === "creado" ||
    status === "solicitud_recibida" ||
    status === "en_revision"
  ) {
    return "internos";
  }

  if (status === "en_produccion") {
    return "avances";
  }

  if (status === "listo_entrega") {
    return "finales";
  }

  return null;
}

function makeClient(config) {
  return createClient(config.url, config.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

async function signInAdmin(client) {
  const credentials = getQaCredentials();
  const { error } = await client.auth.signInWithPassword(credentials);

  if (error) {
    fail("No se pudo autenticar el usuario QA normal para el spike.");
  }
}

async function findInternalPath(client) {
  const { data, error } = await client
    .from("pedidos")
    .select("id, status")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error || !data) {
    fail("No se pudo encontrar un pedido mediante RLS.");
  }

  const pedido = data.find((candidate) => getPedidoFolder(candidate.status));

  if (!pedido) {
    return null;
  }

  const folder = getPedidoFolder(pedido.status);

  return [
    "pedidos",
    pedido.id,
    folder,
    "ppo-03a2-" + randomUUID() + ".pdf",
  ].join("/");
}

async function createPublicFixture(adminClient) {
  const { data: service, error: serviceError } = await adminClient
    .from("tipos_servicio")
    .select("id, workflow_type")
    .eq("is_publicly_available", true)
    .limit(1)
    .maybeSingle();

  if (serviceError || !service) {
    fail("No existe un servicio público disponible para el fixture.");
  }

  const solicitudId = randomUUID();
  const publicReference =
    "GD-" +
    randomBytes(2).toString("hex").toUpperCase() +
    "-" +
    randomBytes(2).toString("hex").toUpperCase();

  const { error } = await adminClient.from("solicitudes").insert({
    id: solicitudId,
    public_reference: publicReference,
    client_name: "Fixture PPO-03A.2",
    client_phone: "5550000000",
    client_email: null,
    service_id: service.id,
    workflow_type: service.workflow_type,
    description: "Fixture descartable para validar TUS firmado.",
    desired_date: null,
    notes: null,
    status: "nueva",
    cliente_id: null,
    reviewed_by: null,
    converted_order_id: null,
  });

  if (error) {
    fail("No se pudo crear el fixture público descartable.");
  }

  return {
    solicitudId,
    path: [
      "solicitudes",
      solicitudId,
      "originales",
      "ppo-03a2-" + randomUUID() + ".pdf",
    ].join("/"),
  };
}

async function startHarnessPage(browser) {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><input id='files' type='file' multiple>");
  });

  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const address = server.address();

  if (!address || typeof address === "string") {
    fail("No se pudo iniciar el origen local del harness.");
  }

  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:" + address.port, {
    waitUntil: "domcontentloaded",
  });
  await page.addScriptTag({ path: TUS_BUNDLE_PATH });
  await page.evaluate(() => {
    const records = [];
    const recordByRequest = new WeakMap();
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      const record = { method: String(method), url: String(url), headers: {} };
      records.push(record);
      recordByRequest.set(this, record);
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(
      name,
      value,
    ) {
      const record = recordByRequest.get(this);

      if (record) {
        record.headers[String(name).toLowerCase()] = Boolean(value);
      }

      return originalSetRequestHeader.call(this, name, value);
    };

    window.__ppo03a2TusRequests = records;
  });

  return { page, server };
}

function makeBrowserUploadInput({
  endpoint,
  token,
  path,
  size,
  abortAfterFirstChunk,
  apiKey,
}) {
  return {
    endpoint,
    token,
    path,
    size,
    abortAfterFirstChunk,
    apiKey,
    chunkSize: TUS_CHUNK_SIZE,
    bucket: BUCKET,
  };
}

async function runBrowserUpload(page, input) {
  return page.evaluate(async (data) => {
    const file = new File([new Uint8Array(data.size)], "ppo-03a2.pdf", {
      type: "application/pdf",
      lastModified: 1,
    });
    const progress = [];
    let interrupted = false;

    let resolveAbort;
    let rejectAbort;
    const abortResult = new Promise((resolveResult, rejectResult) => {
      resolveAbort = resolveResult;
      rejectAbort = rejectResult;
    });

    const upload = new window.tus.Upload(file, {
      endpoint: data.endpoint,
      chunkSize: data.chunkSize,
      retryDelays: [0, 1000, 2000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        "x-signature": data.token,
        "x-upsert": "false",
        ...(data.apiKey ? { apikey: data.apiKey } : {}),
      },
      metadata: {
        bucketName: data.bucket,
        objectName: data.path,
        contentType: "application/pdf",
        cacheControl: "3600",
      },
      onProgress(bytesUploaded, bytesTotal) {
        progress.push([bytesUploaded, bytesTotal]);

        if (
          data.abortAfterFirstChunk &&
          !interrupted &&
          bytesUploaded >= data.chunkSize
        ) {
          interrupted = true;
          void upload.abort(false).then(
            () => resolveAbort({ bytesUploaded, bytesTotal }),
            () => rejectAbort(new Error("TUS_ABORT_REJECTED")),
          );
        }
      },
    });

    const previousUploads = await upload.findPreviousUploads();

    if (previousUploads.length > 0) {
      upload.resumeFromPreviousUpload(previousUploads[0]);
    }

    const completion = new Promise((resolveUpload, rejectUpload) => {
      upload.options.onError = (error) => {
        const status = error?.originalResponse?.getStatus?.() ?? "unknown";
        rejectUpload(new Error("TUS_UPLOAD_REJECTED_" + status));
      };
      upload.options.onSuccess = () => {
        resolveUpload({
          completed: true,
          interrupted,
          previousUploads: previousUploads.length,
          progress,
        });
      };

      upload.start();
    });

    if (data.abortAfterFirstChunk) {
      await abortResult;
      return {
        completed: false,
        interrupted: true,
        previousUploads: previousUploads.length,
        progress,
      };
    }

    return completion;
  }, input);
}

async function runResumableTransfer(page, details) {
  const firstAttempt = await runBrowserUpload(
    page,
    makeBrowserUploadInput({ ...details, abortAfterFirstChunk: true }),
  );

  if (!firstAttempt.interrupted || firstAttempt.completed) {
    fail("No se pudo interrumpir la transferencia TUS después del primer chunk.");
  }

  const resumedAttempt = await runBrowserUpload(
    page,
    makeBrowserUploadInput({ ...details, abortAfterFirstChunk: false }),
  );

  if (!resumedAttempt.completed) {
    fail("La transferencia TUS no finalizó después de reanudar.");
  }

  const progress = [...firstAttempt.progress, ...resumedAttempt.progress];
  const maximumProgress = Math.max(...progress.map(([uploaded]) => uploaded));

  return {
    interrupted: true,
    resumedFromPreviousUpload: resumedAttempt.previousUploads > 0,
    progressEvents: progress.length,
    multipleChunksObserved: maximumProgress > TUS_CHUNK_SIZE,
  };
}

async function issueSignedUpload(client, path) {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data) {
    fail("La autorización firmada fue rechazada.");
  }

  return data;
}

async function runSignedResumableTransfer({ client, page, config, endpoint, path }) {
  let signedUpload = await issueSignedUpload(client, path);

  try {
    const transfer = await runResumableTransfer(page, {
      endpoint,
      token: signedUpload.token,
      path,
      size: INTERNAL_PAYLOAD_SIZE,
    });
    return { transfer, publicApiKeyRequired: false };
  } catch {
    signedUpload = await issueSignedUpload(client, path);
    const transfer = await runResumableTransfer(page, {
      endpoint,
      token: signedUpload.token,
      path,
      size: INTERNAL_PAYLOAD_SIZE,
      apiKey: config.key,
    });
    return { transfer, publicApiKeyRequired: true };
  }
}

async function verifyObjectExists(client, path) {
  const folder = path.slice(0, path.lastIndexOf("/") + 1);
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(BUCKET).list(folder);

  if (error || !data?.some((item) => item.name === fileName)) {
    fail("No se pudo comprobar el objeto con permisos normales.");
  }
}

async function removeObject(client, path) {
  const { error } = await client.storage.from(BUCKET).remove([path]);

  if (error) {
    fail("No se pudo limpiar el objeto del spike con permisos normales.");
  }
}

async function removeObjectIfPresent(client, path) {
  const folder = path.slice(0, path.lastIndexOf("/") + 1);
  const fileName = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(BUCKET).list(folder);

  if (error) {
    fail("No se pudo verificar el cleanup del objeto del spike.");
  }

  if (data?.some((item) => item.name === fileName)) {
    await removeObject(client, path);
  }
}

async function attemptCollision(page, client, endpoint, path, apiKey) {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data) {
    return { rejected: true, stage: "authorization" };
  }

  try {
    await runBrowserUpload(
      page,
      makeBrowserUploadInput({
        endpoint,
        token: data.token,
        path,
        size: PUBLIC_PAYLOAD_SIZE,
        abortAfterFirstChunk: false,
        apiKey,
      }),
    );
    return { rejected: false, stage: "upload" };
  } catch {
    return { rejected: true, stage: "upload" };
  }
}

async function inspectChromeFileTypes(page) {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), "godel-ppo-03a2-"));

  try {
    const files = ["sample.rar", "sample.cdr", "sample.zip", "sample.pdf"].map(
      (name) => join(fixtureDirectory, name),
    );

    for (const file of files) {
      writeFileSync(file, Buffer.from([0, 1, 2, 3]));
    }

    await page.setInputFiles("#files", files);

    return page.evaluate(() =>
      Array.from(document.querySelector("#files").files).map((file) => ({
        extension: file.name.slice(file.name.lastIndexOf(".")).toLowerCase(),
        type: file.type || "(empty)",
      })),
    );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

async function runInternalCase({ config, client, page, endpoint }) {
  const path = await findInternalPath(client);

  if (!path) {
    return { available: false, cleanup: true };
  }

  try {
    const signedTransfer = await runSignedResumableTransfer({
      client,
      page,
      config,
      endpoint,
      path,
    });

    await verifyObjectExists(client, path);
    const collision = await attemptCollision(
      page,
      client,
      endpoint,
      path,
      signedTransfer.publicApiKeyRequired ? config.key : undefined,
    );

    if (!collision.rejected) {
      fail("La colisión con upsert=false no fue rechazada.");
    }

    return {
      available: true,
      transfer: signedTransfer.transfer,
      publicApiKeyRequired: signedTransfer.publicApiKeyRequired,
      collision,
      cleanup: true,
    };
  } finally {
    await removeObjectIfPresent(client, path);
  }
}

async function runPublicCase({ config, adminClient, page, endpoint }) {
  const fixture = await createPublicFixture(adminClient);
  const anonClient = makeClient(config);
  let objectCreated = false;

  try {
    const { data, error } = await anonClient.storage
      .from(BUCKET)
      .createSignedUploadUrl(fixture.path, { upsert: false });

    if (error || !data) {
      return {
        tokenIssued: false,
        transportAttempted: false,
        rejectionStatus: error?.status ?? "unknown",
        cleanup: true,
      };
    }

    const transfer = await runResumableTransfer(
      page,
      {
        endpoint,
        token: data.token,
        path: fixture.path,
        size: INTERNAL_PAYLOAD_SIZE,
      },
    );

    objectCreated = true;
    await verifyObjectExists(adminClient, fixture.path);
    const collision = await attemptCollision(
      page,
      anonClient,
      endpoint,
      fixture.path,
    );
    return {
      tokenIssued: true,
      transportAttempted: true,
      transfer,
      collision,
      cleanup: true,
    };
  } finally {
    if (objectCreated) {
      await removeObject(adminClient, fixture.path);
    }

    const { error: fixtureError } = await adminClient
      .from("solicitudes")
      .delete()
      .eq("id", fixture.solicitudId);

    if (fixtureError) {
      fail("No se pudo eliminar el fixture público descartable.");
    }
  }
}

async function runSignedTransportControl({ config, adminClient, page, endpoint }) {
  const fixture = await createPublicFixture(adminClient);
  let objectCreated = false;

  try {
    const signedTransfer = await runSignedResumableTransfer({
      client: adminClient,
      page,
      config,
      endpoint,
      path: fixture.path,
    });

    objectCreated = true;
    await verifyObjectExists(adminClient, fixture.path);
    const collision = await attemptCollision(
      page,
      adminClient,
      endpoint,
      fixture.path,
      signedTransfer.publicApiKeyRequired ? config.key : undefined,
    );

    if (!collision.rejected) {
      fail("El control firmado no rechazó la colisión con upsert=false.");
    }

    return {
      transfer: signedTransfer.transfer,
      publicApiKeyRequired: signedTransfer.publicApiKeyRequired,
      collision,
      cleanup: true,
    };
  } finally {
    if (objectCreated) {
      await removeObjectIfPresent(adminClient, fixture.path);
    }

    const { error: fixtureError } = await adminClient
      .from("solicitudes")
      .delete()
      .eq("id", fixture.solicitudId);

    if (fixtureError) {
      fail("No se pudo eliminar el fixture del control de transporte.");
    }
  }
}

async function runTarget(config) {
  const client = makeClient(config);
  await signInAdmin(client);
  const endpoint = getTusEndpoint(config.url);
  const browser = await chromium.launch({ headless: true });
  const { page, server } = await startHarnessPage(browser);

  try {
    const internal = await runInternalCase({ config, client, page, endpoint });
    const publicCase = await runPublicCase({
      config,
      adminClient: client,
      page,
      endpoint,
    });
    const transportControl = await runSignedTransportControl({
      config,
      adminClient: client,
      page,
      endpoint,
    });
    const fileTypes = await inspectChromeFileTypes(page);
    const tusRequests = await page.evaluate((expectedEndpoint) =>
      window.__ppo03a2TusRequests
        .filter((request) => request.url.includes("/upload/resumable"))
        .map((request) => ({
          method: request.method,
          matchesEndpointHost:
            new URL(request.url).host === new URL(expectedEndpoint).host,
          authorization: Boolean(request.headers.authorization),
          apiKey: Boolean(request.headers.apikey),
          signature: Boolean(request.headers["x-signature"]),
        })),
    endpoint);

    const signedTransferRequests = tusRequests.filter(
      (request) => request.method === "POST" || request.method === "PATCH",
    );

    if (signedTransferRequests.length === 0 || signedTransferRequests.some((request) => !request.signature)) {
      fail(
        "El navegador no usó x-signature en todas las solicitudes TUS: " +
          JSON.stringify(
            signedTransferRequests.map((request) => ({
              method: request.method,
              matchesEndpointHost: request.matchesEndpointHost,
              signature: request.signature,
              authorization: request.authorization,
              apiKey: request.apiKey,
            })),
          ),
      );
    }

    if (signedTransferRequests.some((request) => request.authorization)) {
      fail("El uploader recibió o reenvió Authorization.");
    }

    return {
      target: config.label,
      destination: sanitizeDestination(endpoint, config.label),
      directStorageOnly: true,
      browserUsedAuthorization: false,
      browserUsedApiKey: signedTransferRequests.some((request) => request.apiKey),
      internal,
      publicCase,
      transportControl,
      fileTypes,
    };
  } catch (error) {
    const trace = await page
      .evaluate(() =>
        window.__ppo03a2TusRequests
          .filter((request) => request.url.includes("/upload/resumable"))
          .map((request) => ({
            method: request.method,
            signature: Boolean(request.headers["x-signature"]),
            authorization: Boolean(request.headers.authorization),
            apiKey: Boolean(request.headers.apikey),
          })),
      )
      .catch(() => []);
    fail(
      "TUS_SPIKE_FAILURE_" +
        (error instanceof Error ? error.message : "unknown") +
        "_TRACE_" +
        JSON.stringify(trace),
    );
  } finally {
    await client.auth.signOut();
    await page.close();
    await new Promise((resolveServer) => server.close(resolveServer));
    await browser.close();
  }
}

function printSummary(result) {
  console.log("target=" + result.target);
  console.log("destination=" + result.destination);
  console.log("direct_storage_only=" + result.directStorageOnly);
  console.log("browser_authorization_header=" + result.browserUsedAuthorization);
  console.log("browser_apikey_header=" + result.browserUsedApiKey);
  console.log("internal_case_available=" + result.internal.available);
  console.log(
    "internal_signed_tus=" +
      (result.internal.available && result.internal.transfer.multipleChunksObserved),
  );
  console.log(
    "internal_resume_found=" +
      (result.internal.available && result.internal.transfer.resumedFromPreviousUpload),
  );
  console.log(
    "internal_collision_rejected=" +
      (result.internal.available && result.internal.collision.rejected),
  );
  console.log("public_token_issued=" + result.publicCase.tokenIssued);
  console.log("public_transport_attempted=" + result.publicCase.transportAttempted);
  console.log(
    "public_token_rejection_status=" +
      (result.publicCase.rejectionStatus ?? "none"),
  );
  console.log(
    "public_resume_found=" +
      (result.publicCase.transfer?.resumedFromPreviousUpload ?? false),
  );
  console.log(
    "public_collision_rejected=" +
      (result.publicCase.collision?.rejected ?? false),
  );
  console.log(
    "transport_control_multichunk=" +
      result.transportControl.transfer.multipleChunksObserved,
  );
  console.log(
    "transport_control_resume_found=" +
      result.transportControl.transfer.resumedFromPreviousUpload,
  );
  console.log(
    "transport_control_collision_rejected=" +
      result.transportControl.collision.rejected,
  );
  console.log(
    "transport_control_collision_stage=" +
      result.transportControl.collision.stage,
  );
  console.log("cleanup_completed=" + (result.internal.cleanup && result.publicCase.cleanup));
  console.log(
    "chrome_file_types=" +
      result.fileTypes.map((file) => file.extension + ":" + file.type).join(","),
  );
}

const target = process.argv[2];

if (target !== "local" && target !== "managed") {
  fail("Uso: node scripts/spikes/ppo-03a2/run.mjs <local|managed>");
}

const config = target === "local" ? await getLocalConfig() : getManagedConfig();
const result = await runTarget(config);
printSummary(result);
