"use server";

import { revalidatePath } from "next/cache";
import {
  createInternalPedido,
  type PedidoFieldErrors,
} from "@/lib/pedidos";
import { getFormValue } from "@/lib/utils";

export type CreatePedidoActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoFieldErrors;
  pedidoId?: string;
  numeroPedido?: string;
};

export async function createPedidoAction(
  _prevState: CreatePedidoActionState,
  formData: FormData,
): Promise<CreatePedidoActionState> {
  const result = await createInternalPedido({
    cliente_id: getFormValue(formData, "cliente_id"),
    title: getFormValue(formData, "title"),
    description: getFormValue(formData, "description"),
    priority: getFormValue(formData, "priority"),
    estimated_delivery_date: getFormValue(
      formData,
      "estimated_delivery_date",
    ),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/dashboard/pedidos");

  return {
    ok: true,
    message: "Pedido creado correctamente.",
    pedidoId: result.pedidoId,
    numeroPedido: result.numeroPedido,
  };
}
