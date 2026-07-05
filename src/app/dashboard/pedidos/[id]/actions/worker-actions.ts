"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { revalidatePedidoDetail } from "@/lib/actions/revalidation";
import {
  assignInternalPedidoWorker,
  removeInternalPedidoWorker,
} from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";
import type {
  AssignPedidoWorkerActionState,
  RemovePedidoWorkerActionState,
} from "./shared";

export async function assignPedidoWorkerAction(
  pedidoId: string,
  _prevState: AssignPedidoWorkerActionState,
  formData: FormData,
): Promise<AssignPedidoWorkerActionState> {
  const assignedProfileId = getFormValue(formData, "assigned_profile_id");
  const result = await assignInternalPedidoWorker({
    pedidoId,
    assignedProfileId,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess(
    result.alreadyAssigned
      ? "El usuario ya estaba asignado a este pedido."
      : "Personal asignado correctamente.",
  );
}

export async function removePedidoWorkerAction(
  pedidoId: string,
  _prevState: RemovePedidoWorkerActionState,
  formData: FormData,
): Promise<RemovePedidoWorkerActionState> {
  const assignedProfileId = getFormValue(formData, "assigned_profile_id");
  const result = await removeInternalPedidoWorker({
    pedidoId,
    assignedProfileId,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Asignación removida correctamente.");
}
