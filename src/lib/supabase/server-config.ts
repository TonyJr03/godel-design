import "server-only";

const INCOMPLETE_SUPABASE_CONFIG_ERROR =
  "Supabase server configuration is incomplete.";

function readOptionalEnvironment(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readRequiredServerEnvironment(name: string): string {
  const value = readOptionalEnvironment(name);

  if (!value) {
    throw new Error(INCOMPLETE_SUPABASE_CONFIG_ERROR);
  }

  return value;
}

export function getSupabaseServerUrl(): string {
  return (
    readOptionalEnvironment("SUPABASE_SERVER_URL") ??
    readRequiredServerEnvironment("NEXT_PUBLIC_SUPABASE_URL")
  );
}

export function getSupabasePublicUrl(): string {
  return readRequiredServerEnvironment("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabasePublishableKey(): string {
  return readRequiredServerEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}
