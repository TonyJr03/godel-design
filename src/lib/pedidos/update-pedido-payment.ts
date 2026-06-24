import { getCurrentProfile } from "@/lib/auth/current-user";
import { isAdmin, isSupervisor } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Enums, Tables } from "@/types/database";

export type UpdatePedidoPaymentInput = {
  pedidoId: string;
  paidCashAmount: string;
  paidTransferAmount: string;
};

export type PedidoPaymentFieldErrors = Partial<
  Record<"pedido_id" | "paid_cash_amount" | "paid_transfer_amount", string>
>;

export type UpdatePedidoPaymentValues = {
  paidCashAmount: string;
  paidTransferAmount: string;
};

export type UpdatedPedidoPayment = {
  totalAmount: number;
  paidCashAmount: number;
  paidTransferAmount: number;
  paidTotalAmount: number;
  pendingAmount: number;
  paymentStatus: Enums<"pedido_pago_estado">;
  paidAt: string | null;
};

export type UpdatePedidoPaymentErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "missing_payment"
  | "validation"
  | "error";

export type UpdatePedidoPaymentResult = ServiceResult<
  { payment: UpdatedPedidoPayment },
  UpdatePedidoPaymentErrorReason,
  { values: UpdatePedidoPaymentValues },
  PedidoPaymentFieldErrors
>;

type PedidoPaymentRow = Pick<
  Tables<"pedido_pagos">,
  | "total_amount"
  | "paid_cash_amount"
  | "paid_transfer_amount"
  | "payment_status"
  | "paid_at"
>;

type UpdatePedidoPaymentRpcResult = {
  data: PedidoPaymentRow | null;
  error: { message?: string } | null;
};

type UpdatePedidoPaymentRpcClient = {
  rpc(
    fn: "actualizar_pago_pedido",
    args: {
      p_pedido_id: string;
      p_paid_cash_amount: number;
      p_paid_transfer_amount: number;
    },
  ): PromiseLike<UpdatePedidoPaymentRpcResult>;
};

type ParsedPaymentAmount =
  | { ok: true; value: number; cents: number }
  | { ok: false; error: string };

const MAX_PAYMENT_AMOUNT = 9999999999.99;
const GENERIC_PAYMENT_UPDATE_ERROR =
  "No se pudo actualizar el pago del pedido. Inténtalo nuevamente.";

const SAFE_RPC_PAYMENT_MESSAGES = [
  "El monto pagado en efectivo es obligatorio",
  "El monto pagado por transferencia es obligatorio",
  "El monto pagado en efectivo no puede ser negativo",
  "El monto pagado por transferencia no puede ser negativo",
  "El monto pagado en efectivo no puede tener mas de 2 decimales",
  "El monto pagado por transferencia no puede tener mas de 2 decimales",
  "El monto pagado en efectivo supera el maximo permitido",
  "El monto pagado por transferencia supera el maximo permitido",
  "El total pagado no puede superar el total del pedido",
] as const;

function getSafeRpcPaymentErrorMessage(
  errorMessage: string | undefined,
): string {
  const message = errorMessage?.trim();

  return (
    SAFE_RPC_PAYMENT_MESSAGES.find((safeMessage) =>
      message?.includes(safeMessage),
    ) ?? GENERIC_PAYMENT_UPDATE_ERROR
  );
}

