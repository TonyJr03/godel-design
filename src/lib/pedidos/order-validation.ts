import {
  hasFieldErrors,
  isValidUuid,
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
import { PEDIDO_PRIORITIES, type PedidoPriority } from "./status";

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

export const PEDIDO_FIELDS = [
  "workflow_type",
  "cliente_id",
  "title",
  "description",
  "total_amount",
  "priority",
  "estimated_delivery_date",
  "print_copies",
  "print_color_mode",
  "print_paper_size",
  "print_sides",
  "print_notes",
] as const;

export const PEDIDO_PRIORIDADES = PEDIDO_PRIORITIES;

export type PedidoField = (typeof PEDIDO_FIELDS)[number];
export type PedidoPrioridad = PedidoPriority;

export type CreatePedidoInput = {
  workflow_type?: unknown;
  cliente_id?: unknown;
  title?: unknown;
  description?: unknown;
  total_amount?: unknown;
  priority?: unknown;
  estimated_delivery_date?: unknown;
  print_copies?: unknown;
  print_color_mode?: unknown;
  print_paper_size?: unknown;
  print_sides?: unknown;
  print_notes?: unknown;
};

type CreatePedidoCommonData = {
  workflow_type: WorkflowType;
  cliente_id: string | null;
  title: string;
  description: string;
  total_amount: number;
  priority: PedidoPrioridad;
  estimated_delivery_date: string | null;
};

type CreateEncargoPedidoData = CreatePedidoCommonData & {
  workflow_type: typeof WORKFLOW_TYPES.ENCARGO;
};

type CreateImpresionPedidoData = CreatePedidoCommonData & {
  workflow_type: typeof WORKFLOW_TYPES.IMPRESION;
  print_copies: number;
  print_color_mode: PrintColorMode;
  print_paper_size: PrintPaperSize;
  print_sides: PrintSides;
  print_notes: string | null;
};

export type CreatePedidoData =
  | CreateEncargoPedidoData
  | CreateImpresionPedidoData;

export type PedidoFieldErrors = Partial<Record<PedidoField, string>>;

export type ValidatePedidoInputResult = ValidationResult<
  CreatePedidoData,
  PedidoFieldErrors
>;

const MAX_TITULO_LENGTH = 160;
const MAX_DESCRIPCION_LENGTH = 3000;
const MAX_PRINT_NOTES_LENGTH = 1000;
const MAX_PRINT_COPIES = 10000;
const MAX_TOTAL_AMOUNT = 9999999999.99;
const DEFAULT_PRINT_TITLE = "Pedido de impresión";

export type PedidoTotalAmountValidationResult =
  | {
      ok: true;
      value: number;
    }
  | {
      ok: false;
      error: string;
    };

export function isPedidoPrioridad(
  priority: string | null | undefined,
): priority is PedidoPrioridad {
  return PEDIDO_PRIORIDADES.includes(priority as PedidoPrioridad);
}

export function validatePedidoTotalAmount(
  value: unknown,
): PedidoTotalAmountValidationResult {
  const totalAmountValue = normalizeSingleLineText(value);

  if (!totalAmountValue) {
    return {
      ok: false,
      error: "El precio total es obligatorio.",
    };
  }

  if (totalAmountValue.startsWith("-")) {
    return {
      ok: false,
      error: "El precio total no puede ser negativo.",
    };
  }

  if (!/^\d+(?:\.\d+)?$/.test(totalAmountValue)) {
    return {
      ok: false,
      error: "El precio total debe ser un número válido.",
    };
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(totalAmountValue)) {
    return {
      ok: false,
      error: "El precio total no puede tener más de 2 decimales.",
    };
  }

  const totalAmount = Number(totalAmountValue);

  if (!Number.isFinite(totalAmount)) {
    return {
      ok: false,
      error: "El precio total debe ser un número válido.",
    };
  }

  if (totalAmount > MAX_TOTAL_AMOUNT) {
    return {
      ok: false,
      error: "El precio total supera el máximo permitido.",
    };
  }

  return {
    ok: true,
    value: totalAmount,
  };
}

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

export function validatePedidoInput(
  input: CreatePedidoInput,
): ValidatePedidoInputResult {
  const workflowTypeValue = normalizeSingleLineText(input.workflow_type);
  const clienteId = normalizeOptionalSingleLineText(input.cliente_id);
  const title = normalizeSingleLineText(input.title);
  const description = normalizeMultilineText(input.description);
  const priority = normalizeSingleLineText(input.priority);
  const fechaEntregaEstimada = normalizeOptionalSingleLineText(
    input.estimated_delivery_date,
  );
  const printCopiesValue = normalizeSingleLineText(input.print_copies);
  const printColorModeValue = normalizeSingleLineText(input.print_color_mode);
  const printPaperSizeValue = normalizeSingleLineText(input.print_paper_size);
  const printSidesValue = normalizeSingleLineText(input.print_sides);
  const printNotes = normalizeOptionalMultilineText(input.print_notes);
  const fieldErrors: PedidoFieldErrors = {};

  if (!isWorkflowType(workflowTypeValue)) {
    fieldErrors.workflow_type =
      "Selecciona si el pedido es un encargo o una impresión.";
  }

  if (clienteId && !isValidUuid(clienteId)) {
    fieldErrors.cliente_id =
      "Selecciona un cliente válido o deja el campo vacío.";
  }

  if (!isPedidoPrioridad(priority)) {
    fieldErrors.priority = "Selecciona una prioridad válida.";
  }

  const totalAmountValidation = validatePedidoTotalAmount(
    input.total_amount,
  );

  if (!totalAmountValidation.ok) {
    fieldErrors.total_amount = totalAmountValidation.error;
  }

  if (fechaEntregaEstimada) {
    const fechaEntregaEstimadaValidation =
      validateOptionalFutureDate(fechaEntregaEstimada);

    if (fechaEntregaEstimadaValidation === "invalid") {
      fieldErrors.estimated_delivery_date = "Selecciona una fecha válida.";
    } else if (fechaEntregaEstimadaValidation === "past") {
      fieldErrors.estimated_delivery_date =
        "La fecha estimada de entrega no puede estar en el pasado.";
    }
  }

  if (workflowTypeValue === WORKFLOW_TYPES.ENCARGO) {
    if (!title) {
      fieldErrors.title = "El título del trabajo es obligatorio.";
    } else if (title.length > MAX_TITULO_LENGTH) {
      fieldErrors.title = `El título no puede superar ${MAX_TITULO_LENGTH} caracteres.`;
    }

    if (!description) {
      fieldErrors.description = "La descripción es obligatoria.";
    } else if (description.length > MAX_DESCRIPCION_LENGTH) {
      fieldErrors.description = `La descripción no puede superar ${MAX_DESCRIPCION_LENGTH} caracteres.`;
    }
  }

  let printCopies: number | null = null;
  let printColorMode: PrintColorMode | null = null;
  let printPaperSize: PrintPaperSize | null = null;
  let printSides: PrintSides | null = null;

  if (workflowTypeValue === WORKFLOW_TYPES.IMPRESION) {
    if (title.length > MAX_TITULO_LENGTH) {
      fieldErrors.title = `El título no puede superar ${MAX_TITULO_LENGTH} caracteres.`;
    }

    if (!printCopiesValue) {
      fieldErrors.print_copies = "Indica la cantidad de copias.";
    } else if (!/^[1-9]\d*$/.test(printCopiesValue)) {
      fieldErrors.print_copies = "Ingresa una cantidad de copias válida.";
    } else {
      printCopies = Number(printCopiesValue);

      if (
        !Number.isSafeInteger(printCopies) ||
        printCopies > MAX_PRINT_COPIES
      ) {
        fieldErrors.print_copies =
          "La cantidad de copias debe estar entre 1 y 10000.";
      }
    }

    if (!isOptionValue(printColorModeValue, PRINT_COLOR_MODE_OPTIONS)) {
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
      fieldErrors.print_sides =
        "Selecciona si será a una cara o doble cara.";
    } else {
      printSides = printSidesValue;
    }

    if (printNotes && printNotes.length > MAX_PRINT_NOTES_LENGTH) {
      fieldErrors.print_notes = `Las observaciones no pueden superar ${MAX_PRINT_NOTES_LENGTH} caracteres.`;
    }
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  const commonData = {
    cliente_id: clienteId,
    total_amount: totalAmountValidation.ok ? totalAmountValidation.value : 0,
    priority: priority as PedidoPrioridad,
    estimated_delivery_date: fechaEntregaEstimada,
  };

  if (workflowTypeValue === WORKFLOW_TYPES.IMPRESION) {
    const printData = {
      copies: printCopies as number,
      colorMode: printColorMode as PrintColorMode,
      paperSize: printPaperSize as PrintPaperSize,
      sides: printSides as PrintSides,
      notes: printNotes,
    };

    return validationSuccess({
      ...commonData,
      workflow_type: WORKFLOW_TYPES.IMPRESION,
      title: title || DEFAULT_PRINT_TITLE,
      description: buildPrintDescription(printData),
      print_copies: printData.copies,
      print_color_mode: printData.colorMode,
      print_paper_size: printData.paperSize,
      print_sides: printData.sides,
      print_notes: printData.notes,
    });
  }

  return validationSuccess({
    ...commonData,
    workflow_type: WORKFLOW_TYPES.ENCARGO,
    title,
    description,
  });
}
