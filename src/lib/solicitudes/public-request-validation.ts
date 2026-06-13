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
import {
  WORKFLOW_TYPES,
  isWorkflowType,
  type WorkflowType,
} from "@/lib/workflow-types";

export const PRINT_COLOR_MODE_OPTIONS = [
  { value: "blanco_negro", label: "Blanco y negro" },
  { value: "color", label: "Color" },
] as const;

export const PRINT_PAPER_SIZE_OPTIONS = [
  { value: "carta", label: "Carta" },
  { value: "a4", label: "A4" },
  { value: "oficio", label: "Oficio" },
  { value: "otro", label: "Otro" },
] as const;

export const PRINT_SIDES_OPTIONS = [
  { value: "una_cara", label: "Una cara" },
  { value: "doble_cara", label: "Doble cara" },
] as const;

export type PrintColorMode = (typeof PRINT_COLOR_MODE_OPTIONS)[number]["value"];
export type PrintPaperSize = (typeof PRINT_PAPER_SIZE_OPTIONS)[number]["value"];
export type PrintSides = (typeof PRINT_SIDES_OPTIONS)[number]["value"];

export type PublicSolicitudInput = {
  workflow_type?: unknown;
  client_name?: unknown;
  client_phone?: unknown;
  client_email?: unknown;
  service_type?: unknown;
  description?: unknown;
  desired_date?: unknown;
  notes?: unknown;
  print_copies?: unknown;
  print_color_mode?: unknown;
  print_paper_size?: unknown;
  print_sides?: unknown;
  files?: unknown;
};

type PublicSolicitudCommonData = {
  client_name: string;
  client_phone: string;
  client_email: string | null;
  workflow_type: WorkflowType;
};

type PublicEncargoSolicitudData = PublicSolicitudCommonData & {
  workflow_type: typeof WORKFLOW_TYPES.ENCARGO;
  service_type: string;
  description: string;
  desired_date: string | null;
  notes: string | null;
};

type PublicImpresionSolicitudData = PublicSolicitudCommonData & {
  workflow_type: typeof WORKFLOW_TYPES.IMPRESION;
  service_type: "Impresion";
  description: string;
  desired_date: null;
  notes: string | null;
  print_copies: number;
  print_color_mode: PrintColorMode;
  print_paper_size: PrintPaperSize;
  print_sides: PrintSides;
};

export type PublicSolicitudData =
  | PublicEncargoSolicitudData
  | PublicImpresionSolicitudData;

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
  print_copies: 10000,
} as const;

const VALIDATION_ERROR_MESSAGE =
  "Revisa los campos marcados antes de enviar la solicitud.";

function isOptionValue<
  Options extends readonly { value: string; label: string }[],
>(
  value: string,
  options: Options,
): value is Options[number]["value"] {
  return options.some((option) => option.value === value);
}

function getOptionLabel<
  Options extends readonly { value: string; label: string }[],
>(value: Options[number]["value"], options: Options): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function buildPrintDescription(input: {
  copies: number;
  colorMode: PrintColorMode;
  paperSize: PrintPaperSize;
  sides: PrintSides;
  notes: string | null;
}): string {
  return [
    "Tipo de trabajo: Impresión",
    "",
    `Cantidad de copias: ${input.copies}`,
    `Modo de color: ${getOptionLabel(input.colorMode, PRINT_COLOR_MODE_OPTIONS)}`,
    `Tamaño de papel: ${getOptionLabel(input.paperSize, PRINT_PAPER_SIZE_OPTIONS)}`,
    `Caras: ${getOptionLabel(input.sides, PRINT_SIDES_OPTIONS)}`,
    "",
    "Observaciones:",
    input.notes ?? "Sin observaciones.",
  ].join("\n");
}