function parsePaymentAmount(
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

function moneyToCents(value: number): number {
  return Math.round(value * 100);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function mapPaymentRow(row: PedidoPaymentRow): UpdatedPedidoPayment {
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

export async function updatePedidoPayment({
  pedidoId: pedidoIdInput,
  paidCashAmount: paidCashAmountInput,
  paidTransferAmount: paidTransferAmountInput,
}: UpdatePedidoPaymentInput): Promise<UpdatePedidoPaymentResult> {
  const pedidoId = pedidoIdInput.trim();
  const values = {
    paidCashAmount: paidCashAmountInput.trim(),
    paidTransferAmount: paidTransferAmountInput.trim(),
  };

  if (!isValidUuid(pedidoId)) {
    return serviceFailure("invalid_id", "El pedido solicitado no existe.", {
      fieldErrors: {
        pedido_id: "El pedido solicitado no existe.",
      },
      values,
    });
  }

  const cashValidation = parsePaymentAmount(
    values.paidCashAmount,
    "en efectivo",
  );
  const transferValidation = parsePaymentAmount(
    values.paidTransferAmount,
    "por transferencia",
  );
  const fieldErrors: PedidoPaymentFieldErrors = {};

  if (!cashValidation.ok) {
    fieldErrors.paid_cash_amount = cashValidation.error;
  }

  if (!transferValidation.ok) {
    fieldErrors.paid_transfer_amount = transferValidation.error;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return serviceFailure("validation", "Revisa los montos del pago.", {
      fieldErrors,
      values,
    });
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      { values },
    );
  }

  if (!isAdmin(profile.role) && !isSupervisor(profile.role)) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para actualizar pagos de pedidos.",
      { values },
    );
  }

  const supabase = await createClient();

  try {
    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id")
      .eq("id", pedidoId)
      .maybeSingle<{ id: string }>();

    if (pedidoError) {
      console.error("Error checking pedido before payment update", pedidoError);

      return serviceFailure("error", GENERIC_PAYMENT_UPDATE_ERROR, { values });
    }

    if (!pedido) {
      return serviceFailure(
        "not_found",
        "El pedido solicitado no existe o no tienes acceso.",
        { values },
      );
    }

    const { data: payment, error: paymentError } = await supabase
      .from("pedido_pagos")
      .select(
        "total_amount, paid_cash_amount, paid_transfer_amount, payment_status, paid_at",
      )
      .eq("pedido_id", pedidoId)
      .maybeSingle<PedidoPaymentRow>();

    if (paymentError) {
      console.error("Error loading payment before update", paymentError);

      return serviceFailure("error", GENERIC_PAYMENT_UPDATE_ERROR, { values });
    }

    if (!payment) {
      return serviceFailure(
        "missing_payment",
        "El pedido no tiene resumen financiero registrado.",
        { values },
      );
    }

    const totalCents = moneyToCents(Number(payment.total_amount));

    if (
      cashValidation.ok &&
      transferValidation.ok &&
      cashValidation.cents + transferValidation.cents > totalCents
    ) {
      return serviceFailure(
        "validation",
        "El total pagado no puede superar el total del pedido.",
        {
          fieldErrors: {
            paid_cash_amount:
              "La suma de efectivo y transferencia supera el total.",
            paid_transfer_amount:
              "La suma de efectivo y transferencia supera el total.",
          },
          values,
        },
      );
    }

    const { data, error } = await (
      supabase as unknown as UpdatePedidoPaymentRpcClient
    ).rpc("actualizar_pago_pedido", {
      p_pedido_id: pedidoId,
      p_paid_cash_amount: cashValidation.ok ? cashValidation.value : 0,
      p_paid_transfer_amount: transferValidation.ok
        ? transferValidation.value
        : 0,
    });

    if (error || !data) {
      console.error("Error updating pedido payment", error);
      const message = getSafeRpcPaymentErrorMessage(error?.message);

      if (message !== GENERIC_PAYMENT_UPDATE_ERROR) {
        return serviceFailure("validation", message, {
          fieldErrors: {
            paid_cash_amount: message,
            paid_transfer_amount: message,
          },
          values,
        });
      }

      return serviceFailure("error", GENERIC_PAYMENT_UPDATE_ERROR, { values });
    }

    return serviceSuccess({ payment: mapPaymentRow(data) });
  } catch (error) {
    console.error("Unexpected error updating pedido payment", error);

    return serviceFailure("error", GENERIC_PAYMENT_UPDATE_ERROR, { values });
  }
}
