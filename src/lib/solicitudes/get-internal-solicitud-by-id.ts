import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type InternalSolicitudDetail = Pick<
  Tables<"solicitudes">,
  | "id"
  | "cliente_nombre"
  | "cliente_telefono"
  | "cliente_email"
  | "tipo_servicio"
  | "descripcion"
  | "cantidad"
  | "fecha_deseada"
  | "observaciones"
  | "estado"
  | "created_at"
  | "updated_at"
>;

export type GetInternalSolicitudByIdResult =
  | {
      ok: true;
      solicitud: InternalSolicitudDetail;
    }
  | {
      ok: false;
      reason: "unauthorized" | "not_found" | "invalid_id" | "error";
      message: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar la solicitud. Intentalo nuevamente.";

function isValidUuid(id: string): boolean {
  return UUID_PATTERN.test(id);
}

export async function getInternalSolicitudById(
  id: string,
): Promise<GetInternalSolicitudByIdResult> {
  if (!isValidUuid(id)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "La solicitud no existe.",
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "solicitudes.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver esta solicitud.",
    };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("solicitudes")
      .select(
        "id, cliente_nombre, cliente_telefono, cliente_email, tipo_servicio, descripcion, cantidad, fecha_deseada, observaciones, estado, created_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error loading internal solicitud detail", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_DETAIL_ERROR,
      };
    }

    if (!data) {
      return {
        ok: false,
        reason: "not_found",
        message: "La solicitud no existe.",
      };
    }

    return {
      ok: true,
      solicitud: data,
    };
  } catch (error) {
    console.error("Unexpected error loading internal solicitud detail", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_DETAIL_ERROR,
    };
  }
}
