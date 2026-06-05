import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";
import type { Tables } from "@/types/database";
import {
  isInternalUserRole,
  type InternalUserRole,
} from "./roles";

export type InternalUserActiveFilter = boolean;

export type InternalUser = Pick<
  Tables<"perfiles">,
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

type ListInternalUsersMeta = {
  q: string | null;
  role: InternalUserRole | null;
  active: InternalUserActiveFilter | null;
  ignoredInvalidRole: boolean;
  ignoredInvalidActive: boolean;
};

export type ListInternalUsersErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListInternalUsersResult = ServiceResult<
  { users: InternalUser[] } & ListInternalUsersMeta,
  ListInternalUsersErrorReason,
  ListInternalUsersMeta
>;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los usuarios internos. Inténtalo nuevamente.";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  const finiteLimit = limit ?? DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
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
  const meta = {
    q,
    role,
    active,
    ignoredInvalidRole,
    ignoredInvalidActive,
  };
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ver usuarios internos.",
      meta,
    );
  }

  if (!hasPermission(profile.role, "usuarios.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver usuarios internos.",
      meta,
    );
  }

  const limit = normalizeLimit(options.limit);
  const supabase = await createClient();

  try {
    let query = supabase
      .from("perfiles")
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

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    return serviceSuccess({
      users: data ?? [],
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal users", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
