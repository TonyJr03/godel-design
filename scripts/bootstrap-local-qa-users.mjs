import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import { createClient } from "@supabase/supabase-js";

const REQUIRED_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "GODEL_TEST_ADMIN_EMAIL",
  "GODEL_TEST_ADMIN_PASSWORD",
  "GODEL_TEST_SUPERVISOR_EMAIL",
  "GODEL_TEST_SUPERVISOR_PASSWORD",
  "GODEL_TEST_WORKER_EMAIL",
  "GODEL_TEST_WORKER_PASSWORD",
];

const ROLES = [
  {
    role: "admin",
    label: "Administrador QA",
    emailName: "GODEL_TEST_ADMIN_EMAIL",
    passwordName: "GODEL_TEST_ADMIN_PASSWORD",
    logLabel: "Administrador QA",
    createdBy: null,
  },
  {
    role: "supervisor",
    label: "Supervisor QA",
    emailName: "GODEL_TEST_SUPERVISOR_EMAIL",
    passwordName: "GODEL_TEST_SUPERVISOR_PASSWORD",
    logLabel: "Supervisor QA",
    createdBy: "admin",
  },
  {
    role: "trabajador",
    label: "Trabajador QA",
    emailName: "GODEL_TEST_WORKER_EMAIL",
    passwordName: "GODEL_TEST_WORKER_PASSWORD",
    logLabel: "Trabajador QA",
    createdBy: "admin",
  },
];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const ADMIN_CLIENT_CONFIG = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOWERCASE_PATTERN = /[a-z]/;
const UPPERCASE_PATTERN = /[A-Z]/;
const NUMBER_PATTERN = /\d/;
const ALLOWED_PASSWORD_SYMBOLS =
  "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";

class BootstrapError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "BootstrapError";
    this.cause = cause;
  }
}

function log(message) {
  console.log(`[qa:bootstrap] ${message}`);
}

function fail(message, cause) {
  throw new BootstrapError(message, cause);
}

function getSanitizedError(error) {
  if (!error || typeof error !== "object") {
    return {};
  }

  return {
    name: typeof error.name === "string" ? error.name : undefined,
    code: typeof error.code === "string" ? error.code : undefined,
    status: typeof error.status === "number" ? error.status : undefined,
  };
}

function readLocalEnvFile() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return new Map();
  }

  return new Map(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        const name = line.slice(0, separatorIndex).trim();
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");

        return [name, value];
      }),
  );
}

function readEnvironment() {
  const localEnv = readLocalEnvFile();
  const values = {};

  for (const name of REQUIRED_ENV_NAMES) {
    values[name] = process.env[name]?.trim() || localEnv.get(name)?.trim() || "";
  }

  return values;
}

function validateLocalSupabaseUrl(rawUrl) {
  if (!rawUrl) {
    fail("NEXT_PUBLIC_SUPABASE_URL es obligatoria.");
  }

  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    fail("NEXT_PUBLIC_SUPABASE_URL no es una URL valida.");
  }

  if (!LOCAL_HOSTS.has(url.hostname)) {
    fail("NEXT_PUBLIC_SUPABASE_URL debe apuntar a localhost o 127.0.0.1.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    fail("NEXT_PUBLIC_SUPABASE_URL debe usar http o https local.");
  }

  if (url.port) {
    const port = Number(url.port);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      fail("NEXT_PUBLIC_SUPABASE_URL usa un puerto invalido.");
    }
  }

  return url.toString().replace(/\/$/, "");
}

function hasAllowedPasswordSymbol(password) {
  return [...password].some((character) =>
    ALLOWED_PASSWORD_SYMBOLS.includes(character),
  );
}

function validatePassword(name, password) {
  if (!password) {
    fail(`${name} es obligatoria.`);
  }

  if (password.length < 8 || password.length > 72) {
    fail(`${name} debe tener entre 8 y 72 caracteres.`);
  }

  if (!LOWERCASE_PATTERN.test(password)) {
    fail(`${name} debe incluir una minuscula.`);
  }

  if (!UPPERCASE_PATTERN.test(password)) {
    fail(`${name} debe incluir una mayuscula.`);
  }

  if (!NUMBER_PATTERN.test(password)) {
    fail(`${name} debe incluir un numero.`);
  }

  if (!hasAllowedPasswordSymbol(password)) {
    fail(`${name} debe incluir un simbolo permitido.`);
  }
}

