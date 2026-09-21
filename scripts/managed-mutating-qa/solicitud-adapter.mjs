import { createClient } from "@supabase/supabase-js";

const SOLICITUD_FIELDS = [
  "id",
  "public_reference",
  "description",
  "workflow_type",
  "cliente_id",
  "converted_order_id",
].join(", ");

function required(value, code) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(code);
  }
  return value;
}

function assertQuerySucceeded(error, code) {
  if (error) {
    throw new Error(code);
  }
}

export async function createAuthenticatedSolicitudAdapter({
  supabaseUrl,
  publishableKey,
  email,
  password,
  createClientFn = createClient,
}) {
  const client = createClientFn(
    required(supabaseUrl, "CLEANUP_SUPABASE_URL_REQUIRED"),
    required(publishableKey, "CLEANUP_PUBLISHABLE_KEY_REQUIRED"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  const { error: authenticationError } = await client.auth.signInWithPassword({
    email: required(email, "CLEANUP_ADMIN_EMAIL_REQUIRED"),
    password: required(password, "CLEANUP_ADMIN_PASSWORD_REQUIRED"),
  });
  assertQuerySucceeded(authenticationError, "CLEANUP_ADMIN_AUTH_FAILED");

  return {
    async findByOwnership(ownershipValue) {
      const { data, error } = await client
        .from("solicitudes")
        .select(SOLICITUD_FIELDS)
        .eq("description", ownershipValue)
        .limit(2);
      assertQuerySucceeded(error, "CLEANUP_DISCOVERY_FAILED");
      return data ?? [];
    },

    async fetchById(remoteId) {
      const { data, error } = await client
        .from("solicitudes")
        .select(SOLICITUD_FIELDS)
        .eq("id", remoteId)
        .maybeSingle();
      assertQuerySucceeded(error, "CLEANUP_DISCOVERY_FAILED");
      return data;
    },

    async deleteExact(remoteId, ownershipValue) {
      const { error } = await client
        .from("solicitudes")
        .delete()
        .eq("id", remoteId)
        .eq("description", ownershipValue);
      assertQuerySucceeded(error, "CLEANUP_DELETE_FAILED");
    },
  };
}
