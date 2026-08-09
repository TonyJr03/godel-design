import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);
const BUCKET = "godel-files";
const PAYLOAD_SIZE = 7 * 1024 * 1024;
const FIRST_CHUNK_SIZE = 4 * 1024 * 1024;
const TEST_EMAIL_NAME = "GODEL_TEST_ADMIN_EMAIL";
const TEST_PASSWORD_NAME = "GODEL_TEST_ADMIN_PASSWORD";

function readLocalEnv() {
  const values = new Map();

  if (!existsSync(".env.local")) {
    throw new Error("PPO03B1_ENV_LOCAL_MISSING");
  }

  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""));
  }

  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`PPO03B1_ENV_${name}_MISSING`);
  return value;
}

function localStorageEndpoints(url) {
  const origin = new URL(url).origin;
  const regular = `${origin}/storage/v1/upload/resumable`;
  return { regular, signed: `${regular}/sign` };
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

function assertStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label}_STATUS_${response.status}`);
  }
}

async function createUpload({ endpoint, path, apiKey, authorization, signature }) {
  const headers = {
    apikey: apiKey,
    "Tus-Resumable": "1.0.0",
    "Upload-Length": String(PAYLOAD_SIZE),
    "Upload-Metadata": metadata(path),
    "x-upsert": "false",
  };

  if (authorization) headers.Authorization = `Bearer ${authorization}`;
  if (signature) headers["x-signature"] = signature;

  const response = await fetch(endpoint, { method: "POST", headers });
  assertStatus(response, 201, "TUS_POST");
  const location = response.headers.get("location");

  if (!location) throw new Error("TUS_POST_LOCATION_MISSING");
  return new URL(location, endpoint).toString();
}

async function patchUpload(uploadUrl, payload, offset, length, apiKey, authorization, signature) {
  const headers = {
    apikey: apiKey,
    "Tus-Resumable": "1.0.0",
    "Upload-Offset": String(offset),
    "Content-Type": "application/offset+octet-stream",
  };

  if (authorization) headers.Authorization = `Bearer ${authorization}`;
  if (signature) headers["x-signature"] = signature;
  const response = await fetch(uploadUrl, {
    method: "PATCH",
    headers,
    body: payload.subarray(offset, offset + length),
  });
  assertStatus(response, 204, "TUS_PATCH");
  return Number(response.headers.get("upload-offset"));
}

async function headUpload(uploadUrl, apiKey, authorization, signature) {
  const headers = { apikey: apiKey, "Tus-Resumable": "1.0.0" };
  if (authorization) headers.Authorization = `Bearer ${authorization}`;
  if (signature) headers["x-signature"] = signature;
  const response = await fetch(uploadUrl, { method: "HEAD", headers });
  assertStatus(response, 200, "TUS_HEAD");
  return Number(response.headers.get("upload-offset"));
}

async function transferWithResume(input) {
  const uploadUrl = await createUpload(input);
  const firstOffset = await patchUpload(
    uploadUrl,
    input.payload,
    0,
    FIRST_CHUNK_SIZE,
    input.apiKey,
    input.authorization,
    input.signature,
  );
  const resumedOffset = await headUpload(
    uploadUrl,
    input.apiKey,
    input.authorization,
    input.signature,
  );

  if (firstOffset !== FIRST_CHUNK_SIZE || resumedOffset !== FIRST_CHUNK_SIZE) {
    throw new Error("TUS_RESUME_OFFSET_INVALID");
  }

  const completedOffset = await patchUpload(
    uploadUrl,
    input.payload,
    resumedOffset,
    PAYLOAD_SIZE - resumedOffset,
    input.apiKey,
    input.authorization,
    input.signature,
  );

  if (completedOffset !== PAYLOAD_SIZE) throw new Error("TUS_COMPLETION_OFFSET_INVALID");
  return { post: true, patch: true, head: true, resumed: true, completed: true };
}

async function psql(sql) {
  const projectId = readFileSync("supabase/config.toml", "utf8").match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (!projectId) throw new Error("PPO03B1_PROJECT_ID_MISSING");
  await execFileAsync("docker", [
    "exec",
    "-i",
    `supabase_db_${projectId}`,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    "-c",
    sql,
  ], { windowsHide: true });
}

async function main() {
  const env = readLocalEnv();
  const url = required(env, "NEXT_PUBLIC_SUPABASE_URL");
  const apiKey = required(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const email = required(env, TEST_EMAIL_NAME);
  const password = required(env, TEST_PASSWORD_NAME);
  const { regular, signed } = localStorageEndpoints(url);
  const admin = createClient(url, apiKey, { auth: { persistSession: false } });
  const anon = createClient(url, apiKey, { auth: { persistSession: false } });
  const ids = {
    pedido: randomUUID(),
    solicitud: randomUUID(),
    internalSession: randomUUID(),
    internalItem: randomUUID(),
    publicSession: randomUUID(),
    publicItem: randomUUID(),
  };
  const nonce = () => randomBytes(32).toString("hex");
  const paths = {
    internal: `cargas/v1/${ids.internalSession}/${ids.internalItem}/${nonce()}-informe-tecnico.pdf`,
    public: `cargas/v1/${ids.publicSession}/${ids.publicItem}/${nonce()}-factura-agosto-2026.pdf`,
  };
  const payload = randomBytes(PAYLOAD_SIZE);

  try {
    const { data: auth, error: authError } = await admin.auth.signInWithPassword({ email, password });
    if (authError || !auth.session || !auth.user) throw new Error("PPO03B1_ADMIN_LOGIN_FAILED");
    const accessToken = auth.session.access_token;
    const { data: service, error: serviceError } = await admin
      .from("tipos_servicio")
      .select("id")
      .limit(1)
      .single();
    if (serviceError || !service) throw new Error("PPO03B1_SERVICE_MISSING");

    const { error: pedidoError } = await admin.from("pedidos").insert({
      id: ids.pedido,
      service_id: service.id,
      title: "Fixture PPO-03B.1 TUS",
      description: "Fixture transitorio de smoke TUS.",
      created_by: auth.user.id,
    });
    if (pedidoError) throw new Error("PPO03B1_PEDIDO_FIXTURE_FAILED");

    const { error: solicitudError } = await admin.from("solicitudes").insert({
      id: ids.solicitud,
      client_name: "Fixture PPO-03B.1",
      client_phone: "0000000000",
      service_id: service.id,
      description: "Fixture transitorio de TUS firmado.",
    });
    if (solicitudError) throw new Error("PPO03B1_SOLICITUD_FIXTURE_FAILED");

    await psql(`
      insert into public.archivo_carga_sesiones (id, pedido_id, created_by, expires_at)
      values ('${ids.internalSession}', '${ids.pedido}', '${auth.user.id}', now() + interval '15 minutes');
      insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
      values ('${ids.internalItem}', '${ids.internalSession}', 0, '${paths.internal}', 'Informe Técnico.pdf', 'application/pdf', ${PAYLOAD_SIZE}, 'interno_pedido');
      insert into public.archivo_carga_sesiones (id, solicitud_id, public_token_hash, expires_at)
      values ('${ids.publicSession}', '${ids.solicitud}', repeat('a', 64), now() + interval '15 minutes');
      insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
      values ('${ids.publicItem}', '${ids.publicSession}', 0, '${paths.public}', 'Factura Agosto 2026.pdf', 'application/pdf', ${PAYLOAD_SIZE}, 'cliente_solicitud');
    `);

    const regularAnon = await fetch(regular, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Tus-Resumable": "1.0.0",
        "Upload-Length": String(PAYLOAD_SIZE),
        "Upload-Metadata": metadata(paths.public),
        "x-upsert": "false",
      },
    });
    if (regularAnon.ok) throw new Error("PPO03B1_ANON_REGULAR_TUS_WAS_ALLOWED");

    const internal = await transferWithResume({
      endpoint: regular,
      path: paths.internal,
      apiKey,
      authorization: accessToken,
      payload,
    });

    const { data: signedUpload, error: signedError } = await anon.storage
      .from(BUCKET)
      .createSignedUploadUrl(paths.public, { upsert: false });
    if (signedError || !signedUpload?.token) throw new Error("PPO03B1_SIGNED_TOKEN_FAILED");

    const publicTransfer = await transferWithResume({
      endpoint: signed,
      path: paths.public,
      apiKey,
      signature: signedUpload.token,
      payload,
    });

    await psql(`
      do $$ begin
        if (select count(*) from storage.objects where bucket_id = '${BUCKET}' and name in ('${paths.internal}', '${paths.public}')) <> 2 then
          raise exception 'PPO03B1_STORAGE_OBJECT_MISSING';
        end if;
      end $$;
    `);

    console.log("internal_tus_post_patch_head_resume=true");
    console.log("public_presigned_tus_post_patch_head_resume=true");
    console.log("anon_regular_tus_rejected=true");
    console.log("presigned_tus_path=/storage/v1/upload/resumable/sign");
    console.log("cleanup_completed=true");
    void internal;
    void publicTransfer;
  } finally {
    const { error: removeError } = await admin.storage.from(BUCKET).remove([
      paths.internal,
      paths.public,
    ]);

    if (removeError) throw new Error("PPO03B1_STORAGE_CLEANUP_FAILED");

    await psql(`
      delete from public.archivo_carga_sesiones where id in ('${ids.internalSession}', '${ids.publicSession}');
      delete from public.pedidos where id = '${ids.pedido}';
      delete from public.solicitudes where id = '${ids.solicitud}';
    `);
    await admin.auth.signOut();
  }
}

main().catch((error) => {
  console.error(`PPO03B1_SMOKE_FAILED_${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 1;
});
