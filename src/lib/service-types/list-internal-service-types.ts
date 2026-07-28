import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  createPaginationMeta,
  getPaginationRange,
  INTERNAL_LIST_PAGE_SIZE,
  normalizePageParam,
} from "@/lib/pagination";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { normalizeSearchQuery } from "@/lib/utils";
import type {
  InternalServiceType,
  InternalServiceTypeRow,
  ListInternalServiceTypesData,
  ListInternalServiceTypesErrorReason,
  ListInternalServiceTypesMeta,
  ListInternalServiceTypesOptions,
  ServiceTypeAvailabilityFilter,
} from "./types";

export type ListInternalServiceTypesResult = ServiceResult<
  ListInternalServiceTypesData,
  ListInternalServiceTypesErrorReason,
  ListInternalServiceTypesMeta
>;

const MAX_LIMIT = 100;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar los servicios. Inténtalo nuevamente.";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return INTERNAL_LIST_PAGE_SIZE;
  }

  const finiteLimit = limit ?? INTERNAL_LIST_PAGE_SIZE;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

function normalizeAvailabilityFilter(
  value: string | null | undefined,
): ServiceTypeAvailabilityFilter | null {
  if (value === "public" || value === "hidden") {
    return value;
  }

  return null;
}

function toInternalServiceType(row: InternalServiceTypeRow): InternalServiceType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workflowType: row.workflow_type,
    isPubliclyAvailable: row.is_publicly_available,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listInternalServiceTypes(
  options: ListInternalServiceTypesOptions = {},
): Promise<ListInternalServiceTypesResult> {
  const q = normalizeSearchQuery(options.q);
  const availability = normalizeAvailabilityFilter(options.availability);
  const ignoredInvalidAvailability = Boolean(
    options.availability && !availability,
  );
  const meta = { q, availability, ignoredInvalidAvailability };
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      meta,
    );
  }

  if (!hasPermission(profile.role, "configuracion.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver configuración.",
      meta,
    );
  }

  const limit = normalizeLimit(options.limit);
  const requestedPage = normalizePageParam(options.page);
  const supabase = await createClient();

  try {
    const {
      error: publicEncargoCountError,
      count: publicEncargoCount,
    } = await supabase
      .from("tipos_servicio")
      .select("id", { count: "exact", head: true })
      .eq("workflow_type", "encargo")
      .eq("is_publicly_available", true);

    if (
      publicEncargoCountError ||
      typeof publicEncargoCount !== "number"
    ) {
      console.error(
        "Error counting public encargo service types",
        publicEncargoCountError ?? { count: publicEncargoCount },
      );

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    const searchCondition = q
      ? `name.ilike.*${q}*,description.ilike.*${q}*`
      : null;
    let countQuery = supabase
      .from("tipos_servicio")
      .select("id", { count: "exact", head: true });

    if (searchCondition) {
      countQuery = countQuery.or(searchCondition);
    }

    if (availability) {
      countQuery = countQuery.eq(
        "is_publicly_available",
        availability === "public",
      );
    }

    const { error: countError, count } = await countQuery;

    if (countError) {
      console.error("Error counting internal service types", countError);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    const pagination = createPaginationMeta({
      page: requestedPage,
      pageSize: limit,
      totalCount: count,
    });

    if (pagination.totalCount === 0) {
      return serviceSuccess({
        serviceTypes: [],
        pagination,
        publicEncargoCount,
        ...meta,
      });
    }

    let serviceTypesQuery = supabase
      .from("tipos_servicio")
      .select(
        "id, name, description, workflow_type, is_publicly_available, created_at, updated_at",
      );

    if (searchCondition) {
      serviceTypesQuery = serviceTypesQuery.or(searchCondition);
    }

    if (availability) {
      serviceTypesQuery = serviceTypesQuery.eq(
        "is_publicly_available",
        availability === "public",
      );
    }

    const { from, to } = getPaginationRange(
      pagination.page,
      pagination.pageSize,
    );
    const { data, error } = await serviceTypesQuery
      .order("workflow_type", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
      .returns<InternalServiceTypeRow[]>();

    if (error) {
      console.error("Error listing internal service types page", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    return serviceSuccess({
      serviceTypes: (data ?? []).map(toInternalServiceType),
      pagination,
      publicEncargoCount,
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal service types", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
