"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createPedidoFromSolicitud } from "@/lib/pedidos";
import { isValidUuid } from "@/lib/storage";
import {
  associateSolicitudWithCliente,
  createClienteFromSolicitudAndAssociate,
  createSolicitudComment,
  type SolicitudCommentFieldErrors,
  updateInternalSolicitudStatus,
} from "@/lib/solicitudes";

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
  pedidoId?: string;
  numeroPedido?: string;
};

export type CreateSolicitudCommentActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: SolicitudCommentFieldErrors;
  values?: {
    contenido: string;
  };
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

async function getSolicitudIdFromRequestPath(): Promise<string> {
  const headersList = await headers();
  const rawPath = headersList.get("next-url") ?? headersList.get("referer");

  if (!rawPath) {
    return "";
  }

  try {
    const pathname = rawPath.startsWith("http")
      ? new URL(rawPath).pathname
      : rawPath;
    const match = pathname.match(/^\/dashboard\/solicitudes\/([^/?#]+)/);

    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

async function getSolicitudIdForComment(formData: FormData): Promise<string> {
  const solicitudId = getFormValue(formData, "solicitud_id").trim();

  if (isValidUuid(solicitudId)) {
    return solicitudId;
  }

  return getSolicitudIdFromRequestPath();
}

export async function updateSolicitudStatusAction(
  _prevState: UpdateSolicitudStatusActionState,
  formData: FormData,
): Promise<UpdateSolicitudStatusActionState> {
  const solicitudId = getFormValue(formData, "solicitud_id");
  const estado = getFormValue(formData, "estado");

  const result = await updateInternalSolicitudStatus({
    solicitudId,
    estado,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${solicitudId}`);

  return {
    ok: true,
    message: "Estado actualizado correctamente.",
  };
}

export async function associateSolicitudClienteAction(
  _prevState: AssociateSolicitudClienteActionState,
  formData: FormData,
): Promise<AssociateSolicitudClienteActionState> {
  const solicitudId = getFormValue(formData, "solicitud_id");
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

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${result.solicitudId}`);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${result.clienteId}`);

  return {
    ok: true,
    message: "Cliente asociado correctamente.",
  };
}

export async function createClienteFromSolicitudAction(
  _prevState: CreateClienteFromSolicitudActionState,
  formData: FormData,
): Promise<CreateClienteFromSolicitudActionState> {
  const solicitudId = getFormValue(formData, "solicitud_id");
  const result = await createClienteFromSolicitudAndAssociate(solicitudId);

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${result.solicitudId}`);
  revalidatePath("/dashboard/clientes");
  revalidatePath(`/dashboard/clientes/${result.clienteId}`);

  return {
    ok: true,
    message: "Cliente creado y asociado correctamente.",
  };
}

export async function convertSolicitudToPedidoAction(
  _prevState: ConvertSolicitudToPedidoActionState,
  formData: FormData,
): Promise<ConvertSolicitudToPedidoActionState> {
  const solicitudId = getFormValue(formData, "solicitud_id");
  const result = await createPedidoFromSolicitud({ solicitudId });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${solicitudId}`);
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
  _prevState: CreateSolicitudCommentActionState,
  formData: FormData,
): Promise<CreateSolicitudCommentActionState> {
  const solicitudId = await getSolicitudIdForComment(formData);
  const contenido = getFormValue(formData, "contenido");
  const result = await createSolicitudComment({
    solicitudId,
    contenido,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  revalidatePath("/dashboard/solicitudes");
  revalidatePath(`/dashboard/solicitudes/${solicitudId}`);

  return {
    ok: true,
    message: "Comentario agregado correctamente.",
    values: {
      contenido: "",
    },
  };
}
