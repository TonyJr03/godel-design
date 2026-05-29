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

export const CLIENTE_FIELDS = ["nombre", "telefono", "email", "notas"] as const;

export type ClienteField = (typeof CLIENTE_FIELDS)[number];

export type CreateClienteInput = {
  nombre?: string | null;
  telefono?: string | null;
  email?: string | null;
  notas?: string | null;
};

export type CreateClienteData = Pick<
  TablesInsert<"clientes">,
  "nombre" | "telefono" | "email" | "notas"
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
  const nombre = normalizeSingleLineText(input.nombre);
  const telefono = normalizeSingleLineText(input.telefono);
  const email =
    normalizeOptionalSingleLineText(input.email)?.toLowerCase() ?? null;
  const notas = normalizeOptionalMultilineText(input.notas);
  const fieldErrors: ClienteFieldErrors = {};

  if (!nombre) {
    fieldErrors.nombre = "El nombre es obligatorio.";
  } else if (nombre.length > MAX_NOMBRE_LENGTH) {
    fieldErrors.nombre = `El nombre no puede superar ${MAX_NOMBRE_LENGTH} caracteres.`;
  }

  if (!telefono) {
    fieldErrors.telefono = "El teléfono es obligatorio.";
  } else if (telefono.length > MAX_TELEFONO_LENGTH) {
    fieldErrors.telefono = `El teléfono no puede superar ${MAX_TELEFONO_LENGTH} caracteres.`;
  }

  if (email && email.length > MAX_EMAIL_LENGTH) {
    fieldErrors.email = `El correo electrónico no puede superar ${MAX_EMAIL_LENGTH} caracteres.`;
  } else if (email && !isBasicEmail(email)) {
    fieldErrors.email = "Ingresa un correo electrónico válido.";
  }

  if (notas && notas.length > MAX_NOTAS_LENGTH) {
    fieldErrors.notas = `Las notas no pueden superar ${MAX_NOTAS_LENGTH} caracteres.`;
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    nombre,
    telefono,
    email,
    notas,
  });
}
