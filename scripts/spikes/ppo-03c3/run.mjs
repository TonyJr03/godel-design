import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "godel-files";
const PAYLOAD_SIZE = 7 * 1024 * 1024;
const FIRST_CHUNK_SIZE = 6 * 1024 * 1024;
const FIXTURE_PREFIX = "PPO-03C.3B managed QA";
const HTTP_TIMEOUT_MS = 60_000;

function fail(code) {
  throw new Error(code);
}

function readEnvFile(fileName) {
  const values = new Map();
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

function readEnvValue(name) {
  return process.env[name]
    ?? readEnvFile("compose.env.local").get(name)
    ?? readEnvFile(".env.local").get(name);
}

function getConfig() {
  const url = readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) fail("PPO03C3_MANAGED_PUBLIC_CONFIG_MISSING");

  const parsed = new URL(url);
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    fail("PPO03C3_MANAGED_CONFIG_POINTS_TO_LOCAL");
  }
  return { url, key };
}

function getCredential(primaryName, fallbackName) {
  const email = readEnvValue(`${primaryName}_EMAIL`) ?? readEnvValue(`${fallbackName}_EMAIL`);
  const password = readEnvValue(`${primaryName}_PASSWORD`) ?? readEnvValue(`${fallbackName}_PASSWORD`);
  return email && password ? { email, password } : null;
}

function getQaCredentials() {
  const admin = getCredential("GODEL_MANAGED_TEST_ADMIN", "GODEL_TEST_ADMIN");
  const unassigned = getCredential("GODEL_MANAGED_TEST_WORKER", "GODEL_TEST_WORKER");
  if (!admin) fail("PPO03C3_MANAGED_ADMIN_CREDENTIALS_MISSING");
  if (!unassigned) fail("PPO03C3_MANAGED_UNAUTHORIZED_QA_CREDENTIALS_MISSING");
  return { admin, unassigned };
}

function makeClient({ url, key }) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function storageEndpoints(url) {
  const source = new URL(url);
  const origin = source.hostname.endsWith(".supabase.co")
    ? `${source.protocol}//${source.hostname.replace(".supabase.co", ".storage.supabase.co")}`
    : source.origin;
  const regular = `${origin}/storage/v1/upload/resumable`;
  return { regular, signed: `${regular}/sign` };
}

function one(value, label) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) fail(`${label}_EMPTY_RESULT`);
  return row;
}

function descriptor(label) {
  return [{
    original_name: `${label}.pdf`,
    safe_name: `${label.toLowerCase().replaceAll(" ", "-")}.pdf`,
    normalized_mime: "application/pdf",
    expected_size: PAYLOAD_SIZE,
  }];
}

function metadata(path) {
  const encode = (value) => Buffer.from(value).toString("base64");
  return [
    `bucketName ${encode(BUCKET)}`,
    `objectName ${encode(path)}`,
    `contentType ${encode("application/pdf")}`,
    `cacheControl ${encode("3600")}`,
  ].join(",");
}

