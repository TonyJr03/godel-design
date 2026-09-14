import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);
const BUCKET = "godel-files";
const PAYLOAD_SIZE = 7 * 1024 * 1024;
const FIRST_CHUNK_SIZE = 6 * 1024 * 1024;

function localEnv() {
  if (!existsSync(".env.local")) throw new Error("PPO03C1_ENV_LOCAL_MISSING");
  const values = new Map();
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""));
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`PPO03C1_ENV_${name}_MISSING`);
  return value;
}

function one(value, label) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) throw new Error(`${label}_EMPTY_RESULT`);
  return row;
}

function tusMetadata(path) {
  const encode = (value) => Buffer.from(value).toString("base64");
  return [
    `bucketName ${encode(BUCKET)}`,
    `objectName ${encode(path)}`,
    `contentType ${encode("application/pdf")}`,
    `cacheControl ${encode("3600")}`,
  ].join(",");
}

function assertStatus(response, expected, label) {
  if (response.status !== expected) throw new Error(`${label}_STATUS_${response.status}`);
}

async function transferWithResume({ endpoint, path, apiKey, payload, authorization, signature }) {
  const baseHeaders = {
    apikey: apiKey,
    "Tus-Resumable": "1.0.0",
    "Upload-Length": String(PAYLOAD_SIZE),
    "Upload-Metadata": tusMetadata(path),
    "x-upsert": "false",
  };
  if (authorization) baseHeaders.Authorization = `Bearer ${authorization}`;
  if (signature) baseHeaders["x-signature"] = signature;
  const created = await fetch(endpoint, { method: "POST", headers: baseHeaders });
  assertStatus(created, 201, "TUS_POST");
  const location = created.headers.get("location");
  if (!location) throw new Error("TUS_LOCATION_MISSING");
  const uploadUrl = new URL(location, endpoint).toString();

  const transfer = async (offset, body) => {
    const headers = {
      apikey: apiKey, "Tus-Resumable": "1.0.0",
      "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream",
    };
    if (authorization) headers.Authorization = `Bearer ${authorization}`;
    if (signature) headers["x-signature"] = signature;
    const response = await fetch(uploadUrl, { method: "PATCH", headers, body });
    assertStatus(response, 204, "TUS_PATCH");
    return Number(response.headers.get("upload-offset"));
  };
  const firstOffset = await transfer(0, payload.subarray(0, FIRST_CHUNK_SIZE));
  const headHeaders = { apikey: apiKey, "Tus-Resumable": "1.0.0" };
  if (authorization) headHeaders.Authorization = `Bearer ${authorization}`;
  if (signature) headHeaders["x-signature"] = signature;
  const head = await fetch(uploadUrl, { method: "HEAD", headers: headHeaders });
  assertStatus(head, 200, "TUS_HEAD");
  const resumedOffset = Number(head.headers.get("upload-offset"));
  if (firstOffset !== FIRST_CHUNK_SIZE || resumedOffset !== FIRST_CHUNK_SIZE) {
    throw new Error("TUS_RESUME_OFFSET_INVALID");
  }
  if (await transfer(resumedOffset, payload.subarray(resumedOffset)) !== PAYLOAD_SIZE) {
    throw new Error("TUS_COMPLETION_OFFSET_INVALID");
  }
  return true;
}

async function psql(sql) {
  const projectId = readFileSync("supabase/config.toml", "utf8")
    .match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (!projectId) throw new Error("PPO03C1_PROJECT_ID_MISSING");
  return execFileAsync("docker", [
    "exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres",
    "-v", "ON_ERROR_STOP=1", "-q", "-c", sql,
  ], { windowsHide: true });
}

async function notEnumerable(client, prefix, label) {
  const { data, error } = await client.storage.from(BUCKET).list(prefix, { limit: 10 });
  if (!error && (data?.length ?? 0) > 0) throw new Error(`${label}_STAGING_VISIBLE`);
}

