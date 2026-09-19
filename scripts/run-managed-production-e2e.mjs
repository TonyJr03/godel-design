import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { request } from "@playwright/test";

const MANAGED_ENV_PATH = ".env.managed.local";
const MANAGED_QA_ENV_PATH = ".env.managed.qa.local";
const TEMPORARY_DIRECTORY_PREFIX = "godel-managed-qa-";

export const MANAGED_PUBLIC_ENV_NAMES = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
]);

export const MANAGED_QA_ENV_NAMES = Object.freeze([
  "GODEL_TEST_ADMIN_EMAIL",
  "GODEL_TEST_ADMIN_PASSWORD",
  "GODEL_TEST_SUPERVISOR_EMAIL",
  "GODEL_TEST_SUPERVISOR_PASSWORD",
  "GODEL_TEST_WORKER_EMAIL",
  "GODEL_TEST_WORKER_PASSWORD",
]);

export const FORBIDDEN_CHILD_ENV_NAMES = Object.freeze([
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVER_URL",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_PROJECT_ID",
  "POSTGRES_PASSWORD",
  "JWT_KEYS",
  "JWT_JWKS",
  "SERVICE_ROLE_KEY",
  "VERCEL_AUTOMATION_BYPASS_SECRET",
]);

const OPERATING_SYSTEM_ENV_NAMES = Object.freeze([
  "ALLUSERSPROFILE",
  "APPDATA",
  "CI",
  "COMSPEC",
  "HOME",
  "HOMEDRIVE",
  "HOMEPATH",
  "LANG",
  "LOCALAPPDATA",
  "NO_COLOR",
  "NUMBER_OF_PROCESSORS",
  "OS",
  "PATH",
  "PATHEXT",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PROCESSOR_ARCHITECTURE",
  "PROGRAMDATA",
  "PROGRAMFILES",
  "PROGRAMFILES(X86)",
  "SYSTEMDRIVE",
  "SYSTEMROOT",
  "TEMP",
  "TERM",
  "TMP",
  "TZ",
  "USERPROFILE",
  "WINDIR",
]);

export const MANAGED_READ_ONLY_SPECS = Object.freeze([
  "tests/e2e/managed-health.spec.ts",
  "tests/e2e/smoke.spec.ts",
  "tests/e2e/dashboard.spec.ts",
  "tests/e2e/dashboard-shell.spec.ts",
  "tests/e2e/internal-listings.spec.ts",
  "tests/e2e/public-tracking.spec.ts",
  "tests/e2e/storage.spec.ts",
  "tests/e2e/usuarios.spec.ts",
]);

export const MANAGED_READ_ONLY_EXCLUDED_TESTS = Object.freeze([
  "shell coexists with an existing pedido workspace",
  "admin sees safe pedido storage panel when a pedido exists",
  "admin sees safe solicitud storage section when a solicitud exists",
  "admin can navigate between usuarios pages",
  "usuario filters remove pagination from the URL",
]);

export function parseEnvironmentFile(contents, sourceName) {
  const values = new Map();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const assignment = line
      .replace(/^export\s+/, "")
      .match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!assignment) {
      throw new Error(`invalid assignment in ${sourceName}`);
    }

    const [, name, rawValue] = assignment;

    if (values.has(name)) {
      throw new Error(`duplicate variable in ${sourceName}`);
    }

    const value = rawValue.trim();
    values.set(
      name,
      value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
        ? value.slice(1, -1)
        : value,
    );
  }

  return values;
}

function readEnvironmentFile(filePath, sourceName) {
  try {
    return parseEnvironmentFile(readFileSync(filePath, "utf8"), sourceName);
  } catch (error) {
    if (error instanceof Error && error.code === "ENOENT") {
      throw new Error(`unable to read ${sourceName} environment`);
    }

    throw error;
  }
}

export function selectRequiredValues(environment, names, sourceName) {
  const selected = {};

  for (const name of names) {
    const value = environment.get(name)?.trim();

    if (!value) {
      throw new Error(`missing required ${sourceName} variable ${name}`);
    }

    selected[name] = value;
  }

  return selected;
}

export function validateProductionOrigin(value) {
  if (!value?.trim()) {
    throw new Error("missing GODEL_MANAGED_PRODUCTION_BASE_URL");
  }

  if (value !== value.trim()) {
    throw new Error("managed Production origin must not contain whitespace");
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    throw new Error("invalid managed Production origin");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error("managed Production URL must be a clean HTTPS origin");
  }

  return parsed.origin;
}

function copyOperatingSystemEnvironment(parentEnvironment) {
  const selected = {};

  for (const name of OPERATING_SYSTEM_ENV_NAMES) {
    const value = parentEnvironment[name];

    if (value !== undefined) {
      selected[name] = value;
    }
  }

  return selected;
}

