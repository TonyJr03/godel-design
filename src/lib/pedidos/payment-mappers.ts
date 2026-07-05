import type { Enums } from "@/types/database";
import type { UpdatePedidoPaymentRpcRow } from "./rpc";

export type UpdatedPedidoPayment = {
  totalAmount: number;
  paidCashAmount: number;
  paidTransferAmount: number;
  paidTotalAmount: number;
  pendingAmount: number;
  paymentStatus: Enums<"pedido_pago_estado">;
  paidAt: string | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function mapUpdatedPedidoPayment(
  row: UpdatePedidoPaymentRpcRow,
): UpdatedPedidoPayment {
  const totalAmount = Number(row.total_amount);
  const paidCashAmount = Number(row.paid_cash_amount);
  const paidTransferAmount = Number(row.paid_transfer_amount);
  const paidTotalAmount = roundMoney(paidCashAmount + paidTransferAmount);

  return {
    totalAmount,
    paidCashAmount,
    paidTransferAmount,
    paidTotalAmount,
    pendingAmount: Math.max(0, roundMoney(totalAmount - paidTotalAmount)),
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
  };
}
