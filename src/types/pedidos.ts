import type { EstadoPedido } from "@/constants/estados-pedido";

export type PedidoId = string;

export type PedidoBase = {
  id: PedidoId;
  estado: EstadoPedido;
};

// TODO: definir el modelo completo cuando exista el flujo real de pedidos.
