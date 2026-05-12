export const ESTADOS_PEDIDO = [
  "solicitud_recibida",
  "en_revision",
  "cotizado",
  "aprobado_cliente",
  "en_diseno",
  "en_produccion",
  "listo_entrega",
  "entregado",
  "cancelado",
] as const;

export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];
