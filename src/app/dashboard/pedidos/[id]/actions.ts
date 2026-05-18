"use server";

import { revalidatePath } from "next/cache";
import {
  updateInternalPedidoStatus,
  type PedidoStatusFieldErrors,
} from "@/lib/pedidos";

export type UpdatePedidoStatusActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoStatusFieldErrors;
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
