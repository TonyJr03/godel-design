"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { revalidatePedidoDetail } from "@/lib/actions/revalidation";
import { updatePedidoPayment } from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";
import type { UpdatePedidoPaymentActionState } from "./shared";

export async function updatePedidoPaymentAction(
  pedidoId: string,
  _prevState: UpdatePedidoPaymentActionState,
  formData: FormData,
): Promise<UpdatePedidoPaymentActionState> {
  const paidCashAmount = getFormValue(formData, "paid_cash_amount");
  const paidTransferAmount = getFormValue(formData, "paid_transfer_amount");
  const result = await updatePedidoPayment({
    pedidoId,
    paidCashAmount,
    paidTransferAmount,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
      values: result.values,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Pago actualizado correctamente.");
}
