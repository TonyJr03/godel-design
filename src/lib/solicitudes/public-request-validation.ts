import {
  hasFieldErrors,
  validationFailure,
  validationSuccess,
} from "@/lib/validators";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";
import {
  normalizePublicSolicitudInput,
  validateCommonPublicSolicitudFields,
} from "./public-request-validation-common";
import {
  buildEncargoSolicitudData,
  validateEncargoSolicitudFields,
} from "./public-request-validation-encargo";
import {
  buildImpresionSolicitudData,
  validateImpresionSolicitudFields,
  type PrintSolicitudValidationData,
} from "./public-request-validation-impresion";
import {
  PUBLIC_SOLICITUD_VALIDATION_ERROR_MESSAGE,
  type PublicSolicitudFieldErrors,
  type PublicSolicitudInput,
  type PublicSolicitudResolvedService,
  type ValidatePublicSolicitudInputResult,
} from "./public-request-validation-types";

export {
  PRINT_COLOR_MODE_OPTIONS,
  PRINT_PAPER_SIZE_OPTIONS,
  PRINT_SIDES_OPTIONS,
} from "./public-request-validation-types";

export type {
  PrintColorMode,
  PrintPaperSize,
  PrintSides,
  PublicSolicitudData,
  PublicSolicitudField,
  PublicSolicitudFieldErrors,
  PublicSolicitudInput,
  PublicSolicitudResolvedService,
  ValidatePublicSolicitudInputResult,
} from "./public-request-validation-types";

export function validatePublicSolicitudInput(
  input: PublicSolicitudInput,
  service: PublicSolicitudResolvedService,
): ValidatePublicSolicitudInputResult {
  const fieldErrors: PublicSolicitudFieldErrors = {};
  const normalizedInput = normalizePublicSolicitudInput(input);
  let printData: PrintSolicitudValidationData | null = null;

  validateCommonPublicSolicitudFields(normalizedInput, fieldErrors);

  if (service.workflowType === WORKFLOW_TYPES.ENCARGO) {
    validateEncargoSolicitudFields(normalizedInput, fieldErrors);
  }

  if (service.workflowType === WORKFLOW_TYPES.IMPRESION) {
    printData = validateImpresionSolicitudFields(
      normalizedInput,
      fieldErrors,
    );
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors, {
      message: PUBLIC_SOLICITUD_VALIDATION_ERROR_MESSAGE,
    });
  }

  if (
    service.workflowType === WORKFLOW_TYPES.IMPRESION &&
    printData
  ) {
    return validationSuccess(
      buildImpresionSolicitudData(normalizedInput, printData, service),
    );
  }

  return validationSuccess(buildEncargoSolicitudData(normalizedInput, service));
}
