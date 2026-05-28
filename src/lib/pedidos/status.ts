import { Constants, type Enums } from "@/types/database";

export const PEDIDO_STATUSES = Constants.public.Enums.pedido_estado;
export const PEDIDO_PRIORITIES = Constants.public.Enums.pedido_prioridad;

export type PedidoStatus = Enums<"pedido_estado">;
export type PedidoPriority = Enums<"pedido_prioridad">;

export function isPedidoStatus(
  value: string | null | undefined,
): value is PedidoStatus {
  return PEDIDO_STATUSES.includes(value as PedidoStatus);
}
