"use server";

import { actionFailure, actionSuccess } from "@/lib/actions/action-state";
import { revalidatePedidoDetail } from "@/lib/actions/revalidation";
import { applyTaskTemplateToPedido } from "@/lib/task-templates";
import { getFormValue } from "@/lib/utils";
import type { ApplyTaskTemplateActionState } from "./shared";

export async function applyTaskTemplateAction(
  pedidoId: string,
  _prevState: ApplyTaskTemplateActionState,
  formData: FormData,
): Promise<ApplyTaskTemplateActionState> {
  const templateId = getFormValue(formData, "template_id");
  const result = await applyTaskTemplateToPedido({
    pedidoId,
    templateId,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidatePedidoDetail(pedidoId);

  return actionSuccess(
    result.insertedCount === 1
      ? "Se agregó 1 tarea desde la plantilla."
      : `Se agregaron ${result.insertedCount} tareas desde la plantilla.`,
  );
}
