import type { ServiceResult } from "@/lib/service-results";
import type { WorkflowType } from "@/lib/workflow-types";
import type { Tables } from "@/types/database";
import type { PedidoTasksProgress } from "./task-progress";
import type { PedidoPaymentStatus, PedidoStatus } from "./status";

export type InternalPedidoEstado = PedidoStatus;

type PedidoCliente = Pick<Tables<"clientes">, "id" | "name"> | null;
type PedidoSolicitud =
  | Pick<Tables<"solicitudes">, "id" | "service_type">
  | null;
type PedidoTrabajadorProfile =
  | Pick<Tables<"perfiles">, "id" | "full_name">
  | null;

export type PedidoPaymentRow = Pick<
  Tables<"pedido_pagos">,
  | "total_amount"
  | "paid_cash_amount"
  | "paid_transfer_amount"
  | "payment_status"
>;

export type InternalPedidoTrabajador = Pick<
  Tables<"pedido_trabajadores">,
  "assigned_profile_id"
> & {
  perfiles: PedidoTrabajadorProfile;
};

export type InternalPedidoPaymentSummary = {
  totalAmount: number;
  paidCashAmount: number;
  paidTransferAmount: number;
  paidTotalAmount: number;
  pendingAmount: number;
  paymentStatus: PedidoPaymentStatus;
  isAvailable: boolean;
};

export type InternalPedidoRow = Pick<
  Tables<"pedidos">,
  | "id"
  | "order_number"
  | "cliente_id"
  | "solicitud_id"
  | "workflow_type"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "estimated_delivery_date"
  | "created_at"
> & {
  clientes: PedidoCliente;
  solicitudes: PedidoSolicitud;
  pedido_trabajadores: InternalPedidoTrabajador[];
  payment: PedidoPaymentRow | PedidoPaymentRow[] | null;
};

export type InternalPedido = Omit<InternalPedidoRow, "payment"> & {
  payment: InternalPedidoPaymentSummary;
  taskProgress: PedidoTasksProgress;
};

export type ListInternalPedidosOptions = {
  q?: string | null;
  status?: string | null;
  workflowType?: string | null;
  paymentStatus?: string | null;
  limit?: number;
};

export type ListInternalPedidosMeta = {
  q: string | null;
  status: InternalPedidoEstado | null;
  workflowType: WorkflowType | null;
  paymentStatus: PedidoPaymentStatus | null;
  ignoredInvalidEstado: boolean;
  ignoredInvalidWorkflowType: boolean;
  ignoredInvalidPaymentStatus: boolean;
};

export type ListInternalPedidosErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListInternalPedidosResult = ServiceResult<
  { pedidos: InternalPedido[] } & ListInternalPedidosMeta,
  ListInternalPedidosErrorReason,
  ListInternalPedidosMeta
>;
