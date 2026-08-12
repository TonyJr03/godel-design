"use server";

import {
  actionFailure,
  actionSuccess,
  type BaseActionState,
} from "@/lib/actions/action-state";
import { revalidateTaskTemplateDetail } from "@/lib/actions/revalidation";
import {
  createTaskTemplate,
  toggleTaskTemplateActive,
  updateTaskTemplate,
  type TaskTemplateFieldErrors,
} from "@/lib/task-templates";
import { getFormValue } from "@/lib/utils";

export type TaskTemplateActionState =
  BaseActionState<TaskTemplateFieldErrors>;

export async function createTaskTemplateAction(
  _prevState: TaskTemplateActionState,
  formData: FormData,
): Promise<TaskTemplateActionState> {
  const result = await createTaskTemplate({
    name: getFormValue(formData, "name"),
    description: getFormValue(formData, "description"),
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  return actionSuccess("Plantilla creada correctamente.");
}

export async function updateTaskTemplateAction(
  _prevState: TaskTemplateActionState,
  formData: FormData,
): Promise<TaskTemplateActionState> {
  const templateId = getFormValue(formData, "template_id");
  const isActiveValue = getFormValue(formData, "is_active");
  const result = await updateTaskTemplate({
    id: templateId,
    name: getFormValue(formData, "name"),
    description: getFormValue(formData, "description"),
    isActive:
      isActiveValue === "true"
        ? true
        : isActiveValue === "false"
          ? false
          : null,
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidateTaskTemplateDetail(templateId);

  return actionSuccess("Plantilla actualizada correctamente.");
}

export async function toggleTaskTemplateActiveAction(
  _prevState: TaskTemplateActionState,
  formData: FormData,
): Promise<TaskTemplateActionState> {
  const templateId = getFormValue(formData, "template_id");
  const isActiveValue = getFormValue(formData, "is_active");
  const result = await toggleTaskTemplateActive({
    id: templateId,
    isActive:
      isActiveValue === "true"
        ? true
        : isActiveValue === "false"
          ? false
          : null,
  });

  if (!result.ok) {
    return actionFailure(result.message);
  }

  revalidateTaskTemplateDetail(templateId);

  return actionSuccess(
    isActiveValue === "true"
      ? "Plantilla activada correctamente."
      : "Plantilla desactivada correctamente.",
  );
}
