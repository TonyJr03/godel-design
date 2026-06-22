import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { TablesUpdate } from "@/types/database";
import {
  parseTaskTemplateTaskTitle,
  type TaskTemplateTaskFieldErrors,
} from "./task-template-task-validation";
import type { TaskTemplateTaskActionValues } from "./create-task-template-task";

export type UpdateTaskTemplateTaskInput = {
  templateId: string;
  taskId: string;
  title: string;
};

export type UpdateTaskTemplateTaskErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "validation"
  | "error";

export type UpdateTaskTemplateTaskResult = ServiceResult<
  Record<never, never>,
  UpdateTaskTemplateTaskErrorReason,
  { values?: TaskTemplateTaskActionValues },
  TaskTemplateTaskFieldErrors
>;

const GENERIC_UPDATE_TASK_ERROR =
  "No se pudo actualizar la tarea de plantilla. Inténtalo nuevamente.";

export async function updateTaskTemplateTask(
  input: UpdateTaskTemplateTaskInput,
): Promise<UpdateTaskTemplateTaskResult> {
  const templateId = input.templateId.trim();
  const taskId = input.taskId.trim();
  const parsedTitle = parseTaskTemplateTaskTitle(input.title);
  const values = {
    title: parsedTitle.ok ? parsedTitle.data.title : input.title.trim(),
  };

  if (!isValidUuid(templateId)) {
    return serviceFailure(
      "invalid_id",
      "La plantilla solicitada no existe.",
      {
        fieldErrors: {
          template_id: "La plantilla solicitada no existe.",
        },
        values,
      },
    );
  }

  if (!isValidUuid(taskId)) {
    return serviceFailure("invalid_id", "La tarea solicitada no existe.", {
      fieldErrors: {
        task_id: "La tarea solicitada no existe.",
      },
      values,
    });
  }

  if (!parsedTitle.ok) {
    return serviceFailure("validation", parsedTitle.message, {
      fieldErrors: parsedTitle.fieldErrors,
      values,
    });
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      { values },
    );
  }

  if (!hasPermission(profile.role, "configuracion.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para gestionar tareas de plantilla.",
      { values },
    );
  }

  const taskUpdate: TablesUpdate<"trabajo_plantilla_tareas"> = {
    title: parsedTitle.data.title,
    task_type: parsedTitle.data.taskType,
    target_quantity: parsedTitle.data.targetQuantity,
  };
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("trabajo_plantilla_tareas")
      .update(taskUpdate)
      .eq("id", taskId)
      .eq("template_id", templateId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      console.error("Error updating task template task", error);

      return serviceFailure("error", GENERIC_UPDATE_TASK_ERROR, { values });
    }

    if (!data) {
      return serviceFailure(
        "not_found",
        "La tarea solicitada no existe o no pertenece a esta plantilla.",
        { values },
      );
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error updating task template task", error);

    return serviceFailure("error", GENERIC_UPDATE_TASK_ERROR, { values });
  }
}
