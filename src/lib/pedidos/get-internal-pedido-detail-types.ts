import type { Enums, Tables } from "@/types/database";
import type {
  InternalServiceReference,
  InternalServiceReferenceRow,
} from "@/lib/service-types";

type PedidoClienteDetail =
  | Pick<Tables<"clientes">, "id" | "name" | "phone" | "email">
  | null;

type PedidoSolicitudBase = Pick<
  Tables<"solicitudes">,
  | "id"
  | "service_id"
  | "workflow_type"
  | "desired_date"
>;

type PedidoSolicitudDetail =
  | (PedidoSolicitudBase & {
      service: InternalServiceReference | null;
    })
  | null;

type PedidoSolicitudDetailRow =
  | (PedidoSolicitudBase & {
      service: InternalServiceReferenceRow | null;
    })
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
  | "service_id"
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
  service: InternalServiceReference | null;
  solicitudes: PedidoSolicitudDetail;
  creador: PedidoProfileDetail;
  pedido_trabajadores: InternalPedidoDetailTrabajador[];
  payment: InternalPedidoPayment;
};

export type InternalPedidoDetailRow = Omit<
  InternalPedidoDetail,
  "payment" | "service" | "solicitudes"
> & {
  service: InternalServiceReferenceRow | null;
  solicitudes: PedidoSolicitudDetailRow;
};