function publicReference() {
  return `GD-${randomBytes(2).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

async function managedFetch(input, init, label) {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  } catch {
    fail(`PPO03C3_${label}_REQUEST_FAILED`);
  }
}

function isReservation(value, { internal = false } = {}) {
  const row = one(value, "PPO03C3_RESERVATION");
  const item = row.items?.[0];
  if (!row.session_id || !item?.item_id || !item.object_path?.startsWith(`cargas/v1/${row.session_id}/${item.item_id}/`)
    || item.expected_size !== PAYLOAD_SIZE || item.normalized_mime !== "application/pdf"
    || (internal && !["interno_pedido", "avance", "final_entrega"].includes(item.visibility))) {
    fail("PPO03C3_RESERVATION_SHAPE_INVALID");
  }
  return { ...row, item };
}

async function login(client, credentials, label) {
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.session || !data.user) fail(`PPO03C3_${label}_LOGIN_FAILED`);
  return data;
}

async function requireRpcRejection(operation, label) {
  const { error } = await operation();
  if (!error) fail(`PPO03C3_${label}_WAS_ALLOWED`);
}

async function requireTusRejection(response, label) {
  if (response.status === 201) fail(`PPO03C3_${label}_WAS_ALLOWED`);
}

async function postTus(endpoint, path, apiKey, { accessToken, signature } = {}) {
  const headers = {
    apikey: apiKey,
    "Tus-Resumable": "1.0.0",
    "Upload-Length": String(PAYLOAD_SIZE),
    "Upload-Metadata": metadata(path),
    "x-upsert": "false",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (signature) headers["x-signature"] = signature;
  return managedFetch(endpoint, { method: "POST", headers }, "TUS_POST");
}

async function transferWithBrowser(page, { endpoint, path, apiKey, accessToken, signature, label }) {
  const result = await page.evaluate(async (input) => {
    const failRequest = (code) => ({ ok: false, code });
    const headers = {
      apikey: input.apiKey,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(input.payloadSize),
      "Upload-Metadata": input.metadata,
      "x-upsert": "false",
    };
    if (input.accessToken) headers.Authorization = `Bearer ${input.accessToken}`;
    if (input.signature) headers["x-signature"] = input.signature;

    let created;
    try {
      created = await fetch(input.endpoint, { method: "POST", headers });
    } catch {
      return failRequest("POST_REQUEST_FAILED");
    }
    if (created.status !== 201) return failRequest(`POST_STATUS_${created.status}`);
    const location = created.headers.get("location");
    if (!location) return failRequest("LOCATION_MISSING");
    const uploadUrl = new URL(location, input.endpoint).toString();
    const payload = new Uint8Array(input.payloadSize);
    const partHeaders = {
      apikey: input.apiKey,
      "Tus-Resumable": "1.0.0",
      "Content-Type": "application/offset+octet-stream",
    };
    if (input.accessToken) partHeaders.Authorization = `Bearer ${input.accessToken}`;
    if (input.signature) partHeaders["x-signature"] = input.signature;

    const patch = async (offset, body) => {
      try {
        const response = await fetch(uploadUrl, {
          method: "PATCH",
          headers: { ...partHeaders, "Upload-Offset": String(offset) },
          body,
        });
        return { status: response.status, offset: Number(response.headers.get("upload-offset")) };
      } catch {
        return null;
      }
    };
    const first = await patch(0, payload.subarray(0, input.firstChunkSize));
    if (!first) return failRequest("PATCH_REQUEST_FAILED");
    if (first.status !== 204 || first.offset !== input.firstChunkSize) return failRequest("PATCH_OFFSET_INVALID");

    let head;
    try {
      head = await fetch(uploadUrl, { method: "HEAD", headers: partHeaders });
    } catch {
      return failRequest("HEAD_REQUEST_FAILED");
    }
    const resumedOffset = Number(head.headers.get("upload-offset"));
    if (head.status !== 200 || resumedOffset !== input.firstChunkSize) return failRequest("HEAD_OFFSET_INVALID");
    const completed = await patch(resumedOffset, payload.subarray(resumedOffset));
    if (!completed) return failRequest("FINAL_PATCH_REQUEST_FAILED");
    if (completed.status !== 204 || completed.offset !== input.payloadSize) return failRequest("COMPLETION_OFFSET_INVALID");
    return { ok: true };
  }, {
    endpoint,
    path,
    apiKey,
    accessToken,
    signature,
    payloadSize: PAYLOAD_SIZE,
    firstChunkSize: FIRST_CHUNK_SIZE,
    metadata: metadata(path),
  });
  if (!result.ok) fail(`PPO03C3_${label}_${result.code}`);
}

async function assertNotEnumerable(client, label) {
  const { data, error } = await client.storage.from(BUCKET).list("cargas/v1", { limit: 10 });
  if (!error && (data?.length ?? 0) > 0) fail(`PPO03C3_${label}_STAGED_VISIBLE`);
}

async function assertDownloadRejected(client, path, label) {
  const { error } = await client.storage.from(BUCKET).download(path);
  if (!error) fail(`PPO03C3_${label}_STAGED_DOWNLOAD_WAS_ALLOWED`);
}

async function cleanupObject(client, path) {
  if (!path) return true;
  const { error } = await client.storage.from(BUCKET).remove([path]);
  return !error;
}

async function cleanupFixture(client, table, id) {
  if (!id) return true;
  const { error } = await client.from(table).delete().eq("id", id);
  return !error;
}

async function main() {
  const config = getConfig();
  const credentials = getQaCredentials();
  const anon = makeClient(config);
  const admin = makeClient(config);
  const unassigned = makeClient(config);
  const capability = randomBytes(32).toString("base64url");
  const capabilityHash = createHash("sha256").update(capability).digest("hex");
  const endpoints = storageEndpoints(config.url);
  const fixtures = { publicSolicitudId: null, publicPath: null, internalPedidoId: null, internalPath: null };
  let cleanup = { publicObject: false, internalObject: false, publicMetadata: false, internalMetadata: false };
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("about:blank");
    const [adminLogin, unassignedLogin] = await Promise.all([
      login(admin, credentials.admin, "ADMIN"),
      login(unassigned, credentials.unassigned, "UNAUTHORIZED"),
    ]);
    if (adminLogin.user.id === unassignedLogin.user.id) fail("PPO03C3_UNAUTHORIZED_IDENTITY_NOT_DISTINCT");
    console.log("managed_qa_identities_ready=true");

    const { data: service, error: serviceError } = await anon
      .from("tipos_servicio")
      .select("id")
      .eq("is_publicly_available", true)
      .eq("workflow_type", "encargo")
      .limit(1)
      .maybeSingle();
    if (serviceError || !service) fail("PPO03C3_PUBLIC_ENCARGO_SERVICE_MISSING");

    const { data: publicData, error: publicError } = await anon.rpc(
      "crear_solicitud_publica_con_reserva_carga",
      {
        p_public_reference: publicReference(),
        p_service_id: service.id,
        p_client_name: `${FIXTURE_PREFIX} public`,
        p_client_phone: "5550000000",
        p_client_email: "ppo03c3@example.invalid",
        p_description: "Fixture HTTPS descartable del gate administrado.",
        p_public_token_hash: capabilityHash,
        p_items: descriptor("ppo-03c3-public"),
      },
    );
    if (publicError) fail("PPO03C3_PUBLIC_RESERVATION_FAILED");
    const publicReservation = isReservation(publicData);
    fixtures.publicSolicitudId = publicReservation.solicitud_id;
    fixtures.publicPath = publicReservation.item.object_path;
    console.log("managed_public_reservation=true");

    const { data: authorization, error: authorizationError } = await anon.rpc(
      "autorizar_firma_carga_publica",
      {
        p_session_id: publicReservation.session_id,
        p_item_id: publicReservation.item.item_id,
        p_public_token: capability,
      },
    );
    const authorized = one(authorization, "PPO03C3_PUBLIC_AUTHORIZATION");
    if (authorizationError || authorized.object_path !== fixtures.publicPath
      || authorized.expected_size !== PAYLOAD_SIZE || authorized.normalized_mime !== "application/pdf") {
      fail("PPO03C3_PUBLIC_AUTHORIZATION_FAILED");
    }
    await requireRpcRejection(() => anon.rpc("autorizar_firma_carga_publica", {
      p_session_id: publicReservation.session_id,
      p_item_id: publicReservation.item.item_id,
      p_public_token: randomBytes(32).toString("base64url"),
    }), "PUBLIC_INVALID_CAPABILITY");

    const { data: signed, error: signedError } = await anon.storage
      .from(BUCKET)
      .createSignedUploadUrl(fixtures.publicPath, { upsert: false });
    if (signedError || !signed?.token) fail("PPO03C3_PUBLIC_SIGNED_TOKEN_FAILED");
    console.log("managed_public_signing=true");

    await requireTusRejection(await postTus(endpoints.regular, fixtures.publicPath, config.key), "PUBLIC_REGULAR_ANON_TUS");
    await requireTusRejection(await postTus(endpoints.signed, fixtures.publicPath, config.key), "PUBLIC_SIGNED_TUS_NO_SIGNATURE");
    await requireTusRejection(await postTus(endpoints.signed, fixtures.publicPath, config.key, { signature: "invalid" }), "PUBLIC_SIGNED_TUS_INVALID_SIGNATURE");
    await transferWithBrowser(page, {
      endpoint: endpoints.signed,
      path: fixtures.publicPath,
      apiKey: config.key,
      signature: signed.token,
      label: "PUBLIC_TUS",
    });
    console.log("managed_public_tus_post_patch_head_resume=true");

    await assertNotEnumerable(anon, "ANON_PUBLIC");
    await assertNotEnumerable(unassigned, "AUTH_PUBLIC");
    await assertDownloadRejected(anon, fixtures.publicPath, "ANON_PUBLIC");
    await assertDownloadRejected(unassigned, fixtures.publicPath, "AUTH_PUBLIC");
    console.log("managed_public_staged_isolation=true");

    const { data: publicFinalizeData, error: publicFinalizeError } = await anon.rpc("finalizar_carga_publica", {
      p_session_id: publicReservation.session_id,
      p_item_id: publicReservation.item.item_id,
      p_public_token: capability,
    });
    const publicFinalize = one(publicFinalizeData, "PPO03C3_PUBLIC_FINALIZE");
    if (publicFinalizeError || publicFinalize.result !== "committed" || publicFinalize.item_status !== "committed"
      || publicFinalize.session_status !== "completed" || !publicFinalize.archivo_id) {
      fail("PPO03C3_PUBLIC_FINALIZE_INVALID");
    }
    const { data: publicRetryData, error: publicRetryError } = await anon.rpc("finalizar_carga_publica", {
      p_session_id: publicReservation.session_id,
      p_item_id: publicReservation.item.item_id,
      p_public_token: capability,
    });
    const publicRetry = one(publicRetryData, "PPO03C3_PUBLIC_RETRY");
    if (publicRetryError || publicRetry.result !== "already_committed" || publicRetry.archivo_id !== publicFinalize.archivo_id) {
      fail("PPO03C3_PUBLIC_RETRY_NOT_IDEMPOTENT");
    }
    const { data: committedMetadata, error: committedMetadataError } = await admin
      .from("archivos")
      .select("id, visibility")
      .eq("id", publicFinalize.archivo_id)
      .maybeSingle();
    if (committedMetadataError || !committedMetadata || committedMetadata.visibility !== "cliente_solicitud") {
      fail("PPO03C3_PUBLIC_COMMITTED_METADATA_NOT_ACCESSIBLE");
    }
    const { error: committedDirectReadError } = await admin.storage.from(BUCKET).download(fixtures.publicPath);
    console.log(`managed_public_committed_direct_storage_read=${committedDirectReadError ? "server_signed_route_required" : "available"}`);
    console.log("managed_public_finalize_retry=true");

    const { data: pedidoData, error: pedidoError } = await admin.rpc("crear_pedido_manual", {
      p_service_id: service.id,
      p_cliente_id: null,
      p_title: `${FIXTURE_PREFIX} internal`,
      p_description: "Fixture HTTPS descartable del gate administrado.",
      p_priority: "normal",
      p_estimated_delivery_date: null,
      p_total_amount: 0,
    });
    const pedido = one(pedidoData, "PPO03C3_INTERNAL_PEDIDO");
    if (pedidoError || !pedido.pedido_id) fail("PPO03C3_INTERNAL_PEDIDO_CREATE_FAILED");
    fixtures.internalPedidoId = pedido.pedido_id;
    await requireRpcRejection(() => unassigned.rpc("reservar_carga_pedido", {
      p_pedido_id: fixtures.internalPedidoId,
      p_items: descriptor("ppo-03c3-unauthorized"),
    }), "INTERNAL_FOREIGN_PEDIDO_RESERVATION");
    console.log("managed_internal_reservation_and_negative=true");

    const { data: internalData, error: internalError } = await admin.rpc("reservar_carga_pedido", {
      p_pedido_id: fixtures.internalPedidoId,
      p_items: descriptor("ppo-03c3-internal"),
    });
    if (internalError) fail("PPO03C3_INTERNAL_RESERVATION_FAILED");
    const internalReservation = isReservation(internalData, { internal: true });
    fixtures.internalPath = internalReservation.item.object_path;
    await requireTusRejection(await postTus(endpoints.regular, fixtures.internalPath, config.key), "INTERNAL_TUS_WITHOUT_JWT");
    await transferWithBrowser(page, {
      endpoint: endpoints.regular,
      path: fixtures.internalPath,
      apiKey: config.key,
      accessToken: adminLogin.session.access_token,
      label: "INTERNAL_TUS",
    });
    console.log("managed_internal_tus_post_patch_head_resume=true");
    await assertNotEnumerable(anon, "ANON_INTERNAL");
    await assertNotEnumerable(unassigned, "AUTH_INTERNAL");
    await assertDownloadRejected(anon, fixtures.internalPath, "ANON_INTERNAL");
    await assertDownloadRejected(unassigned, fixtures.internalPath, "AUTH_INTERNAL");
    console.log("managed_internal_staged_isolation=true");

    const { data: internalFinalizeData, error: internalFinalizeError } = await admin.rpc("finalizar_carga_pedido", {
      p_session_id: internalReservation.session_id,
      p_item_id: internalReservation.item.item_id,
    });
    const internalFinalize = one(internalFinalizeData, "PPO03C3_INTERNAL_FINALIZE");
    if (internalFinalizeError || internalFinalize.result !== "committed" || internalFinalize.item_status !== "committed"
      || internalFinalize.session_status !== "completed" || !internalFinalize.archivo_id) {
      fail("PPO03C3_INTERNAL_FINALIZE_INVALID");
    }
    const { data: internalRetryData, error: internalRetryError } = await admin.rpc("finalizar_carga_pedido", {
      p_session_id: internalReservation.session_id,
      p_item_id: internalReservation.item.item_id,
    });
    const internalRetry = one(internalRetryData, "PPO03C3_INTERNAL_RETRY");
    if (internalRetryError || internalRetry.result !== "already_committed" || internalRetry.archivo_id !== internalFinalize.archivo_id) {
      fail("PPO03C3_INTERNAL_RETRY_NOT_IDEMPOTENT");
    }
    console.log("managed_internal_finalize_retry=true");

  } finally {
    cleanup = {
      publicObject: await cleanupObject(admin, fixtures.publicPath),
      internalObject: await cleanupObject(admin, fixtures.internalPath),
      publicMetadata: await cleanupFixture(admin, "solicitudes", fixtures.publicSolicitudId),
      internalMetadata: await cleanupFixture(admin, "pedidos", fixtures.internalPedidoId),
    };
    const cleanupCompleted = Object.values(cleanup).every(Boolean);
    console.log(`cleanup_completed=${cleanupCompleted}`);
    if (!cleanupCompleted) console.log("cleanup_residue_requires_documentation=true");
    await Promise.allSettled([admin.auth.signOut(), unassigned.auth.signOut()]);
    await browser?.close();
  }

}

main().catch((error) => {
  const code = error instanceof Error && /^PPO03C3_[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "PPO03C3_MANAGED_GATE_FAILED";
  console.error(code);
  process.exitCode = 1;
});
