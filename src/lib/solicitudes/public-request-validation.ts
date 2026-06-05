import {
  hasFieldErrors,
  isBasicEmail,
  normalizeMultilineText,
  normalizeOptionalMultilineText,
  normalizeOptionalSingleLineText,
  normalizeSingleLineText,
  validationFailure,
  validationSuccess,
  validateOptionalFutureDate,
  type ValidationResult,
} from "@/lib/validators";

export type PublicSolicitudInput = {
  client_name?: unknown;
  client_phone?: unknown;
  client_email?: unknown;
  service_type?: unknown;
  description?: unknown;
  desired_date?: unknown;
  notes?: unknown;
  files?: unknown;
};

export type PublicSolicitudData = {
  client_name: string;
  client_phone: string;
  client_email: string | null;
  service_type: string;
  description: string;
  desired_date: string | null;
  notes: string | null;
};

export type PublicSolicitudField = keyof PublicSolicitudInput;

export type PublicSolicitudFieldErrors = Partial<
  Record<PublicSolicitudField, string>
>;

export type ValidatePublicSolicitudInputResult = ValidationResult<
  PublicSolicitudData,
  PublicSolicitudFieldErrors,
  { message: string }
>;

const FIELD_LIMITS = {
  client_name: 120,
  client_phone: 40,
  client_email: 254,
  service_type: 120,
  description: 2000,
  notes: 1000,
} as const;

const VALIDATION_ERROR_MESSAGE =
  "Revisa los campos marcados antes de enviar la solicitud.";

export function validatePublicSolicitudInput(
  input: PublicSolicitudInput,
): ValidatePublicSolicitudInputResult {
  const fieldErrors: PublicSolicitudFieldErrors = {};

  const client_name = normalizeSingleLineText(input.client_name);
  const client_phone = normalizeSingleLineText(input.client_phone);
  const client_email = normalizeOptionalSingleLineText(input.client_email);
  const service_type = normalizeSingleLineText(input.service_type);
  const description = normalizeMultilineText(input.description);
  const desired_date = normalizeOptionalSingleLineText(input.desired_date);
  const notes = normalizeOptionalMultilineText(input.notes);

  if (!client_name) {
    fieldErrors.client_name = "Ingresa el name del cliente.";
  } else if (client_name.length > FIELD_LIMITS.client_name) {
    fieldErrors.client_name = "El nombre es demasiado largo.";
  }

  if (!client_phone) {
    fieldErrors.client_phone = "Ingresa un teléfono de contacto.";
  } else if (client_phone.length > FIELD_LIMITS.client_phone) {
    fieldErrors.client_phone = "El teléfono es demasiado largo.";
  }

  if (client_email) {
    if (client_email.length > FIELD_LIMITS.client_email) {
      fieldErrors.client_email = "El correo es demasiado largo.";
    } else if (!isBasicEmail(client_email)) {
      fieldErrors.client_email = "Ingresa un correo válido.";
    }
  }

  if (!service_type) {
    fieldErrors.service_type = "Selecciona o indica el tipo de servicio.";
  } else if (service_type.length > FIELD_LIMITS.service_type) {
    fieldErrors.service_type = "El tipo de servicio es demasiado largo.";
  }

  if (!description) {
    fieldErrors.description = "Describe el trabajo solicitado.";
  } else if (description.length > FIELD_LIMITS.description) {
    fieldErrors.description = "La descripción es demasiado larga.";
  }

  if (desired_date) {
    const desiredDateValidation = validateOptionalFutureDate(desired_date);

    if (desiredDateValidation === "invalid") {
      fieldErrors.desired_date = "Ingresa una fecha válida.";
    } else if (desiredDateValidation === "past") {
      fieldErrors.desired_date =
        "La fecha deseada no puede ser anterior a hoy.";
    }
  }

  if (notes && notes.length > FIELD_LIMITS.notes) {
    fieldErrors.notes = "Las observaciones son demasiado largas.";
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors, {
      message: VALIDATION_ERROR_MESSAGE,
    });
  }

  return validationSuccess({
    client_name,
    client_phone,
    client_email,
    service_type,
    description,
    desired_date,
    notes,
  });
}
