import type { SupabaseClient } from "@supabase/supabase-js";
import type { Enums, Tables } from "@/types/database";

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
