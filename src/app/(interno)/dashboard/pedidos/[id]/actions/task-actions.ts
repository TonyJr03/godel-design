"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { revalidatePedidoDetail } from "@/lib/actions/revalidation";
import {
  createPedidoTask,
  deletePedidoTask,
  updatePedidoTask,
} from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";
import type {
  CreatePedidoTaskActionState,
  DeletePedidoTaskActionState,
  TogglePedidoTaskCompletionActionState,
  UpdatePedidoTaskProgressActionState,
  UpdatePedidoTaskTitleActionState,
} from "./shared";

export async function createPedidoTaskAction(
  pedidoId: string,
  _prevState: CreatePedidoTaskActionState,
  formData: FormData,
): Promise<CreatePedidoTaskActionState> {
  const title = getFormValue(formData, "title");
  const result = await createPedidoTask({
    pedidoId,
    title,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
      values: result.values,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Tarea creada correctamente.", {
    values: {
      title: "",
    },
  });
}

export async function updatePedidoTaskTitleAction(
  pedidoId: string,
  _prevState: UpdatePedidoTaskTitleActionState,
  formData: FormData,
): Promise<UpdatePedidoTaskTitleActionState> {
  const taskId = getFormValue(formData, "task_id");
  const title = getFormValue(formData, "title");
  const result = await updatePedidoTask({
    pedidoId,
    taskId,
    title,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
      values: result.values,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Tarea actualizada correctamente.");
}

export async function updatePedidoTaskProgressAction(
  pedidoId: string,
  _prevState: UpdatePedidoTaskProgressActionState,
  formData: FormData,
): Promise<UpdatePedidoTaskProgressActionState> {
  const taskId = getFormValue(formData, "task_id");
  const completedQuantity = getFormValue(formData, "completed_quantity");
  const result = await updatePedidoTask({
    pedidoId,
    taskId,
    completedQuantity,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
      values: result.values,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Progreso actualizado correctamente.");
}

export async function completePedidoTaskAction(
  pedidoId: string,
  _prevState: TogglePedidoTaskCompletionActionState,
  formData: FormData,
): Promise<TogglePedidoTaskCompletionActionState> {
  const taskId = getFormValue(formData, "task_id");
  const result = await updatePedidoTask({
    pedidoId,
    taskId,
    isCompleted: true,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Tarea marcada como completada.");
}

export async function reopenPedidoTaskAction(
  pedidoId: string,
  _prevState: TogglePedidoTaskCompletionActionState,
  formData: FormData,
): Promise<TogglePedidoTaskCompletionActionState> {
  const taskId = getFormValue(formData, "task_id");
  const result = await updatePedidoTask({
    pedidoId,
    taskId,
    isCompleted: false,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Tarea reabierta correctamente.");
}

export async function deletePedidoTaskAction(
  pedidoId: string,
  _prevState: DeletePedidoTaskActionState,
  formData: FormData,
): Promise<DeletePedidoTaskActionState> {
  const taskId = getFormValue(formData, "task_id");
  const result = await deletePedidoTask({
    pedidoId,
    taskId,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Tarea eliminada correctamente.");
}
