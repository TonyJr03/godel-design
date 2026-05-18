import { Constants, type Enums } from "@/types/database";

export const PEDIDO_STATUSES = Constants.public.Enums.pedido_estado;

export type PedidoStatus = Enums<"pedido_estado">;

export const PEDIDO_STATUS_LABELS: Record<PedidoStatus, string> = {
  solicitud_recibida: "Solicitud recibida",
  en_revision: "En revisión",
  cotizado: "Cotizado",
  aprobado_cliente: "Aprobado por cliente",
  en_diseno: "En diseño",
  en_produccion: "En producción",
  listo_entrega: "Listo para entrega",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

export function isPedidoStatus(
  value: string | null | undefined,
): value is PedidoStatus {
  return PEDIDO_STATUSES.includes(value as PedidoStatus);
}
