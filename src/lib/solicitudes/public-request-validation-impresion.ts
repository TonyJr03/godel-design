import { WORKFLOW_TYPES } from "@/lib/workflow-types";
import type { NormalizedPublicSolicitudInput } from "./public-request-validation-common";
import {
  PRINT_COLOR_MODE_OPTIONS,
  PRINT_PAPER_SIZE_OPTIONS,
  PRINT_SIDES_OPTIONS,
  PUBLIC_SOLICITUD_FIELD_LIMITS,
  type PrintColorMode,
  type PrintPaperSize,
  type PrintSides,
  type PublicImpresionSolicitudData,
  type PublicSolicitudFieldErrors,
} from "./public-request-validation-types";

export type PrintSolicitudValidationData = {
  copies: number | null;
  colorMode: PrintColorMode | null;
  paperSize: PrintPaperSize | null;
  sides: PrintSides | null;
};

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

export function validateImpresionSolicitudFields(
  input: NormalizedPublicSolicitudInput,
  fieldErrors: PublicSolicitudFieldErrors,
): PrintSolicitudValidationData {
  let copies: number | null = null;
  let colorMode: PrintColorMode | null = null;
  let paperSize: PrintPaperSize | null = null;
  let sides: PrintSides | null = null;

  if (!/^[1-9]\d*$/.test(input.printCopiesValue)) {
    fieldErrors.print_copies = "Ingresa una cantidad de copias válida.";
  } else {
    copies = Number(input.printCopiesValue);

    if (
      !Number.isSafeInteger(copies) ||
      copies > PUBLIC_SOLICITUD_FIELD_LIMITS.print_copies
    ) {
      fieldErrors.print_copies =
        "La cantidad de copias debe estar entre 1 y 10000.";
    }
  }

  if (!isOptionValue(input.printColorModeValue, PRINT_COLOR_MODE_OPTIONS)) {
    fieldErrors.print_color_mode = "Selecciona el modo de color.";
  } else {
    colorMode = input.printColorModeValue;
  }

  if (!isOptionValue(input.printPaperSizeValue, PRINT_PAPER_SIZE_OPTIONS)) {
    fieldErrors.print_paper_size = "Selecciona el tamaño de papel.";
  } else {
    paperSize = input.printPaperSizeValue;
  }

  if (!isOptionValue(input.printSidesValue, PRINT_SIDES_OPTIONS)) {
    fieldErrors.print_sides = "Selecciona la cantidad de caras.";
  } else {
    sides = input.printSidesValue;
  }

  return {
    copies,
    colorMode,
    paperSize,
    sides,
  };
}

export function buildImpresionSolicitudData(
  input: NormalizedPublicSolicitudInput,
  printData: PrintSolicitudValidationData,
): PublicImpresionSolicitudData {
  const copies = printData.copies as number;
  const colorMode = printData.colorMode as PrintColorMode;
  const paperSize = printData.paperSize as PrintPaperSize;
  const sides = printData.sides as PrintSides;

  return {
    workflow_type: WORKFLOW_TYPES.IMPRESION,
    client_name: input.client_name,
    client_phone: input.client_phone,
    client_email: input.client_email,
    service_type: "Impresion",
    description: buildPrintDescription({
      copies,
      colorMode,
      paperSize,
      sides,
      notes: input.notes,
    }),
    desired_date: null,
    notes: input.notes,
    print_copies: copies,
    print_color_mode: colorMode,
    print_paper_size: paperSize,
    print_sides: sides,
  };
}
