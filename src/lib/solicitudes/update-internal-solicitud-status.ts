import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import { updateSolicitudStatusRpc } from "./rpc";
import {
  isManualSolicitudStatus,
  isSolicitudStatus,
  type ManualSolicitudStatus,
} from "./status";

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
  | "transition"
  | "error";

export type UpdateInternalSolicitudStatusResult = ServiceResult<
  { status: ManualSolicitudStatus },
  UpdateInternalSolicitudStatusErrorReason
>;

const GENERIC_UPDATE_ERROR =
  "No se pudo actualizar el estado. Inténtalo nuevamente.";

const SAFE_RPC_STATUS_MESSAGES = [
  "Transición de estado no permitida.",
  "No se puede cambiar el estado de una solicitud cerrada.",
  "El estado convertida solo se asigna al convertir la solicitud en pedido.",
  "No tienes permiso para cambiar el estado de esta solicitud.",
] as const;

function getSafeRpcStatusErrorMessage(errorMessage: string | undefined): string {
  const message = errorMessage?.trim();

  return (
    SAFE_RPC_STATUS_MESSAGES.find((safeMessage) =>
      message?.includes(safeMessage),
    ) ?? GENERIC_UPDATE_ERROR
  );
}

export async function updateInternalSolicitudStatus({
  solicitudId,
  status,
}: UpdateInternalSolicitudStatusInput): Promise<UpdateInternalSolicitudStatusResult> {
  const normalizedSolicitudId = solicitudId.trim();
  const normalizedStatus = status.trim();

  if (!isValidUuid(normalizedSolicitudId)) {
    return serviceFailure("invalid_id", "La solicitud no existe.");
  }

  if (!isSolicitudStatus(normalizedStatus)) {
    return serviceFailure("invalid_status", "Selecciona un estado válido.");
  }

  if (!isManualSolicitudStatus(normalizedStatus)) {
    return serviceFailure(
      "invalid_status",
      "El estado convertida solo se asigna al convertir la solicitud en pedido.",
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para cambiar el estado de solicitudes.",
    );
  }

  if (!hasPermission(profile.role, "solicitudes.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para cambiar el estado de solicitudes.",
    );
  }

  const supabase = await createClient();

  try {
    const { data: solicitud, error: solicitudError } = await supabase
      .from("solicitudes")
      .select("id")
      .eq("id", normalizedSolicitudId)
      .maybeSingle<{ id: string }>();

    if (solicitudError) {
      console.error("Error checking solicitud before status update", solicitudError);

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    if (!solicitud) {
      return serviceFailure("not_found", "La solicitud no existe.");
    }

    const { error } = await updateSolicitudStatusRpc(supabase, {
      p_solicitud_id: normalizedSolicitudId,
      p_estado_nuevo: normalizedStatus,
    });

    if (error) {
      console.error("Error updating internal solicitud status", error);
      const message = getSafeRpcStatusErrorMessage(error.message);

      if (message !== GENERIC_UPDATE_ERROR) {
        return serviceFailure("transition", message);
      }

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    return serviceSuccess({ status: normalizedStatus });
  } catch (error) {
    console.error("Unexpected error updating internal solicitud status", error);

    return serviceFailure("error", GENERIC_UPDATE_ERROR);
  }
}
