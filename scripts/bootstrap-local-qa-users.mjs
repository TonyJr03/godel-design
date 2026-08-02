import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

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
const BOOTSTRAP_PROFILES_SQL_PATH = "scripts/sql/bootstrap-local-qa-profiles.sql";
const DOCKER_LOCAL_ENDPOINT_PATTERN = /^(npipe|unix):\/\//i;
const DOCKER_REMOTE_ENDPOINT_PATTERN = /^(tcp|ssh|https?):\/\//i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const SENSITIVE_VALUE_MIN_LENGTH = 4;
const MAX_DIAGNOSTIC_LENGTH = 1200;
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
const DIAGNOSTIC_UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const DIAGNOSTIC_EMAIL_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
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
    context: typeof error.context === "string" ? error.context : undefined,
    name: typeof error.name === "string" ? error.name : undefined,
    code: typeof error.code === "string" ? error.code : undefined,
    detail: typeof error.detail === "string" ? error.detail : undefined,
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSensitiveValues(config, additionalValues = []) {
  return [
    config.supabaseUrl,
    config.publishableKey,
    config.secretKey,
    ...config.fixtures.flatMap((fixture) => [fixture.email, fixture.password]),
    ...additionalValues,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length >= SENSITIVE_VALUE_MIN_LENGTH)
    .sort((a, b) => b.length - a.length);
}

function sanitizeDiagnostic(value, sensitiveValues) {
  let text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (const sensitiveValue of sensitiveValues) {
    text = text.replace(
      new RegExp(escapeRegExp(sensitiveValue), "g"),
      "[redacted]",
    );
  }

  text = text
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(DIAGNOSTIC_UUID_PATTERN, "[redacted-uuid]")
    .replace(DIAGNOSTIC_EMAIL_PATTERN, "[redacted-email]");

  if (text.length > MAX_DIAGNOSTIC_LENGTH) {
    return `${text.slice(0, MAX_DIAGNOSTIC_LENGTH)}...`;
  }

  return text;
}

function formatProcessDiagnostic(
  { command, code, stderr, stdout },
  sensitiveValues,
) {
  const diagnostic = sanitizeDiagnostic(stderr || stdout, sensitiveValues);
  const suffix = diagnostic ? `: ${diagnostic}` : "";

  return `${command} exit=${code}${suffix}`;
}

async function runProcess(command, args, options = {}) {
  const { input = "", sensitiveValues = [] } = options;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      rejectPromise(
        new BootstrapError("No se pudo ejecutar tooling local.", {
          context: command,
          name: error?.name,
          code: error?.code,
        }),
      );
    });

    child.on("close", (code) => {
      resolvePromise({
        code,
        stdout,
        stderr,
        detail: formatProcessDiagnostic(
          { command, code, stderr, stdout },
          sensitiveValues,
        ),
      });
    });

    child.stdin.end(input);
  });
}

async function runRequiredProcess(command, args, options = {}) {
  const result = await runProcess(command, args, options);

  if (result.code !== 0) {
    fail(options.errorMessage ?? "No se pudo ejecutar tooling local.", {
      context: options.context ?? command,
      detail: result.detail,
      status: result.code,
    });
  }

  return result;
}

function readSupabaseProjectId() {
  const configPath = resolve(process.cwd(), "supabase/config.toml");
  const config = readFileSync(configPath, "utf8");
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m);

  if (!match?.[1]) {
    fail("No se pudo resolver el project_id local de Supabase.");
  }

  if (!PROJECT_ID_PATTERN.test(match[1])) {
    fail("El project_id local de Supabase usa caracteres no permitidos.");
  }

  return match[1];
}

