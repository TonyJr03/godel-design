import { readFileSync } from "node:fs";

const SUPABASE_REQUIRED = [
  "SUPABASE_PUBLIC_URL",
  "API_EXTERNAL_URL",
  "SITE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
];

const GODEL_REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVER_URL",
  "SUPABASE_SECRET_KEY",
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function parseArguments(argumentsList) {
  if (
    argumentsList.length !== 4 ||
    argumentsList[0] !== "--supabase-env" ||
    argumentsList[2] !== "--godel-env" ||
    !argumentsList[1] ||
    !argumentsList[3]
  ) {
    throw new Error(
      "usage: node scripts/validate-selfhosted-runtime-env.mjs --supabase-env <path> --godel-env <path>",
    );
  }

  return {
    supabaseEnvPath: argumentsList[1],
    godelEnvPath: argumentsList[3],
  };
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
      continue;
    }

    const [, name, rawValue] = assignment;
    if (values.has(name)) {
      throw new Error(`duplicate variable ${name} in ${sourceName}`);
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

function requireVariables(environment, names) {
  const missing = names.filter((name) => !environment.get(name)?.trim());

  if (missing.length > 0) {
    throw new Error(`missing required variable ${missing[0]}`);
  }
}

function normalizeUrl(value) {
  const parsed = new URL(value);

  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("invalid URL");
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.protocol}//${parsed.host}${pathname}`;
}

function validateUrlContract(supabase, godel) {
  let publicUrl;
  let apiExternalUrl;
  let siteUrl;
  let godelPublicUrl;

  try {
    publicUrl = normalizeUrl(supabase.get("SUPABASE_PUBLIC_URL"));
    apiExternalUrl = normalizeUrl(supabase.get("API_EXTERNAL_URL"));
    siteUrl = normalizeUrl(supabase.get("SITE_URL"));
    godelPublicUrl = normalizeUrl(godel.get("NEXT_PUBLIC_SUPABASE_URL"));
  } catch {
    throw new Error("invalid URL contract");
  }

  if (godelPublicUrl !== publicUrl) {
    throw new Error("public URL mismatch");
  }

  if (apiExternalUrl !== `${godelPublicUrl}/auth/v1`) {
    throw new Error("API_EXTERNAL_URL contract mismatch");
  }

  if (siteUrl !== godelPublicUrl) {
    throw new Error("SITE_URL contract mismatch");
  }
}

function readEnvironmentFile(filePath, sourceName) {
  try {
    return parseEnvironmentFile(readFileSync(filePath, "utf8"), sourceName);
  } catch (error) {
    if (error instanceof Error && error.code === "ENOENT") {
      throw new Error(`unable to read ${sourceName} env`);
    }

    throw error;
  }
}

function main() {
  const { supabaseEnvPath, godelEnvPath } = parseArguments(process.argv.slice(2));
  const supabase = readEnvironmentFile(supabaseEnvPath, "Supabase");
  const godel = readEnvironmentFile(godelEnvPath, "Godel");

  requireVariables(supabase, SUPABASE_REQUIRED);
  requireVariables(godel, GODEL_REQUIRED);

  if (
    godel.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") !==
    supabase.get("SUPABASE_PUBLISHABLE_KEY")
  ) {
    throw new Error("publishable key mismatch");
  }

  if (godel.get("SUPABASE_SECRET_KEY") !== supabase.get("SUPABASE_SECRET_KEY")) {
    throw new Error("secret key mismatch");
  }

  validateUrlContract(supabase, godel);

  if (godel.get("SUPABASE_SERVER_URL").trim() !== "http://api-gw:8000") {
    throw new Error("SUPABASE_SERVER_URL contract mismatch");
  }

  console.log("PASS: self-hosted runtime environment contract is valid");
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : "environment validation failed");
}
