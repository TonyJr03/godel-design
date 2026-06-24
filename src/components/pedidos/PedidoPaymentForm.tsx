"use client";

import { useActionState } from "react";
import type {
  PedidoDetailAction,
  UpdatePedidoPaymentActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { InternalPedidoPayment } from "@/lib/pedidos";

type PedidoPaymentFormProps = {
  action: PedidoDetailAction<UpdatePedidoPaymentActionState>;
  payment: InternalPedidoPayment;
};

const initialState: UpdatePedidoPaymentActionState = {
  ok: false,
  message: "",
};

export function PedidoPaymentForm({
  action,
  payment,
}: PedidoPaymentFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const cashError = state.fieldErrors?.paid_cash_amount;
  const transferError = state.fieldErrors?.paid_transfer_amount;
  const cashValue = state.values?.paidCashAmount ?? payment.paidCashAmount;
  const transferValue =
    state.values?.paidTransferAmount ?? payment.paidTransferAmount;

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="mt-5 border-t border-border pt-5"
    >
      {state.message ? (
        <div
          className={
            state.ok
              ? "rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success"
              : "rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
          }
          role={state.ok ? "status" : "alert"}
          aria-live="polite"
        >
          {state.message}
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="paid_cash_amount"
            className="text-sm font-medium text-text-primary"
          >
            Pagado en efectivo
          </label>
          <input
            id="paid_cash_amount"
            name="paid_cash_amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            disabled={pending}
            defaultValue={cashValue}
            aria-invalid={Boolean(cashError)}
            aria-describedby={
              cashError ? "paid-cash-amount-error" : undefined
            }
            className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
          />
          {cashError ? (
            <p
              id="paid-cash-amount-error"
              className="mt-2 text-sm leading-5 text-danger"
            >
              {cashError}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="paid_transfer_amount"
            className="text-sm font-medium text-text-primary"
          >
            Pagado por transferencia
          </label>
          <input
            id="paid_transfer_amount"
            name="paid_transfer_amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            disabled={pending}
            defaultValue={transferValue}
            aria-invalid={Boolean(transferError)}
            aria-describedby={
              transferError ? "paid-transfer-amount-error" : undefined
            }
            className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
          />
          {transferError ? (
            <p
              id="paid-transfer-amount-error"
              className="mt-2 text-sm leading-5 text-danger"
            >
              {transferError}
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-4 text-xs leading-5 text-text-muted">
        Registra montos acumulados actuales. El total del pedido no se edita
        desde esta sección.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Actualizando..." : "Actualizar pago"}
      </button>
    </form>
  );
}
