import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test } from "@playwright/test";

import type { Database } from "@/types/database";
import type { QaRole } from "./auth";

type QaSupabaseClient = SupabaseClient<Database>;

const credentialPrefixes = {
  admin: "GODEL_TEST_ADMIN",
  supervisor: "GODEL_TEST_SUPERVISOR",
  worker: "GODEL_TEST_WORKER",
} satisfies Record<QaRole, string>;

function readLocalEnv(name: string) {
  if (process.env[name]) {
    return process.env[name];
  }

  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return undefined;
  }

  const line = readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));

  if (!line) {
    return undefined;
  }

  return line.slice(line.indexOf("=") + 1).trim().replace(/^['"]|['"]$/g, "");
}

export async function createQaSupabaseClient(
  role: QaRole = "admin",
): Promise<QaSupabaseClient> {
  const supabaseUrl = readLocalEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseKey = readLocalEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const prefix = credentialPrefixes[role];
  const email = readLocalEnv(`${prefix}_EMAIL`);
  const password = readLocalEnv(`${prefix}_PASSWORD`);

  if (!supabaseUrl || !supabaseKey || !email || !password) {
    test.skip(
      true,
      `Supabase QA environment or credentials for ${role} are not configured.`,
    );
  }

  const supabase = createClient<Database>(supabaseUrl!, supabaseKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: email!,
    password: password!,
  });

  if (error) {
    throw new Error(`Could not authenticate Supabase QA client for ${role}.`);
  }

  return supabase;
}

export async function signOutQaSupabaseClient(supabase: QaSupabaseClient) {
  await supabase.auth.signOut();
}
