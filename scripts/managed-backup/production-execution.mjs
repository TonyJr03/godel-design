import { lstat, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { buildSupabaseDatabaseCommandPlans } from "./command-plans.mjs";
import { runCommand } from "./command-runner.mjs";
import { validateConfigSnapshot } from "./inventory.mjs";
import { createProductionReadOnlyCaptureAdapter } from "./production-capture-adapter.mjs";
import { resolveProductionGitAuthority, runProductionBackup } from "./production-backup.mjs";
import {
  assertProductionConfirmation,
  assertProductionGitAuthority,
  assertWriterFreezeConfirmation,
  readProductionBackupConfiguration,
} from "./production-contract.mjs";
import {
  R2_PRODUCTION_LOCK_CONFIRMATION,
  createR2ExternalPublicationAdapter,
} from "./r2-external-custody.mjs";

export const PRODUCTION_BUCKET_ALLOWED_MIME_TYPES = Object.freeze([
  "application/msword",
  "application/pdf",
  "application/vnd.corel-draw",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.rar",
  "application/x-zip-compressed",
  "application/zip",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const VERCEL_ENVIRONMENT_VARIABLE_NAMES = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
]);
const PRIVATE_AGE_ENVIRONMENT_NAMES = Object.freeze([
  "AGE_IDENTITY",
  "AGE_IDENTITY_FILE",
  "GODEL_MANAGED_BACKUP_AGE_IDENTITY",
  "GODEL_MANAGED_BACKUP_AGE_IDENTITY_FILE",
]);
const EXPECTED_TOOL_VERSIONS = Object.freeze({ age: "1.3.1", rclone: "1.75.1" });

function fail(code, message) {
  const error = new Error(message);
  error.name = "ManagedProductionExecutionError";
  error.code = code;
  throw error;
}

function required(environment, name) {
  const value = environment?.[name];
  if (typeof value !== "string" || value.length === 0) fail("PRODUCTION_EXECUTION_CONFIG_MISSING", `${name} is required`);
  return value;
}

function systemEnvironment(source = {}) {
  const environment = {};
  for (const key of ["PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR"]) {
    if (typeof source[key] === "string") environment[key] = source[key];
  }
  return environment;
}

function cleanHttpsUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("PRODUCTION_EXECUTION_CONFIG_INVALID", `${label} must be a clean HTTPS URL`);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail("PRODUCTION_EXECUTION_CONFIG_INVALID", `${label} must be a clean HTTPS URL`);
  }
  return parsed.toString();
}

export function assertNoPrivateAgeIdentity(environment = {}) {
  if (Object.entries(environment).some(([name, value]) => (
    typeof value === "string"
    && value.length > 0
    && (PRIVATE_AGE_ENVIRONMENT_NAMES.includes(name) || (/(?:^|_)AGE(?:_|$)/i.test(name) && /(?:IDENTITY|PRIVATE)/i.test(name)))
  ))) {
    fail("PRIVATE_AGE_IDENTITY_FORBIDDEN", "Private age identity configuration is forbidden on the Production capture host");
  }
  if (Object.values(environment).some((value) => typeof value === "string" && /AGE-SECRET-KEY-/i.test(value))) {
    fail("PRIVATE_AGE_IDENTITY_FORBIDDEN", "Private age identity material is forbidden on the Production capture host");
  }
}

export function readProductionExecutionConfiguration(environment = {}) {
  const supabaseRegion = required(environment, "GODEL_MANAGED_SUPABASE_REGION");
  if (!/^[a-z0-9-]{2,40}$/.test(supabaseRegion)) fail("PRODUCTION_EXECUTION_CONFIG_INVALID", "Supabase region is invalid");
  const authSiteUrl = cleanHttpsUrl(required(environment, "GODEL_MANAGED_AUTH_SITE_URL"), "Auth Site URL");
  let redirectAllowlist;
  try {
    redirectAllowlist = JSON.parse(required(environment, "GODEL_MANAGED_AUTH_REDIRECT_ALLOWLIST_JSON"));
  } catch {
    fail("PRODUCTION_EXECUTION_CONFIG_INVALID", "Auth redirect allowlist must be strict JSON");
  }
  if (!Array.isArray(redirectAllowlist) || redirectAllowlist.some((value) => typeof value !== "string")) {
    fail("PRODUCTION_EXECUTION_CONFIG_INVALID", "Auth redirect allowlist must be a JSON array of HTTPS URLs");
  }
  const redirects = redirectAllowlist.map((value) => cleanHttpsUrl(value, "Auth redirect"));
  if (new Set(redirects).size !== redirects.length) fail("PRODUCTION_EXECUTION_CONFIG_INVALID", "Auth redirect allowlist contains duplicates");
  return Object.freeze({ supabaseRegion, authSiteUrl, redirectAllowlist: Object.freeze(redirects.sort((left, right) => left.localeCompare(right, "en"))) });
}

