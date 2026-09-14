function getPublicSupabaseNamespace() {
  const publicUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);

  return `${publicUrl.protocol}//${publicUrl.host}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const GODEL_SUPABASE_AUTH_COOKIE_NAME = `sb-godel-${getPublicSupabaseNamespace()}-auth-token`;
