import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { Constants, type Enums, type Tables } from "@/types/database";

export const INTERNAL_USER_ROLES = Constants.public.Enums.app_role;

export type InternalUserRole = Enums<"app_role">;
export type InternalUserActiveFilter = boolean;

export type InternalUser = Pick<
  Tables<"profiles">,
  | "id"
  | "full_name"
  | "role"
  | "phone"
  | "avatar_url"
  | "is_active"
  | "created_at"
  | "updated_at"
>;

export type ListInternalUsersOptions = {
  q?: string | null;
  role?: string | null;
  active?: string | null;
  limit?: number;
};

export type ListInternalUsersResult =
  | {
      ok: true;
      users: InternalUser[];
      q: string | null;
      role: InternalUserRole | null;
      active: InternalUserActiveFilter | null;
      ignoredInvalidRole: boolean;
      ignoredInvalidActive: boolean;
    }
  | {
      ok: false;
      reason: "unauthorized" | "error";
      message: string;
      q: string | null;
      role: InternalUserRole | null;
      active: InternalUserActiveFilter | null;
      ignoredInvalidRole: boolean;
      ignoredInvalidActive: boolean;
    };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 80;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los usuarios internos. Inténtalo nuevamente.";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  const finiteLimit = limit ?? DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

function normalizeSearchQuery(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value
    .replace(/[(),*%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);

  return normalized || null;
}

export function isInternalUserRole(
  role: string | null | undefined,
): role is InternalUserRole {
  return INTERNAL_USER_ROLES.includes(role as InternalUserRole);
}

function normalizeActiveFilter(
  active: string | null | undefined,
): InternalUserActiveFilter | null {
  if (active === "true") {
    return true;
  }

  if (active === "false") {
    return false;
  }

  return null;
}

export async function listInternalUsers(
  options: ListInternalUsersOptions = {},
): Promise<ListInternalUsersResult> {
  const q = normalizeSearchQuery(options.q);
  const role = isInternalUserRole(options.role) ? options.role : null;
  const active = normalizeActiveFilter(options.active);
  const ignoredInvalidRole = Boolean(options.role && !role);
  const ignoredInvalidActive = Boolean(options.active && active === null);
  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "usuarios.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver usuarios internos.",
      q,
      role,
      active,
      ignoredInvalidRole,
      ignoredInvalidActive,
    };
  }

  const limit = normalizeLimit(options.limit);
  const supabase = await createClient();

  try {
    let query = supabase
      .from("profiles")
      .select(
        "id, full_name, role, phone, avatar_url, is_active, created_at, updated_at",
      )
      .order("full_name", { ascending: true })
      .limit(limit);

    if (q) {
      query = query.or(`full_name.ilike.*${q}*,phone.ilike.*${q}*`);
    }

    if (role) {
      query = query.eq("role", role);
    }

    if (active !== null) {
      query = query.eq("is_active", active);
    }

    const { data, error } = await query.returns<InternalUser[]>();

    if (error) {
      console.error("Error listing internal users", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_LIST_ERROR,
        q,
        role,
        active,
        ignoredInvalidRole,
        ignoredInvalidActive,
      };
    }

    return {
      ok: true,
      users: data ?? [],
      q,
      role,
      active,
      ignoredInvalidRole,
      ignoredInvalidActive,
    };
  } catch (error) {
    console.error("Unexpected error listing internal users", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_LIST_ERROR,
      q,
      role,
      active,
      ignoredInvalidRole,
      ignoredInvalidActive,
    };
  }
}