async function resolveLocalDockerContext(sensitiveValues) {
  const contextResult = await runRequiredProcess(
    "docker",
    ["context", "show"],
    {
      context: "docker.context",
      errorMessage: "No se pudo verificar el contexto Docker local.",
      sensitiveValues,
    },
  );
  const contextName = contextResult.stdout.trim();

  if (!contextName) {
    fail("No se pudo verificar el contexto Docker local.");
  }

  const endpointResult = await runRequiredProcess(
    "docker",
    [
      "context",
      "inspect",
      contextName,
      "--format",
      "{{.Endpoints.docker.Host}}",
    ],
    {
      context: "docker.context",
      errorMessage: "No se pudo verificar el endpoint Docker local.",
      sensitiveValues,
    },
  );
  const endpoint = endpointResult.stdout.trim();

  if (!endpoint) {
    fail("No se pudo verificar el endpoint Docker local.");
  }

  if (
    DOCKER_REMOTE_ENDPOINT_PATTERN.test(endpoint) ||
    !DOCKER_LOCAL_ENDPOINT_PATTERN.test(endpoint)
  ) {
    fail("El contexto Docker debe usar un endpoint local npipe o unix.");
  }

  return contextName;
}

async function assertRunningDbContainer(
  contextName,
  containerName,
  sensitiveValues,
) {
  const result = await runRequiredProcess(
    "docker",
    [
      "--context",
      contextName,
      "inspect",
      "--format",
      "{{.State.Running}}",
      containerName,
    ],
    {
      context: "docker.inspect",
      errorMessage: "No se pudo verificar el contenedor local de Postgres.",
      sensitiveValues,
    },
  );

  if (result.stdout.trim() !== "true") {
    fail("El contenedor local de Postgres no esta en ejecucion.", {
      context: "docker.inspect",
      detail: "running=false",
    });
  }
}

async function runLocalQaProfilesBootstrap(config, userIds) {
  const adminId = validateAuthUser({ id: userIds.get("admin") });
  const supervisorId = validateAuthUser({ id: userIds.get("supervisor") });
  const workerId = validateAuthUser({ id: userIds.get("trabajador") });
  const sensitiveValues = getSensitiveValues(config, [
    adminId,
    supervisorId,
    workerId,
  ]);
  const projectId = readSupabaseProjectId();
  const containerName = `supabase_db_${projectId}`;
  const sql = readFileSync(
    resolve(process.cwd(), BOOTSTRAP_PROFILES_SQL_PATH),
    "utf8",
  );

  const contextName = await resolveLocalDockerContext(sensitiveValues);

  await assertRunningDbContainer(contextName, containerName, sensitiveValues);

  const result = await runRequiredProcess(
    "docker",
    [
      "--context",
      contextName,
      "exec",
      "-i",
      containerName,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      "VERBOSITY=terse",
      "-v",
      `admin_id=${adminId}`,
      "-v",
      `supervisor_id=${supervisorId}`,
      "-v",
      `worker_id=${workerId}`,
      "-X",
      "-q",
      "-t",
      "-A",
      "-f",
      "-",
    ],
    {
      context: "LocalQaProfilesError",
      errorMessage: "No se pudieron preparar los perfiles QA locales.",
      input: sql,
      sensitiveValues,
    },
  );

  if (
    !result.stdout
      .split(/\r?\n/)
      .some((line) => line.trim() === "QA_PROFILES_OK")
  ) {
    fail("No se confirmo el bootstrap local de perfiles QA.", {
      context: "LocalQaProfilesError",
      detail: "missing_marker",
    });
  }

  log("QA_PROFILES_OK");
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

  await runLocalQaProfilesBootstrap(env, userIds);

  for (const fixture of env.fixtures) {
    await verifyLogin(env, fixture);
  }

  log("Inicio de sesion verificado para los tres roles.");
  log("Bootstrap local completado.");
}

main().catch((error) => {
  const sanitized = getSanitizedError(error.cause);
  const detail = [
    sanitized.context,
    sanitized.name,
    sanitized.code,
    sanitized.detail,
    sanitized.status,
  ]
    .filter(Boolean)
    .join(" ");

  console.error(
    `[qa:bootstrap] Error: ${error.message}${detail ? ` (${detail})` : ""}`,
  );
  process.exitCode = 1;
});
