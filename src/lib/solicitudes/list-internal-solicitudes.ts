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
import { isValidUuid } from "@/lib/validators";
import { getSolicitudServiceTypeSearchValues } from "./labels";
import { mapInternalSolicitud } from "./mappers";
import { SOLICITUD_STATUSES, type SolicitudStatus } from "./status";
import type { InternalSolicitud, InternalSolicitudRow } from "./types";

export const INTERNAL_SOLICITUD_ESTADOS = SOLICITUD_STATUSES;

export type InternalSolicitudEstado = SolicitudStatus;

export type ListInternalSolicitudesOptions = {
  q?: string | null;
  status?: string | null;
  serviceId?: string | null;
  page?: string | number | null;
  limit?: number;
};

type ListInternalSolicitudesMeta = {
  q: string | null;
  status: InternalSolicitudEstado | null;
  serviceId: string | null;
  ignoredInvalidEstado: boolean;
  ignoredInvalidServiceId: boolean;
};

export type ListInternalSolicitudesErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListInternalSolicitudesResult = ServiceResult<
  {
    solicitudes: InternalSolicitud[];
    pagination: PaginationMeta;
  } & ListInternalSolicitudesMeta,
  ListInternalSolicitudesErrorReason,
  Partial<ListInternalSolicitudesMeta>
>;

const MAX_LIMIT = 100;
const REFERENCE_SCAN_LIMIT = 500;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar las solicitudes. Inténtalo nuevamente.";
const SOLICITUDES_SELECT = `
  id,
  client_name,
  client_phone,
  client_email,
  workflow_type,
  service_id,
  service_type,
  status,
  created_at,
  desired_date,
  service:tipos_servicio!solicitudes_service_id_fkey(
    id,
    name,
    workflow_type,
    is_publicly_available
  )
`;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return INTERNAL_LIST_PAGE_SIZE;
  }

  const finiteLimit = limit ?? INTERNAL_LIST_PAGE_SIZE;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

export function isInternalSolicitudEstado(
  status: string | null | undefined,
): status is InternalSolicitudEstado {
  return INTERNAL_SOLICITUD_ESTADOS.includes(status as InternalSolicitudEstado);
}

function canMatchVisibleSolicitudReference(query: string): boolean {
  const compactQuery = query.replace(/-/g, "").toLowerCase();

  return (
    compactQuery.length >= 4 &&
    /^[0-9a-f]+$/.test(compactQuery)
  );
}

function matchesVisibleSolicitudReference(id: string, query: string): boolean {
  const compactQuery = query.replace(/-/g, "").toLowerCase();

  return (
    canMatchVisibleSolicitudReference(query) &&
    id.replace(/-/g, "").toLowerCase().startsWith(compactQuery)
  );
}

function formatPostgrestInValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildSolicitudSearchCondition(
  q: string | null,
  referenceIds: string[],
  serviceIds: string[],
): string | null {
  if (!q) {
    return null;
  }

  const conditions = [
    `client_name.ilike.*${q}*`,
    `client_phone.ilike.*${q}*`,
    `client_email.ilike.*${q}*`,
    `public_reference.ilike.*${q}*`,
    `service_type.ilike.*${q}*`,
    `description.ilike.*${q}*`,
    `notes.ilike.*${q}*`,
  ];
  const serviceTypeValues = getSolicitudServiceTypeSearchValues(q);

  if (serviceTypeValues.length > 0) {
    conditions.push(
      `service_type.in.(${serviceTypeValues
        .map(formatPostgrestInValue)
        .join(",")})`,
    );
  }

  if (referenceIds.length > 0) {
    conditions.push(`id.in.(${referenceIds.join(",")})`);
  }

  if (serviceIds.length > 0) {
    conditions.push(`service_id.in.(${serviceIds.join(",")})`);
  }

  return conditions.join(",");
}

