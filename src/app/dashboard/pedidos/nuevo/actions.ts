"use server";

import { revalidatePath } from "next/cache";
import {
  createInternalPedido,
  type PedidoFieldErrors,
} from "@/lib/pedidos";

export type CreatePedidoActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoFieldErrors;
  pedidoId?: string;
  numeroPedido?: string;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function createPedidoAction(
  _prevState: CreatePedidoActionState,
  formData: FormData,
): Promise<CreatePedidoActionState> {
  const result = await createInternalPedido({
    cliente_id: getFormValue(formData, "cliente_id"),
    titulo: getFormValue(formData, "titulo"),
    descripcion: getFormValue(formData, "descripcion"),
    prioridad: getFormValue(formData, "prioridad"),
    fecha_entrega_estimada: getFormValue(
      formData,
      "fecha_entrega_estimada",
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
