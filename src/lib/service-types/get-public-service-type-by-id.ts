import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type {
  GetPublicServiceTypeByIdErrorReason,
  PublicServiceType,
  PublicServiceTypeRow,
} from "./types";

export type GetPublicServiceTypeByIdResult = ServiceResult<
  { serviceType: PublicServiceType },
  GetPublicServiceTypeByIdErrorReason
>;

const SERVICE_NOT_AVAILABLE_MESSAGE =
  "El servicio seleccionado ya no está disponible. Elige otro servicio e inténtalo nuevamente.";
const GENERIC_GET_ERROR =
  "No pudimos validar el servicio seleccionado. Inténtalo nuevamente.";

function toPublicServiceType(row: PublicServiceTypeRow): PublicServiceType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workflowType: row.workflow_type,
  };
}

export async function getPublicServiceTypeById(
  serviceTypeId: string,
): Promise<GetPublicServiceTypeByIdResult> {
  const normalizedServiceTypeId = serviceTypeId.trim();

  if (!isValidUuid(normalizedServiceTypeId)) {
    return serviceFailure(
      "invalid_id",
      SERVICE_NOT_AVAILABLE_MESSAGE,
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("tipos_servicio")
      .select("id, name, description, workflow_type")
      .eq("id", normalizedServiceTypeId)
      .eq("is_publicly_available", true)
      .maybeSingle<PublicServiceTypeRow>();

    if (error) {
      console.error("Error resolving public service type", error);

      return serviceFailure("error", GENERIC_GET_ERROR);
    }

    if (!data) {
      return serviceFailure(
        "not_found",
        SERVICE_NOT_AVAILABLE_MESSAGE,
      );
    }

    return serviceSuccess({
      serviceType: toPublicServiceType(data),
    });
  } catch (error) {
    console.error("Unexpected error resolving public service type", error);

    return serviceFailure("error", GENERIC_GET_ERROR);
  }
}
