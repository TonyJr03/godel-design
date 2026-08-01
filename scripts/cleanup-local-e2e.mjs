import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const SCOPE_CONFIG = Object.freeze({
  servicios: {
    sqlPath: "scripts/sql/cleanup-local-e2e-servicios.sql",
    markerPattern: /^E2E_CLEANUP_OK scope=servicios deleted=\d+$/,
  },
  clientes: {
    sqlPath: "scripts/sql/cleanup-local-e2e-clientes.sql",
    markerPattern: /^E2E_CLEANUP_OK scope=clientes deleted=\d+$/,
  },
});
const RUN_ID_PATTERN = /^\d{14}-[0-9a-f]{8}$/;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;
const DOCKER_CONTEXT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const DOCKER_LOCAL_ENDPOINT_PATTERN = /^(npipe|unix):\/\//i;
const DOCKER_REMOTE_ENDPOINT_PATTERN = /^(tcp|ssh|https?):\/\//i;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const EMAIL_PATTERN =
  /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/gi;
const MAX_DIAGNOSTIC_LENGTH = 1200;

class E2eCleanupError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "E2eCleanupError";
    this.cause = cause;
  }
}

function fail(message, cause) {
  throw new E2eCleanupError(message, cause);
}

function safeReadText(relativePath, context) {
  try {
    return readFileSync(resolve(process.cwd(), relativePath), "utf8");
  } catch (error) {
    fail("No se pudo leer un archivo requerido de cleanup E2E local.", {
      context,
      code: error?.code,
      name: error?.name,
    });
  }
}

function readLocalEnvFile() {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return new Map();
  }

  return new Map(
    safeReadText(".env.local", "e2eCleanup.env")
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

function readLocalEnv(name) {
  return process.env[name]?.trim() || readLocalEnvFile().get(name)?.trim() || "";
}

function parseArgs(args) {
  const parsed = new Map();

  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];

    if (name === "--all") {
      fail("--all no esta permitido para cleanup E2E local.");
    }

    if (name !== "--scope" && name !== "--run-id") {
      fail("Argumento inesperado para cleanup E2E local.");
    }

    if (parsed.has(name)) {
      fail("Argumento duplicado para cleanup E2E local.");
    }

    const value = args[index + 1];

    if (!value || value.startsWith("--")) {
      fail("Falta un valor obligatorio para cleanup E2E local.");
    }

    parsed.set(name, value.trim());
    index += 1;
  }

  const scope = parsed.get("--scope");
  const runId = parsed.get("--run-id");

  if (!scope) {
    fail("--scope es obligatorio.");
  }

  if (!Object.hasOwn(SCOPE_CONFIG, scope)) {
    fail("Scope de cleanup E2E desconocido.");
  }

  const scopeConfig = SCOPE_CONFIG[scope];

  if (!runId) {
    fail("--run-id es obligatorio.");
  }

  if (!RUN_ID_PATTERN.test(runId)) {
    fail("El run ID debe usar el formato YYYYMMDDHHMMSS-xxxxxxxx.");
  }

  return {
    scope,
    scopeConfig,
    runId,
    ownershipPrefix: `E2E-${scope}-${runId}`,
  };
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
    fail("NEXT_PUBLIC_SUPABASE_URL debe apuntar exactamente a localhost o 127.0.0.1.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    fail("NEXT_PUBLIC_SUPABASE_URL debe usar http o https local.");
  }

  const port = Number(url.port);

  if (!url.port || !Number.isInteger(port) || port < 1 || port > 65535) {
    fail("NEXT_PUBLIC_SUPABASE_URL usa un puerto invalido.");
  }

  return url.toString().replace(/\/$/, "");
}

function readSupabaseProjectId() {
  const config = safeReadText("supabase/config.toml", "e2eCleanup.config");
  const match = config.match(/^\s*project_id\s*=\s*"([^"]+)"\s*$/m);

  if (!match?.[1]) {
    fail("No se pudo resolver el project_id local de Supabase.");
  }

  if (!PROJECT_ID_PATTERN.test(match[1])) {
    fail("El project_id local de Supabase usa caracteres no permitidos.");
  }

  return match[1];
}

