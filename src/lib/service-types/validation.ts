import {
  hasFieldErrors,
  normalizeMultilineText,
  normalizeSingleLineText,
  validationFailure,
  validationSuccess,
  type ValidationResult,
} from "@/lib/validators/form";
import type {
  CreateServiceTypeInput,
  ServiceTypeFieldErrors,
  UpdateServiceTypeInput,
  ValidServiceTypeInput,
} from "./types";

export const SERVICE_TYPE_NAME_MIN_LENGTH = 2;
export const SERVICE_TYPE_NAME_MAX_LENGTH = 120;
export const SERVICE_TYPE_DESCRIPTION_MAX_LENGTH = 500;

type ServiceTypeValidationResult = ValidationResult<
  ValidServiceTypeInput,
  ServiceTypeFieldErrors
>;

function parsePublicAvailability(
  value: unknown,
  options: { defaultValue?: boolean; required?: boolean } = {},
): { ok: true; value: boolean } | { ok: false; error: string } {
  if (typeof value === "boolean") {
    return { ok: true, value };
  }

  if (value === undefined || value === null || value === "") {
    if (options.required) {
      return {
        ok: false,
        error: "Selecciona si el servicio estará disponible públicamente.",
      };
    }

    return { ok: true, value: options.defaultValue ?? true };
  }

  if (typeof value === "string") {
    const normalizedValue = value.trim().toLowerCase();

    if (["true", "1", "on", "yes", "si", "sí"].includes(normalizedValue)) {
      return { ok: true, value: true };
    }

    if (["false", "0", "off", "no"].includes(normalizedValue)) {
      return { ok: true, value: false };
    }
  }

  return {
    ok: false,
    error: "El valor de disponibilidad pública no es válido.",
  };
}

function validateServiceTypeInput(
  input: CreateServiceTypeInput | UpdateServiceTypeInput,
  options: { defaultPublicAvailability?: boolean; requirePublicAvailability?: boolean },
): ServiceTypeValidationResult {
  const name = normalizeSingleLineText(input.name);
  const description = normalizeMultilineText(input.description);
  const publicAvailability = parsePublicAvailability(
    input.isPubliclyAvailable,
    {
      defaultValue: options.defaultPublicAvailability,
      required: options.requirePublicAvailability,
    },
  );
  const fieldErrors: ServiceTypeFieldErrors = {};

  if (!name) {
    fieldErrors.name = "El nombre del servicio es obligatorio.";
  } else if (name.length < SERVICE_TYPE_NAME_MIN_LENGTH) {
    fieldErrors.name = "El nombre debe tener al menos 2 caracteres.";
  } else if (name.length > SERVICE_TYPE_NAME_MAX_LENGTH) {
    fieldErrors.name = "El nombre no puede superar 120 caracteres.";
  }

  if (!description) {
    fieldErrors.description = "La descripción del servicio es obligatoria.";
  } else if (description.length > SERVICE_TYPE_DESCRIPTION_MAX_LENGTH) {
    fieldErrors.description =
      "La descripción no puede superar 500 caracteres.";
  }

  if (!publicAvailability.ok) {
    fieldErrors.isPubliclyAvailable = publicAvailability.error;
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    name,
    description,
    isPubliclyAvailable: publicAvailability.ok
      ? publicAvailability.value
      : options.defaultPublicAvailability ?? true,
  });
}

export function validateCreateServiceTypeInput(
  input: CreateServiceTypeInput,
): ServiceTypeValidationResult {
  return validateServiceTypeInput(input, {
    defaultPublicAvailability: true,
  });
}

export function validateUpdateServiceTypeInput(
  input: UpdateServiceTypeInput,
): ServiceTypeValidationResult {
  return validateServiceTypeInput(input, {
    requirePublicAvailability: true,
  });
}
