import {
  isBasicEmail,
  normalizeMultilineText,
  normalizeOptionalMultilineText,
  normalizeOptionalSingleLineText,
  normalizeSingleLineText,
} from "@/lib/validators";
import { isWorkflowType } from "@/lib/workflow-types";
import {
  PUBLIC_SOLICITUD_FIELD_LIMITS,
  type PublicSolicitudFieldErrors,
  type PublicSolicitudInput,
} from "./public-request-validation-types";

export type NormalizedPublicSolicitudInput = {
  workflowTypeValue: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  service_type: string;
  description: string;
  desired_date: string | null;
  notes: string | null;
  printCopiesValue: string;
  printColorModeValue: string;
  printPaperSizeValue: string;
  printSidesValue: string;
};

export function normalizePublicSolicitudInput(
  input: PublicSolicitudInput,
): NormalizedPublicSolicitudInput {
  return {
    workflowTypeValue: normalizeSingleLineText(input.workflow_type),
    client_name: normalizeSingleLineText(input.client_name),
    client_phone: normalizeSingleLineText(input.client_phone),
    client_email: normalizeOptionalSingleLineText(input.client_email),
    service_type: normalizeSingleLineText(input.service_type),
    description: normalizeMultilineText(input.description),
    desired_date: normalizeOptionalSingleLineText(input.desired_date),
    notes: normalizeOptionalMultilineText(input.notes),
    printCopiesValue: normalizeSingleLineText(input.print_copies),
    printColorModeValue: normalizeSingleLineText(input.print_color_mode),
    printPaperSizeValue: normalizeSingleLineText(input.print_paper_size),
    printSidesValue: normalizeSingleLineText(input.print_sides),
  };
}

export function validateCommonPublicSolicitudFields(
  input: NormalizedPublicSolicitudInput,
  fieldErrors: PublicSolicitudFieldErrors,
) {
  if (!isWorkflowType(input.workflowTypeValue)) {
    fieldErrors.workflow_type =
      "Selecciona si necesitas un encargo personalizado o una impresión.";
  }

  if (!input.client_name) {
    fieldErrors.client_name = "Ingresa el nombre del cliente.";
  } else if (
    input.client_name.length > PUBLIC_SOLICITUD_FIELD_LIMITS.client_name
  ) {
    fieldErrors.client_name = "El nombre es demasiado largo.";
  }

  if (!input.client_phone) {
    fieldErrors.client_phone = "Ingresa un teléfono de contacto.";
  } else if (
    input.client_phone.length > PUBLIC_SOLICITUD_FIELD_LIMITS.client_phone
  ) {
    fieldErrors.client_phone = "El teléfono es demasiado largo.";
  }

  if (input.client_email) {
    if (input.client_email.length > PUBLIC_SOLICITUD_FIELD_LIMITS.client_email) {
      fieldErrors.client_email = "El correo es demasiado largo.";
    } else if (!isBasicEmail(input.client_email)) {
      fieldErrors.client_email = "Ingresa un correo válido.";
    }
  }

  if (input.notes && input.notes.length > PUBLIC_SOLICITUD_FIELD_LIMITS.notes) {
    fieldErrors.notes = "Las observaciones son demasiado largas.";
  }
}
