"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { revalidatePedidoDetail } from "@/lib/actions/revalidation";
import { createPedidoComment } from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";
import type { CreatePedidoCommentActionState } from "./shared";

export async function createPedidoCommentAction(
  pedidoId: string,
  _prevState: CreatePedidoCommentActionState,
  formData: FormData,
): Promise<CreatePedidoCommentActionState> {
  const content = getFormValue(formData, "content");
  const result = await createPedidoComment({
    pedidoId,
    content,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
      values: result.values,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Comentario agregado correctamente.", {
    values: {
      content: "",
    },
  });
}
