import { Constants, type Enums } from "@/types/database";
import { getTodayIsoDate } from "@/lib/utils";
import { isValidUuid } from "@/lib/validators";

export const PEDIDO_FIELDS = [
  "cliente_id",
  "titulo",
  "descripcion",
  "prioridad",
  "fecha_entrega_estimada",
] as const;

export const PEDIDO_PRIORIDADES = Constants.public.Enums.pedido_prioridad;

export type PedidoField = (typeof PEDIDO_FIELDS)[number];
export type PedidoPrioridad = Enums<"pedido_prioridad">;

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

export type ValidatePedidoInputResult =
  | {
      ok: true;
      data: CreatePedidoData;
    }
  | {
      ok: false;
      fieldErrors: PedidoFieldErrors;
    };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITULO_LENGTH = 160;
const MAX_DESCRIPCION_LENGTH = 3000;

function cleanRequired(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function cleanMultiline(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim();
}

function cleanOptionalDate(value: string | null | undefined): string | null {
  const cleaned = (value ?? "").trim();

  return cleaned || null;
}

export function isPedidoPrioridad(
  prioridad: string | null | undefined,
): prioridad is PedidoPrioridad {
  return PEDIDO_PRIORIDADES.includes(prioridad as PedidoPrioridad);
}

export function validatePedidoInput(
  input: CreatePedidoInput,
): ValidatePedidoInputResult {
  const clienteId = cleanRequired(input.cliente_id);
  const titulo = cleanRequired(input.titulo);
  const descripcion = cleanMultiline(input.descripcion);
  const prioridad = cleanRequired(input.prioridad);
  const fechaEntregaEstimada = cleanOptionalDate(input.fecha_entrega_estimada);
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
    if (!ISO_DATE_PATTERN.test(fechaEntregaEstimada)) {
      fieldErrors.fecha_entrega_estimada = "Selecciona una fecha válida.";
    } else if (fechaEntregaEstimada < getTodayIsoDate()) {
      fieldErrors.fecha_entrega_estimada =
        "La fecha estimada de entrega no puede estar en el pasado.";
    }
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
      cliente_id: clienteId,
      titulo,
      descripcion,
      prioridad: prioridad as PedidoPrioridad,
      fecha_entrega_estimada: fechaEntregaEstimada,
    },
  };
}
