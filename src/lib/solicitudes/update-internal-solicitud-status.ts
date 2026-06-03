import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { TablesUpdate } from "@/types/database";
import { isManualSolicitudStatus, type ManualSolicitudStatus } from "./status";

export type UpdateInternalSolicitudStatusInput = {
  solicitudId: string;
  status: string;
};

export type UpdateInternalSolicitudStatusErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "invalid_status"
  | "not_found"
  | "error";

export type UpdateInternalSolicitudStatusResult = ServiceResult<
  { status: ManualSolicitudStatus },
  UpdateInternalSolicitudStatusErrorReason
>;

const GENERIC_UPDATE_ERROR =
  "No se pudo actualizar el status. Inténtalo nuevamente.";

export async function updateInternalSolicitudStatus({
  solicitudId,
  status,
}: UpdateInternalSolicitudStatusInput): Promise<UpdateInternalSolicitudStatusResult> {
  if (!isValidUuid(solicitudId)) {
    return serviceFailure("invalid_id", "La solicitud no existe.");
  }

  if (!isManualSolicitudStatus(status)) {
    return serviceFailure(
      "invalid_status",
      "El status seleccionado no se puede asignar manualmente.",
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para cambiar el status de solicitudes.",
    );
  }

  if (!hasPermission(profile.role, "solicitudes.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para cambiar el status de solicitudes.",
    );
  }

  const supabase = await createClient();
  const updateData: TablesUpdate<"solicitudes"> = {
    status,
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

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "La solicitud no existe.");
    }

    return serviceSuccess({ status });
  } catch (error) {
    console.error("Unexpected error updating internal solicitud status", error);

    return serviceFailure("error", GENERIC_UPDATE_ERROR);
  }
}
