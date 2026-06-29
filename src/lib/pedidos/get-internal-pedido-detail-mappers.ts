import type {
  InternalPedidoDetail,
  InternalPedidoDetailRow,
  InternalPedidoPayment,
  PedidoDetailPaymentRow,
} from "./get-internal-pedido-detail-types";

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getMissingPayment(): InternalPedidoPayment {
  return {
    totalAmount: 0,
    paidCashAmount: 0,
    paidTransferAmount: 0,
    paidTotalAmount: 0,
    pendingAmount: 0,
    paymentStatus: "sin_pago",
    paidAt: null,
    isAvailable: false,
  };
}

function mapPaymentRow(row: PedidoDetailPaymentRow): InternalPedidoPayment {
  const totalAmount = Number(row.total_amount);
  const paidCashAmount = Number(row.paid_cash_amount);
  const paidTransferAmount = Number(row.paid_transfer_amount);
  const paidTotalAmount = roundMoney(paidCashAmount + paidTransferAmount);
  const pendingAmount = Math.max(0, roundMoney(totalAmount - paidTotalAmount));

  return {
    totalAmount,
    paidCashAmount,
    paidTransferAmount,
    paidTotalAmount,
    pendingAmount,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
    isAvailable: true,
  };
}

export function mapInternalPedidoDetail(
  pedido: InternalPedidoDetailRow,
  payment: PedidoDetailPaymentRow | null,
): InternalPedidoDetail {
  return {
    ...pedido,
    payment: payment ? mapPaymentRow(payment) : getMissingPayment(),
  };
}
