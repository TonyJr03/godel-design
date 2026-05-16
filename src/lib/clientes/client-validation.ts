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

export type ValidateClienteInputResult =
  | {
      ok: true;
      data: CreateClienteData;
    }
  | {
      ok: false;
      fieldErrors: ClienteFieldErrors;
    };

const MAX_NOMBRE_LENGTH = 120;
const MAX_TELEFONO_LENGTH = 40;
const MAX_EMAIL_LENGTH = 160;
const MAX_NOTAS_LENGTH = 1000;
const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanRequired(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function cleanOptional(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").trim().replace(/\s+/g, " ");

  return cleaned || null;
}

function cleanOptionalMultiline(value: string | null | undefined): string | null {
  const cleaned = (value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();

  return cleaned || null;
}

export function validateClienteInput(
  input: CreateClienteInput,
): ValidateClienteInputResult {
  const nombre = cleanRequired(input.nombre);
  const telefono = cleanRequired(input.telefono);
  const email = cleanOptional(input.email)?.toLowerCase() ?? null;
  const notas = cleanOptionalMultiline(input.notas);
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
  } else if (email && !BASIC_EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Ingresa un correo electrónico válido.";
  }

  if (notas && notas.length > MAX_NOTAS_LENGTH) {
    fieldErrors.notas = `Las notas no pueden superar ${MAX_NOTAS_LENGTH} caracteres.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
    };
  }

  return {
    ok: true,
    data: {
      nombre,
      telefono,
      email,
      notas,
    },
  };
}
