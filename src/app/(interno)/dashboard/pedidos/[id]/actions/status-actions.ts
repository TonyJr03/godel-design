"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import {
  ensurePedidoReviewStarted,
  updateInternalPedidoStatus,
} from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";
import type { UpdatePedidoStatusActionState } from "./shared";

type StartPedidoReviewOnOpenActionState = {
  ok: boolean;
  message: string;
};

export async function startPedidoReviewOnOpenAction(
  pedidoId: string,
): Promise<StartPedidoReviewOnOpenActionState> {
  const result = await ensurePedidoReviewStarted({ pedidoId });

  if (!result.ok) {
    return actionFailure(result.message);
  }

  return actionSuccess("Revisión iniciada.");
}

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

  return actionSuccess("Estado actualizado correctamente.");
}
