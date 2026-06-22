"use server";

import { revalidatePath } from "next/cache";
import {
  createTaskTemplate,
  toggleTaskTemplateActive,
  updateTaskTemplate,
  type TaskTemplateFieldErrors,
} from "@/lib/task-templates";
import { getFormValue } from "@/lib/utils";

export type TaskTemplateActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: TaskTemplateFieldErrors;
};

export async function createTaskTemplateAction(
  _prevState: TaskTemplateActionState,
  formData: FormData,
): Promise<TaskTemplateActionState> {
  const result = await createTaskTemplate({
    name: getFormValue(formData, "name"),
    description: getFormValue(formData, "description"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/dashboard/configuracion");

  return {
    ok: true,
    message: "Plantilla creada correctamente.",
  };
}

export async function updateTaskTemplateAction(
  _prevState: TaskTemplateActionState,
  formData: FormData,
): Promise<TaskTemplateActionState> {
  const result = await updateTaskTemplate({
    id: getFormValue(formData, "template_id"),
    name: getFormValue(formData, "name"),
    description: getFormValue(formData, "description"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/dashboard/configuracion");

  return {
    ok: true,
    message: "Plantilla actualizada correctamente.",
  };
}

export async function toggleTaskTemplateActiveAction(
  _prevState: TaskTemplateActionState,
  formData: FormData,
): Promise<TaskTemplateActionState> {
  const isActiveValue = getFormValue(formData, "is_active");
  const result = await toggleTaskTemplateActive({
    id: getFormValue(formData, "template_id"),
    isActive:
      isActiveValue === "true"
        ? true
        : isActiveValue === "false"
          ? false
          : null,
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
    };
  }

  revalidatePath("/dashboard/configuracion");

  return {
    ok: true,
    message:
      isActiveValue === "true"
        ? "Plantilla activada correctamente."
        : "Plantilla desactivada correctamente.",
  };
}
