import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
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
import {
  cleanupLocalPublicPolicy,
  installLocalPublicPolicy,
} from "./local-policy.mjs";

const execFileAsync = promisify(execFile);
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
  const configuredUrl = readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const configuredKey = readEnvValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (
    configuredUrl &&
    configuredKey &&
    /^(https?:\/\/)(127\.0\.0\.1|localhost)(:|\/|$)/i.test(configuredUrl)
  ) {
    return { label: "local", url: configuredUrl, key: configuredKey };
  }

  let output;

  try {
    output = await execFileAsync("npx.cmd", ["supabase", "status", "--output", "env"], {
      cwd: process.cwd(),
      windowsHide: true,
    });
  } catch {
    fail("No se pudo obtener la configuración pública de Supabase local.");
  }

  const { stdout, stderr } = output;
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

function getQaCredentials(target) {
  const prefix = target === "managed" ? "GODEL_MANAGED_TEST_ADMIN" : "GODEL_TEST_ADMIN";
  const email = readEnvValue(prefix + "_EMAIL");
  const password = readEnvValue(prefix + "_PASSWORD");

  if (!email || !password) {
    fail("Faltan las credenciales QA normales para el destino del spike.");
  }

  return { email, password };
}

function getTusEndpoint(supabaseUrl, mode) {
  const url = new URL(supabaseUrl);

  if (
    url.hostname.endsWith(".supabase.co") &&
    !url.hostname.includes(".storage.supabase.co")
  ) {
    const endpoint = (
      url.protocol +
      "//" +
      url.hostname.replace(".supabase.co", ".storage.supabase.co") +
      "/storage/v1/upload/resumable"
    );

    return mode === "presigned" ? endpoint + "/sign" : endpoint;
  }

  const endpoint = url.origin + "/storage/v1/upload/resumable";
  return mode === "presigned" ? endpoint + "/sign" : endpoint;
}

function sanitizeDestination(endpoint, label) {
  const url = new URL(endpoint);
  return url.protocol + "//" + label + "-storage" + url.pathname;
}

