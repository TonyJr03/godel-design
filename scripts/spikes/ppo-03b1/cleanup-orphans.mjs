import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

const execFileAsync = promisify(execFile);
const BUCKET = "godel-files";

function localEnv() {
  if (!existsSync(".env.local")) throw new Error("ENV_LOCAL_MISSING");
  const values = new Map();
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const separator = line.indexOf("=");
    values.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, ""));
  }
  return values;
}

function required(values, name) {
  const value = values.get(name);
  if (!value) throw new Error(`${name}_MISSING`);
  return value;
}

function dockerArgs(extra) {
  const projectId = readFileSync("supabase/config.toml", "utf8").match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m)?.[1];
  if (!projectId) throw new Error("PROJECT_ID_MISSING");
  return ["exec", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-t", "-A", ...extra];
}

async function sql(text) {
  return execFileAsync("docker", dockerArgs(["-c", text]), { windowsHide: true });
}

function escapeSql(value) {
  return value.replaceAll("'", "''");
}

async function main() {
  const env = localEnv();
  const client = createClient(
    required(env, "NEXT_PUBLIC_SUPABASE_URL"),
    required(env, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { persistSession: false } },
  );
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email: required(env, "GODEL_TEST_ADMIN_EMAIL"),
    password: required(env, "GODEL_TEST_ADMIN_PASSWORD"),
  });
  if (authError || !auth.user) throw new Error("ADMIN_LOGIN_FAILED");

  const { stdout } = await sql("select name from storage.objects where bucket_id = 'godel-files' and name like 'cargas/v1/%' order by name;");
  const paths = stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  if (paths.length === 0) {
    console.log("orphan_cleanup_removed=0");
    return;
  }

  const parsed = paths.map((path) => {
    const match = path.match(/^cargas\/v1\/([0-9a-f-]{36})\/([0-9a-f-]{36})\/([0-9a-f]{32,128})-([a-z0-9][a-z0-9_-]{0,118}\.(?:pdf|jpg|jpeg|png|webp|doc|docx|zip|rar|cdr))$/);
    if (!match) throw new Error("UNEXPECTED_CARGAS_PATH");
    return { path, sessionId: match[1], itemId: match[2], safeName: match[4] };
  });
  const { data: service, error: serviceError } = await client.from("tipos_servicio").select("id").limit(1).single();
  if (serviceError || !service) throw new Error("SERVICE_MISSING");
  const pedidoId = randomUUID();

  try {
    const { error: pedidoError } = await client.from("pedidos").insert({
      id: pedidoId,
      service_id: service.id,
      title: "Fixture PPO-03B.1 orphan cleanup",
      description: "Reserva temporal para eliminar staged huérfano.",
      created_by: auth.user.id,
    });
    if (pedidoError) throw new Error("CLEANUP_PEDIDO_CREATE_FAILED");

    for (const [index, item] of parsed.entries()) {
      await sql(`
        insert into public.archivo_carga_sesiones (id, pedido_id, created_by, expires_at)
        values ('${item.sessionId}', '${pedidoId}', '${auth.user.id}', now() + interval '5 minutes');
        insert into public.archivo_carga_items (id, session_id, sort_order, object_path, original_name, normalized_mime, expected_size, visibility)
        values ('${item.itemId}', '${item.sessionId}', ${index % 10}, '${escapeSql(item.path)}', '${item.safeName}', 'application/pdf', 1, 'interno_pedido');
      `);
    }

    const { error: removeError } = await client.storage.from(BUCKET).remove(paths);
    if (removeError) throw new Error("STORAGE_API_REMOVE_FAILED");
    const { stdout: remaining } = await sql("select count(*) from storage.objects where bucket_id = 'godel-files' and name like 'cargas/v1/%';");
    if (Number(remaining.trim()) !== 0) throw new Error("STORAGE_OBJECTS_REMAIN");
    console.log(`orphan_cleanup_removed=${paths.length}`);
  } finally {
    await sql(`delete from public.archivo_carga_sesiones where pedido_id = '${pedidoId}'; delete from public.pedidos where id = '${pedidoId}';`).catch(() => {});
    await client.auth.signOut();
  }
}

main().catch((error) => {
  console.error(`PPO03B1_ORPHAN_CLEANUP_FAILED_${error instanceof Error ? error.message : "unknown"}`);
  process.exitCode = 1;
});
