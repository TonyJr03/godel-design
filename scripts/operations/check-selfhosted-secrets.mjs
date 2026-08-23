#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const DEFAULT_SUPABASE_ENV = resolve(ROOT, "infra/supabase/.env");
const DEFAULT_GODEL_ENV = resolve(ROOT, "compose.env.local");
const DEFAULT_TEMPLATE_ENV = resolve(ROOT, "infra/supabase/.env.example");

const REQUIRED_SUPABASE = [
  "POSTGRES_PASSWORD",
  "JWT_SECRET",
  "ANON_KEY",
  "SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "DASHBOARD_PASSWORD",
  "SECRET_KEY_BASE",
  "REALTIME_DB_ENC_KEY",
  "VAULT_ENC_KEY",
  "PG_META_CRYPTO_KEY",
];

const REQUIRED_GODEL = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVER_URL",
  "SUPABASE_SECRET_KEY",
];

const AUTH_TARGET = {
  DISABLE_SIGNUP: "true",
  ENABLE_EMAIL_SIGNUP: "true",
  ENABLE_PHONE_SIGNUP: "false",
  ENABLE_PHONE_AUTOCONFIRM: "false",
  ENABLE_ANONYMOUS_USERS: "false",
};

const OPTIONAL_UNUSED = [
  "SMTP_ADMIN_EMAIL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SENDER_NAME",
  "S3_PROTOCOL_ACCESS_KEY_ID",
  "S3_PROTOCOL_ACCESS_KEY_SECRET",
  "LOGFLARE_PUBLIC_ACCESS_TOKEN",
  "LOGFLARE_PRIVATE_ACCESS_TOKEN",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
  "OPENAI_API_KEY",
];

const DEFAULT_SENSITIVE_NAMES = new Set([
  ...REQUIRED_SUPABASE,
  "JWT_KEYS",
  "JWT_JWKS",
  "ANON_KEY_ASYMMETRIC",
  "SERVICE_ROLE_KEY_ASYMMETRIC",
]);

function parseEnvironmentFile(contents, sourceName) {
  const values = new Map();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const assignment = line.replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);

    if (!assignment) {
      continue;
    }

    const [, name, rawValue] = assignment;

    if (values.has(name)) {
      throw new Error(`duplicate variable ${name} in ${sourceName}`);
    }

    const value = rawValue.trim();
    values.set(
      name,
      value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
        ? value.slice(1, -1)
        : value,
    );
  }

  return values;
}

async function readEnvironmentFile(filePath, sourceName) {
  try {
    return parseEnvironmentFile(await readFile(filePath, "utf8"), sourceName);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(`unable to read ${sourceName} environment file`);
    }

    throw error;
  }
}

function parseArguments(args) {
  const value = {
    supabaseEnv: DEFAULT_SUPABASE_ENV,
    godelEnv: DEFAULT_GODEL_ENV,
    templateEnv: DEFAULT_TEMPLATE_ENV,
  };

  while (args.length > 0) {
    const option = args.shift();
    const supplied = args.shift();

    if (!supplied || supplied.startsWith("--")) {
      throw new Error(`${option} requires a path`);
    }

    if (option === "--supabase-env") {
      value.supabaseEnv = resolve(supplied);
    } else if (option === "--godel-env") {
      value.godelEnv = resolve(supplied);
    } else if (option === "--template-env") {
      value.templateEnv = resolve(supplied);
    } else {
      throw new Error(`unknown option ${option}`);
    }
  }

  return value;
}

function hasValue(environment, name) {
  return Boolean(environment.get(name)?.trim());
}

function requireVariables(environment, names, errors) {
  for (const name of names) {
    if (!hasValue(environment, name)) {
      errors.push(`${name} is missing or empty`);
    }
  }
}

function validateMinimumLength(environment, name, minimum, errors) {
  if (hasValue(environment, name) && environment.get(name).length < minimum) {
    errors.push(`${name} has an invalid length`);
  }
}

function validateJwtShape(environment, name, errors) {
  const value = environment.get(name);

  if (value && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    errors.push(`${name} has an invalid JWT shape`);
  }
}

function validateJson(environment, name, errors) {
  const value = environment.get(name);

  if (!value) {
    return;
  }

  try {
    JSON.parse(value);
  } catch {
    errors.push(`${name} has an invalid JSON shape`);
  }
}

function validateUrl(environment, name, errors) {
  const value = environment.get(name);

  if (!value) {
    return;
  }

  try {
    const parsed = new URL(value);

    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error("invalid URL");
    }
  } catch {
    errors.push(`${name} has an invalid URL shape`);
  }
}

