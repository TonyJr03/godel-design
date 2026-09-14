import { createClient } from "@/lib/supabase/client";

export async function getStorageAccessToken(): Promise<string | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getSession();
  return error || !data.session?.access_token ? null : data.session.access_token;
}