export function buildChildEnvironment({
  parentEnvironment,
  publicEnvironment,
  qaEnvironment,
  productionOrigin,
  storageStatePath,
}) {
  const childEnvironment = {
    ...copyOperatingSystemEnvironment(parentEnvironment),
    ...publicEnvironment,
    ...qaEnvironment,
    GODEL_MANAGED_PRODUCTION_QA: "1",
    GODEL_MANAGED_STORAGE_STATE_PATH: storageStatePath,
    PLAYWRIGHT_BASE_URL: productionOrigin,
    PLAYWRIGHT_EXTERNAL_SERVER: "1",
  };

  for (const name of FORBIDDEN_CHILD_ENV_NAMES) {
    delete childEnvironment[name];
  }

  return childEnvironment;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildPlaywrightArguments() {
  const excludedTestPattern = `(?:${MANAGED_READ_ONLY_EXCLUDED_TESTS
    .map(escapeRegularExpression)
    .join("|")})$`;

  return [
    "test",
    ...MANAGED_READ_ONLY_SPECS,
    "--project=chromium",
    "--workers=1",
    "--grep-invert",
    excludedTestPattern,
  ];
}

function cookieAppliesToOrigin(cookie, origin) {
  const hostname = new URL(origin).hostname.toLowerCase();
  const domain = cookie.domain.replace(/^\./, "").toLowerCase();

  return (
    cookie.secure === true &&
    cookie.path === "/" &&
    (hostname === domain || hostname.endsWith(`.${domain}`))
  );
}

export async function bootstrapProtectionStorageState({
  productionOrigin,
  bypassSecret,
  storageStatePath,
  createRequestContext = (options) => request.newContext(options),
}) {
  if (!bypassSecret?.trim()) {
    throw new Error("missing VERCEL_AUTOMATION_BYPASS_SECRET");
  }

  const context = await createRequestContext({ baseURL: productionOrigin });
  let response;

  try {
    try {
      response = await context.get("/", {
        failOnStatusCode: false,
        headers: {
          "x-vercel-protection-bypass": bypassSecret,
          "x-vercel-set-bypass-cookie": "true",
        },
        maxRedirects: 0,
      });

      if (response.status() < 200 || response.status() >= 300) {
        throw new Error("unsuccessful bootstrap response");
      }

      const state = await context.storageState();
      const infrastructureCookies = state.cookies.filter((cookie) =>
        cookieAppliesToOrigin(cookie, productionOrigin),
      );

      if (infrastructureCookies.length === 0) {
        throw new Error("missing origin cookie");
      }

      await writeFile(
        storageStatePath,
        JSON.stringify({ cookies: infrastructureCookies, origins: [] }),
        { encoding: "utf8", mode: 0o600 },
      );
    } catch {
      throw new Error("Deployment Protection bootstrap failed");
    }
  } finally {
    let cleanupFailed = false;

    try {
      await response?.dispose();
    } catch {
      cleanupFailed = true;
    }

    try {
      await context.dispose();
    } catch {
      cleanupFailed = true;
    }

    if (cleanupFailed) {
      throw new Error("Deployment Protection bootstrap cleanup failed");
    }
  }
}

function isSafeTemporaryDirectory(directory) {
  const temporaryRoot = resolve(tmpdir());
  const resolvedDirectory = resolve(directory);

  return (
    resolvedDirectory.startsWith(`${temporaryRoot}${sep}`) &&
    basename(resolvedDirectory).startsWith(TEMPORARY_DIRECTORY_PREFIX)
  );
}

export async function withTemporaryStorageState(operation) {
  const directory = await mkdtemp(
    join(resolve(tmpdir()), TEMPORARY_DIRECTORY_PREFIX),
  );
  const storageStatePath = join(directory, "storage-state.json");

  try {
    return await operation({ directory, storageStatePath });
  } finally {
    if (!isSafeTemporaryDirectory(directory)) {
      throw new Error("refusing to remove an unexpected temporary directory");
    }

    await rm(directory, { force: true, recursive: true });
  }
}

function runPlaywright(childEnvironment) {
  const playwrightCli = resolve(
    process.cwd(),
    "node_modules",
    "@playwright",
    "test",
    "cli.js",
  );

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [playwrightCli, ...buildPlaywrightArguments()], {
      env: childEnvironment,
      stdio: "inherit",
      windowsHide: true,
    });

    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal);
      }
    };
    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    const removeSignalHandlers = () => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };

    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);

    child.once("error", () => {
      removeSignalHandlers();
      rejectRun(new Error("could not start Playwright"));
    });
    child.once("close", (code) => {
      removeSignalHandlers();
      resolveRun(code ?? 1);
    });
  });
}

async function main() {
  const managed = readEnvironmentFile(
    resolve(process.cwd(), MANAGED_ENV_PATH),
    "managed runtime",
  );
  const qa = readEnvironmentFile(
    resolve(process.cwd(), MANAGED_QA_ENV_PATH),
    "managed QA",
  );
  const publicEnvironment = selectRequiredValues(
    managed,
    MANAGED_PUBLIC_ENV_NAMES,
    "managed runtime",
  );
  const qaEnvironment = selectRequiredValues(
    qa,
    MANAGED_QA_ENV_NAMES,
    "managed QA",
  );
  const productionOrigin = validateProductionOrigin(
    process.env.GODEL_MANAGED_PRODUCTION_BASE_URL,
  );
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  if (!bypassSecret?.trim()) {
    throw new Error("missing VERCEL_AUTOMATION_BYPASS_SECRET");
  }

  return withTemporaryStorageState(async ({ storageStatePath }) => {
    await bootstrapProtectionStorageState({
      bypassSecret,
      productionOrigin,
      storageStatePath,
    });

    const childEnvironment = buildChildEnvironment({
      parentEnvironment: process.env,
      productionOrigin,
      publicEnvironment,
      qaEnvironment,
      storageStatePath,
    });

    console.log(
      "[managed-production-e2e] Starting the protected read-only Chromium allowlist.",
    );

    return runPlaywright(childEnvironment);
  });
}

const isDirectExecution =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        `[managed-production-e2e] Error: ${
          error instanceof Error ? error.message : "runner preparation failed"
        }`,
      );
      process.exitCode = 1;
    });
}