export async function listInternalSolicitudes(
  options: ListInternalSolicitudesOptions = {},
): Promise<ListInternalSolicitudesResult> {
  const q = normalizeSearchQuery(options.q);
  const selectedEstado = isInternalSolicitudEstado(options.status)
    ? options.status
    : null;
  const selectedServiceId = options.serviceId && isValidUuid(options.serviceId)
    ? options.serviceId
    : null;
  const ignoredInvalidEstado = Boolean(options.status && !selectedEstado);
  const ignoredInvalidServiceId = Boolean(options.serviceId && !selectedServiceId);
  const meta = {
    q,
    status: selectedEstado,
    serviceId: selectedServiceId,
    ignoredInvalidEstado,
    ignoredInvalidServiceId,
  };
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      meta,
    );
  }

  if (!hasPermission(profile.role, "solicitudes.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver solicitudes.",
      meta,
    );
  }

  const limit = normalizeLimit(options.limit);
  const requestedPage = normalizePageParam(options.page);
  const supabase = await createClient();

  try {
    let referenceIds: string[] = [];
    let serviceIds: string[] = [];

    if (q) {
      const { data: serviceRows, error: serviceRowsError } = await supabase
        .from("tipos_servicio")
        .select("id")
        .ilike("name", `%${q}%`)
        .limit(REFERENCE_SCAN_LIMIT)
        .returns<Array<{ id: string }>>();

      if (serviceRowsError) {
        console.error(
          "Error resolving solicitud search services",
          serviceRowsError,
        );

        return serviceFailure("error", GENERIC_LIST_ERROR, meta);
      }

      serviceIds = (serviceRows ?? []).map((service) => service.id);
    }

    if (q && canMatchVisibleSolicitudReference(q)) {
      let referenceQuery = supabase
        .from("solicitudes")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(REFERENCE_SCAN_LIMIT);

      if (selectedEstado) {
        referenceQuery = referenceQuery.eq("status", selectedEstado);
      }

      if (selectedServiceId) {
        referenceQuery = referenceQuery.eq("service_id", selectedServiceId);
      }

      const { data: referenceRows, error: referenceError } =
        await referenceQuery.returns<Array<{ id: string }>>();

      if (referenceError) {
        console.error(
          "Error resolving visible solicitud references",
          referenceError,
        );

        return serviceFailure("error", GENERIC_LIST_ERROR, meta);
      }

      referenceIds = (referenceRows ?? [])
        .filter((solicitud) =>
          matchesVisibleSolicitudReference(solicitud.id, q),
        )
        .map((solicitud) => solicitud.id);
    }

    const searchCondition = buildSolicitudSearchCondition(
      q,
      referenceIds,
      serviceIds,
    );
    let countQuery = supabase
      .from("solicitudes")
      .select("id", { count: "exact", head: true });

    if (selectedEstado) {
      countQuery = countQuery.eq("status", selectedEstado);
    }

    if (selectedServiceId) {
      countQuery = countQuery.eq("service_id", selectedServiceId);
    }

    if (searchCondition) {
      countQuery = countQuery.or(searchCondition);
    }

    const { error: countError, count } = await countQuery;

    if (countError) {
      console.error("Error counting internal solicitudes", countError);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    const pagination = createPaginationMeta({
      page: requestedPage,
      pageSize: limit,
      totalCount: count,
    });

    if (pagination.totalCount === 0) {
      return serviceSuccess({
        solicitudes: [],
        pagination,
        ...meta,
      });
    }

    let dataQuery = supabase
      .from("solicitudes")
      .select(SOLICITUDES_SELECT);

    if (selectedEstado) {
      dataQuery = dataQuery.eq("status", selectedEstado);
    }

    if (selectedServiceId) {
      dataQuery = dataQuery.eq("service_id", selectedServiceId);
    }

    if (searchCondition) {
      dataQuery = dataQuery.or(searchCondition);
    }

    const { from, to } = getPaginationRange(
      pagination.page,
      pagination.pageSize,
    );
    const { data, error } = await dataQuery
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to)
      .returns<InternalSolicitudRow[]>();

    if (error) {
      console.error("Error listing internal solicitudes page", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    return serviceSuccess({
      solicitudes: (data ?? []).map(mapInternalSolicitud),
      pagination,
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal solicitudes", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
