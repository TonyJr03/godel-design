import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const RUNTIME_ENV_PATH = "compose.env.local";
const QA_ENV_PATH = ".env.qa.local";
const RUNTIME_PUBLIC_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
];
const QA_ENV_NAMES = [
  "GODEL_TEST_ADMIN_EMAIL",
  "GODEL_TEST_ADMIN_PASSWORD",
  "GODEL_TEST_SUPERVISOR_EMAIL",
  "GODEL_TEST_SUPERVISOR_PASSWORD",
  "GODEL_TEST_WORKER_EMAIL",
  "GODEL_TEST_WORKER_PASSWORD",
];
const FORBIDDEN_CHILD_ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVER_URL",
  "POSTGRES_PASSWORD",
  "JWT_KEYS",
  "JWT_JWKS",
  "SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function fail(message) {
  console.error(`[selfhosted-e2e] Error: ${message}`);
  process.exitCode = 1;
}

function parseEnvironmentFile(contents, sourceName) {
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

function requireValues(environment, names, sourceName) {
  const missing = names.find((name) => !environment.get(name)?.trim());

  if (missing) {
    throw new Error(`missing required ${sourceName} variable ${missing}`);
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
  const child = spawn(
    process.execPath,
    [playwrightCli, "test", ...process.argv.slice(2)],
    {
      env: childEnvironment,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  child.on("error", () => {
    fail("could not start Playwright.");
  });

  child.on("close", (code) => {
    process.exitCode = code ?? 1;
  });
}

try {
  const runtime = readEnvironmentFile(
    resolve(process.cwd(), RUNTIME_ENV_PATH),
    "runtime",
  );
  const qa = readEnvironmentFile(resolve(process.cwd(), QA_ENV_PATH), "QA");

  requireValues(runtime, RUNTIME_PUBLIC_NAMES, "runtime");
  requireValues(qa, QA_ENV_NAMES, "QA");

  const childEnvironment = { ...process.env };

  for (const name of FORBIDDEN_CHILD_ENV_NAMES) {
    delete childEnvironment[name];
  }

  for (const name of RUNTIME_PUBLIC_NAMES) {
    childEnvironment[name] = runtime.get(name);
  }

  for (const name of QA_ENV_NAMES) {
    childEnvironment[name] = qa.get(name);
  }

  childEnvironment.PLAYWRIGHT_BASE_URL = "http://localhost:8080";
  childEnvironment.PLAYWRIGHT_EXTERNAL_SERVER = "1";

  console.log("[selfhosted-e2e] Using the external production-like server at http://localhost:8080.");
  runPlaywright(childEnvironment);
} catch (error) {
  fail(error instanceof Error ? error.message : "could not prepare Playwright.");
}
