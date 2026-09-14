import { createBrowserClient } from "@supabase/ssr";
import { GODEL_SUPABASE_AUTH_COOKIE_NAME } from "./auth-cookie";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: { name: GODEL_SUPABASE_AUTH_COOKIE_NAME },
    },
  );
}
