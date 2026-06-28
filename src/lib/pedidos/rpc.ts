import type { SupabaseClient } from "@supabase/supabase-js";
import type { Enums, Json, Tables } from "@/types/database";

export type CreateManualPedidoRpcRow = {
  pedido_id: string;
  order_number: string;
  public_reference: string;
};

type CreateManualPedidoRpcResult = {
  data: CreateManualPedidoRpcRow[] | null;
  error: { message?: string } | null;
};

type CreateManualPedidoRpcArgs = {
  p_workflow_type: Enums<"workflow_type">;
  p_cliente_id: string | null;
  p_title: string;
  p_description: string;
  p_priority: Enums<"pedido_prioridad">;
  p_estimated_delivery_date: string | null;
  p_total_amount: number;
};

type CreateManualPedidoRpcClient = {
  rpc(
    fn: "crear_pedido_manual",
    args: CreateManualPedidoRpcArgs,
  ): PromiseLike<CreateManualPedidoRpcResult>;
};

export function createManualPedidoRpc(
  supabase: SupabaseClient,
  args: CreateManualPedidoRpcArgs,
) {
  return (supabase as unknown as CreateManualPedidoRpcClient).rpc(
    "crear_pedido_manual",
    args,
  );
}

export type ConvertSolicitudToPedidoRpcRow = Pick<
  Tables<"pedidos">,
  "id" | "order_number"
>;

type ConvertSolicitudToPedidoRpcResult = {
  data: ConvertSolicitudToPedidoRpcRow | null;
  error: { message?: string } | null;
};

type ConvertSolicitudToPedidoRpcArgs = {
  p_solicitud_id: string;
  p_title: string;
  p_description: string;
  p_priority: Enums<"pedido_prioridad">;
  p_estimated_delivery_date: string | null;
  p_total_amount: number;
};

type ConvertSolicitudToPedidoRpcClient = {
  rpc(
    fn: "convertir_solicitud_a_pedido",
    args: ConvertSolicitudToPedidoRpcArgs,
  ): PromiseLike<ConvertSolicitudToPedidoRpcResult>;
};

export function convertSolicitudToPedidoRpc(
  supabase: SupabaseClient,
  args: ConvertSolicitudToPedidoRpcArgs,
) {
  return (supabase as unknown as ConvertSolicitudToPedidoRpcClient).rpc(
    "convertir_solicitud_a_pedido",
    args,
  );
}

export type UpdatePedidoPaymentRpcRow = Pick<
  Tables<"pedido_pagos">,
  | "total_amount"
  | "paid_cash_amount"
  | "paid_transfer_amount"
  | "payment_status"
  | "paid_at"
>;

type UpdatePedidoPaymentRpcResult = {
  data: UpdatePedidoPaymentRpcRow | null;
  error: { message?: string } | null;
};

type UpdatePedidoPaymentRpcArgs = {
  p_pedido_id: string;
  p_paid_cash_amount: number;
  p_paid_transfer_amount: number;
};

type UpdatePedidoPaymentRpcClient = {
  rpc(
    fn: "actualizar_pago_pedido",
    args: UpdatePedidoPaymentRpcArgs,
  ): PromiseLike<UpdatePedidoPaymentRpcResult>;
};

export function updatePedidoPaymentRpc(
  supabase: SupabaseClient,
  args: UpdatePedidoPaymentRpcArgs,
) {
  return (supabase as unknown as UpdatePedidoPaymentRpcClient).rpc(
    "actualizar_pago_pedido",
    args,
  );
}

export type PedidoCommentsRpcRow = Pick<
  Tables<"pedido_comentarios">,
  "id" | "content" | "created_at"
> & {
  author_full_name: string;
  author_role: Enums<"app_role"> | null;
};

type PedidoCommentsRpcResult = {
  data: PedidoCommentsRpcRow[] | null;
  error: { message?: string } | null;
};

type PedidoCommentsRpcArgs = {
  p_pedido_id: string;
};

type PedidoCommentsRpcClient = {
  rpc(
    fn: "listar_pedido_comentarios",
    args: PedidoCommentsRpcArgs,
  ): PromiseLike<PedidoCommentsRpcResult>;
};

export function listPedidoCommentsRpc(
  supabase: SupabaseClient,
  args: PedidoCommentsRpcArgs,
) {
  return (supabase as unknown as PedidoCommentsRpcClient).rpc(
    "listar_pedido_comentarios",
    args,
  );
}

export type PedidoHistoryRpcRow = {
  id: string;
  action: Enums<"pedido_historial_action">;
  summary: string;
  old_value: string | null;
  new_value: string | null;
  metadata: Json;
  created_at: string;
  actor_full_name: string | null;
  actor_role: Enums<"app_role"> | null;
};

type PedidoHistoryRpcResult = {
  data: PedidoHistoryRpcRow[] | null;
  error: { message?: string } | null;
};

type PedidoHistoryRpcArgs = {
  p_pedido_id: string;
};

type PedidoHistoryRpcClient = {
  rpc(
    fn: "listar_pedido_historial",
    args: PedidoHistoryRpcArgs,
  ): PromiseLike<PedidoHistoryRpcResult>;
};

export function listPedidoHistoryRpc(
  supabase: SupabaseClient,
  args: PedidoHistoryRpcArgs,
) {
  return (supabase as unknown as PedidoHistoryRpcClient).rpc(
    "listar_pedido_historial",
    args,
  );
}