export function createProductionConfigurationSnapshot({ configuration, productionRuntimeSha, toolingGitSha } = {}) {
  const snapshot = {
    schemaVersion: 1,
    supabaseRegion: configuration.supabaseRegion,
    authSiteUrl: { classification: "ENCRYPTED_INTERNAL_ONLY", value: configuration.authSiteUrl },
    redirectAllowlist: [...configuration.redirectAllowlist],
    signupEnabled: false,
    anonymousEnabled: false,
    bucket: {
      id: "godel-files",
      public: false,
      fileSizeLimit: 20_971_520,
      allowedMimeTypes: [...PRODUCTION_BUCKET_ALLOWED_MIME_TYPES],
    },
    requiredExtensions: ["pgcrypto"],
    realtime: { required: false, publications: [] },
    vercelEnvironmentVariableNames: [...VERCEL_ENVIRONMENT_VARIABLE_NAMES].sort((left, right) => left.localeCompare(right, "en")),
    productionRuntimeSha,
    toolingGitSha,
  };
  validateConfigSnapshot(snapshot);
  return Object.freeze(snapshot);
}

export async function admitRepoLocalSupabaseCli({ repoRoot, inspect = lstat, read = readFile } = {}) {
  const cliPath = join(resolve(repoRoot), "node_modules", "supabase", "dist", "supabase.js");
  const state = await inspect(cliPath).catch(() => null);
  if (!state?.isFile() || state.isSymbolicLink()) fail("SUPABASE_CLI_REQUIRED", "Approved repo-local Supabase CLI is required");
  let version;
  try {
    const packageJson = JSON.parse(await read(join(resolve(repoRoot), "node_modules", "supabase", "package.json"), "utf8"));
    version = packageJson.version;
  } catch {
    fail("SUPABASE_CLI_REQUIRED", "Approved repo-local Supabase CLI metadata is required");
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) fail("SUPABASE_CLI_REQUIRED", "Approved repo-local Supabase CLI version is invalid");
  return Object.freeze({ cliPath, version });
}

function extractVersion(output, tool) {
  const match = String(output ?? "").match(/(?:^|\s)v?(\d+\.\d+\.\d+)(?=\s|$)/m);
  if (!match) fail("TOOL_VERSION_INVALID", `${tool} did not report a semantic version`);
  return match[1];
}

export async function admitProductionTools({ environment = {}, repoRoot, execute = runCommand, supabaseVersion } = {}) {
  const allowedEnvironment = systemEnvironment(environment);
  const invoke = async (tool, executable, args) => {
    try {
      return await execute({ operation: `admit ${tool} for Production backup`, executable, args, cwd: repoRoot, allowedEnvironment });
    } catch {
      fail("TOOL_REQUIRED", `${tool} is required for Production backup execution`);
    }
  };
  const age = await invoke("age", "age", ["--version"]);
  const rclone = await invoke("rclone", "rclone", ["version"]);
  await invoke("tar", "tar", ["--version"]);
  const ageVersion = extractVersion(`${age.stdout}\n${age.stderr}`, "age");
  const rcloneVersion = extractVersion(`${rclone.stdout}\n${rclone.stderr}`, "rclone");
  if (ageVersion !== EXPECTED_TOOL_VERSIONS.age || rcloneVersion !== EXPECTED_TOOL_VERSIONS.rclone) {
    fail("TOOL_VERSION_MISMATCH", "Production backup tool version does not match the governed baseline");
  }
  return Object.freeze([
    Object.freeze({ name: "age", present: true, version: ageVersion }),
    Object.freeze({ name: "node", present: true, version: process.version }),
    Object.freeze({ name: "rclone", present: true, version: rcloneVersion }),
    Object.freeze({ name: "supabase", present: true, version: supabaseVersion }),
  ]);
}

