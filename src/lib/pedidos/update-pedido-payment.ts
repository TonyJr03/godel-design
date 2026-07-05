import { getCurrentProfile } from "@/lib/auth/current-user";
import { isAdmin, isSupervisor } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import {
  GENERIC_PAYMENT_UPDATE_ERROR,
  getSafeRpcPaymentErrorMessage,
} from "./payment-errors";
import {
  mapUpdatedPedidoPayment,
  type UpdatedPedidoPayment,
} from "./payment-mappers";
import {
  buildUpdatePedidoPaymentRpcArgs,
  getPaymentAmountFieldErrors,
  getPaymentTotalExceededFieldErrors,
  getUpdatePedidoPaymentValues,
  hasPaymentFieldErrors,
  isPaymentTotalExceeded,
  parsePaymentAmount,
  type PedidoPaymentFieldErrors,
  type UpdatePedidoPaymentValues,
} from "./payment-validation";
import {
  updatePedidoPaymentRpc,
  type UpdatePedidoPaymentRpcRow,
} from "./rpc";

export type UpdatePedidoPaymentInput = {
  pedidoId: string;
  paidCashAmount: string;
  paidTransferAmount: string;
};

export type { UpdatedPedidoPayment } from "./payment-mappers";
export type {
  PedidoPaymentFieldErrors,
  UpdatePedidoPaymentValues,
} from "./payment-validation";

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

export async function updatePedidoPayment({
  pedidoId: pedidoIdInput,
  paidCashAmount: paidCashAmountInput,
  paidTransferAmount: paidTransferAmountInput,
}: UpdatePedidoPaymentInput): Promise<UpdatePedidoPaymentResult> {
  const pedidoId = pedidoIdInput.trim();
  const values = getUpdatePedidoPaymentValues({
    paidCashAmount: paidCashAmountInput,
    paidTransferAmount: paidTransferAmountInput,
  });

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
  const fieldErrors = getPaymentAmountFieldErrors(
    cashValidation,
    transferValidation,
  );

  if (hasPaymentFieldErrors(fieldErrors)) {
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
      .maybeSingle<UpdatePedidoPaymentRpcRow>();

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

    if (
      isPaymentTotalExceeded(
        cashValidation,
        transferValidation,
        Number(payment.total_amount),
      )
    ) {
      return serviceFailure(
        "validation",
        "El total pagado no puede superar el total del pedido.",
        {
          fieldErrors: getPaymentTotalExceededFieldErrors(),
          values,
        },
      );
    }

    const { data, error } = await updatePedidoPaymentRpc(
      supabase,
      buildUpdatePedidoPaymentRpcArgs(
        pedidoId,
        cashValidation,
        transferValidation,
      ),
    );

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

    return serviceSuccess({ payment: mapUpdatedPedidoPayment(data) });
  } catch (error) {
    console.error("Unexpected error updating pedido payment", error);

    return serviceFailure("error", GENERIC_PAYMENT_UPDATE_ERROR, { values });
  }
}
