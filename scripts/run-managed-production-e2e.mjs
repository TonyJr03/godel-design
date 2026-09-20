import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { request } from "@playwright/test";

const MANAGED_ENV_PATH = ".env.managed.local";
const MANAGED_QA_ENV_PATH = ".env.managed.qa.local";
const TEMPORARY_DIRECTORY_PREFIX = "godel-managed-qa-";
const ALLOWED_BOOTSTRAP_REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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

export const MANAGED_READ_ONLY_BATCHES = Object.freeze([
  Object.freeze({
    name: "foundation",
    specs: Object.freeze([
      "tests/e2e/managed-health.spec.ts",
      "tests/e2e/smoke.spec.ts",
    ]),
  }),
  Object.freeze({
    name: "dashboard",
    specs: Object.freeze(["tests/e2e/dashboard.spec.ts"]),
  }),
  Object.freeze({
    name: "shell",
    specs: Object.freeze(["tests/e2e/dashboard-shell.spec.ts"]),
  }),
  Object.freeze({
    name: "listings",
    specs: Object.freeze(["tests/e2e/internal-listings.spec.ts"]),
  }),
  Object.freeze({
    name: "remaining-readonly",
    specs: Object.freeze([
      "tests/e2e/public-tracking.spec.ts",
      "tests/e2e/storage.spec.ts",
      "tests/e2e/usuarios.spec.ts",
    ]),
  }),
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

export function validateManagedReadOnlyBatchInventory({
  batches = MANAGED_READ_ONLY_BATCHES,
  specs = MANAGED_READ_ONLY_SPECS,
} = {}) {
  const flattenedSpecs = batches.flatMap((batch) => batch.specs);
  const seenSpecs = new Set();
  const duplicates = new Set();

  for (const spec of flattenedSpecs) {
    if (seenSpecs.has(spec)) {
      duplicates.add(spec);
    }

    seenSpecs.add(spec);
  }

  const expectedSpecs = new Set(specs);
  const missingSpecs = specs.filter((spec) => !seenSpecs.has(spec));
  const extraSpecs = flattenedSpecs.filter((spec) => !expectedSpecs.has(spec));

  if (
    duplicates.size > 0 ||
    missingSpecs.length > 0 ||
    extraSpecs.length > 0 ||
    flattenedSpecs.length !== specs.length
  ) {
    throw new Error("managed read-only batch inventory drift");
  }

  return {
    batchCount: batches.length,
    duplicates: [],
    extraSpecs: [],
    flattenedSpecs,
    missingSpecs: [],
  };
}

function assertManagedReadOnlyBatch(batch) {
  validateManagedReadOnlyBatchInventory();

  if (!MANAGED_READ_ONLY_BATCHES.includes(batch)) {
    throw new Error("unrecognized managed read-only batch");
  }
}

export function buildPlaywrightArguments(batch) {
  assertManagedReadOnlyBatch(batch);

  const excludedTestPattern = `(?:${MANAGED_READ_ONLY_EXCLUDED_TESTS
    .map(escapeRegularExpression)
    .join("|")})$`;

  return [
    "test",
    ...batch.specs,
    "--project=chromium",
    "--workers=1",
    "--grep-invert",
    excludedTestPattern,
    "--output",
    join("test-results", "managed-readonly", batch.name),
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

function validateBootstrapResponse(response, productionOrigin) {
  const status = response.status();

  if (status >= 200 && status < 300) {
    return {
      redirectSameOrigin: null,
      redirectUsed: false,
      statusClass: "2xx",
    };
  }

  if (!ALLOWED_BOOTSTRAP_REDIRECT_STATUSES.has(status)) {
    throw new Error("unsupported bootstrap response");
  }

  const location = response.headers().location;

  if (!location) {
    throw new Error("missing bootstrap redirect location");
  }

  let redirectTarget;

  try {
    redirectTarget = new URL(location, productionOrigin);
  } catch {
    throw new Error("invalid bootstrap redirect location");
  }

  if (
    redirectTarget.origin !== productionOrigin ||
    redirectTarget.username ||
    redirectTarget.password
  ) {
    throw new Error("unsafe bootstrap redirect location");
  }

  return {
    redirectSameOrigin: true,
    redirectUsed: true,
    statusClass: "3xx",
  };
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

      const responseMetadata = validateBootstrapResponse(
        response,
        productionOrigin,
      );

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

      return {
        ...responseMetadata,
        infrastructureCookiePresent: true,
      };
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

export function runPlaywrightBatch(
  childEnvironment,
  batch,
  { spawnProcess = spawn } = {},
) {
  assertManagedReadOnlyBatch(batch);

  const playwrightCli = resolve(
    process.cwd(),
    "node_modules",
    "@playwright",
    "test",
    "cli.js",
  );

  return new Promise((resolveRun, rejectRun) => {
    const child = spawnProcess(
      process.execPath,
      [playwrightCli, ...buildPlaywrightArguments(batch)],
      {
        env: childEnvironment,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    let receivedSignal = false;
    let settled = false;

    const forwardSignal = (signal) => {
      receivedSignal = true;

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

      if (!settled) {
        settled = true;
        rejectRun(new Error("could not start Playwright batch"));
      }
    });
    child.once("close", (code) => {
      removeSignalHandlers();

      if (settled) {
        return;
      }

      settled = true;

      if (receivedSignal) {
        rejectRun(new Error("Playwright batch interrupted by signal"));
        return;
      }

      resolveRun(code ?? 1);
    });
  });
}

export async function runManagedReadOnlyBatches({
  childEnvironment,
  log = console.log,
  runBatch = runPlaywrightBatch,
  storageStateAvailable = existsSync,
}) {
  const inventory = validateManagedReadOnlyBatchInventory();
  const storageStatePath =
    childEnvironment?.GODEL_MANAGED_STORAGE_STATE_PATH;
  const exitCodes = [];

  for (const batch of MANAGED_READ_ONLY_BATCHES) {
    if (!storageStatePath || !storageStateAvailable(storageStatePath)) {
      throw new Error("managed read-only batch infrastructure failure");
    }

    log(`[managed-production-e2e] batch_start=${batch.name}`);

    let exitCode;

    try {
      exitCode = await runBatch(childEnvironment, batch);
    } catch {
      throw new Error("managed read-only batch infrastructure failure");
    }

    if (!Number.isInteger(exitCode) || exitCode < 0) {
      throw new Error("managed read-only batch infrastructure failure");
    }

    exitCodes.push(exitCode);
    log(`[managed-production-e2e] batch_exit=${exitCode}`);
  }

  const batchesFailed = exitCodes.filter((code) => code !== 0).length;
  const batchesPassed = inventory.batchCount - batchesFailed;
  const overall = batchesFailed === 0 ? "PASS" : "FAIL";

  log(
    `[managed-production-e2e] batches_total=${inventory.batchCount} ` +
      `batches_passed=${batchesPassed} batches_failed=${batchesFailed} ` +
      `overall=${overall}`,
  );

  return batchesFailed === 0 ? 0 : 1;
}

async function main() {
  validateManagedReadOnlyBatchInventory();

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

    return runManagedReadOnlyBatches({ childEnvironment });
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
