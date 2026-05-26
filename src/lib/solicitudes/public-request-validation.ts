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

export type PublicSolicitudValidationResult =
  | {
      ok: true;
      data: PublicSolicitudData;
    }
  | {
      ok: false;
      fieldErrors: PublicSolicitudFieldErrors;
      message: string;
    };

const FIELD_LIMITS = {
  cliente_nombre: 120,
  cliente_telefono: 40,
  cliente_email: 254,
  tipo_servicio: 120,
  descripcion: 2000,
  observaciones: 1000,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function getText(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function cleanSingleLineText(value: unknown) {
  return getText(value)
    .replace(CONTROL_CHARS_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMultilineText(value: unknown) {
  return getText(value)
    .replace(/\r\n?/g, "\n")
    .replace(CONTROL_CHARS_PATTERN, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

function optionalText(value: unknown, multiline = false) {
  const cleanValue = multiline
    ? cleanMultilineText(value)
    : cleanSingleLineText(value);

  return cleanValue.length > 0 ? cleanValue : null;
}

function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function getTodayIsoDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseCantidad(value: unknown) {
  const textValue = cleanSingleLineText(value);

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
): PublicSolicitudValidationResult {
  const fieldErrors: PublicSolicitudFieldErrors = {};

  const cliente_nombre = cleanSingleLineText(input.cliente_nombre);
  const cliente_telefono = cleanSingleLineText(input.cliente_telefono);
  const cliente_email = optionalText(input.cliente_email);
  const tipo_servicio = cleanSingleLineText(input.tipo_servicio);
  const descripcion = cleanMultilineText(input.descripcion);
  const cantidad = parseCantidad(input.cantidad);
  const fecha_deseada = optionalText(input.fecha_deseada);
  const observaciones = optionalText(input.observaciones, true);

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
    } else if (!EMAIL_PATTERN.test(cliente_email)) {
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

  if (
    observaciones &&
    observaciones.length > FIELD_LIMITS.observaciones
  ) {
    fieldErrors.observaciones = "Las observaciones son demasiado largas.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      fieldErrors,
      message: "Revisa los campos marcados antes de enviar la solicitud.",
    };
  }

  return {
    ok: true,
    data: {
      cliente_nombre,
      cliente_telefono,
      cliente_email,
      tipo_servicio,
      descripcion,
      cantidad,
      fecha_deseada,
      observaciones,
    },
  };
}
