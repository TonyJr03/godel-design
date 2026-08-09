import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const BUCKET = "godel-files";
const MEBIBYTE = 1024 * 1024;
const PAYLOAD_SIZE = 7 * MEBIBYTE;
const FIRST_CHUNK_SIZE = 6 * MEBIBYTE;
const FIXTURE_NAME = "Fixture PPO-03B.2";

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

function getManagedConfig() {
  const url = readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (!url || !key) fail("PPO03B2_MANAGED_PUBLIC_CONFIG_MISSING");

  const hostname = new URL(url).hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    fail("PPO03B2_MANAGED_CONFIG_POINTS_TO_LOCAL");
  }

  return { url, key };
}

function getQaCredentials() {
  const email = readEnvValue("GODEL_MANAGED_TEST_ADMIN_EMAIL");
  const password = readEnvValue("GODEL_MANAGED_TEST_ADMIN_PASSWORD");
  return email && password ? { email, password } : null;
}

function makeClient(config) {
  return createClient(config.url, config.key, {
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

function metadata(path, contentType = "application/pdf") {
  const encode = (value) => Buffer.from(value).toString("base64");
  return [
    `bucketName ${encode(BUCKET)}`,
    `objectName ${encode(path)}`,
    `contentType ${encode(contentType)}`,
    `cacheControl ${encode("3600")}`,
  ].join(",");
}

function reservedPath() {
  return `cargas/v1/${randomUUID()}/${randomUUID()}/${randomBytes(32).toString("hex")}-ppo-03b2.pdf`;
}

function legacyFolderForStatus(status) {
  if (["creado", "solicitud_recibida", "en_revision"].includes(status)) return "internos";
  if (status === "en_produccion") return "avances";
  if (status === "listo_entrega") return "finales";
  return null;
}

function isAccessError(error) {
  const value = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return error?.code === "42501" || /permission|privilege|not authorized|row-level security/.test(value);
}

async function requireAccessRejection(operation, label) {
  const { error } = await operation();
  if (!error) fail(`PPO03B2_${label}_WAS_ALLOWED`);
  if (!isAccessError(error)) fail(`PPO03B2_${label}_NOT_REJECTED_BY_ACCESS`);
  return true;
}

async function requireHttpRejection(response, label) {
  if (response.ok) fail(`PPO03B2_${label}_WAS_ALLOWED`);
  return true;
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
  return fetch(endpoint, { method: "POST", headers });
}

async function patchTus(uploadUrl, payload, offset, length, apiKey, accessToken) {
  const response = await fetch(uploadUrl, {
    method: "PATCH",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Offset": String(offset),
      "Content-Type": "application/offset+octet-stream",
    },
    body: payload.subarray(offset, offset + length),
  });
  if (response.status !== 204) fail(`PPO03B2_TUS_PATCH_STATUS_${response.status}`);
  return Number(response.headers.get("upload-offset"));
}

async function transferLegacyTus(endpoint, path, apiKey, accessToken) {
  const payload = randomBytes(PAYLOAD_SIZE);
  const created = await postTus(endpoint, path, apiKey, { accessToken });
  if (created.status !== 201) fail(`PPO03B2_LEGACY_TUS_POST_STATUS_${created.status}`);
  const location = created.headers.get("location");
  if (!location) fail("PPO03B2_LEGACY_TUS_LOCATION_MISSING");
  const uploadUrl = new URL(location, endpoint).toString();
  const firstOffset = await patchTus(uploadUrl, payload, 0, FIRST_CHUNK_SIZE, apiKey, accessToken);
  const head = await fetch(uploadUrl, {
    method: "HEAD",
    headers: { apikey: apiKey, Authorization: `Bearer ${accessToken}`, "Tus-Resumable": "1.0.0" },
  });
  if (head.status !== 200) fail(`PPO03B2_LEGACY_TUS_HEAD_STATUS_${head.status}`);
  const resumedOffset = Number(head.headers.get("upload-offset"));
  if (firstOffset !== FIRST_CHUNK_SIZE || resumedOffset !== FIRST_CHUNK_SIZE) {
    fail("PPO03B2_LEGACY_TUS_RESUME_OFFSET_INVALID");
  }
  const finalOffset = await patchTus(uploadUrl, payload, resumedOffset, PAYLOAD_SIZE - resumedOffset, apiKey, accessToken);
  if (finalOffset !== PAYLOAD_SIZE) fail("PPO03B2_LEGACY_TUS_FINAL_OFFSET_INVALID");
  return true;
}

async function objectExists(client, path) {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(BUCKET).list(folder);
  if (error || !data?.some((entry) => entry.name === name)) fail("PPO03B2_OBJECT_NOT_VERIFIABLE");
}

async function removeObjectIfPresent(client, path) {
  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data, error } = await client.storage.from(BUCKET).list(folder);
  if (error) fail("PPO03B2_OBJECT_CLEANUP_LIST_FAILED");
  if (!data?.some((entry) => entry.name === name)) return;
  const { error: removeError } = await client.storage.from(BUCKET).remove([path]);
  if (removeError) fail("PPO03B2_OBJECT_CLEANUP_FAILED");
  const { data: remaining, error: verifyError } = await client.storage.from(BUCKET).list(folder);
  if (verifyError || remaining?.some((entry) => entry.name === name)) {
    fail("PPO03B2_OBJECT_CLEANUP_RESIDUE");
  }
}

function publicReference() {
  return `GD-${randomBytes(2).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
}

async function createSolicitudFixture(client) {
  const { data: service, error: serviceError } = await client
    .from("tipos_servicio")
    .select("id, workflow_type")
    .eq("is_publicly_available", true)
    .limit(1)
    .maybeSingle();
  if (serviceError || !service) fail("PPO03B2_PUBLIC_SERVICE_MISSING");

  const id = randomUUID();
  const { error } = await client.from("solicitudes").insert({
    id,
    public_reference: publicReference(),
    client_name: FIXTURE_NAME,
    client_phone: "5550000000",
    service_id: service.id,
    workflow_type: service.workflow_type,
    description: "Fixture HTTPS descartable PPO-03B.2.",
  });
  if (error) fail("PPO03B2_SOLICITUD_FIXTURE_CREATE_FAILED");
  return id;
}

async function deleteSolicitudFixture(client, id) {
  if (!id) return;
  const { error } = await client.from("solicitudes").delete().eq("id", id);
  if (error) fail("PPO03B2_SOLICITUD_FIXTURE_CLEANUP_FAILED");
  const { data, error: verifyError } = await client.from("solicitudes").select("id").eq("id", id);
  if (verifyError || data?.length) fail("PPO03B2_SOLICITUD_FIXTURE_RESIDUE");
}

async function findOrCreatePedidoFixture(client) {
  const { data, error } = await client.from("pedidos").select("id, status").order("created_at", { ascending: false }).limit(25);
  if (error || !data) fail("PPO03B2_PEDIDO_LOOKUP_FAILED");
  const existing = data.find((pedido) => legacyFolderForStatus(pedido.status));
  if (existing) return { id: existing.id, folder: legacyFolderForStatus(existing.status), created: false };

  const { data: service, error: serviceError } = await client.from("tipos_servicio").select("id").limit(1).maybeSingle();
  if (serviceError || !service) fail("PPO03B2_PEDIDO_SERVICE_MISSING");
  const { data: created, error: createError } = await client.rpc("crear_pedido_manual", {
    p_service_id: service.id,
    p_cliente_id: null,
    p_title: "Fixture PPO-03B.2",
    p_description: "Fixture HTTPS descartable para TUS legacy.",
    p_priority: "normal",
    p_estimated_delivery_date: null,
    p_total_amount: 0,
  });
  if (createError || !created?.[0]?.pedido_id) fail("PPO03B2_PEDIDO_FIXTURE_CREATE_FAILED");
  return { id: created[0].pedido_id, folder: "internos", created: true };
}

async function deletePedidoFixture(client, id) {
  const { error } = await client.from("pedidos").delete().eq("id", id);
  if (error) fail("PPO03B2_PEDIDO_FIXTURE_CLEANUP_FAILED");
  const { data, error: verifyError } = await client.from("pedidos").select("id").eq("id", id);
  if (verifyError || data?.length) fail("PPO03B2_PEDIDO_FIXTURE_RESIDUE");
}

async function cleanupStrandedFixtures(client) {
  const { data: solicitudes, error: solicitudesError } = await client
    .from("solicitudes").select("id").eq("client_name", FIXTURE_NAME).limit(50);
  if (solicitudesError || !solicitudes) fail("PPO03B2_CLEANUP_SOLICITUD_LOOKUP_FAILED");
  for (const solicitud of solicitudes) {
    const folder = `solicitudes/${solicitud.id}/originales`;
    const { data: objects, error: objectsError } = await client.storage.from(BUCKET).list(folder);
    if (objectsError) fail("PPO03B2_CLEANUP_OBJECT_LOOKUP_FAILED");
    const paths = (objects ?? []).filter((entry) => entry.name.startsWith("ppo-03b2-")).map((entry) => `${folder}/${entry.name}`);
    if (paths.length) {
      const { error } = await client.storage.from(BUCKET).remove(paths);
      if (error) fail("PPO03B2_CLEANUP_OBJECTS_FAILED");
    }
    await deleteSolicitudFixture(client, solicitud.id);
  }
}

async function runAnonControlPlane(client) {
  const sessionId = randomUUID();
  const itemId = randomUUID();
  const path = `cargas/v1/${sessionId}/${itemId}/${randomBytes(32).toString("hex")}-ppo-03b2.pdf`;
  return {
    sessionsSelect: await requireAccessRejection(() => client.from("archivo_carga_sesiones").select("id").limit(1), "ANON_UPLOAD_SESSIONS_SELECT"),
    itemsSelect: await requireAccessRejection(() => client.from("archivo_carga_items").select("id").limit(1), "ANON_UPLOAD_ITEMS_SELECT"),
    sessionsInsert: await requireAccessRejection(() => client.from("archivo_carga_sesiones").insert({
      id: sessionId, solicitud_id: randomUUID(), public_token_hash: "a".repeat(64), expires_at: new Date(Date.now() + 60000).toISOString(),
    }), "ANON_UPLOAD_SESSIONS_INSERT"),
    itemsInsert: await requireAccessRejection(() => client.from("archivo_carga_items").insert({
      id: itemId, session_id: sessionId, sort_order: 0, object_path: path, original_name: "ppo-03b2.pdf", normalized_mime: "application/pdf", expected_size: 1, visibility: "cliente_solicitud",
    }), "ANON_UPLOAD_ITEMS_INSERT"),
  };
}

async function runAuthenticatedControlPlane(client) {
  const sessionId = randomUUID();
  const itemId = randomUUID();
  const path = `cargas/v1/${sessionId}/${itemId}/${randomBytes(32).toString("hex")}-ppo-03b2.pdf`;
  return {
    sessionsSelect: await requireAccessRejection(() => client.from("archivo_carga_sesiones").select("id").limit(1), "AUTH_UPLOAD_SESSIONS_SELECT"),
    itemsSelect: await requireAccessRejection(() => client.from("archivo_carga_items").select("id").limit(1), "AUTH_UPLOAD_ITEMS_SELECT"),
    sessionsInsert: await requireAccessRejection(() => client.from("archivo_carga_sesiones").insert({
      id: sessionId, pedido_id: randomUUID(), created_by: randomUUID(), expires_at: new Date(Date.now() + 60000).toISOString(),
    }), "AUTH_UPLOAD_SESSIONS_INSERT"),
    itemsInsert: await requireAccessRejection(() => client.from("archivo_carga_items").insert({
      id: itemId, session_id: sessionId, sort_order: 0, object_path: path, original_name: "ppo-03b2.pdf", normalized_mime: "application/pdf", expected_size: 1, visibility: "interno_pedido",
    }), "AUTH_UPLOAD_ITEMS_INSERT"),
  };
}

async function runReservedRootNegatives(config, anon, accessToken) {
  const { regular, signed } = storageEndpoints(config.url);
  const path = reservedPath();
  const { error: signError } = await anon.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
  if (!signError) fail("PPO03B2_UNSIGNED_ROOT_SIGN_WAS_ALLOWED");
  const regularAnon = await requireHttpRejection(await postTus(regular, path, config.key), "ANON_REGULAR_TUS");
  const signedWithoutSignature = await requireHttpRejection(await postTus(signed, path, config.key), "SIGNED_ENDPOINT_WITHOUT_SIGNATURE");
  const signedInvalidSignature = await requireHttpRejection(await postTus(signed, path, config.key, { signature: "invalid-signature" }), "SIGNED_ENDPOINT_INVALID_SIGNATURE");
  const authenticatedWithoutReservation = accessToken
    ? await requireHttpRejection(await postTus(regular, reservedPath(), config.key, { accessToken }), "AUTH_ROOT_WITHOUT_RESERVATION")
    : null;
  return { signRejected: true, regularAnon, signedWithoutSignature, signedInvalidSignature, authenticatedWithoutReservation };
}

async function runLegacyAuthenticated(config, client, accessToken) {
  const pedido = await findOrCreatePedidoFixture(client);
  const path = `pedidos/${pedido.id}/${pedido.folder}/ppo-03b2-${randomUUID()}.pdf`;
  try {
    const transfer = await transferLegacyTus(storageEndpoints(config.url).regular, path, config.key, accessToken);
    await objectExists(client, path);
    return transfer;
  } finally {
    await removeObjectIfPresent(client, path);
    if (pedido.created) await deletePedidoFixture(client, pedido.id);
  }
}

async function runLegacyPublicZip(client, anon) {
  const solicitudId = await createSolicitudFixture(client);
  const path = `solicitudes/${solicitudId}/originales/ppo-03b2-${randomUUID()}.zip`;
  try {
    const { error } = await anon.storage.from(BUCKET).upload(path, randomBytes(128), {
      contentType: "application/x-zip-compressed",
      upsert: false,
    });
    if (error) fail("PPO03B2_LEGACY_ZIP_UPLOAD_FAILED");
    await objectExists(client, path);
    return true;
  } finally {
    await removeObjectIfPresent(client, path);
    await deleteSolicitudFixture(client, solicitudId);
  }
}

async function runListingCheck(client, label) {
  const { error, data } = await client.storage.from(BUCKET).list("cargas/v1", { limit: 1 });
  const visibleObjects = data?.length ?? 0;
  if (!error && visibleObjects > 0) fail(`PPO03B2_${label.toUpperCase()}_CARGAS_V1_VISIBLE_OBJECTS`);
  return { accessRejected: Boolean(error), visibleObjects, label };
}

async function main() {
  const config = getManagedConfig();
  const anon = makeClient(config);
  const credentials = getQaCredentials();
  let authenticated = null;
  let accessToken = null;
  let result;

  try {
    const anonControlPlane = await runAnonControlPlane(anon);
    if (credentials) {
      authenticated = makeClient(config);
      const { data, error } = await authenticated.auth.signInWithPassword(credentials);
      if (error || !data.session) fail("PPO03B2_AUTHENTICATED_QA_LOGIN_FAILED");
      accessToken = data.session.access_token;
    }

    const reservedRoot = await runReservedRootNegatives(config, anon, accessToken);
    const authenticatedControlPlane = authenticated ? await runAuthenticatedControlPlane(authenticated) : null;
    const legacyAuthenticated = authenticated ? await runLegacyAuthenticated(config, authenticated, accessToken) : null;
    const legacyZip = authenticated ? await runLegacyPublicZip(authenticated, anon) : null;
    const anonListing = await runListingCheck(anon, "anon");
    const authenticatedListing = authenticated ? await runListingCheck(authenticated, "authenticated") : null;

    result = { anonControlPlane, authenticatedControlPlane, reservedRoot, legacyAuthenticated, legacyZip, anonListing, authenticatedListing };
  } finally {
    if (authenticated) {
      try {
        await cleanupStrandedFixtures(authenticated);
      } finally {
        await authenticated.auth.signOut();
      }
    }
  }

  if (!result) fail("PPO03B2_RESULT_MISSING");
  console.log("anon_upload_sessions_select_rejected=true");
  console.log("anon_upload_items_select_rejected=true");
  console.log("anon_upload_sessions_insert_rejected=true");
  console.log("anon_upload_items_insert_rejected=true");
  console.log(`authenticated_control_plane=${result.authenticatedControlPlane ? "executed" : "not_executed_missing_normal_qa_credentials"}`);
  console.log(`authenticated_upload_sessions_select_rejected=${result.authenticatedControlPlane?.sessionsSelect ?? "not_executed_missing_normal_qa_credentials"}`);
  console.log(`authenticated_upload_items_select_rejected=${result.authenticatedControlPlane?.itemsSelect ?? "not_executed_missing_normal_qa_credentials"}`);
  console.log(`authenticated_upload_sessions_insert_rejected=${result.authenticatedControlPlane?.sessionsInsert ?? "not_executed_missing_normal_qa_credentials"}`);
  console.log(`authenticated_upload_items_insert_rejected=${result.authenticatedControlPlane?.itemsInsert ?? "not_executed_missing_normal_qa_credentials"}`);
  console.log(`cargas_v1_unsigned_sign_rejected=${result.reservedRoot.signRejected}`);
  console.log(`anon_regular_tus_rejected=${result.reservedRoot.regularAnon}`);
  console.log(`signed_without_signature_rejected=${result.reservedRoot.signedWithoutSignature}`);
  console.log(`signed_invalid_signature_rejected=${result.reservedRoot.signedInvalidSignature}`);
  console.log(`authenticated_cargas_v1_without_reservation=${result.reservedRoot.authenticatedWithoutReservation === null ? "not_executed_missing_normal_qa_credentials" : "rejected"}`);
  console.log(`legacy_authenticated_tus=${result.legacyAuthenticated === null ? "not_executed_missing_normal_qa_credentials" : "true"}`);
  console.log(`legacy_public_zip=${result.legacyZip === null ? "not_executed_missing_normal_qa_credentials" : "true"}`);
  console.log(`anon_cargas_v1_listing_access_rejected=${result.anonListing.accessRejected}`);
  console.log(`anon_cargas_v1_visible_objects=${result.anonListing.visibleObjects}`);
  console.log(`authenticated_cargas_v1_listing_access_rejected=${result.authenticatedListing?.accessRejected ?? "not_executed_missing_normal_qa_credentials"}`);
  console.log(`authenticated_cargas_v1_visible_objects=${result.authenticatedListing?.visibleObjects ?? "not_executed_missing_normal_qa_credentials"}`);
  console.log("cleanup_completed=true");
}

main().catch((error) => {
  console.error(`PPO03B2_MANAGED_FAILED_${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 1;
});