function validateEnvironment(values) {
  for (const name of REQUIRED_ENV_NAMES) {
    if (!values[name]) {
      fail(`${name} es obligatoria.`);
    }
  }

  const supabaseUrl = validateLocalSupabaseUrl(
    values.NEXT_PUBLIC_SUPABASE_URL,
  );

  if (
    values.SUPABASE_SECRET_KEY === values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    fail("SUPABASE_SECRET_KEY debe ser diferente de la publishable key.");
  }

  const normalizedEmails = new Set();

  for (const fixture of ROLES) {
    const email = values[fixture.emailName].trim().toLowerCase();
    const password = values[fixture.passwordName];

    if (!EMAIL_PATTERN.test(email)) {
      fail(`${fixture.emailName} debe tener estructura de correo valida.`);
    }

    if (normalizedEmails.has(email)) {
      fail("Los correos QA deben ser diferentes entre si.");
    }

    normalizedEmails.add(email);
    validatePassword(fixture.passwordName, password);
  }

  return {
    supabaseUrl,
    publishableKey: values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    secretKey: values.SUPABASE_SECRET_KEY,
    fixtures: ROLES.map((fixture) => ({
      ...fixture,
      email: values[fixture.emailName].trim().toLowerCase(),
      password: values[fixture.passwordName],
    })),
  };
}

function createAdminClient({ supabaseUrl, secretKey }) {
  return createClient(supabaseUrl, secretKey, ADMIN_CLIENT_CONFIG);
}

function createPublicClient({ supabaseUrl, publishableKey }) {
  return createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function getSupabaseDbContainerName() {
  const configPath = resolve(process.cwd(), "supabase/config.toml");
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m);

  if (!match?.[1]) {
    fail("No se pudo resolver el project_id local de Supabase.");
  }

  return `supabase_db_${match[1]}`;
}

function quoteSqlLiteral(value) {
  if (value === null) {
    return "null";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

async function runLocalPostgres(sql) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      getSupabaseDbContainerName(),
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-q",
      "-t",
      "-A",
      "-f",
      "-",
    ]);
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      rejectPromise(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout.trim());
        return;
      }

      rejectPromise(
        new BootstrapError("No se pudo ejecutar SQL local para perfiles QA.", {
          name: "LocalPostgresError",
          status: code,
        }),
      );
    });

    child.stdin.end(sql);
  }).catch((error) => {
    if (error instanceof BootstrapError) {
      throw error;
    }

    fail("No se pudo ejecutar SQL local para perfiles QA.", {
      name: error?.name,
      code: error?.code,
      status: error?.exitCode,
    });
  });
}

async function listUsersByEmail(admin, email) {
  const matches = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      fail("No se pudieron listar usuarios Auth.", error);
    }

    matches.push(
      ...data.users.filter(
        (user) => user.email?.trim().toLowerCase() === email,
      ),
    );

    if (!data.nextPage || page >= data.lastPage) {
      break;
    }

    page = data.nextPage;
  }

  return matches;
}

function validateAuthUser(user) {
  if (!user?.id || !UUID_PATTERN.test(user.id)) {
    fail("Auth no devolvio un UUID valido para un usuario QA.");
  }

  return user.id;
}

async function prepareAuthUser(admin, fixture) {
  const matches = await listUsersByEmail(admin, fixture.email);

  if (matches.length > 1) {
    fail("Existe mas de un usuario Auth para un correo QA configurado.");
  }

  if (matches.length === 0) {
    const { data, error } = await admin.auth.admin.createUser({
      email: fixture.email,
      password: fixture.password,
      email_confirm: true,
    });

    if (error) {
      fail(`No se pudo crear ${fixture.logLabel}.`, error);
    }

    return validateAuthUser(data.user);
  }

  const userId = validateAuthUser(matches[0]);
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    password: fixture.password,
    email_confirm: true,
    ban_duration: "none",
  });

  if (error) {
    fail(`No se pudo actualizar ${fixture.logLabel}.`, error);
  }

  const updatedUserId = validateAuthUser(data.user);

  if (updatedUserId !== userId) {
    fail("Auth devolvio un UUID inesperado al actualizar un usuario QA.");
  }

  return userId;
}

