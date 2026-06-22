"use server";

import { revalidatePath } from "next/cache";
import {
  createTaskTemplateTask,
  deleteTaskTemplateTask,
  reorderTaskTemplateTask,
  updateTaskTemplateTask,
  type TaskTemplateTaskActionValues,
  type TaskTemplateTaskFieldErrors,
} from "@/lib/task-templates";
import { getFormValue } from "@/lib/utils";

export type TaskTemplateDetailAction<State> = (
  prevState: State,
  formData: FormData,
) => Promise<State>;

export type CreateTaskTemplateTaskActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: TaskTemplateTaskFieldErrors;
  values?: TaskTemplateTaskActionValues;
};

export type UpdateTaskTemplateTaskActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: TaskTemplateTaskFieldErrors;
  values?: TaskTemplateTaskActionValues;
};

export type DeleteTaskTemplateTaskActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: TaskTemplateTaskFieldErrors;
};

export type MoveTaskTemplateTaskActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: TaskTemplateTaskFieldErrors;
};

function revalidateTaskTemplateDetail(templateId: string) {
  revalidatePath("/dashboard/configuracion");
  revalidatePath(`/dashboard/configuracion/plantillas/${templateId}`);
}

export async function createTaskTemplateTaskAction(
  templateId: string,
  _prevState: CreateTaskTemplateTaskActionState,
  formData: FormData,
): Promise<CreateTaskTemplateTaskActionState> {
  const result = await createTaskTemplateTask({
    templateId,
    title: getFormValue(formData, "title"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  revalidateTaskTemplateDetail(templateId);

  return {
    ok: true,
    message: "Tarea agregada correctamente.",
    values: {
      title: "",
    },
  };
}

export async function updateTaskTemplateTaskAction(
  templateId: string,
  _prevState: UpdateTaskTemplateTaskActionState,
  formData: FormData,
): Promise<UpdateTaskTemplateTaskActionState> {
  const result = await updateTaskTemplateTask({
    templateId,
    taskId: getFormValue(formData, "task_id"),
    title: getFormValue(formData, "title"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  revalidateTaskTemplateDetail(templateId);

  return {
    ok: true,
    message: "Tarea actualizada correctamente.",
  };
}

export async function deleteTaskTemplateTaskAction(
  templateId: string,
  _prevState: DeleteTaskTemplateTaskActionState,
  formData: FormData,
): Promise<DeleteTaskTemplateTaskActionState> {
  const result = await deleteTaskTemplateTask({
    templateId,
    taskId: getFormValue(formData, "task_id"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidateTaskTemplateDetail(templateId);

  return {
    ok: true,
    message: "Tarea eliminada correctamente.",
  };
}

export async function moveTaskTemplateTaskAction(
  templateId: string,
  _prevState: MoveTaskTemplateTaskActionState,
  formData: FormData,
): Promise<MoveTaskTemplateTaskActionState> {
  const result = await reorderTaskTemplateTask({
    templateId,
    taskId: getFormValue(formData, "task_id"),
    direction: getFormValue(formData, "direction"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidateTaskTemplateDetail(templateId);

  return {
    ok: true,
    message: "Orden actualizado correctamente.",
  };
}
