"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { revalidatePedidoDetail } from "@/lib/actions/revalidation";
import { updateInternalPedidoStatus } from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";
import type { UpdatePedidoStatusActionState } from "./shared";

export async function updatePedidoStatusAction(
  pedidoId: string,
  _prevState: UpdatePedidoStatusActionState,
  formData: FormData,
): Promise<UpdatePedidoStatusActionState> {
  const status = getFormValue(formData, "status");
  const result = await updateInternalPedidoStatus({
    pedidoId,
    status,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Estado actualizado correctamente.");
}
