"use server";

import { revalidatePath } from "next/cache";
import {
  assignInternalPedidoWorker,
  updateInternalPedidoStatus,
  type PedidoWorkerFieldErrors,
  type PedidoStatusFieldErrors,
} from "@/lib/pedidos";

export type UpdatePedidoStatusActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoStatusFieldErrors;
};

export type AssignPedidoWorkerActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoWorkerFieldErrors;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function updatePedidoStatusAction(
  _prevState: UpdatePedidoStatusActionState,
  formData: FormData,
): Promise<UpdatePedidoStatusActionState> {
  const pedidoId = getFormValue(formData, "pedido_id");
  const estado = getFormValue(formData, "estado");
  const result = await updateInternalPedidoStatus({
    pedidoId,
    estado,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/dashboard/pedidos");
  revalidatePath(`/dashboard/pedidos/${pedidoId}`);

  return {
    ok: true,
    message: "Estado actualizado correctamente.",
  };
}

export async function assignPedidoWorkerAction(
  _prevState: AssignPedidoWorkerActionState,
  formData: FormData,
): Promise<AssignPedidoWorkerActionState> {
  const pedidoId = getFormValue(formData, "pedido_id");
  const trabajadorId = getFormValue(formData, "trabajador_id");
  const result = await assignInternalPedidoWorker({
    pedidoId,
    trabajadorId,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/dashboard/pedidos");
  revalidatePath(`/dashboard/pedidos/${pedidoId}`);

  return {
    ok: true,
    message: "Trabajador asignado correctamente.",
  };
}