async function main() {
  const env = localEnv();
  const url = required(env, "NEXT_PUBLIC_SUPABASE_URL");
  const apiKey = required(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const email = required(env, "GODEL_TEST_ADMIN_EMAIL");
  const password = required(env, "GODEL_TEST_ADMIN_PASSWORD");
  const resumable = `${new URL(url).origin}/storage/v1/upload/resumable`;
  const anon = createClient(url, apiKey, { auth: { persistSession: false } });
  const internal = createClient(url, apiKey, { auth: { persistSession: false } });
  const ids = { solicitud: null, pedido: randomUUID(), publicSession: null, publicItem: null, internalSession: null, internalItem: null, publicArchivo: null, internalArchivo: null };
  const paths = { public: null, internal: null };
  const payload = randomBytes(PAYLOAD_SIZE);
  const capability = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(capability).digest("hex");
  const reference = `GD-${randomBytes(2).toString("hex").toUpperCase()}-${randomBytes(2).toString("hex").toUpperCase()}`;
  const descriptor = (originalName, safeName) => [{
    original_name: originalName, safe_name: safeName,
    normalized_mime: "application/pdf", expected_size: PAYLOAD_SIZE,
  }];

  try {
    const { data: login, error: loginError } = await internal.auth.signInWithPassword({ email, password });
    if (loginError || !login.session || !login.user) throw new Error("PPO03C1_ADMIN_LOGIN_FAILED");
    const { data: service, error: serviceError } = await internal.from("tipos_servicio")
      .select("id").eq("is_publicly_available", true).eq("workflow_type", "encargo").limit(1).single();
    if (serviceError || !service) throw new Error("PPO03C1_SERVICE_MISSING");

    const { data: publicReservationData, error: publicReservationError } = await anon.rpc(
      "crear_solicitud_publica_con_reserva_carga",
      {
        p_public_reference: reference, p_service_id: service.id,
        p_client_name: "PPO-03C public smoke", p_client_phone: "0000000000",
        p_client_email: "ppo03c@example.invalid", p_description: "Reserva transitoria TUS publica.",
        p_public_token_hash: hash,
        p_items: descriptor("Factura PPO-03C.pdf", "factura-ppo-03c.pdf"),
      },
    );
    if (publicReservationError) throw new Error(`PPO03C1_PUBLIC_RESERVATION_FAILED_${publicReservationError.message}`);
    const publicReservation = one(publicReservationData, "PPO03C1_PUBLIC_RESERVATION");
    ids.solicitud = publicReservation.solicitud_id;
    ids.publicSession = publicReservation.session_id;
    ids.publicItem = publicReservation.items?.[0]?.item_id;
    paths.public = publicReservation.items?.[0]?.object_path;
    if (!ids.solicitud || !ids.publicSession || !ids.publicItem || !paths.public) throw new Error("PPO03C1_PUBLIC_SHAPE_INVALID");

    const { data: authorization, error: authorizationError } = await anon.rpc("autorizar_firma_carga_publica", {
      p_session_id: ids.publicSession, p_item_id: ids.publicItem, p_public_token: capability,
    });
    if (authorizationError || one(authorization, "PPO03C1_AUTHORIZATION").object_path !== paths.public) {
      throw new Error("PPO03C1_PUBLIC_AUTHORIZATION_FAILED");
    }

    const { error: pedidoError } = await internal.from("pedidos").insert({
      id: ids.pedido, service_id: service.id, title: "PPO-03C internal smoke",
      description: "Reserva transitoria TUS interna.", created_by: login.user.id,
    });
    if (pedidoError) throw new Error(`PPO03C1_PEDIDO_FAILED_${pedidoError.message}`);

    const { data: internalReservationData, error: internalReservationError } = await internal.rpc("reservar_carga_pedido", {
      p_pedido_id: ids.pedido, p_items: descriptor("Informe PPO-03C.pdf", "informe-ppo-03c.pdf"),
    });
    if (internalReservationError) throw new Error(`PPO03C1_INTERNAL_RESERVATION_FAILED_${internalReservationError.message}`);
    const internalReservation = one(internalReservationData, "PPO03C1_INTERNAL_RESERVATION");
    ids.internalSession = internalReservation.session_id;
    ids.internalItem = internalReservation.items?.[0]?.item_id;
    paths.internal = internalReservation.items?.[0]?.object_path;
    if (!ids.internalSession || !ids.internalItem || !paths.internal) throw new Error("PPO03C1_INTERNAL_SHAPE_INVALID");

    const { data: signed, error: signedError } = await anon.storage.from(BUCKET).createSignedUploadUrl(paths.public, { upsert: false });
    if (signedError || !signed?.token) throw new Error("PPO03C1_SIGNED_TOKEN_FAILED");
    await transferWithResume({ endpoint: `${resumable}/sign`, path: paths.public, apiKey, signature: signed.token, payload });
    await transferWithResume({ endpoint: resumable, path: paths.internal, apiKey, authorization: login.session.access_token, payload });
    await notEnumerable(anon, "cargas/v1", "PPO03C1_ANON");
    await notEnumerable(internal, "cargas/v1", "PPO03C1_INTERNAL");
    const { error: anonReadError } = await anon.storage.from(BUCKET).download(paths.public);
    const { error: internalReadError } = await internal.storage.from(BUCKET).download(paths.internal);
    if (!anonReadError || !internalReadError) throw new Error("PPO03C1_STAGED_READ_WAS_ALLOWED");
    const { stdout: staged } = await psql("select concat_ws('|'," +
      "(select count(*) from storage.objects where name in ('" + paths.public + "', '" + paths.internal + "'))," +
      "(select count(*) from public.archivo_carga_items where id in ('" + ids.publicItem + "', '" + ids.internalItem + "') and status = 'reserved')," +
      "(select count(*) from public.archivos where file_path in ('" + paths.public + "', '" + paths.internal + "')));");
    if (!staged.includes("2|2|0")) throw new Error("PPO03C1_STAGED_STATE_INVALID");

    const [publicA, publicB] = await Promise.all([
      anon.rpc("finalizar_carga_publica", { p_session_id: ids.publicSession, p_item_id: ids.publicItem, p_public_token: capability }),
      anon.rpc("finalizar_carga_publica", { p_session_id: ids.publicSession, p_item_id: ids.publicItem, p_public_token: capability }),
    ]);
    if (publicA.error || publicB.error) throw new Error("PPO03C1_PUBLIC_FINALIZE_FAILED");
    ids.publicArchivo = one(publicA.data, "PPO03C1_PUBLIC_FINALIZE").archivo_id;
    if (!ids.publicArchivo || one(publicB.data, "PPO03C1_PUBLIC_FINALIZE_RETRY").archivo_id !== ids.publicArchivo) throw new Error("PPO03C1_PUBLIC_NOT_IDEMPOTENT");
    if (new Set([one(publicA.data, "PPO03C1_PUBLIC_FINALIZE").result, one(publicB.data, "PPO03C1_PUBLIC_FINALIZE_RETRY").result]).size !== 2 || ![one(publicA.data, "PPO03C1_PUBLIC_FINALIZE").result, one(publicB.data, "PPO03C1_PUBLIC_FINALIZE_RETRY").result].every((result) => result === "committed" || result === "already_committed")) throw new Error("PPO03C1_PUBLIC_FINALIZE_RESULT_SET_INVALID");

    const [internalA, internalB] = await Promise.all([
      internal.rpc("finalizar_carga_pedido", { p_session_id: ids.internalSession, p_item_id: ids.internalItem }),
      internal.rpc("finalizar_carga_pedido", { p_session_id: ids.internalSession, p_item_id: ids.internalItem }),
    ]);
    if (internalA.error || internalB.error) throw new Error("PPO03C1_INTERNAL_FINALIZE_FAILED");
    ids.internalArchivo = one(internalA.data, "PPO03C1_INTERNAL_FINALIZE").archivo_id;
    if (!ids.internalArchivo || one(internalB.data, "PPO03C1_INTERNAL_FINALIZE_RETRY").archivo_id !== ids.internalArchivo) throw new Error("PPO03C1_INTERNAL_NOT_IDEMPOTENT");
    if (new Set([one(internalA.data, "PPO03C1_INTERNAL_FINALIZE").result, one(internalB.data, "PPO03C1_INTERNAL_FINALIZE_RETRY").result]).size !== 2 || ![one(internalA.data, "PPO03C1_INTERNAL_FINALIZE").result, one(internalB.data, "PPO03C1_INTERNAL_FINALIZE_RETRY").result].every((result) => result === "committed" || result === "already_committed")) throw new Error("PPO03C1_INTERNAL_FINALIZE_RESULT_SET_INVALID");

    const { stdout } = await psql(`select concat_ws('|',
      (select count(*) from public.archivo_carga_sesiones where id in ('${ids.publicSession}', '${ids.internalSession}') and status = 'completed'),
      (select count(*) from public.archivo_carga_items where id in ('${ids.publicItem}', '${ids.internalItem}') and status = 'committed'),
      (select count(*) from public.archivos where id in ('${ids.publicArchivo}', '${ids.internalArchivo}'))
    );`);
    if (!stdout.includes("2|2|2")) throw new Error("PPO03C1_COMMIT_VERIFICATION_FAILED");
    console.log("public_presigned_tus_post_patch_head_resume=true");
    console.log("internal_tus_post_patch_head_resume=true");
    console.log("staged_objects_non_enumerable=true");
    console.log("concurrent_finalize_idempotent=true");
  } finally {
    const removable = [paths.public, paths.internal].filter(Boolean);
    const removableSql = removable.length
      ? removable.map((path) => "'" + path + "'").join(",")
      : "null";
    if (removable.length) {
      const { error } = await internal.storage.from(BUCKET).remove(removable);
      if (error) throw new Error(`PPO03C1_STORAGE_CLEANUP_FAILED_${error.message}`);
    }
    const { stdout: cleanup } = await psql(`delete from public.archivo_carga_sesiones where id in (${[ids.publicSession, ids.internalSession].filter(Boolean).map((id) => "'" + id + "'").join(",") || "null"});
      delete from public.pedidos where id = '${ids.pedido}';
      delete from public.solicitudes where id = ${ids.solicitud ? "'" + ids.solicitud + "'" : "null"};
      select concat_ws('|',
        (select count(*) from storage.objects where name in (` + removableSql + `)),
        (select count(*) from public.archivo_carga_sesiones where id in (${[ids.publicSession, ids.internalSession].filter(Boolean).map((id) => "'" + id + "'").join(",") || "null"}))
      );`);
    if (!cleanup.includes("0|0")) throw new Error("PPO03C1_CLEANUP_RESIDUE_DETECTED");
    const sessionIdsSql = [ids.publicSession, ids.internalSession]
      .filter(Boolean).map((id) => "'" + id + "'").join(",") || "null";
    const archivoIdsSql = [ids.publicArchivo, ids.internalArchivo]
      .filter(Boolean).map((id) => "'" + id + "'").join(",") || "null";
    const solicitudIdSql = ids.solicitud ? "'" + ids.solicitud + "'" : "null";
    const { stdout: exhaustiveCleanup } = await psql(
      "select concat_ws('|'," +
      "(select count(*) from storage.objects where name in (" + removableSql + "))," +
      "(select count(*) from public.archivo_carga_sesiones where id in (" + sessionIdsSql + "))," +
      "(select count(*) from public.archivo_carga_items where session_id in (" + sessionIdsSql + "))," +
      "(select count(*) from public.archivos where id in (" + archivoIdsSql + "))," +
      "(select count(*) from public.solicitudes where id = " + solicitudIdSql + ")," +
      "(select count(*) from public.pedidos where id = '" + ids.pedido + "')," +
      "(select count(*) from public.solicitud_historial where solicitud_id = " + solicitudIdSql + ")," +
      "(select count(*) from public.pedido_historial where pedido_id = '" + ids.pedido + "'));"
    );
    if (!exhaustiveCleanup.includes("0|0|0|0|0|0|0|0")) {
      throw new Error("PPO03C1_EXHAUSTIVE_CLEANUP_RESIDUE_DETECTED");
    }
    await internal.auth.signOut();
  }
}

main().then(() => console.log("cleanup_completed=true")).catch((error) => {
  console.error(`PPO03C1_SMOKE_FAILED_${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 1;
});
