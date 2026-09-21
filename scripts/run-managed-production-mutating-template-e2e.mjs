import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  FORBIDDEN_CHILD_ENV_NAMES,
  MANAGED_PUBLIC_ENV_NAMES,
  bootstrapProtectionStorageState,
  buildChildEnvironment,
  parseEnvironmentFile,
  selectRequiredValues,
  validateProductionOrigin,
  withTemporaryStorageState,
} from "./run-managed-production-e2e.mjs";
import { createAuthenticatedTemplateAdapter } from "./managed-mutating-qa/template-adapter.mjs";
import {
  MANAGED_MUTATING_TEMPLATE_SPEC,
  TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_NAME,
  assertTemplateMutatingProductionConfirmation,
  recoverManagedTemplates,
  runSingleManagedTemplate,
} from "./managed-mutating-qa/template-flow.mjs";

const MANAGED_ENV_PATH = ".env.managed.local";
const MANAGED_QA_ENV_PATH = ".env.managed.qa.local";
const MANAGED_ADMIN_ENV_NAMES = Object.freeze([
  "GODEL_TEST_ADMIN_EMAIL",
  "GODEL_TEST_ADMIN_PASSWORD",
]);
const NON_ADMIN_QA_ENV_NAMES = Object.freeze([
  "GODEL_TEST_SUPERVISOR_EMAIL",
  "GODEL_TEST_SUPERVISOR_PASSWORD",
  "GODEL_TEST_WORKER_EMAIL",
  "GODEL_TEST_WORKER_PASSWORD",
]);

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

function loadManagedConfiguration() {
  const managed = readEnvironmentFile(
    resolve(process.cwd(), MANAGED_ENV_PATH),
    "managed runtime",
  );
  const qa = readEnvironmentFile(
    resolve(process.cwd(), MANAGED_QA_ENV_PATH),
    "managed QA",
  );
  if (
    managed.has(TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_NAME)
    || qa.has(TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_NAME)
  ) {
    throw new Error("MUTATING_TEMPLATE_CONFIRMATION_MUST_NOT_BE_PERSISTED");
  }
  return {
    adminEnvironment: selectRequiredValues(
      qa,
      MANAGED_ADMIN_ENV_NAMES,
      "managed QA",
    ),
    publicEnvironment: selectRequiredValues(
      managed,
      MANAGED_PUBLIC_ENV_NAMES,
      "managed runtime",
    ),
  };
}

export function validateTemplateMutatingCommandArguments(args) {
  if (args.length === 0) return "run";
  if (args.length === 1 && args[0] === "--recover") return "recover";
  throw new Error("UNSUPPORTED_MUTATING_TEMPLATE_ARGUMENTS");
}

export function buildTemplateMutatingPlaywrightArguments() {
  return [
    "test",
    MANAGED_MUTATING_TEMPLATE_SPEC,
    "--project=chromium",
    "--workers=1",
    "--retries=0",
    "--output",
    resolve("test-results", "managed-mutating", "template"),
  ];
}

export function buildTemplateMutatingChildEnvironment({
  parentEnvironment,
  publicEnvironment,
  adminEnvironment,
  productionOrigin,
  storageStatePath,
  runId,
  templateName,
}) {
  const child = {
    ...buildChildEnvironment({
      parentEnvironment,
      publicEnvironment,
      qaEnvironment: adminEnvironment,
      productionOrigin,
      storageStatePath,
    }),
    GODEL_MANAGED_MUTATING_TEMPLATE_QA: "1",
    GODEL_MANAGED_MUTATING_RUN_ID: runId,
    GODEL_MANAGED_MUTATING_TEMPLATE_NAME: templateName,
  };
  for (const name of FORBIDDEN_CHILD_ENV_NAMES) delete child[name];
  for (const name of NON_ADMIN_QA_ENV_NAMES) delete child[name];
  delete child[TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_NAME];
  return child;
}

