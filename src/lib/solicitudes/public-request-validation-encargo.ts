import { validateOptionalFutureDate } from "@/lib/validators";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";
import type { NormalizedPublicSolicitudInput } from "./public-request-validation-common";
import {
  type PublicEncargoSolicitudData,
  type PublicSolicitudResolvedService,
  type PublicSolicitudFieldErrors,
  PUBLIC_SOLICITUD_FIELD_LIMITS,
} from "./public-request-validation-types";

export function validateEncargoSolicitudFields(
  input: NormalizedPublicSolicitudInput,
  fieldErrors: PublicSolicitudFieldErrors,
) {
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
  service: PublicSolicitudResolvedService,
): PublicEncargoSolicitudData {
  return {
    service_id: service.id,
    workflow_type: WORKFLOW_TYPES.ENCARGO,
    client_name: input.client_name,
    client_phone: input.client_phone,
    client_email: input.client_email,
    description: input.description,
    desired_date: input.desired_date,
    notes: input.notes,
  };
}
