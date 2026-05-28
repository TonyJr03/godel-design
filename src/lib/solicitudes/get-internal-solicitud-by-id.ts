import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";

export type InternalSolicitudDetail = Pick<
  Tables<"solicitudes">,
  | "id"
  | "cliente_id"
  | "cliente_nombre"
  | "cliente_telefono"
  | "cliente_email"
  | "tipo_servicio"
  | "descripcion"
  | "cantidad"
  | "fecha_deseada"
  | "observaciones"
  | "estado"
  | "converted_order_id"
  | "reviewed_by"
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

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar la solicitud. Inténtalo nuevamente.";

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
        "id, cliente_id, cliente_nombre, cliente_telefono, cliente_email, tipo_servicio, descripcion, cantidad, fecha_deseada, observaciones, estado, converted_order_id, reviewed_by, created_at, updated_at",
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
