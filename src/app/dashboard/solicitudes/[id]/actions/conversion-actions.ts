"use server";

import { revalidateSolicitudConversion } from "@/lib/actions/revalidation";
import { createPedidoFromSolicitud } from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";
import type { ConvertSolicitudToPedidoActionState } from "./shared";

export async function convertSolicitudToPedidoAction(
  solicitudId: string,
  _prevState: ConvertSolicitudToPedidoActionState,
  formData: FormData,
): Promise<ConvertSolicitudToPedidoActionState> {
  const title = getFormValue(formData, "title");
  const description = getFormValue(formData, "description");
  const totalAmount = getFormValue(formData, "total_amount");
  const priority = getFormValue(formData, "priority");
  const estimatedDeliveryDate = getFormValue(
    formData,
    "estimated_delivery_date",
  );
  const result = await createPedidoFromSolicitud({
    solicitudId,
    title,
    description,
    totalAmount,
    priority,
    estimatedDeliveryDate,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values ?? {
        title,
        description,
        total_amount: totalAmount,
        priority,
        estimated_delivery_date: estimatedDeliveryDate || null,
      },
    };
  }

  revalidateSolicitudConversion(solicitudId, result.pedidoId);

  return {
    ok: true,
    message: "Pedido creado correctamente.",
    pedidoId: result.pedidoId,
    numeroPedido: result.numeroPedido,
  };
}
