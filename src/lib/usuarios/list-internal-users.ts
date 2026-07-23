import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  createPaginationMeta,
  getPaginationRange,
  INTERNAL_LIST_PAGE_SIZE,
  normalizePageParam,
  type PaginationMeta,
} from "@/lib/pagination";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";
import {
  isInternalUserRole,
  type InternalUserRole,
} from "./roles";
import type { InternalUser } from "./types";

export type InternalUserActiveFilter = boolean;

export type ListInternalUsersOptions = {
  q?: string | null;
  role?: string | null;
  active?: string | null;
  page?: string | number | null;
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
  { users: InternalUser[]; pagination: PaginationMeta } & ListInternalUsersMeta,
  ListInternalUsersErrorReason,
  ListInternalUsersMeta
>;

const MAX_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los usuarios internos. Inténtalo nuevamente.";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return INTERNAL_LIST_PAGE_SIZE;
  }

  const finiteLimit = limit ?? INTERNAL_LIST_PAGE_SIZE;

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
  const requestedPage = normalizePageParam(options.page);
  const supabase = await createClient();

  try {
    const searchCondition = q
      ? `full_name.ilike.*${q}*,phone.ilike.*${q}*`
      : null;
    let countQuery = supabase
      .from("perfiles")
      .select("id", { count: "exact", head: true });

    if (searchCondition) {
      countQuery = countQuery.or(searchCondition);
    }

    if (role) {
      countQuery = countQuery.eq("role", role);
    }

    if (active !== null) {
      countQuery = countQuery.eq("is_active", active);
    }

    const { error: countError, count } = await countQuery;

    if (countError) {
      console.error("Error counting internal users", countError);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    const pagination = createPaginationMeta({
      page: requestedPage,
      pageSize: limit,
      totalCount: count,
    });

    if (pagination.totalCount === 0) {
      return serviceSuccess({
        users: [],
        pagination,
        ...meta,
      });
    }

    let dataQuery = supabase
      .from("perfiles")
      .select(
        "id, full_name, role, phone, avatar_url, is_active, created_at, updated_at",
      );

    if (searchCondition) {
      dataQuery = dataQuery.or(searchCondition);
    }

    if (role) {
      dataQuery = dataQuery.eq("role", role);
    }

    if (active !== null) {
      dataQuery = dataQuery.eq("is_active", active);
    }

    const { from, to } = getPaginationRange(
      pagination.page,
      pagination.pageSize,
    );
    const { data, error } = await dataQuery
      .order("full_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<InternalUser[]>();

    if (error) {
      console.error("Error listing internal users page", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    return serviceSuccess({
      users: data ?? [],
      pagination,
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal users", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
