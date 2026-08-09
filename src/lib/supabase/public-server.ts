import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  getSupabasePublishableKey,
  getSupabaseServerUrl,
} from "@/lib/supabase/server-config";
import type { Database } from "@/types/database";

export function createPublicServerClient() {
  return createClient<Database>(
    getSupabaseServerUrl(),
    getSupabasePublishableKey(),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
