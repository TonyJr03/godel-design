import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  createPaginationMeta,
  getPaginationRange,
  INTERNAL_LIST_PAGE_SIZE,
  normalizePageParam,
  type PaginationMeta,
} from "@/lib/pagination";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";
import type { InternalCliente } from "./types";

export type ListInternalClientesOptions = {
  q?: string | null;
  page?: string | number | null;
  limit?: number;
};

export type ListInternalClientesErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListInternalClientesResult = ServiceResult<
  {
    clientes: InternalCliente[];
    q: string | null;
    pagination: PaginationMeta;
  },
  ListInternalClientesErrorReason,
  {
    q: string | null;
  }
>;

const MAX_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los clientes. Inténtalo nuevamente.";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return INTERNAL_LIST_PAGE_SIZE;
  }

  const finiteLimit = limit ?? INTERNAL_LIST_PAGE_SIZE;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

export async function listInternalClientes(
  options: ListInternalClientesOptions = {},
): Promise<ListInternalClientesResult> {
  const q = normalizeSearchQuery(options.q);
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      { q },
    );
  }

  if (!hasPermission(profile.role, "clientes.view")) {
    return serviceFailure("forbidden", "No tienes permiso para ver clientes.", {
      q,
    });
  }

  const limit = normalizeLimit(options.limit);
  const requestedPage = normalizePageParam(options.page);
  const supabase = await createClient();

  try {
    const searchCondition = q
      ? `name.ilike.*${q}*,phone.ilike.*${q}*,email.ilike.*${q}*,notes.ilike.*${q}*`
      : null;
    let countQuery = supabase
      .from("clientes")
      .select("id", { count: "exact", head: true });

    if (searchCondition) {
      countQuery = countQuery.or(searchCondition);
    }

    const { error: countError, count } = await countQuery;

    if (countError) {
      console.error("Error counting internal clientes", countError);

      return serviceFailure("error", GENERIC_LIST_ERROR, { q });
    }

    const pagination = createPaginationMeta({
      page: requestedPage,
      pageSize: limit,
      totalCount: count,
    });

    if (pagination.totalCount === 0) {
      return serviceSuccess({
        clientes: [],
        q,
        pagination,
      });
    }

    let dataQuery = supabase
      .from("clientes")
      .select("id, name, phone, email, created_at, updated_at");

    if (searchCondition) {
      dataQuery = dataQuery.or(searchCondition);
    }

    const { from, to } = getPaginationRange(
      pagination.page,
      pagination.pageSize,
    );
    const { data, error } = await dataQuery
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<InternalCliente[]>();

    if (error) {
      console.error("Error listing internal clientes page", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, { q });
    }

    return serviceSuccess({
      clientes: data ?? [],
      q,
      pagination,
    });
  } catch (error) {
    console.error("Unexpected error listing internal clientes", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, { q });
  }
}
