import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const ADMIN_CLIENT_CONFIG = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
} as const;

function readRequiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error("Supabase admin client is not configured.");
  }

  return value;
}

export function createAdminClient() {
  const supabaseUrl = readRequiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
  const secretKey = readRequiredEnvironment("SUPABASE_SECRET_KEY");
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (publishableKey && secretKey === publishableKey) {
    throw new Error("Supabase admin client is not configured.");
  }

  return createClient<Database>(supabaseUrl, secretKey, ADMIN_CLIENT_CONFIG);
}
