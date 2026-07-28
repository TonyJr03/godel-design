import type { ValidationResult } from "@/lib/validators";
import { WORKFLOW_TYPES, type WorkflowType } from "@/lib/workflow-types";

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
  service_id?: unknown;
  client_name?: unknown;
  client_phone?: unknown;
  client_email?: unknown;
  description?: unknown;
  desired_date?: unknown;
  notes?: unknown;
  print_copies?: unknown;
  print_color_mode?: unknown;
  print_paper_size?: unknown;
  print_sides?: unknown;
  hasFiles: boolean;
};

export type PublicSolicitudResolvedService = {
  id: string;
  name: string;
  workflowType: WorkflowType;
};

export type PublicSolicitudCommonData = {
  service_id: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  workflow_type: WorkflowType;
};

export type PublicEncargoSolicitudData = PublicSolicitudCommonData & {
  workflow_type: typeof WORKFLOW_TYPES.ENCARGO;
  description: string;
  desired_date: string | null;
  notes: string | null;
};

export type PublicImpresionSolicitudData = PublicSolicitudCommonData & {
  workflow_type: typeof WORKFLOW_TYPES.IMPRESION;
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

export type PublicSolicitudField = keyof PublicSolicitudInput | "files";

export type PublicSolicitudFieldErrors = Partial<
  Record<PublicSolicitudField, string>
>;

export type ValidatePublicSolicitudInputResult = ValidationResult<
  PublicSolicitudData,
  PublicSolicitudFieldErrors,
  { message: string }
>;

export const PUBLIC_SOLICITUD_FIELD_LIMITS = {
  client_name: 120,
  client_phone: 40,
  client_email: 254,
  description: 2000,
  notes: 1000,
  print_copies: 10000,
} as const;

export const PUBLIC_SOLICITUD_VALIDATION_ERROR_MESSAGE =
  "Revisa los campos marcados antes de enviar la solicitud.";
