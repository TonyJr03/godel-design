import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { TablesUpdate } from "@/types/database";
import { isManualSolicitudStatus, type ManualSolicitudStatus } from "./status";

export type UpdateInternalSolicitudStatusInput = {
  solicitudId: string;
  estado: string;
};

export type UpdateInternalSolicitudStatusResult =
  | {
      ok: true;
      estado: ManualSolicitudStatus;
    }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "invalid_id"
        | "invalid_status"
        | "not_found"
        | "error";
      message: string;
    };

const GENERIC_UPDATE_ERROR =
  "No se pudo actualizar el estado. Inténtalo nuevamente.";

export async function updateInternalSolicitudStatus({
  solicitudId,
  estado,
}: UpdateInternalSolicitudStatusInput): Promise<UpdateInternalSolicitudStatusResult> {
  if (!isValidUuid(solicitudId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "La solicitud no existe.",
    };
  }

  if (!isManualSolicitudStatus(estado)) {
    return {
      ok: false,
      reason: "invalid_status",
      message: "El estado seleccionado no se puede asignar manualmente.",
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "solicitudes.manage")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para cambiar el estado de solicitudes.",
    };
  }

  const supabase = await createClient();
  const updateData: TablesUpdate<"solicitudes"> = {
    estado,
    reviewed_by: profile.id,
  };

  try {
    const { data, error } = await supabase
      .from("solicitudes")
      .update(updateData)
      .eq("id", solicitudId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Error updating internal solicitud status", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_UPDATE_ERROR,
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
      estado,
    };
  } catch (error) {
    console.error("Unexpected error updating internal solicitud status", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_UPDATE_ERROR,
    };
  }
}
