import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
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
  | "quantity"
>;

export type ListInternalSolicitudesOptions = {
  status?: string | null;
  limit?: number;
};

type ListInternalSolicitudesMeta = {
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
const GENERIC_LIST_ERROR =
  "No se pudieron cargar las solicitudes. Inténtalo nuevamente.";

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

export async function listInternalSolicitudes(
  options: ListInternalSolicitudesOptions = {},
): Promise<ListInternalSolicitudesResult> {
  const selectedEstado = isInternalSolicitudEstado(options.status)
    ? options.status
    : null;
  const ignoredInvalidEstado = Boolean(options.status && !selectedEstado);
  const meta = { status: selectedEstado, ignoredInvalidEstado };
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
    let query = supabase
      .from("solicitudes")
      .select(
        "id, client_name, client_phone, client_email, service_type, status, created_at, desired_date, quantity",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (selectedEstado) {
      query = query.eq("status", selectedEstado);
    }

    const { data, error } = await query.returns<InternalSolicitud[]>();

    if (error) {
      console.error("Error listing internal solicitudes", error);

      return serviceFailure("error", GENERIC_LIST_ERROR, meta);
    }

    return serviceSuccess({
      solicitudes: data ?? [],
      ...meta,
    });
  } catch (error) {
    console.error("Unexpected error listing internal solicitudes", error);

    return serviceFailure("error", GENERIC_LIST_ERROR, meta);
  }
}
