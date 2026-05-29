import { getTodayIsoDate } from "@/lib/utils";
import {
  hasFieldErrors,
  isValidIsoDate,
  isValidUuid,
  normalizeMultilineText,
  normalizeOptionalSingleLineText,
  normalizeSingleLineText,
  validationFailure,
  validationSuccess,
  type ValidationResult,
} from "@/lib/validators";
import { PEDIDO_PRIORITIES, type PedidoPriority } from "./status";

export const PEDIDO_FIELDS = [
  "cliente_id",
  "titulo",
  "descripcion",
  "prioridad",
  "fecha_entrega_estimada",
] as const;

export const PEDIDO_PRIORIDADES = PEDIDO_PRIORITIES;

export type PedidoField = (typeof PEDIDO_FIELDS)[number];
export type PedidoPrioridad = PedidoPriority;

export type CreatePedidoInput = {
  cliente_id?: string | null;
  titulo?: string | null;
  descripcion?: string | null;
  prioridad?: string | null;
  fecha_entrega_estimada?: string | null;
};

export type CreatePedidoData = {
  cliente_id: string;
  titulo: string;
  descripcion: string;
  prioridad: PedidoPrioridad;
  fecha_entrega_estimada: string | null;
};

export type PedidoFieldErrors = Partial<Record<PedidoField, string>>;

export type ValidatePedidoInputResult = ValidationResult<
  CreatePedidoData,
  PedidoFieldErrors
>;

const MAX_TITULO_LENGTH = 160;
const MAX_DESCRIPCION_LENGTH = 3000;

export function isPedidoPrioridad(
  prioridad: string | null | undefined,
): prioridad is PedidoPrioridad {
  return PEDIDO_PRIORIDADES.includes(prioridad as PedidoPrioridad);
}

export function validatePedidoInput(
  input: CreatePedidoInput,
): ValidatePedidoInputResult {
  const clienteId = normalizeSingleLineText(input.cliente_id);
  const titulo = normalizeSingleLineText(input.titulo);
  const descripcion = normalizeMultilineText(input.descripcion);
  const prioridad = normalizeSingleLineText(input.prioridad);
  const fechaEntregaEstimada = normalizeOptionalSingleLineText(
    input.fecha_entrega_estimada,
  );
  const fieldErrors: PedidoFieldErrors = {};

  if (!clienteId) {
    fieldErrors.cliente_id = "Selecciona un cliente.";
  } else if (!isValidUuid(clienteId)) {
    fieldErrors.cliente_id = "Selecciona un cliente válido.";
  }

  if (!titulo) {
    fieldErrors.titulo = "El título del trabajo es obligatorio.";
  } else if (titulo.length > MAX_TITULO_LENGTH) {
    fieldErrors.titulo = `El título no puede superar ${MAX_TITULO_LENGTH} caracteres.`;
  }

  if (!descripcion) {
    fieldErrors.descripcion = "La descripción es obligatoria.";
  } else if (descripcion.length > MAX_DESCRIPCION_LENGTH) {
    fieldErrors.descripcion = `La descripción no puede superar ${MAX_DESCRIPCION_LENGTH} caracteres.`;
  }

  if (!isPedidoPrioridad(prioridad)) {
    fieldErrors.prioridad = "Selecciona una prioridad válida.";
  }

  if (fechaEntregaEstimada) {
    if (!isValidIsoDate(fechaEntregaEstimada)) {
      fieldErrors.fecha_entrega_estimada = "Selecciona una fecha válida.";
    } else if (fechaEntregaEstimada < getTodayIsoDate()) {
      fieldErrors.fecha_entrega_estimada =
        "La fecha estimada de entrega no puede estar en el pasado.";
    }
  }

  if (hasFieldErrors(fieldErrors)) {
    return validationFailure(fieldErrors);
  }

  return validationSuccess({
    cliente_id: clienteId,
    titulo,
    descripcion,
    prioridad: prioridad as PedidoPrioridad,
    fecha_entrega_estimada: fechaEntregaEstimada,
  });
}
