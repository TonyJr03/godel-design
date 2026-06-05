import {
  hasFieldErrors,
  isValidUuid,
  normalizeMultilineText,
  normalizeOptionalSingleLineText,
  normalizeSingleLineText,
  validationFailure,
  validationSuccess,
  validateOptionalFutureDate,
  type ValidationResult,
} from "@/lib/validators";
import { PEDIDO_PRIORITIES, type PedidoPriority } from "./status";

export const PEDIDO_FIELDS = [
  "cliente_id",
  "title",
  "description",
  "priority",
  "estimated_delivery_date",
] as const;

export const PEDIDO_PRIORIDADES = PEDIDO_PRIORITIES;

export type PedidoField = (typeof PEDIDO_FIELDS)[number];
export type PedidoPrioridad = PedidoPriority;

export type CreatePedidoInput = {
  cliente_id?: string | null;
  title?: string | null;
  description?: string | null;
  priority?: string | null;
  estimated_delivery_date?: string | null;
};

export type CreatePedidoData = {
  cliente_id: string | null;
  title: string;
  description: string;
  priority: PedidoPrioridad;
  estimated_delivery_date: string | null;
};

export type PedidoFieldErrors = Partial<Record<PedidoField, string>>;

export type ValidatePedidoInputResult = ValidationResult<
  CreatePedidoData,
  PedidoFieldErrors
>;

const MAX_TITULO_LENGTH = 160;
const MAX_DESCRIPCION_LENGTH = 3000;

export function isPedidoPrioridad(
  priority: string | null | undefined,
): priority is PedidoPrioridad {
  return PEDIDO_PRIORIDADES.includes(priority as PedidoPrioridad);
}

export function validatePedidoInput(
  input: CreatePedidoInput,
): ValidatePedidoInputResult {
  const clienteId = normalizeOptionalSingleLineText(input.cliente_id);
  const title = normalizeSingleLineText(input.title);
  const description = normalizeMultilineText(input.description);
  const priority = normalizeSingleLineText(input.priority);
  const fechaEntregaEstimada = normalizeOptionalSingleLineText(
    input.estimated_delivery_date,
  );
  const fieldErrors: PedidoFieldErrors = {};

  if (clienteId && !isValidUuid(clienteId)) {
    fieldErrors.cliente_id = "Selecciona un cliente válido o deja el campo vacío.";
  }

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

  if (!isPedidoPrioridad(priority)) {
    fieldErrors.priority = "Selecciona una prioridad válida.";
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

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    cliente_id: clienteId,
    title,
    description,
    priority: priority as PedidoPrioridad,
    estimated_delivery_date: fechaEntregaEstimada,
  });
}
