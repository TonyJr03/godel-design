import type { Enums, Tables } from "@/types/database";

type PedidoClienteDetail =
  | Pick<Tables<"clientes">, "id" | "name" | "phone" | "email">
  | null;

type PedidoSolicitudDetail =
  | Pick<
      Tables<"solicitudes">,
      | "id"
      | "client_name"
      | "client_phone"
      | "client_email"
      | "workflow_type"
      | "service_type"
      | "description"
      | "status"
      | "desired_date"
      | "created_at"
    >
  | null;

type PedidoProfileDetail =
  | Pick<Tables<"perfiles">, "id" | "full_name">
  | null;

type PedidoAssignedProfileDetail =
  | Pick<Tables<"perfiles">, "id" | "full_name" | "role" | "is_active">
  | null;

export type PedidoDetailPaymentRow = Pick<
  Tables<"pedido_pagos">,
  | "total_amount"
  | "paid_cash_amount"
  | "paid_transfer_amount"
  | "payment_status"
  | "paid_at"
>;

export type InternalPedidoPayment = {
  totalAmount: number;
  paidCashAmount: number;
  paidTransferAmount: number;
  paidTotalAmount: number;
  pendingAmount: number;
  paymentStatus: Enums<"pedido_pago_estado">;
  paidAt: string | null;
  isAvailable: boolean;
};

export type InternalPedidoDetailTrabajador = Pick<
  Tables<"pedido_trabajadores">,
  "id" | "assigned_profile_id" | "assigned_at" | "assigned_by"
> & {
  perfiles: PedidoAssignedProfileDetail;
};

export type InternalPedidoDetail = Pick<
  Tables<"pedidos">,
  | "id"
  | "order_number"
  | "public_reference"
  | "cliente_id"
  | "solicitud_id"
  | "workflow_type"
  | "title"
  | "description"
  | "status"
  | "priority"
  | "estimated_delivery_date"
  | "actual_delivery_date"
  | "created_by"
  | "created_at"
  | "updated_at"
> & {
  clientes: PedidoClienteDetail;
  solicitudes: PedidoSolicitudDetail;
  creador: PedidoProfileDetail;
  pedido_trabajadores: InternalPedidoDetailTrabajador[];
  payment: InternalPedidoPayment;
};

export type InternalPedidoDetailRow = Omit<InternalPedidoDetail, "payment">;
