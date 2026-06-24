import type { ReactNode } from "react";

import type {
  PedidoDetailAction,
  UpdatePedidoPaymentActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import { formatMoney } from "@/lib/format/money";
import type { InternalPedidoPayment } from "@/lib/pedidos";
import { formatAppDateTime } from "@/lib/utils";
import { PedidoPaymentForm } from "./PedidoPaymentForm";

type PedidoPaymentSectionProps = {
  payment: InternalPedidoPayment;
  canManage: boolean;
  updatePaymentAction?: PedidoDetailAction<UpdatePedidoPaymentActionState>;
};

const PAYMENT_STATUS_LABELS: Record<
  InternalPedidoPayment["paymentStatus"],
  string
> = {
  sin_pago: "Sin pagar",
  parcial: "Pago parcial",
  pagado: "Pagado",
};

function PaymentRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="text-sm leading-6 text-text-secondary">{label}</dt>
      <dd className="text-right text-sm font-semibold leading-6 text-text-primary">
        {value}
      </dd>
    </div>
  );
}

export function PedidoPaymentSection({
  payment,
  canManage,
  updatePaymentAction,
}: PedidoPaymentSectionProps) {
  const hasNoAmountToPay = payment.isAvailable && payment.totalAmount === 0;

  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">
        Pago del pedido
      </h2>

      {!payment.isAvailable ? (
        <p className="mt-5 rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
          Este pedido no tiene resumen financiero registrado. No se puede
          actualizar el pago hasta corregir esa inconsistencia.
        </p>
      ) : (
        <>
          <dl className="mt-5">
            <PaymentRow label="Total" value={formatMoney(payment.totalAmount)} />
            <PaymentRow
              label="Pagado en efectivo"
              value={formatMoney(payment.paidCashAmount)}
            />
            <PaymentRow
              label="Pagado por transferencia"
              value={formatMoney(payment.paidTransferAmount)}
            />
            <PaymentRow
              label="Total pagado"
              value={formatMoney(payment.paidTotalAmount)}
            />
            <PaymentRow
              label="Pendiente"
              value={formatMoney(payment.pendingAmount)}
            />
            <PaymentRow
              label="Estado"
              value={PAYMENT_STATUS_LABELS[payment.paymentStatus]}
            />
            {payment.paidAt ? (
              <PaymentRow
                label="Pagado completamente el"
                value={formatAppDateTime(payment.paidAt)}
              />
            ) : null}
          </dl>

          {hasNoAmountToPay ? (
            <p className="mt-5 rounded-(--radius-control) border border-info/30 bg-info-soft px-4 py-3 text-sm leading-6 text-text-primary">
              Este pedido fue registrado sin monto a pagar.
            </p>
          ) : null}

          {canManage && updatePaymentAction && !hasNoAmountToPay ? (
            <PedidoPaymentForm
              action={updatePaymentAction}
              payment={payment}
            />
          ) : null}
        </>
      )}
    </section>
  );
}
