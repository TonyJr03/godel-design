"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
  assignInternalPedidoWorker,
  createPedidoComment,
  removeInternalPedidoWorker,
  updateInternalPedidoStatus,
  type PedidoCommentFieldErrors,
  type PedidoWorkerFieldErrors,
  type RemovePedidoWorkerFieldErrors,
  type PedidoStatusFieldErrors,
} from "@/lib/pedidos";
import {
  uploadPedidoFile,
  validatePedidoFileCategory,
  type PedidoFileCategory,
  type UploadPedidoFileResult,
} from "@/lib/storage";
import { getFormValue } from "@/lib/utils";
import { isValidUuid } from "@/lib/validators";

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

export type RemovePedidoWorkerActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: RemovePedidoWorkerFieldErrors;
};

export type UploadPedidoFileActionState = {
  ok: boolean;
  message: string;
};

export type CreatePedidoCommentActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: PedidoCommentFieldErrors;
  values?: {
    contenido: string;
  };
};

async function getPedidoIdFromRequestPath(): Promise<string> {
  const headersList = await headers();
  const rawPath = headersList.get("next-url") ?? headersList.get("referer");

  if (!rawPath) {
    return "";
  }

  try {
    const pathname = rawPath.startsWith("http")
      ? new URL(rawPath).pathname
      : rawPath;
    const match = pathname.match(/^\/dashboard\/pedidos\/([^/?#]+)/);

    return match?.[1] ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
}

async function getPedidoIdForComment(formData: FormData): Promise<string> {
  const pedidoId = getFormValue(formData, "pedido_id").trim();

  if (isValidUuid(pedidoId)) {
    return pedidoId;
  }

  return getPedidoIdFromRequestPath();
}

function getUploadPedidoFileMessage(
  reason: Exclude<UploadPedidoFileResult, { ok: true }>["reason"],
) {
  const messages: Record<typeof reason, string> = {
    unauthorized: "Debes iniciar sesión con un usuario interno activo.",
    invalid_pedido_id: "El pedido solicitado no existe.",
    pedido_not_found: "El pedido solicitado no existe o no tienes acceso.",
    invalid_category: "Selecciona una categoría válida.",
    forbidden_category: "No tienes permiso para subir archivos en esa categoría.",
    invalid_file:
      "El archivo no es válido. Revisa el tipo, la extensión y el tamaño.",
    storage_error: "No se pudo guardar el archivo. Inténtalo nuevamente.",
    metadata_error:
      "El archivo se subió, pero no se pudo guardar su registro. Inténtalo nuevamente.",
    error: "No se pudo subir el archivo. Inténtalo nuevamente.",
  };

  return messages[reason];
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
    message: result.alreadyAssigned
      ? "El usuario ya estaba asignado a este pedido."
      : "Personal asignado correctamente.",
  };
}

export async function removePedidoWorkerAction(
  _prevState: RemovePedidoWorkerActionState,
  formData: FormData,
): Promise<RemovePedidoWorkerActionState> {
  const pedidoId = getFormValue(formData, "pedido_id");
  const trabajadorId = getFormValue(formData, "trabajador_id");
  const result = await removeInternalPedidoWorker({
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
    message: "Asignación removida correctamente.",
  };
}

export async function uploadPedidoFileAction(
  _prevState: UploadPedidoFileActionState,
  formData: FormData,
): Promise<UploadPedidoFileActionState> {
  const pedidoId = getFormValue(formData, "pedido_id");
  const category = getFormValue(formData, "category");
  const file = formData.get("file");

  if (!validatePedidoFileCategory(category)) {
    return {
      ok: false,
      message: "Selecciona una categoría válida.",
    };
  }

  if (!(file instanceof File)) {
    return {
      ok: false,
      message: "Selecciona un archivo válido.",
    };
  }

  const result = await uploadPedidoFile({
    pedidoId,
    category: category as PedidoFileCategory,
    file,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: getUploadPedidoFileMessage(result.reason),
    };
  }

  revalidatePath("/dashboard/pedidos");
  revalidatePath(`/dashboard/pedidos/${pedidoId}`);

  return {
    ok: true,
    message: "Archivo subido correctamente.",
  };
}

export async function createPedidoCommentAction(
  _prevState: CreatePedidoCommentActionState,
  formData: FormData,
): Promise<CreatePedidoCommentActionState> {
  const pedidoId = await getPedidoIdForComment(formData);
  const contenido = getFormValue(formData, "contenido");
  const result = await createPedidoComment({
    pedidoId,
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

  revalidatePath("/dashboard/pedidos");
  revalidatePath(`/dashboard/pedidos/${pedidoId}`);

  return {
    ok: true,
    message: "Comentario agregado correctamente.",
    values: {
      contenido: "",
    },
  };
}
