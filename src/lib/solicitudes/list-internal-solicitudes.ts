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
import { getSolicitudServiceTypeSearchValues } from "./labels";
import { SOLICITUD_STATUSES, type SolicitudStatus } from "./status";

export const INTERNAL_SOLICITUD_ESTADOS = SOLICITUD_STATUSES;

export type InternalSolicitudEstado = SolicitudStatus;

export type InternalSolicitud = Pick<
  Tables<"solicitudes">,
  | "id"
  | "client_name"
  | "client_phone"
  | "client_email"
  | "service_type"
  | "status"
  | "created_at"
  | "desired_date"
>;

export type ListInternalSolicitudesOptions = {
  q?: string | null;
  status?: string | null;
  limit?: number;
};

type ListInternalSolicitudesMeta = {
  q: string | null;
  status: InternalSolicitudEstado | null;
  ignoredInvalidEstado: boolean;
};

export type ListInternalSolicitudesErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListInternalSolicitudesResult = ServiceResult<
  { solicitudes: InternalSolicitud[] } & ListInternalSolicitudesMeta,
  ListInternalSolicitudesErrorReason,
  Partial<ListInternalSolicitudesMeta>
>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const REFERENCE_SCAN_LIMIT = 500;
const GENERIC_LIST_ERROR =
  "No se pudieron cargar las solicitudes. Inténtalo nuevamente.";
const SOLICITUDES_SELECT =
  "id, client_name, client_phone, client_email, service_type, status, created_at, desired_date";

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  const finiteLimit = limit ?? DEFAULT_LIMIT;

  return Math.min(Math.max(Math.trunc(finiteLimit), 1), MAX_LIMIT);
}

export function isInternalSolicitudEstado(
  status: string | null | undefined,
): status is InternalSolicitudEstado {
  return INTERNAL_SOLICITUD_ESTADOS.includes(status as InternalSolicitudEstado);
}

function mergeSolicitudes(
  groups: InternalSolicitud[][],
  limit: number,
): InternalSolicitud[] {
  const byId = new Map<string, InternalSolicitud>();

  for (const group of groups) {
    for (const solicitud of group) {
      byId.set(solicitud.id, solicitud);
    }
  }

  return [...byId.values()]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}

function matchesVisibleSolicitudReference(id: string, query: string): boolean {
  const compactQuery = query.replace(/-/g, "").toLowerCase();

  return (
    compactQuery.length >= 4 &&
    /^[0-9a-f]+$/.test(compactQuery) &&
    id.replace(/-/g, "").toLowerCase().startsWith(compactQuery)
  );
}

export async function listInternalSolicitudes(
  options: ListInternalSolicitudesOptions = {},
): Promise<ListInternalSolicitudesResult> {
  const q = normalizeSearchQuery(options.q);
  const selectedEstado = isInternalSolicitudEstado(options.status)
    ? options.status
    : null;
  const ignoredInvalidEstado = Boolean(options.status && !selectedEstado);
  const meta = { q, status: selectedEstado, ignoredInvalidEstado };
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
  const supabase = await createClient();

  try {
    let baseQuery = supabase
      .from("solicitudes")
      .select(SOLICITUDES_SELECT)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (selectedEstado) {
      baseQuery = baseQuery.eq("status", selectedEstado);
    }

    if (!q) {
      const { data, error } =
        await baseQuery.returns<InternalSolicitud[]>();

      if (error) {
        console.error("Error listing internal solicitudes", error);

        return serviceFailure("error", GENERIC_LIST_ERROR, meta);
      }

      return serviceSuccess({
        solicitudes: data ?? [],
        ...meta,
      });
    }

    let textQuery = supabase
      .from("solicitudes")
      .select(SOLICITUDES_SELECT)
      .or(
        `client_name.ilike.*${q}*,client_phone.ilike.*${q}*,client_email.ilike.*${q}*,service_type.ilike.*${q}*,description.ilike.*${q}*,notes.ilike.*${q}*`,
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    let referenceQuery = supabase
      .from("solicitudes")
      .select(SOLICITUDES_SELECT)
      .order("created_at", { ascending: false })
      .limit(REFERENCE_SCAN_LIMIT);

    if (selectedEstado) {
      textQuery = textQuery.eq("status", selectedEstado);
      referenceQuery = referenceQuery.eq("status", selectedEstado);
    }

    const serviceTypeValues = getSolicitudServiceTypeSearchValues(q);
    let serviceTypeQuery =
      serviceTypeValues.length > 0
        ? supabase
            .from("solicitudes")
            .select(SOLICITUDES_SELECT)
            .in("service_type", serviceTypeValues)
            .order("created_at", { ascending: false })
            .limit(limit)
        : null;

    if (serviceTypeQuery && selectedEstado) {
      serviceTypeQuery = serviceTypeQuery.eq("status", selectedEstado);
    }

    const [textResult, referenceResult, serviceTypeResult] = await Promise.all([
      textQuery.returns<InternalSolicitud[]>(),
      referenceQuery.returns<InternalSolicitud[]>(),
      serviceTypeQuery
        ? serviceTypeQuery.returns<InternalSolicitud[]>()
        : Promise.resolve({ data: [] as InternalSolicitud[], error: null }),
    ]);
    const searchError =
      textResult.error ?? referenceResult.error ?? serviceTypeResult.error;

    if (searchError) {
      console.error("Error searching internal solicitudes", searchError);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    const referenceMatches = (referenceResult.data ?? []).filter((solicitud) =>
      matchesVisibleSolicitudReference(solicitud.id, q),
    );

    return serviceSuccess({
      solicitudes: mergeSolicitudes(
        [
          textResult.data ?? [],
          serviceTypeResult.data ?? [],
          referenceMatches,
        ],
        limit,
      ),
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal solicitudes", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
