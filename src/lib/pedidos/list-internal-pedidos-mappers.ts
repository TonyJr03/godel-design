import type { PedidoTasksProgress } from "./task-progress";
import type {
  InternalPedido,
  InternalPedidoPaymentSummary,
  InternalPedidoRow,
  PedidoPaymentRow,
} from "./list-internal-pedidos-types";

export const EMPTY_TASK_PROGRESS: PedidoTasksProgress = {
  totalTasks: 0,
  completedTasks: 0,
  pendingTasks: 0,
  progressPercentage: 0,
  hasTasks: false,
  isComplete: false,
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function getPaymentRow(
  payment: InternalPedidoRow["payment"],
): PedidoPaymentRow | null {
  return Array.isArray(payment) ? payment[0] ?? null : payment;
}

function getMissingPaymentSummary(): InternalPedidoPaymentSummary {
  return {
    totalAmount: 0,
    paidCashAmount: 0,
    paidTransferAmount: 0,
    paidTotalAmount: 0,
    pendingAmount: 0,
    paymentStatus: "sin_pago",
    isAvailable: false,
  };
}

export function mapPaymentSummary(
  payment: InternalPedidoRow["payment"],
): InternalPedidoPaymentSummary {
  const paymentRow = getPaymentRow(payment);

  if (!paymentRow) {
    return getMissingPaymentSummary();
  }

  const totalAmount = Number(paymentRow.total_amount);
  const paidCashAmount = Number(paymentRow.paid_cash_amount);
  const paidTransferAmount = Number(paymentRow.paid_transfer_amount);
  const paidTotalAmount = roundMoney(paidCashAmount + paidTransferAmount);

  return {
    totalAmount,
    paidCashAmount,
    paidTransferAmount,
    paidTotalAmount,
    pendingAmount: Math.max(0, roundMoney(totalAmount - paidTotalAmount)),
    paymentStatus: paymentRow.payment_status,
    isAvailable: true,
  };
}

export function mergePedidos(
  groups: InternalPedidoRow[][],
  limit: number,
): InternalPedidoRow[] {
  const byId = new Map<string, InternalPedidoRow>();

  for (const group of groups) {
    for (const pedido of group) {
      byId.set(pedido.id, pedido);
    }
  }

  return [...byId.values()]
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit);
}

export function mapInternalPedidos(
  pedidos: InternalPedidoRow[],
  progressByPedidoId: Map<string, PedidoTasksProgress>,
): InternalPedido[] {
  return pedidos.map((pedido) => ({
    ...pedido,
    payment: mapPaymentSummary(pedido.payment),
    taskProgress: progressByPedidoId.get(pedido.id) ?? EMPTY_TASK_PROGRESS,
  }));
}
