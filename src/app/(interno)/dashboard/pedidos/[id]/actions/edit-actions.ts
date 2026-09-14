"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { updateInternalPedido } from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";
import type { UpdatePedidoDataActionState } from "./shared";

export async function updatePedidoDataAction(
  pedidoId: string,
  _prevState: UpdatePedidoDataActionState,
  formData: FormData,
): Promise<UpdatePedidoDataActionState> {
  const title = getFormValue(formData, "title");
  const description = getFormValue(formData, "description");
  const serviceId = getFormValue(formData, "service_id");
  const totalAmount = getFormValue(formData, "total_amount");
  const priority = getFormValue(formData, "priority");
  const estimatedDeliveryDate = getFormValue(
    formData,
    "estimated_delivery_date",
  );
  const result = await updateInternalPedido({
    pedidoId,
    service_id: serviceId,
    title,
    description,
    total_amount: totalAmount,
    priority,
    estimated_delivery_date: estimatedDeliveryDate,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  return actionSuccess("Pedido actualizado correctamente.");
}
