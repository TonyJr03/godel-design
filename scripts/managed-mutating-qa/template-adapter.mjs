import { createClient } from "@supabase/supabase-js";

const TEMPLATE_FIELDS = "id, name, description, is_active";
const TASK_FIELDS = "id, template_id, title, task_type, target_quantity, sort_order";

function required(value, code) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(code);
  }
  return value;
}

function assertQuerySucceeded(error, code) {
  if (error) throw new Error(code);
}

export async function createAuthenticatedTemplateAdapter({
  supabaseUrl,
  publishableKey,
  email,
  password,
  createClientFn = createClient,
}) {
  const client = createClientFn(
    required(supabaseUrl, "TEMPLATE_SUPABASE_URL_REQUIRED"),
    required(publishableKey, "TEMPLATE_PUBLISHABLE_KEY_REQUIRED"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  const { data: authenticationData, error: authenticationError } =
    await client.auth.signInWithPassword({
      email: required(email, "TEMPLATE_ADMIN_EMAIL_REQUIRED"),
      password: required(password, "TEMPLATE_ADMIN_PASSWORD_REQUIRED"),
    });
  assertQuerySucceeded(authenticationError, "TEMPLATE_ADMIN_AUTH_FAILED");
  const authenticatedUserId = required(
    authenticationData?.user?.id,
    "TEMPLATE_ADMIN_AUTH_FAILED",
  );

  return {
    async createInactiveTemplate({ name, description, isActive }) {
      if (isActive !== false) throw new Error("TEMPLATE_MUST_BE_INACTIVE");
      const { data, error } = await client
        .from("trabajo_plantillas")
        .insert({
          name: required(name, "TEMPLATE_NAME_REQUIRED"),
          description: required(description, "TEMPLATE_DESCRIPTION_REQUIRED"),
          is_active: false,
          created_by: authenticatedUserId,
          updated_by: authenticatedUserId,
        })
        .select(TEMPLATE_FIELDS)
        .single();
      assertQuerySucceeded(error, "TEMPLATE_INSERT_FAILED");
      if (!data) throw new Error("TEMPLATE_INSERT_FAILED");
      return data;
    },

    async findTemplateByOwnership(ownershipValue) {
      const { data, error } = await client
        .from("trabajo_plantillas")
        .select(TEMPLATE_FIELDS)
        .eq("name", ownershipValue)
        .limit(2);
      assertQuerySucceeded(error, "CLEANUP_DISCOVERY_FAILED");
      return data ?? [];
    },

    async fetchTemplateById(remoteId) {
      const { data, error } = await client
        .from("trabajo_plantillas")
        .select(TEMPLATE_FIELDS)
        .eq("id", remoteId)
        .maybeSingle();
      assertQuerySucceeded(error, "CLEANUP_DISCOVERY_FAILED");
      return data;
    },

    async listTasksByTemplateId(remoteId) {
      const { data, error } = await client
        .from("trabajo_plantilla_tareas")
        .select(TASK_FIELDS)
        .eq("template_id", remoteId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      assertQuerySucceeded(error, "CLEANUP_DISCOVERY_FAILED");
      return data ?? [];
    },

    async deleteTemplateExact(remoteId, ownershipValue, isActive) {
      if (isActive !== false) throw new Error("TEMPLATE_DELETE_MUST_BE_INACTIVE");
      const { error } = await client
        .from("trabajo_plantillas")
        .delete()
        .eq("id", remoteId)
        .eq("name", ownershipValue)
        .eq("is_active", false);
      assertQuerySucceeded(error, "CLEANUP_DELETE_FAILED");
    },
  };
}
