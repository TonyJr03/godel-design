"use server";

import { revalidatePath } from "next/cache";
import {
  createPedidoFromSolicitud,
  type CreatePedidoFromSolicitudFieldErrors,
} from "@/lib/pedidos";
import {
  associateSolicitudWithCliente,
  createClienteFromSolicitudAndAssociate,
  createSolicitudComment,
  type SolicitudCommentFieldErrors,
  updateInternalSolicitudStatus,
} from "@/lib/solicitudes";
import { getFormValue } from "@/lib/utils";

export type SolicitudDetailAction<State> = (
  prevState: State,
  formData: FormData,
) => Promise<State>;

export type UpdateSolicitudStatusActionState = {
  ok: boolean;
  message: string;
};

export type AssociateSolicitudClienteActionState = {
  ok: boolean;
  message: string;
};

export type CreateClienteFromSolicitudActionState = {
  ok: boolean;
  message: string;
};

export type ConvertSolicitudToPedidoActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: CreatePedidoFromSolicitudFieldErrors;
  values?: {
    title: string;
    description: string;
    total_amount: string | number;
    priority: string;
    estimated_delivery_date: string | null;
  };
  pedidoId?: string;
  numeroPedido?: string;
};

export type CreateSolicitudCommentActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: SolicitudCommentFieldErrors;
  values?: {
    content: string;
  };
};

function revalidateSolicitudDetail(solicitudId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${solicitudId}`);
}

export async function updateSolicitudStatusAction(
  solicitudId: string,
  _prevState: UpdateSolicitudStatusActionState,
  formData: FormData,
): Promise<UpdateSolicitudStatusActionState> {
  const status = getFormValue(formData, "status");

  const result = await updateInternalSolicitudStatus({
    solicitudId,
    status,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidateSolicitudDetail(solicitudId);

  return {
    ok: true,
    message: "Estado actualizado correctamente.",
  };
}

export async function associateSolicitudClienteAction(
  solicitudId: string,
  _prevState: AssociateSolicitudClienteActionState,
  formData: FormData,
): Promise<AssociateSolicitudClienteActionState> {
  const clienteId = getFormValue(formData, "cliente_id");
  const result = await associateSolicitudWithCliente({
    solicitudId,
    clienteId,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidateSolicitudDetail(result.solicitudId);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${result.clienteId}`);

  return {
    ok: true,
    message: "Cliente asociado correctamente.",
  };
}

export async function createClienteFromSolicitudAction(
  solicitudId: string,
  _prevState: CreateClienteFromSolicitudActionState,
  _formData: FormData,
): Promise<CreateClienteFromSolicitudActionState> {
  void _prevState;
  void _formData;

  const result = await createClienteFromSolicitudAndAssociate(solicitudId);

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidateSolicitudDetail(result.solicitudId);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${result.clienteId}`);

  return {
    ok: true,
    message: "Cliente creado y asociado correctamente.",
  };
}

export async function convertSolicitudToPedidoAction(
  solicitudId: string,
  _prevState: ConvertSolicitudToPedidoActionState,
  formData: FormData,
): Promise<ConvertSolicitudToPedidoActionState> {
  const title = getFormValue(formData, "title");
  const description = getFormValue(formData, "description");
  const totalAmount = getFormValue(formData, "total_amount");
  const priority = getFormValue(formData, "priority");
  const estimatedDeliveryDate = getFormValue(
    formData,
    "estimated_delivery_date",
  );
  const result = await createPedidoFromSolicitud({
    solicitudId,
    title,
    description,
    totalAmount,
    priority,
    estimatedDeliveryDate,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values ?? {
        title,
        description,
        total_amount: totalAmount,
        priority,
        estimated_delivery_date: estimatedDeliveryDate || null,
      },
    };
  }

  revalidateSolicitudDetail(solicitudId);
  revalidatePath("/dashboard/pedidos");
  revalidatePath(`/dashboard/pedidos/${result.pedidoId}`);

  return {
    ok: true,
    message: "Pedido creado correctamente.",
    pedidoId: result.pedidoId,
    numeroPedido: result.numeroPedido,
  };
}

export async function createSolicitudCommentAction(
  solicitudId: string,
  _prevState: CreateSolicitudCommentActionState,
  formData: FormData,
): Promise<CreateSolicitudCommentActionState> {
  const content = getFormValue(formData, "content");
  const result = await createSolicitudComment({
    solicitudId,
    content,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  revalidateSolicitudDetail(solicitudId);

  return {
    ok: true,
    message: "Comentario agregado correctamente.",
    values: {
      content: "",
    },
  };
}
