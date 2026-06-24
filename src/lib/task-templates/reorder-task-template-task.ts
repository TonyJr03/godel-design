import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { TaskTemplateTaskFieldErrors } from "./task-template-task-validation";

export type TaskTemplateTaskMoveDirection = "up" | "down";

export type ReorderTaskTemplateTaskInput = {
  templateId: string;
  taskId: string;
  direction: string;
};

export type ReorderTaskTemplateTaskErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "validation"
  | "not_found"
  | "error";

export type ReorderTaskTemplateTaskResult = ServiceResult<
  Record<never, never>,
  ReorderTaskTemplateTaskErrorReason,
  Record<never, never>,
  TaskTemplateTaskFieldErrors
>;

type TaskOrderRow = {
  id: string;
  sort_order: number;
  created_at: string;
};

const GENERIC_REORDER_TASK_ERROR =
  "No se pudo reordenar la tarea de plantilla. Inténtalo nuevamente.";

function isMoveDirection(
  value: string,
): value is TaskTemplateTaskMoveDirection {
  return value === "up" || value === "down";
}

export async function reorderTaskTemplateTask(
  input: ReorderTaskTemplateTaskInput,
): Promise<ReorderTaskTemplateTaskResult> {
  const templateId = input.templateId.trim();
  const taskId = input.taskId.trim();
  const direction = input.direction.trim();

  if (!isValidUuid(templateId)) {
    return serviceFailure(
      "invalid_id",
      "La plantilla solicitada no existe.",
      {
        fieldErrors: {
          template_id: "La plantilla solicitada no existe.",
        },
      },
    );
  }

  if (!isValidUuid(taskId)) {
    return serviceFailure("invalid_id", "La tarea solicitada no existe.", {
      fieldErrors: {
        task_id: "La tarea solicitada no existe.",
      },
    });
  }

  if (!isMoveDirection(direction)) {
    return serviceFailure("validation", "Selecciona un movimiento válido.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "configuracion.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para gestionar tareas de plantilla.",
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("trabajo_plantilla_tareas")
      .select("id, sort_order, created_at")
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .returns<TaskOrderRow[]>();

    if (error) {
      console.error("Error loading task template tasks for reorder", error);

      return serviceFailure("error", GENERIC_REORDER_TASK_ERROR);
    }

    const tasks = data ?? [];
    const currentIndex = tasks.findIndex((task) => task.id === taskId);

    if (currentIndex === -1) {
      return serviceFailure(
        "not_found",
        "La tarea solicitada no existe o no pertenece a esta plantilla.",
      );
    }

    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= tasks.length) {
      return serviceSuccess();
    }

    const reorderedTasks = [...tasks];
    const [movingTask] = reorderedTasks.splice(currentIndex, 1);
    reorderedTasks.splice(targetIndex, 0, movingTask);

    for (const [index, task] of reorderedTasks.entries()) {
      if (task.sort_order === index) {
        continue;
      }

      const { error: updateError } = await supabase
        .from("trabajo_plantilla_tareas")
        .update({ sort_order: index })
        .eq("id", task.id)
        .eq("template_id", templateId);

      if (updateError) {
        console.error("Error updating task template task order", updateError);

        return serviceFailure("error", GENERIC_REORDER_TASK_ERROR);
      }
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error reordering task template task", error);

    return serviceFailure("error", GENERIC_REORDER_TASK_ERROR);
  }
}
