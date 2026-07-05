export type PedidoPaymentFieldErrors = Partial<
  Record<"pedido_id" | "paid_cash_amount" | "paid_transfer_amount", string>
>;

export type UpdatePedidoPaymentValues = {
  paidCashAmount: string;
  paidTransferAmount: string;
};

export type ParsedPaymentAmount =
  | { ok: true; value: number; cents: number }
  | { ok: false; error: string };

const MAX_PAYMENT_AMOUNT = 9999999999.99;

export function getUpdatePedidoPaymentValues(input: {
  paidCashAmount: string;
  paidTransferAmount: string;
}): UpdatePedidoPaymentValues {
  return {
    paidCashAmount: input.paidCashAmount.trim(),
    paidTransferAmount: input.paidTransferAmount.trim(),
  };
}

export function parsePaymentAmount(
  value: string,
  fieldLabel: string,
): ParsedPaymentAmount {
  const normalized = value.trim();

  if (!normalized) {
    return {
      ok: false,
      error: `El monto pagado ${fieldLabel} es obligatorio.`,
    };
  }

  if (normalized.startsWith("-")) {
    return {
      ok: false,
      error: `El monto pagado ${fieldLabel} no puede ser negativo.`,
    };
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return {
      ok: false,
      error: `El monto pagado ${fieldLabel} debe ser un número válido.`,
    };
  }

  const [, decimalPart = ""] = normalized.split(".");

  if (decimalPart.length > 2) {
    return {
      ok: false,
      error: `El monto pagado ${fieldLabel} no puede tener más de 2 decimales.`,
    };
  }

  const valueNumber = Number(normalized);

  if (!Number.isFinite(valueNumber)) {
    return {
      ok: false,
      error: `El monto pagado ${fieldLabel} debe ser un número válido.`,
    };
  }

  if (valueNumber > MAX_PAYMENT_AMOUNT) {
    return {
      ok: false,
      error: `El monto pagado ${fieldLabel} supera el máximo permitido.`,
    };
  }

  return {
    ok: true,
    value: valueNumber,
    cents: Math.round(valueNumber * 100),
  };
}

export function getPaymentAmountFieldErrors(
  cashValidation: ParsedPaymentAmount,
  transferValidation: ParsedPaymentAmount,
): PedidoPaymentFieldErrors {
  const fieldErrors: PedidoPaymentFieldErrors = {};

  if (!cashValidation.ok) {
    fieldErrors.paid_cash_amount = cashValidation.error;
  }

  if (!transferValidation.ok) {
    fieldErrors.paid_transfer_amount = transferValidation.error;
  }

  return fieldErrors;
}

export function hasPaymentFieldErrors(
  fieldErrors: PedidoPaymentFieldErrors,
): boolean {
  return Object.keys(fieldErrors).length > 0;
}

export function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

export function isPaymentTotalExceeded(
  cashValidation: ParsedPaymentAmount,
  transferValidation: ParsedPaymentAmount,
  totalAmount: number,
): boolean {
  return (
    cashValidation.ok &&
    transferValidation.ok &&
    cashValidation.cents + transferValidation.cents > moneyToCents(totalAmount)
  );
}

export function getPaymentTotalExceededFieldErrors(): PedidoPaymentFieldErrors {
  return {
    paid_cash_amount: "La suma de efectivo y transferencia supera el total.",
    paid_transfer_amount:
      "La suma de efectivo y transferencia supera el total.",
  };
}

export function buildUpdatePedidoPaymentRpcArgs(
  pedidoId: string,
  cashValidation: ParsedPaymentAmount,
  transferValidation: ParsedPaymentAmount,
) {
  return {
    p_pedido_id: pedidoId,
    p_paid_cash_amount: cashValidation.ok ? cashValidation.value : 0,
    p_paid_transfer_amount: transferValidation.ok
      ? transferValidation.value
      : 0,
  };
}