function getTransferSize(config) {
  return config.label === "managed" ? PUBLIC_PAYLOAD_SIZE : INTERNAL_PAYLOAD_SIZE;
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

async function signInAdmin(client, target) {
  const credentials = getQaCredentials(target);
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
      this.addEventListener("loadend", () => {
        record.status = this.status;
      });
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
  mode,
  credential,
  path,
  size,
  apiKey,
}) {
  return {
    endpoint,
    mode,
    credential,
    path,
    size,
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
    const createUpload = ({ abortAfterFirstChunk, removeFingerprintOnSuccess }) => {
      const state = {
        uploadUrlAvailable: false,
        chunksCompleted: 0,
        progress: [],
        aborted: false,
      };
      let resolveAbort;
      let rejectAbort;
      let rejectUpload;
      const abortResult = new Promise((resolveResult, rejectResult) => {
        resolveAbort = resolveResult;
        rejectAbort = rejectResult;
      });
      const uploadError = new Promise((_, rejectResult) => {
        rejectUpload = rejectResult;
      });
      const upload = new window.tus.Upload(file, {
        endpoint: data.endpoint,
        chunkSize: data.chunkSize,
        retryDelays: [0, 1000, 2000],
        uploadDataDuringCreation: false,
        removeFingerprintOnSuccess,
        headers: {
          "x-upsert": "false",
          apikey: data.apiKey,
          ...(data.mode === "authenticated"
            ? { Authorization: "Bearer " + data.credential }
            : { "x-signature": data.credential }),
        },
        metadata: {
          bucketName: data.bucket,
          objectName: data.path,
          contentType: "application/pdf",
          cacheControl: "3600",
        },
        onUploadUrlAvailable() {
          state.uploadUrlAvailable = true;
        },
        onProgress(bytesUploaded, bytesTotal) {
          state.progress.push([bytesUploaded, bytesTotal]);
        },
        onChunkComplete(_chunkSize, bytesAccepted) {
          state.chunksCompleted += 1;

          if (abortAfterFirstChunk && !state.aborted) {
            state.aborted = true;
            void upload.abort(false).then(
              () => resolveAbort(bytesAccepted),
              () => rejectAbort(new Error("TUS_ABORT_REJECTED")),
            );
          }
        },
        onError(error) {
          const status = error?.originalResponse?.getStatus?.() ?? "unknown";
          rejectUpload(new Error("TUS_UPLOAD_REJECTED_" + status));
        },
      });

      return { upload, state, abortResult, uploadError };
    };

    const first = createUpload({
      abortAfterFirstChunk: true,
      removeFingerprintOnSuccess: false,
    });
    const firstPreviousUploads = await first.upload.findPreviousUploads();

    if (firstPreviousUploads.length > 0) {
      throw new Error("TUS_UNEXPECTED_PREVIOUS_UPLOAD");
    }

    first.upload.start();
    const interruptedOffset = await Promise.race([
      first.abortResult,
      first.uploadError,
    ]);

    if (
      !first.state.uploadUrlAvailable ||
      first.state.chunksCompleted < 1 ||
      interruptedOffset < data.chunkSize
    ) {
      throw new Error("TUS_ABORT_NOT_CONFIRMED_AFTER_PATCH");
    }

    const resumed = createUpload({
      abortAfterFirstChunk: false,
      removeFingerprintOnSuccess: true,
    });
    const previousUploads = await resumed.upload.findPreviousUploads();

    if (previousUploads.length === 0) {
      throw new Error("TUS_PREVIOUS_UPLOAD_NOT_FOUND");
    }

    resumed.upload.resumeFromPreviousUpload(previousUploads[0]);
    const completion = new Promise((resolveUpload, rejectUpload) => {
      resumed.upload.options.onError = rejectUpload;
      resumed.upload.options.onSuccess = () => resolveUpload();
      resumed.upload.start();
    });
    await completion;

    const resumedInitialProgress = resumed.state.progress[0]?.[0] ?? 0;

    if (resumedInitialProgress === 0) {
      throw new Error("TUS_RESUME_RESTARTED_FROM_ZERO");
    }

    return {
      interrupted: true,
      resumedFromPreviousUpload: true,
      firstChunksCompleted: first.state.chunksCompleted,
      resumedChunksCompleted: resumed.state.chunksCompleted,
      firstProgressEvents: first.state.progress.length,
      resumedProgressEvents: resumed.state.progress.length,
      resumedInitialProgress,
      multipleChunksObserved:
        first.state.chunksCompleted + resumed.state.chunksCompleted > 1,
    };
  }, input);
}

async function runResumableTransfer(page, details) {
  return runBrowserUpload(page, makeBrowserUploadInput(details));
}

async function getAccessToken(client) {
  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session?.access_token) {
    fail("No se pudo obtener el access token de la sesión QA normal.");
  }

  return session.access_token;
}

