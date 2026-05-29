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
  | "cliente_nombre"
  | "cliente_telefono"
  | "cliente_email"
  | "tipo_servicio"
  | "estado"
  | "created_at"
  | "fecha_deseada"
  | "cantidad"
>;

export type ListInternalSolicitudesOptions = {
  estado?: string | null;
  limit?: number;
};

type ListInternalSolicitudesMeta = {
  estado: InternalSolicitudEstado | null;
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
  estado: string | null | undefined,
): estado is InternalSolicitudEstado {
  return INTERNAL_SOLICITUD_ESTADOS.includes(estado as InternalSolicitudEstado);
}

export async function listInternalSolicitudes(
  options: ListInternalSolicitudesOptions = {},
): Promise<ListInternalSolicitudesResult> {
  const selectedEstado = isInternalSolicitudEstado(options.estado)
    ? options.estado
    : null;
  const ignoredInvalidEstado = Boolean(options.estado && !selectedEstado);
  const meta = { estado: selectedEstado, ignoredInvalidEstado };
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
        "id, cliente_nombre, cliente_telefono, cliente_email, tipo_servicio, estado, created_at, fecha_deseada, cantidad",
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (selectedEstado) {
      query = query.eq("estado", selectedEstado);
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
