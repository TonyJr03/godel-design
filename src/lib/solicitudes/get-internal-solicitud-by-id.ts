import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { InternalSolicitudDetail } from "./types";

export type GetInternalSolicitudByIdErrorReason =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_id"
  | "error";

export type GetInternalSolicitudByIdResult = ServiceResult<
  { solicitud: InternalSolicitudDetail },
  GetInternalSolicitudByIdErrorReason
>;

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar la solicitud. Inténtalo nuevamente.";

export async function getInternalSolicitudById(
  id: string,
): Promise<GetInternalSolicitudByIdResult> {
  if (!isValidUuid(id)) {
    return serviceFailure("invalid_id", "La solicitud no existe.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ver esta solicitud.",
    );
  }

  if (!hasPermission(profile.role, "solicitudes.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver esta solicitud.",
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("solicitudes")
      .select(
        "id, public_reference, cliente_id, client_name, client_phone, client_email, workflow_type, service_type, description, desired_date, notes, status, converted_order_id, reviewed_by, created_at, updated_at",
      )
      .eq("id", id)
      .returns<InternalSolicitudDetail>()
      .maybeSingle();

    if (error) {
      console.error("Error loading internal solicitud detail", error);

      return serviceFailure("error", GENERIC_DETAIL_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "La solicitud no existe.");
    }

    return serviceSuccess({ solicitud: data });
  } catch (error) {
    console.error("Unexpected error loading internal solicitud detail", error);

    return serviceFailure("error", GENERIC_DETAIL_ERROR);
  }
}
