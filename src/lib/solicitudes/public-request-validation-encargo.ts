import { validateOptionalFutureDate } from "@/lib/validators";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";
import type { NormalizedPublicSolicitudInput } from "./public-request-validation-common";
import {
  PUBLIC_SOLICITUD_FIELD_LIMITS,
  type PublicEncargoSolicitudData,
  type PublicSolicitudFieldErrors,
} from "./public-request-validation-types";

export function validateEncargoSolicitudFields(
  input: NormalizedPublicSolicitudInput,
  fieldErrors: PublicSolicitudFieldErrors,
) {
  if (!input.service_type) {
    fieldErrors.service_type = "Selecciona o indica el tipo de servicio.";
  } else if (
    input.service_type.length > PUBLIC_SOLICITUD_FIELD_LIMITS.service_type
  ) {
    fieldErrors.service_type = "El tipo de servicio es demasiado largo.";
  }

  if (!input.description) {
    fieldErrors.description = "Describe el trabajo solicitado.";
  } else if (
    input.description.length > PUBLIC_SOLICITUD_FIELD_LIMITS.description
  ) {
    fieldErrors.description = "La descripción es demasiado larga.";
  }

  if (input.desired_date) {
    const desiredDateValidation = validateOptionalFutureDate(
      input.desired_date,
    );

    if (desiredDateValidation === "invalid") {
      fieldErrors.desired_date = "Ingresa una fecha válida.";
    } else if (desiredDateValidation === "past") {
      fieldErrors.desired_date =
        "La fecha deseada no puede ser anterior a hoy.";
    }
  }
}

export function buildEncargoSolicitudData(
  input: NormalizedPublicSolicitudInput,
): PublicEncargoSolicitudData {
  return {
    workflow_type: WORKFLOW_TYPES.ENCARGO,
    client_name: input.client_name,
    client_phone: input.client_phone,
    client_email: input.client_email,
    service_type: input.service_type,
    description: input.description,
    desired_date: input.desired_date,
    notes: input.notes,
  };
}
