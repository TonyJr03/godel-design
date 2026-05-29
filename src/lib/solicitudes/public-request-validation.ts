import { getTodayIsoDate } from "@/lib/utils";
import {
  hasFieldErrors,
  isBasicEmail,
  isValidIsoDate,
  normalizeMultilineText,
  normalizeOptionalMultilineText,
  normalizeOptionalSingleLineText,
  normalizeSingleLineText,
  validationFailure,
  validationSuccess,
  type ValidationResult,
} from "@/lib/validators";

export type PublicSolicitudInput = {
  cliente_nombre?: unknown;
  cliente_telefono?: unknown;
  cliente_email?: unknown;
  tipo_servicio?: unknown;
  descripcion?: unknown;
  cantidad?: unknown;
  fecha_deseada?: unknown;
  observaciones?: unknown;
  files?: unknown;
};

export type PublicSolicitudData = {
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email: string | null;
  tipo_servicio: string;
  descripcion: string;
  cantidad: number | null;
  fecha_deseada: string | null;
  observaciones: string | null;
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
  cliente_nombre: 120,
  cliente_telefono: 40,
  cliente_email: 254,
  tipo_servicio: 120,
  descripcion: 2000,
  observaciones: 1000,
} as const;

const VALIDATION_ERROR_MESSAGE =
  "Revisa los campos marcados antes de enviar la solicitud.";

function parseCantidad(value: unknown) {
  const textValue = normalizeSingleLineText(value);

  if (!textValue) {
    return null;
  }

  if (!/^\d+$/.test(textValue)) {
    return Number.NaN;
  }

  return Number(textValue);
}

export function validatePublicSolicitudInput(
  input: PublicSolicitudInput,
): ValidatePublicSolicitudInputResult {
  const fieldErrors: PublicSolicitudFieldErrors = {};

  const cliente_nombre = normalizeSingleLineText(input.cliente_nombre);
  const cliente_telefono = normalizeSingleLineText(input.cliente_telefono);
  const cliente_email = normalizeOptionalSingleLineText(input.cliente_email);
  const tipo_servicio = normalizeSingleLineText(input.tipo_servicio);
  const descripcion = normalizeMultilineText(input.descripcion);
  const cantidad = parseCantidad(input.cantidad);
  const fecha_deseada = normalizeOptionalSingleLineText(input.fecha_deseada);
  const observaciones = normalizeOptionalMultilineText(input.observaciones);

  if (!cliente_nombre) {
    fieldErrors.cliente_nombre = "Ingresa el nombre del cliente.";
  } else if (cliente_nombre.length > FIELD_LIMITS.cliente_nombre) {
    fieldErrors.cliente_nombre = "El nombre es demasiado largo.";
  }

  if (!cliente_telefono) {
    fieldErrors.cliente_telefono = "Ingresa un teléfono de contacto.";
  } else if (cliente_telefono.length > FIELD_LIMITS.cliente_telefono) {
    fieldErrors.cliente_telefono = "El teléfono es demasiado largo.";
  }

  if (cliente_email) {
    if (cliente_email.length > FIELD_LIMITS.cliente_email) {
      fieldErrors.cliente_email = "El correo es demasiado largo.";
    } else if (!isBasicEmail(cliente_email)) {
      fieldErrors.cliente_email = "Ingresa un correo válido.";
    }
  }

  if (!tipo_servicio) {
    fieldErrors.tipo_servicio = "Selecciona o indica el tipo de servicio.";
  } else if (tipo_servicio.length > FIELD_LIMITS.tipo_servicio) {
    fieldErrors.tipo_servicio = "El tipo de servicio es demasiado largo.";
  }

  if (!descripcion) {
    fieldErrors.descripcion = "Describe el trabajo solicitado.";
  } else if (descripcion.length > FIELD_LIMITS.descripcion) {
    fieldErrors.descripcion = "La descripción es demasiado larga.";
  }

  if (Number.isNaN(cantidad) || (cantidad !== null && cantidad <= 0)) {
    fieldErrors.cantidad = "La cantidad debe ser un entero positivo.";
  }

  if (fecha_deseada) {
    if (!isValidIsoDate(fecha_deseada)) {
      fieldErrors.fecha_deseada = "Ingresa una fecha válida.";
    } else if (fecha_deseada < getTodayIsoDate()) {
      fieldErrors.fecha_deseada =
        "La fecha deseada no puede ser anterior a hoy.";
    }
  }

  if (observaciones && observaciones.length > FIELD_LIMITS.observaciones) {
    fieldErrors.observaciones = "Las observaciones son demasiado largas.";
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors, {
      message: VALIDATION_ERROR_MESSAGE,
    });
  }

  return validationSuccess({
    cliente_nombre,
    cliente_telefono,
    cliente_email,
    tipo_servicio,
    descripcion,
    cantidad,
    fecha_deseada,
    observaciones,
  });
}