function sanitizeDiagnostic(value, sensitiveValues = []) {
  let text = String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (const sensitiveValue of sensitiveValues) {
    if (typeof sensitiveValue !== "string" || sensitiveValue.length < 4) {
      continue;
    }

    text = text.replaceAll(sensitiveValue, "[redacted]");
  }

  text = text
    .replace(JWT_PATTERN, "[redacted-jwt]")
    .replace(UUID_PATTERN, "[redacted-uuid]")
    .replace(EMAIL_PATTERN, "[redacted-email]");

  if (text.length > MAX_DIAGNOSTIC_LENGTH) {
    return `${text.slice(0, MAX_DIAGNOSTIC_LENGTH)}...`;
  }

  return text;
}

function formatProcessDiagnostic({ context, code, stdout, stderr }, sensitiveValues) {
  const diagnostic = sanitizeDiagnostic(stderr || stdout, sensitiveValues);
  const suffix = diagnostic ? `: ${diagnostic}` : "";

  return `${context} exit=${code}${suffix}`;
}

async function runProcess(command, args, options = {}) {
  const { input = "", context = command, sensitiveValues = [] } = options;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      shell: false,
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
        new E2eCleanupError("No se pudo ejecutar tooling local.", {
          context,
          code: error?.code,
          name: error?.name,
        }),
      );
    });

    child.on("close", (code) => {
      resolvePromise({
        code,
        stdout,
        stderr,
        detail: formatProcessDiagnostic(
          { context, code, stdout, stderr },
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

async function resolveLocalDockerContext(sensitiveValues) {
  const contextResult = await runRequiredProcess("docker", ["context", "show"], {
    context: "docker.context",
    errorMessage: "No se pudo verificar el contexto Docker local.",
    sensitiveValues,
  });
  const contextName = contextResult.stdout.trim();

  if (!contextName || !DOCKER_CONTEXT_PATTERN.test(contextName)) {
    fail("El contexto Docker local usa un nombre no permitido.");
  }

  const endpointResult = await runRequiredProcess(
    "docker",
    [
      "--context",
      contextName,
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

async function assertRunningDbContainer(contextName, containerName, sensitiveValues) {
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

async function runCleanupSql({
  contextName,
  containerName,
  scope,
  scopeConfig,
  runId,
  ownershipPrefix,
  sensitiveValues,
}) {
  const sql = safeReadText(scopeConfig.sqlPath, "e2eCleanup.sql");
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
      `scope=${scope}`,
      "-v",
      `run_id=${runId}`,
      "-v",
      `ownership_prefix=${ownershipPrefix}`,
      "-X",
      "-q",
      "-t",
      "-A",
      "-f",
      "-",
    ],
    {
      context: "e2eCleanup.psql",
      errorMessage: "No se pudo ejecutar el cleanup E2E local.",
      input: sql,
      sensitiveValues,
    },
  );
  const marker = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => scopeConfig.markerPattern.test(line));

  if (!marker) {
    fail("No se confirmo el marcador de cleanup E2E local.", {
      context: "e2eCleanup.marker",
      detail: "missing_marker",
    });
  }

  console.log(marker);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = validateLocalSupabaseUrl(
    readLocalEnv("NEXT_PUBLIC_SUPABASE_URL"),
  );
  const sensitiveValues = [supabaseUrl];
  const projectId = readSupabaseProjectId();
  const containerName = `supabase_db_${projectId}`;
  const contextName = await resolveLocalDockerContext(sensitiveValues);

  await assertRunningDbContainer(contextName, containerName, sensitiveValues);
  await runCleanupSql({
    contextName,
    containerName,
    ...args,
    sensitiveValues,
  });
}

main().catch((error) => {
  const cause = error?.cause;
  const details = [
    cause?.context,
    cause?.name,
    cause?.code,
    cause?.detail,
    cause?.status,
  ]
    .filter(Boolean)
    .join(" ");

  console.error(
    `[qa:e2e:cleanup] Error: ${error.message}${details ? ` (${details})` : ""}`,
  );
  process.exitCode = 1;
});