async function runAuthenticatedResumableTransfer({ client, page, config, endpoint, path }) {
  const accessToken = await getAccessToken(client);
  const transfer = await runResumableTransfer(page, {
    endpoint,
    mode: "authenticated",
    credential: accessToken,
    path,
    size: getTransferSize(config),
    apiKey: config.key,
  });

  return { transfer };
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

async function cleanupStrandedPublicFixtures(client) {
  const { data: fixtures, error: fixturesError } = await client
    .from("solicitudes")
    .select("id")
    .eq("client_name", "Fixture PPO-03A.2")
    .limit(50);

  if (fixturesError || !fixtures) {
    fail("No se pudo verificar fixtures públicos residuales del spike.");
  }

  for (const fixture of fixtures) {
    const folder = ["solicitudes", fixture.id, "originales"].join("/");
    const { data: objects, error: objectsError } = await client.storage
      .from(BUCKET)
      .list(folder);

    if (objectsError) {
      fail("No se pudo verificar objetos residuales del spike.");
    }

    const paths = (objects ?? [])
      .filter((object) => object.name.startsWith("ppo-03a2-"))
      .map((object) => folder + "/" + object.name);

    if (paths.length > 0) {
      const { error: removeError } = await client.storage.from(BUCKET).remove(paths);

      if (removeError) {
        fail("No se pudieron eliminar objetos residuales del spike.");
      }
    }

    const { error: deleteError } = await client
      .from("solicitudes")
      .delete()
      .eq("id", fixture.id);

    if (deleteError) {
      fail("No se pudo eliminar un fixture público residual del spike.");
    }
  }
}

async function attemptAuthenticatedCollision(page, client, config, endpoint, path) {
  try {
    await runAuthenticatedResumableTransfer({ client, page, config, endpoint, path });
    return { rejected: false, stage: "upload" };
  } catch {
    return { rejected: true, stage: "upload" };
  }
}

async function attemptPresignedCollision(page, client, config, endpoint, path) {
  const { data, error } = await client.storage
    .from(BUCKET)
    .createSignedUploadUrl(path, { upsert: false });

  if (error || !data) {
    return { rejected: true, stage: "authorization" };
  }

  try {
    await runResumableTransfer(page, {
      endpoint,
      mode: "presigned",
      credential: data.token,
      path,
      size: PUBLIC_PAYLOAD_SIZE,
      apiKey: config.key,
    });
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
    if (config.label === "local") {
      fail("No existe un pedido QA local accesible para el caso interno obligatorio.");
    }

    return { available: false, cleanup: true };
  }

  try {
    const authenticatedTransfer = await runAuthenticatedResumableTransfer({
      client,
      page,
      config,
      endpoint,
      path,
    });

    await verifyObjectExists(client, path);
    const collision = await attemptAuthenticatedCollision(
      page,
      client,
      config,
      endpoint,
      path,
    );

    if (!collision.rejected) {
      fail("La colisión con upsert=false no fue rechazada.");
    }

    return {
      available: true,
      authenticatedTus: true,
      transfer: authenticatedTransfer.transfer,
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

    const transfer = await runResumableTransfer(page, {
      endpoint,
      mode: "presigned",
      credential: data.token,
      path: fixture.path,
      size: getTransferSize(config),
      apiKey: config.key,
    });

    objectCreated = true;
    await verifyObjectExists(adminClient, fixture.path);
    const collision = await attemptPresignedCollision(
      page,
      anonClient,
      config,
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

async function runAuthenticatedTransportControl({ config, adminClient, page, endpoint }) {
  const fixture = await createPublicFixture(adminClient);
  let objectCreated = false;

  try {
    const authenticatedTransfer = await runAuthenticatedResumableTransfer({
      client: adminClient,
      page,
      config,
      endpoint,
      path: fixture.path,
    });

    objectCreated = true;
    await verifyObjectExists(adminClient, fixture.path);
    const collision = await attemptAuthenticatedCollision(
      page,
      adminClient,
      config,
      endpoint,
      fixture.path,
    );

    if (!collision.rejected) {
      fail("El control autenticado no rechazó la colisión con upsert=false.");
    }

    return {
      transfer: authenticatedTransfer.transfer,
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
  await signInAdmin(client, config.label);
  await cleanupStrandedPublicFixtures(client);
  const authenticatedEndpoint = getTusEndpoint(config.url, "authenticated");
  const presignedEndpoint = getTusEndpoint(config.url, "presigned");
  const browser = await chromium.launch({ headless: true });
  const { page, server } = await startHarnessPage(browser);

  try {
    const internal = await runInternalCase({
      config,
      client,
      page,
      endpoint: authenticatedEndpoint,
    });
    const publicCase = await runPublicCase({
      config,
      adminClient: client,
      page,
      endpoint: presignedEndpoint,
    });
    const authenticatedControl = await runAuthenticatedTransportControl({
      config,
      adminClient: client,
      page,
      endpoint: authenticatedEndpoint,
    });
    const fileTypes = await inspectChromeFileTypes(page);
    const tusRequests = await page.evaluate(() =>
      window.__ppo03a2TusRequests
        .filter((request) => request.url.includes("/upload/resumable"))
        .map((request) => ({
          method: request.method,
          pathname: new URL(request.url).pathname,
          authorization: Boolean(request.headers.authorization),
          apiKey: Boolean(request.headers.apikey),
          signature: Boolean(request.headers["x-signature"]),
        })),
    );

    const tusTransferRequests = tusRequests.filter((request) =>
      ["POST", "HEAD", "PATCH"].includes(request.method),
    );
    const requestModes = {
      authenticated: tusTransferRequests.filter((request) => request.authorization),
      presigned: tusTransferRequests.filter((request) => request.signature),
    };
    const getMethodCounts = (requests) =>
      Object.fromEntries(
        ["POST", "HEAD", "PATCH"].map((method) => [
          method,
          requests.filter((request) => request.method === method).length,
        ]),
      );
    const methodCounts = {
      authenticated: getMethodCounts(requestModes.authenticated),
      presigned: getMethodCounts(requestModes.presigned),
    };

    if (
      tusTransferRequests.length === 0 ||
      tusTransferRequests.some((request) => !request.apiKey) ||
      tusTransferRequests.some(
        (request) => request.authorization === request.signature,
      ) ||
      requestModes.authenticated.some(
        (request) => request.pathname !== new URL(authenticatedEndpoint).pathname,
      ) ||
      requestModes.presigned.some(
        (request) => request.pathname !== new URL(presignedEndpoint).pathname,
      ) ||
      Object.values(methodCounts.authenticated).some(
        (count) => count === 0,
      ) ||
      (config.label === "local" &&
        Object.values(methodCounts.presigned).some((count) => count === 0))
    ) {
      fail(
        "Las cabeceras TUS por modo no respetaron el contrato: " +
          JSON.stringify(
            tusTransferRequests.map((request) => ({
              method: request.method,
              pathname: request.pathname,
              signature: request.signature,
              authorization: request.authorization,
              apiKey: request.apiKey,
            })),
          ),
      );
    }

    return {
      target: config.label,
      authenticatedDestination: sanitizeDestination(authenticatedEndpoint, config.label),
      presignedDestination: sanitizeDestination(presignedEndpoint, config.label),
      directStorageOnly: true,
      browserUsedApiKey: tusTransferRequests.every((request) => request.apiKey),
      tusMethodCounts: methodCounts,
      internal,
      publicCase,
      authenticatedControl,
      fileTypes,
    };
  } catch (error) {
    const trace = await page
      .evaluate(() =>
        window.__ppo03a2TusRequests
          .filter((request) => request.url.includes("/upload/resumable"))
          .map((request) => ({
            method: request.method,
            status: Number(request.status ?? 0),
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
    try {
      await cleanupStrandedPublicFixtures(client);
    } finally {
      await client.auth.signOut();
      await page.close();
      await new Promise((resolveServer) => server.close(resolveServer));
      await browser.close();
    }
  }
}

function printSummary(result) {
  console.log("target=" + result.target);
  console.log("authenticated_destination=" + result.authenticatedDestination);
  console.log("presigned_destination=" + result.presignedDestination);
  console.log("direct_storage_only=" + result.directStorageOnly);
  console.log("browser_apikey_header=" + result.browserUsedApiKey);
  console.log(
    "authenticated_tus_post_count=" + result.tusMethodCounts.authenticated.POST,
  );
  console.log(
    "authenticated_tus_head_count=" + result.tusMethodCounts.authenticated.HEAD,
  );
  console.log(
    "authenticated_tus_patch_count=" + result.tusMethodCounts.authenticated.PATCH,
  );
  console.log(
    "presigned_tus_post_count=" + result.tusMethodCounts.presigned.POST,
  );
  console.log(
    "presigned_tus_head_count=" + result.tusMethodCounts.presigned.HEAD,
  );
  console.log(
    "presigned_tus_patch_count=" + result.tusMethodCounts.presigned.PATCH,
  );
  console.log("internal_case_available=" + result.internal.available);
  console.log(
    "internal_authenticated_tus=" +
      (result.internal.available && result.internal.authenticatedTus),
  );
  console.log(
    "internal_resume_found=" +
      (result.internal.available && result.internal.transfer?.resumedFromPreviousUpload === true),
  );
  console.log(
    "internal_collision_rejected=" +
      (result.internal.available && result.internal.collision?.rejected === true),
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
    "authenticated_control_multichunk=" +
      result.authenticatedControl.transfer.multipleChunksObserved,
  );
  console.log(
    "authenticated_control_resume_found=" +
      result.authenticatedControl.transfer.resumedFromPreviousUpload,
  );
  console.log(
    "authenticated_control_collision_rejected=" +
      result.authenticatedControl.collision.rejected,
  );
  console.log(
    "authenticated_control_collision_stage=" +
      result.authenticatedControl.collision.stage,
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

let result;

if (target === "local") {
  await cleanupLocalPublicPolicy();

  try {
    const config = await getLocalConfig();
    await installLocalPublicPolicy();
    result = await runTarget(config);
  } finally {
    await cleanupLocalPublicPolicy();
  }
} else {
  const config = getManagedConfig();
  result = await runTarget(config);
}

printSummary(result);
