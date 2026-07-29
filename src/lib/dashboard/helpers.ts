import { addDays, formatDateOnly } from "@/lib/utils";
import type { Enums } from "@/types/database";

export type SolicitudEstado = Enums<"solicitud_estado">;
export type PedidoEstado = Enums<"pedido_estado">;
export type PedidoWorkflowType = Enums<"workflow_type">;

export type DashboardDateWindow = {
  today: string;
  nextSevenDays: string;
};

export type PedidoDeliveryStatusInput = {
  status: PedidoEstado;
  estimated_delivery_date: string | null;
};

export type PedidoTaskRequirementInput = {
  workflow_type: PedidoWorkflowType;
};

export const SUMMARY_PENDING_SOLICITUD_STATUSES: readonly SolicitudEstado[] = [
  "nueva",
  "en_revision",
  "contactada",
];

export const WORK_PENDING_SOLICITUD_STATUSES: readonly SolicitudEstado[] = [
  "nueva",
  "en_revision",
  "contactada",
  "aprobada",
];

export const FINAL_PEDIDO_STATUSES: readonly PedidoEstado[] = [
  "entregado",
  "cancelado",
];

export const PENDING_REVIEW_PEDIDO_STATUSES: readonly PedidoEstado[] = [
  "creado",
  "solicitud_recibida",
];

export const DASHBOARD_PEDIDO_NEW_STATUSES: readonly PedidoEstado[] = [
  "creado",
  "solicitud_recibida",
];

export const DASHBOARD_PEDIDO_REVIEW_STATUSES: readonly PedidoEstado[] = [
  "en_revision",
];

export const DASHBOARD_PEDIDO_PRODUCTION_STATUSES: readonly PedidoEstado[] = [
  "en_produccion",
];

export const DASHBOARD_PEDIDO_READY_STATUSES: readonly PedidoEstado[] = [
  "listo_entrega",
];

export const DASHBOARD_PEDIDO_GROUP_LIMITS = {
  nuevos: 4,
  enRevision: 4,
  enProduccion: 6,
  listosEntrega: 8,
} as const;

export const PEDIDO_STATUSES_WITHOUT_TASKS_ATTENTION: readonly PedidoEstado[] = [
  ...PENDING_REVIEW_PEDIDO_STATUSES,
  "en_revision",
];

export function getDashboardDateWindow(
  date = new Date(),
): DashboardDateWindow {
  return {
    today: formatDateOnly(date),
    nextSevenDays: formatDateOnly(addDays(date, 7)),
  };
}

export function isPedidoActivo(status: PedidoEstado): boolean {
  return !FINAL_PEDIDO_STATUSES.includes(status);
}

export function isPedidoPendingReview(status: PedidoEstado): boolean {
  return PENDING_REVIEW_PEDIDO_STATUSES.includes(status);
}

export function doesPedidoWorkflowRequireTasks(
  pedido: PedidoTaskRequirementInput,
): boolean {
  return pedido.workflow_type === "encargo";
}

export function isPedidoAtrasado(
  pedido: PedidoDeliveryStatusInput,
  today: string,
): boolean {
  return Boolean(
    pedido.estimated_delivery_date &&
      pedido.estimated_delivery_date < today &&
      isPedidoActivo(pedido.status),
  );
}

export function isPedidoProximoEntrega(
  pedido: PedidoDeliveryStatusInput,
  today: string,
  nextSevenDays: string,
): boolean {
  return Boolean(
    pedido.estimated_delivery_date &&
      pedido.estimated_delivery_date >= today &&
      pedido.estimated_delivery_date <= nextSevenDays &&
      isPedidoActivo(pedido.status),
  );
}
