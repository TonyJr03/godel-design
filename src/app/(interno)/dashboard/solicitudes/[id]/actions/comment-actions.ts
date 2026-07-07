"use server";

import { revalidateSolicitudDetail } from "@/lib/actions/revalidation";
import { createSolicitudComment } from "@/lib/solicitudes";
import { getFormValue } from "@/lib/utils";
import type { CreateSolicitudCommentActionState } from "./shared";

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
