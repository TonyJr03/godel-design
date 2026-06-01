import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type Pedido = Tables<"pedidos">;
export type PedidoInsert = TablesInsert<"pedidos">;
export type PedidoUpdate = TablesUpdate<"pedidos">;
export type EstadoPedido = Enums<"pedido_estado">;
export type PrioridadPedido = Enums<"pedido_prioridad">;

export type PedidoId = Pedido["id"];

export type PedidoBase = {
  id: PedidoId;
  status: EstadoPedido;
};
