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
    workflow_type: getFormValue(formData, "workflow_type"),
    cliente_id: getFormValue(formData, "cliente_id"),
    title: getFormValue(formData, "title"),
    description: getFormValue(formData, "description"),
    priority: getFormValue(formData, "priority"),
    estimated_delivery_date: getFormValue(
      formData,
      "estimated_delivery_date",
    ),
    print_copies: getFormValue(formData, "print_copies"),
    print_color_mode: getFormValue(formData, "print_color_mode"),
    print_paper_size: getFormValue(formData, "print_paper_size"),
    print_sides: getFormValue(formData, "print_sides"),
    print_notes: getFormValue(formData, "print_notes"),
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
