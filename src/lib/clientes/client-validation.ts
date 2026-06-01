import {
  hasFieldErrors,
  isBasicEmail,
  normalizeOptionalMultilineText,
  normalizeOptionalSingleLineText,
  normalizeSingleLineText,
  validationFailure,
  validationSuccess,
  type ValidationResult,
} from "@/lib/validators";
import type { TablesInsert } from "@/types/database";

export const CLIENTE_FIELDS = ["name", "phone", "email", "notes"] as const;

export type ClienteField = (typeof CLIENTE_FIELDS)[number];

export type CreateClienteInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export type CreateClienteData = Pick<
  TablesInsert<"clientes">,
  "name" | "phone" | "email" | "notes"
>;

export type ClienteFieldErrors = Partial<Record<ClienteField, string>>;

export type ValidateClienteInputResult = ValidationResult<
  CreateClienteData,
  ClienteFieldErrors
>;

const MAX_NOMBRE_LENGTH = 120;
const MAX_TELEFONO_LENGTH = 40;
const MAX_EMAIL_LENGTH = 160;
const MAX_NOTAS_LENGTH = 1000;

export function validateClienteInput(
  input: CreateClienteInput,
): ValidateClienteInputResult {
  const name = normalizeSingleLineText(input.name);
  const phone = normalizeSingleLineText(input.phone);
  const email =
    normalizeOptionalSingleLineText(input.email)?.toLowerCase() ?? null;
  const notes = normalizeOptionalMultilineText(input.notes);
  const fieldErrors: ClienteFieldErrors = {};

  if (!name) {
    fieldErrors.name = "El nombre es obligatorio.";
  } else if (name.length > MAX_NOMBRE_LENGTH) {
    fieldErrors.name = `El nombre no puede superar ${MAX_NOMBRE_LENGTH} caracteres.`;
  }

  if (!phone) {
    fieldErrors.phone = "El teléfono es obligatorio.";
  } else if (phone.length > MAX_TELEFONO_LENGTH) {
    fieldErrors.phone = `El teléfono no puede superar ${MAX_TELEFONO_LENGTH} caracteres.`;
  }

  if (email && email.length > MAX_EMAIL_LENGTH) {
    fieldErrors.email = `El correo electrónico no puede superar ${MAX_EMAIL_LENGTH} caracteres.`;
  } else if (email && !isBasicEmail(email)) {
    fieldErrors.email = "Ingresa un correo electrónico válido.";
  }

  if (notes && notes.length > MAX_NOTAS_LENGTH) {
    fieldErrors.notes = `Las notas no pueden superar ${MAX_NOTAS_LENGTH} caracteres.`;
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    name,
    phone,
    email,
    notes,
  });
}