export function runTemplateMutatingPlaywright(
  childEnvironment,
  { spawnProcess = spawn, signalTarget = process } = {},
) {
  if (
    childEnvironment?.GODEL_MANAGED_PRODUCTION_QA !== "1"
    || childEnvironment.GODEL_MANAGED_MUTATING_TEMPLATE_QA !== "1"
    || !childEnvironment.GODEL_MANAGED_MUTATING_RUN_ID
    || !childEnvironment.GODEL_MANAGED_MUTATING_TEMPLATE_NAME
    || !childEnvironment.GODEL_TEST_ADMIN_EMAIL
    || !childEnvironment.GODEL_TEST_ADMIN_PASSWORD
  ) {
    throw new Error("MUTATING_TEMPLATE_CHILD_ENVIRONMENT_INVALID");
  }

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
      [playwrightCli, ...buildTemplateMutatingPlaywrightArguments()],
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
      if (!child.killed) child.kill(signal);
    };
    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    const removeSignalHandlers = () => {
      signalTarget.off("SIGINT", onSigint);
      signalTarget.off("SIGTERM", onSigterm);
    };
    signalTarget.once("SIGINT", onSigint);
    signalTarget.once("SIGTERM", onSigterm);
    child.once("error", () => {
      removeSignalHandlers();
      if (!settled) {
        settled = true;
        rejectRun(new Error("MUTATING_TEMPLATE_PLAYWRIGHT_START_FAILED"));
      }
    });
    child.once("close", (code) => {
      removeSignalHandlers();
      if (settled) return;
      settled = true;
      if (receivedSignal) {
        rejectRun(new Error("MUTATING_TEMPLATE_PLAYWRIGHT_INTERRUPTED"));
        return;
      }
      resolveRun(code ?? 1);
    });
  });
}

function createAdapterFactory(publicEnvironment, adminEnvironment) {
  return () => createAuthenticatedTemplateAdapter({
    supabaseUrl: publicEnvironment.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey:
      publicEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    email: adminEnvironment.GODEL_TEST_ADMIN_EMAIL,
    password: adminEnvironment.GODEL_TEST_ADMIN_PASSWORD,
  });
}

export async function main(args = process.argv.slice(2)) {
  const mode = validateTemplateMutatingCommandArguments(args);
  const confirmation =
    process.env[TEMPLATE_MUTATING_PRODUCTION_CONFIRMATION_NAME];
  assertTemplateMutatingProductionConfirmation(confirmation);
  const { adminEnvironment, publicEnvironment } = loadManagedConfiguration();
  const createAdapter = createAdapterFactory(
    publicEnvironment,
    adminEnvironment,
  );

  if (mode === "recover") {
    const recovery = await recoverManagedTemplates({
      confirmation,
      createAdapter,
    });
    return recovery.exitCode;
  }

  const productionOrigin = validateProductionOrigin(
    process.env.GODEL_MANAGED_PRODUCTION_BASE_URL,
  );
  const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return withTemporaryStorageState(async ({ storageStatePath }) => {
    const result = await runSingleManagedTemplate({
      confirmation,
      createAdapter,
      bootstrap: async () => {
        await bootstrapProtectionStorageState({
          bypassSecret,
          productionOrigin,
          storageStatePath,
        });
        return { storageStatePath };
      },
      runPlaywright: ({ ownershipValue, runId }) => {
        const childEnvironment = buildTemplateMutatingChildEnvironment({
          parentEnvironment: process.env,
          publicEnvironment,
          adminEnvironment,
          productionOrigin,
          storageStatePath,
          runId,
          templateName: ownershipValue,
        });
        return runTemplateMutatingPlaywright(childEnvironment);
      },
    });
    return result.exitCode;
  });
}

const isDirectExecution =
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectExecution) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(
        `[managed-mutating-template] Error: ${
          error?.code ?? error?.message ?? "MUTATING_TEMPLATE_RUNNER_FAILED"
        }`,
      );
      process.exitCode = 1;
    });
}