export function buildRepoLocalSupabaseDatabasePlans({ cliPath } = {}) {
  return buildSupabaseDatabaseCommandPlans({
    target: "linked",
    executable: process.execPath,
    prefixArgs: [cliPath],
  });
}

export async function runProductionExecution({
  environment = process.env,
  repoRoot = process.cwd(),
  dependencies = {},
} = {}) {
  assertProductionConfirmation(environment);
  assertWriterFreezeConfirmation(environment);
  if (environment.GODEL_MANAGED_R2_PRODUCTION_LOCK_CONFIRM !== R2_PRODUCTION_LOCK_CONFIRMATION) {
    fail("R2_PRODUCTION_LOCK_CONFIRMATION_REQUIRED", "Exact R2 Production prefix lock confirmation is required");
  }
  assertNoPrivateAgeIdentity(environment);
  const productionConfiguration = readProductionBackupConfiguration(environment);
  const executionConfiguration = readProductionExecutionConfiguration(environment);
  const cli = await (dependencies.admitSupabaseCli ?? admitRepoLocalSupabaseCli)({ repoRoot });
  const toolVersions = await (dependencies.admitTools ?? admitProductionTools)({
    environment,
    repoRoot,
    execute: dependencies.execute ?? runCommand,
    supabaseVersion: cli.version,
  });
  const gitResolver = dependencies.resolveGitAuthority ?? resolveProductionGitAuthority;
  const authority = assertProductionGitAuthority(await gitResolver({ repoRoot, sourceEnvironment: environment, execute: dependencies.execute ?? runCommand }));
  const configurationSnapshot = createProductionConfigurationSnapshot({
    configuration: executionConfiguration,
    productionRuntimeSha: productionConfiguration.productionRuntimeSha,
    toolingGitSha: authority.head,
  });
  const databasePlans = buildRepoLocalSupabaseDatabasePlans({ cliPath: cli.cliPath });
  const captureAdapterFactory = dependencies.captureAdapterFactory ?? createProductionReadOnlyCaptureAdapter;
  const captureAdapter = captureAdapterFactory({
    execute: dependencies.execute ?? runCommand,
    configurationSnapshotProvider: async () => configurationSnapshot,
    toolVersionsProvider: async () => toolVersions,
  });
  const r2AdapterFactory = dependencies.r2AdapterFactory ?? createR2ExternalPublicationAdapter;
  const externalPublicationAdapter = r2AdapterFactory({
    mode: "production",
    environment,
    repoRoot,
    execute: dependencies.execute ?? runCommand,
  });
  if (typeof externalPublicationAdapter?.downloadReceipt !== "function") {
    fail("EXTERNAL_RECEIPT_ROUNDTRIP_REQUIRED", "Production R2 custody requires VERIFIED receipt roundtrip");
  }
  const runner = dependencies.runBackup ?? runProductionBackup;
  const result = await runner({
    environment,
    repoRoot,
    externalPublicationAdapter,
    captureAdapter,
    dependencies: {
      ...(dependencies.coreDependencies ?? {}),
      resolveGitAuthority: async () => authority,
      buildDatabasePlans: () => databasePlans,
    },
  });
  return Object.freeze({
    status: "PASS",
    backupId: result.backupId,
    externalPublication: result.externalPublication,
    toolingGitSha: authority.head,
    productionRuntimeSha: productionConfiguration.productionRuntimeSha,
    warnings: Object.freeze([...(result.warnings ?? [])]),
  });
}

export function sanitizeProductionExecutionFailure(error) {
  const code = typeof error?.code === "string" && /^[A-Z0-9_]{3,80}$/.test(error.code) ? error.code : "PRODUCTION_EXECUTION_FAILED";
  return Object.freeze({ status: "FAIL", code, message: "Production backup execution failed safely" });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  try {
    console.log(JSON.stringify(await runProductionExecution()));
  } catch (error) {
    console.log(JSON.stringify(sanitizeProductionExecutionFailure(error)));
    process.exitCode = 1;
  }
}