export function validatePublicSolicitudInput(
  input: PublicSolicitudInput,
): ValidatePublicSolicitudInputResult {
  const fieldErrors: PublicSolicitudFieldErrors = {};

  const workflowTypeValue = normalizeSingleLineText(input.workflow_type);
  const client_name = normalizeSingleLineText(input.client_name);
  const client_phone = normalizeSingleLineText(input.client_phone);
  const client_email = normalizeOptionalSingleLineText(input.client_email);
  const service_type = normalizeSingleLineText(input.service_type);
  const description = normalizeMultilineText(input.description);
  const desired_date = normalizeOptionalSingleLineText(input.desired_date);
  const notes = normalizeOptionalMultilineText(input.notes);
  const printCopiesValue = normalizeSingleLineText(input.print_copies);
  const printColorModeValue = normalizeSingleLineText(input.print_color_mode);
  const printPaperSizeValue = normalizeSingleLineText(input.print_paper_size);
  const printSidesValue = normalizeSingleLineText(input.print_sides);

  if (!isWorkflowType(workflowTypeValue)) {
    fieldErrors.workflow_type =
      "Selecciona si necesitas un encargo personalizado o una impresión.";
  }

  if (!client_name) {
    fieldErrors.client_name = "Ingresa el nombre del cliente.";
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

  if (workflowTypeValue === WORKFLOW_TYPES.ENCARGO) {
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
  }

  if (notes && notes.length > FIELD_LIMITS.notes) {
    fieldErrors.notes = "Las observaciones son demasiado largas.";
  }

  let printCopies: number | null = null;
  let printColorMode: PrintColorMode | null = null;
  let printPaperSize: PrintPaperSize | null = null;
  let printSides: PrintSides | null = null;

  if (workflowTypeValue === WORKFLOW_TYPES.IMPRESION) {
    if (!/^[1-9]\d*$/.test(printCopiesValue)) {
      fieldErrors.print_copies = "Ingresa una cantidad de copias válida.";
    } else {
      printCopies = Number(printCopiesValue);

      if (
        !Number.isSafeInteger(printCopies) ||
        printCopies > FIELD_LIMITS.print_copies
      ) {
        fieldErrors.print_copies =
          "La cantidad de copias debe estar entre 1 y 10000.";
      }
    }

    if (
      !isOptionValue(printColorModeValue, PRINT_COLOR_MODE_OPTIONS)
    ) {
      fieldErrors.print_color_mode = "Selecciona el modo de color.";
    } else {
      printColorMode = printColorModeValue;
    }

    if (!isOptionValue(printPaperSizeValue, PRINT_PAPER_SIZE_OPTIONS)) {
      fieldErrors.print_paper_size = "Selecciona el tamaño de papel.";
    } else {
      printPaperSize = printPaperSizeValue;
    }

    if (!isOptionValue(printSidesValue, PRINT_SIDES_OPTIONS)) {
      fieldErrors.print_sides = "Selecciona la cantidad de caras.";
    } else {
      printSides = printSidesValue;
    }
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors, {
      message: VALIDATION_ERROR_MESSAGE,
    });
  }

  if (workflowTypeValue === WORKFLOW_TYPES.IMPRESION) {
    const printData = {
      copies: printCopies as number,
      colorMode: printColorMode as PrintColorMode,
      paperSize: printPaperSize as PrintPaperSize,
      sides: printSides as PrintSides,
      notes,
    };

    return validationSuccess({
      workflow_type: WORKFLOW_TYPES.IMPRESION,
      client_name,
      client_phone,
      client_email,
      service_type: "Impresion",
      description: buildPrintDescription(printData),
      desired_date: null,
      notes,
      print_copies: printData.copies,
      print_color_mode: printData.colorMode,
      print_paper_size: printData.paperSize,
      print_sides: printData.sides,
    });
  }

  return validationSuccess({
    workflow_type: WORKFLOW_TYPES.ENCARGO,
    client_name,
    client_phone,
    client_email,
    service_type,
    description,
    desired_date,
    notes,
  });
}