function asymmetricAuthActive(environment) {
  return ["JWT_KEYS", "JWT_JWKS", "ANON_KEY_ASYMMETRIC", "SERVICE_ROLE_KEY_ASYMMETRIC"].some((name) => hasValue(environment, name));
}

function validateKnownDefaults(environment, template, errors) {
  for (const name of DEFAULT_SENSITIVE_NAMES) {
    const value = environment.get(name);
    const knownDefault = template.get(name);

    if (value && knownDefault && value === knownDefault) {
      errors.push(`${name} is using a forbidden default-like value`);
    }
  }
}

function validateAuthContract(environment, errors) {
  for (const [name, expected] of Object.entries(AUTH_TARGET)) {
    if (environment.get(name)?.trim().toLowerCase() !== expected) {
      errors.push(`${name} does not satisfy the Godel Auth contract`);
    }
  }
}

function validateCrossFileContract(supabase, godel, errors) {
  if (hasValue(supabase, "SUPABASE_SECRET_KEY") && hasValue(godel, "SUPABASE_SECRET_KEY") && supabase.get("SUPABASE_SECRET_KEY") !== godel.get("SUPABASE_SECRET_KEY")) {
    errors.push("SUPABASE_SECRET_KEY mismatch");
  }

  if (hasValue(supabase, "SUPABASE_PUBLISHABLE_KEY") && hasValue(godel, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") && supabase.get("SUPABASE_PUBLISHABLE_KEY") !== godel.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
    errors.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY mismatch");
  }
}

function evaluateContract({ supabase, godel, template }) {
  const errors = [];
  const optionalPresent = OPTIONAL_UNUSED.filter((name) => hasValue(supabase, name));

  requireVariables(supabase, REQUIRED_SUPABASE, errors);
  requireVariables(godel, REQUIRED_GODEL, errors);

  if (asymmetricAuthActive(supabase)) {
    requireVariables(supabase, ["JWT_KEYS", "JWT_JWKS"], errors);
    validateJson(supabase, "JWT_KEYS", errors);
    validateJson(supabase, "JWT_JWKS", errors);
  }

  validateJwtShape(supabase, "ANON_KEY", errors);
  validateJwtShape(supabase, "SERVICE_ROLE_KEY", errors);
  validateUrl(godel, "NEXT_PUBLIC_SUPABASE_URL", errors);
  validateUrl(godel, "SUPABASE_SERVER_URL", errors);

  validateMinimumLength(supabase, "POSTGRES_PASSWORD", 16, errors);
  validateMinimumLength(supabase, "JWT_SECRET", 32, errors);
  validateMinimumLength(supabase, "SUPABASE_PUBLISHABLE_KEY", 16, errors);
  validateMinimumLength(supabase, "SUPABASE_SECRET_KEY", 16, errors);
  validateMinimumLength(supabase, "DASHBOARD_PASSWORD", 16, errors);
  validateMinimumLength(supabase, "SECRET_KEY_BASE", 64, errors);
  validateMinimumLength(supabase, "REALTIME_DB_ENC_KEY", 16, errors);
  validateMinimumLength(supabase, "VAULT_ENC_KEY", 32, errors);
  validateMinimumLength(supabase, "PG_META_CRYPTO_KEY", 32, errors);

  validateKnownDefaults(supabase, template, errors);
  validateAuthContract(supabase, errors);
  validateCrossFileContract(supabase, godel, errors);

  return { errors, optionalPresent };
}

export async function checkSecretContract(paths) {
  const [supabase, godel, template] = await Promise.all([
    readEnvironmentFile(paths.supabaseEnv, "Supabase"),
    readEnvironmentFile(paths.godelEnv, "Godel"),
    readEnvironmentFile(paths.templateEnv, "tracked template"),
  ]);

  return evaluateContract({ supabase, godel, template });
}

export async function checkSecretContractFiles({ supabaseEnv, godelEnv, templateEnv }) {
  return checkSecretContract({
    supabaseEnv: resolve(supabaseEnv),
    godelEnv: resolve(godelEnv),
    templateEnv: resolve(templateEnv),
  });
}

async function main() {
  const paths = parseArguments(process.argv.slice(2));
  const result = await checkSecretContract(paths);

  for (const name of result.optionalPresent) {
    console.log(`INFO: ${name} is optional and unused in the normal Godel contract`);
  }

  if (result.errors.length > 0) {
    for (const message of result.errors) {
      console.error(`FAIL: ${message}`);
    }

    process.exitCode = 1;
    return;
  }

  console.log("PASS: self-hosted secret contract is valid");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : "secret contract check failed"}`);
    process.exitCode = 1;
  });
}