async function upsertProfile(admin, fixture, userId, adminUserId) {
  const expectedCreatedBy =
    fixture.createdBy === "admin" ? adminUserId : fixture.createdBy;

  void admin;

  await runLocalPostgres(`
insert into public.perfiles (
  id,
  full_name,
  role,
  is_active,
  must_change_password,
  created_by,
  phone,
  avatar_url
)
values (
  ${quoteSqlLiteral(userId)}::uuid,
  ${quoteSqlLiteral(fixture.label)},
  ${quoteSqlLiteral(fixture.role)}::public.app_role,
  true,
  false,
  ${quoteSqlLiteral(expectedCreatedBy)}::uuid,
  null,
  null
)
on conflict (id) do update
set
  full_name = excluded.full_name,
  role = excluded.role,
  is_active = excluded.is_active,
  must_change_password = excluded.must_change_password,
  created_by = excluded.created_by,
  phone = excluded.phone,
  avatar_url = excluded.avatar_url;
`);
}

async function verifyProfile(admin, fixture, userId, adminUserId) {
  const expectedCreatedBy =
    fixture.createdBy === "admin" ? adminUserId : fixture.createdBy;
  const profileJson = await runLocalPostgres(`
select coalesce(
  jsonb_build_object(
    'id', p.id,
    'full_name', p.full_name,
    'role', p.role,
    'is_active', p.is_active,
    'must_change_password', p.must_change_password,
    'created_by', p.created_by
  )::text,
  ''
)
from public.perfiles as p
where p.id = ${quoteSqlLiteral(userId)}::uuid;
`);

  void admin;

  if (!profileJson) {
    fail(`No se pudo verificar el perfil de ${fixture.logLabel}.`);
  }

  const data = JSON.parse(profileJson);

  if (
    data.id !== userId ||
    data.full_name !== fixture.label ||
    data.role !== fixture.role ||
    data.is_active !== true ||
    data.must_change_password !== false ||
    data.created_by !== expectedCreatedBy
  ) {
    fail(`El perfil de ${fixture.logLabel} no coincide con el contrato QA.`);
  }
}

async function verifyLogin(config, fixture) {
  const supabase = createPublicClient(config);
  const { error } = await supabase.auth.signInWithPassword({
    email: fixture.email,
    password: fixture.password,
  });

  if (error) {
    fail(`No se pudo verificar el inicio de sesion de ${fixture.logLabel}.`, error);
  }

  await supabase.auth.signOut();
}

async function main() {
  const env = validateEnvironment(readEnvironment());
  const admin = createAdminClient(env);
  const userIds = new Map();

  log("Entorno local confirmado.");

  for (const fixture of env.fixtures) {
    const userId = await prepareAuthUser(admin, fixture);
    userIds.set(fixture.role, userId);
    log(`${fixture.logLabel} preparado.`);
  }

  const adminUserId = userIds.get("admin");

  for (const fixture of env.fixtures) {
    await upsertProfile(admin, fixture, userIds.get(fixture.role), adminUserId);
    await verifyProfile(admin, fixture, userIds.get(fixture.role), adminUserId);
  }

  for (const fixture of env.fixtures) {
    await verifyLogin(env, fixture);
  }

  log("Inicio de sesion verificado para los tres roles.");
  log("Bootstrap local completado.");
}

main().catch((error) => {
  const sanitized = getSanitizedError(error.cause);
  const detail = [sanitized.name, sanitized.code, sanitized.status]
    .filter(Boolean)
    .join(" ");

  console.error(
    `[qa:bootstrap] Error: ${error.message}${detail ? ` (${detail})` : ""}`,
  );
  process.exitCode = 1;
});
