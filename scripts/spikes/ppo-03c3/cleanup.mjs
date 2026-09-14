import { existsSync, readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

const FIXTURE_PREFIX = "PPO-03C.3B managed QA";

function fail(code) {
  throw new Error(code);
}

function readEnvFile(fileName) {
  const values = new Map();
  if (!existsSync(fileName)) return values;
  for (const line of readFileSync(fileName, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    values.set(line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, ""));
  }
  return values;
}

function readEnvValue(name) {
  return process.env[name]
    ?? readEnvFile("compose.env.local").get(name)
    ?? readEnvFile(".env.local").get(name);
}

async function main() {
  const url = readEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const email = readEnvValue("GODEL_MANAGED_TEST_ADMIN_EMAIL");
  const password = readEnvValue("GODEL_MANAGED_TEST_ADMIN_PASSWORD");
  if (!url || !key || !email || !password) fail("PPO03C3_CLEANUP_CONFIG_MISSING");
  if (["localhost", "127.0.0.1"].includes(new URL(url).hostname)) fail("PPO03C3_CLEANUP_POINTS_TO_LOCAL");

  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  try {
    const { data: login, error: loginError } = await client.auth.signInWithPassword({ email, password });
    if (loginError || !login.session) fail("PPO03C3_CLEANUP_LOGIN_FAILED");
    const { data: fixtures, error: lookupError } = await client
      .from("solicitudes")
      .select("id")
      .like("client_name", `${FIXTURE_PREFIX}%`)
      .limit(20);
    if (lookupError || !fixtures) fail("PPO03C3_CLEANUP_LOOKUP_FAILED");

    let removed = 0;
    for (const fixture of fixtures) {
      const { error } = await client.from("solicitudes").delete().eq("id", fixture.id);
      if (!error) removed += 1;
    }
    const { data: remaining, error: verificationError } = await client
      .from("solicitudes")
      .select("id")
      .like("client_name", `${FIXTURE_PREFIX}%`)
      .limit(20);
    if (verificationError || !remaining) fail("PPO03C3_CLEANUP_VERIFICATION_FAILED");
    console.log(`stranded_public_fixtures_removed=${removed}`);
    console.log(`stranded_public_fixture_residue=${remaining.length}`);
    if (remaining.length) process.exitCode = 1;
  } finally {
    await client.auth.signOut();
  }
}

main().catch((error) => {
  const code = error instanceof Error && /^PPO03C3_[A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "PPO03C3_CLEANUP_FAILED";
  console.error(code);
  process.exitCode = 1;
});
