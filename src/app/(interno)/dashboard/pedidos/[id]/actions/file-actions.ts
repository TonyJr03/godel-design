"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { revalidatePedidoDetail } from "@/lib/actions/revalidation";
import {
  uploadPedidoFile,
  type UploadPedidoFileResult,
} from "@/lib/storage";
import type { UploadPedidoFileActionState } from "./shared";

function getUploadPedidoFileMessage(
  reason: Exclude<UploadPedidoFileResult, { ok: true }>["reason"],
) {
  const messages: Record<typeof reason, string> = {
    unauthorized: "Debes iniciar sesión con un usuario interno activo.",
    invalid_pedido_id: "El pedido solicitado no existe.",
    pedido_not_found: "El pedido solicitado no existe o no tienes acceso.",
    pedido_delivered: "No se pueden subir archivos a un pedido entregado.",
    pedido_canceled: "No se pueden subir archivos a un pedido cancelado.",
    status_not_allowed:
      "El estado actual del pedido no permite subir archivos.",
    invalid_file:
      "El archivo no es válido. Revisa el tipo, la extensión y el tamaño.",
    storage_error: "No se pudo guardar el archivo. Inténtalo nuevamente.",
    metadata_error:
      "El archivo se subió, pero no se pudo guardar su registro. Inténtalo nuevamente.",
    error: "No se pudo subir el archivo. Inténtalo nuevamente.",
  };

  return messages[reason];
}

export async function uploadPedidoFileAction(
  pedidoId: string,
  _prevState: UploadPedidoFileActionState,
  formData: FormData,
): Promise<UploadPedidoFileActionState> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return actionFailure("Selecciona un archivo válido.");
  }

  const result = await uploadPedidoFile({
    pedidoId,
    file,
  });

  if (!result.ok) {
    return actionFailure(getUploadPedidoFileMessage(result.reason));
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess("Archivo subido correctamente.");
}
