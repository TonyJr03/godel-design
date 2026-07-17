"use client";

import { useActionState } from "react";
import type {
  PedidoDetailAction,
  UpdatePedidoPaymentActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import { Alert, Button, FormField, Input } from "@/components/ui";
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
        <Alert
          variant={state.ok ? "success" : "danger"}
          aria-live="polite"
        >
          {state.message}
        </Alert>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormField
          id="paid_cash_amount"
          label="Pagado en efectivo"
          required
          error={cashError}
          errorId="paid-cash-amount-error"
          compact
        >
          {({ describedBy, invalid }) => (
            <Input
              id="paid_cash_amount"
              name="paid_cash_amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              disabled={pending}
              defaultValue={cashValue}
              invalid={invalid}
              aria-describedby={describedBy}
            />
          )}
        </FormField>

        <FormField
          id="paid_transfer_amount"
          label="Pagado por transferencia"
          required
          error={transferError}
          errorId="paid-transfer-amount-error"
          compact
        >
          {({ describedBy, invalid }) => (
            <Input
              id="paid_transfer_amount"
              name="paid_transfer_amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              required
              disabled={pending}
              defaultValue={transferValue}
              invalid={invalid}
              aria-describedby={describedBy}
            />
          )}
        </FormField>
      </div>

      <p className="mt-4 text-xs leading-5 text-text-muted">
        Registra los montos acumulados recibidos.
      </p>

      <Button
        type="submit"
        disabled={pending}
        className="mt-4 w-full sm:w-auto"
      >
        {pending ? "Actualizando..." : "Actualizar pago"}
      </Button>
    </form>
  );
}
