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

export type DeleteTaskTemplateTaskInput = {
  templateId: string;
  taskId: string;
};

export type DeleteTaskTemplateTaskErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type DeleteTaskTemplateTaskResult = ServiceResult<
  Record<never, never>,
  DeleteTaskTemplateTaskErrorReason,
  Record<never, never>,
  TaskTemplateTaskFieldErrors
>;

type TaskOrderRow = {
  id: string;
  sort_order: number;
  created_at: string;
};

const GENERIC_DELETE_TASK_ERROR =
  "No se pudo eliminar la tarea de plantilla. Inténtalo nuevamente.";

async function normalizeTaskTemplateTaskOrder(
  templateId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trabajo_plantilla_tareas")
    .select("id, sort_order, created_at")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .returns<TaskOrderRow[]>();

  if (error) {
    console.error("Error loading task template tasks for order normalize", error);

    return false;
  }

  for (const [index, task] of (data ?? []).entries()) {
    if (task.sort_order === index) {
      continue;
    }

    const { error: updateError } = await supabase
      .from("trabajo_plantilla_tareas")
      .update({ sort_order: index })
      .eq("id", task.id)
      .eq("template_id", templateId);

    if (updateError) {
      console.error("Error normalizing task template task order", updateError);

      return false;
    }
  }

  return true;
}

export async function deleteTaskTemplateTask(
  input: DeleteTaskTemplateTaskInput,
): Promise<DeleteTaskTemplateTaskResult> {
  const templateId = input.templateId.trim();
  const taskId = input.taskId.trim();

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
      .delete()
      .eq("id", taskId)
      .eq("template_id", templateId)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      console.error("Error deleting task template task", error);

      return serviceFailure("error", GENERIC_DELETE_TASK_ERROR);
    }

    if (!data) {
      return serviceFailure(
        "not_found",
        "La tarea solicitada no existe o no pertenece a esta plantilla.",
      );
    }

    const normalized = await normalizeTaskTemplateTaskOrder(templateId);

    if (!normalized) {
      return serviceFailure("error", GENERIC_DELETE_TASK_ERROR);
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error deleting task template task", error);

    return serviceFailure("error", GENERIC_DELETE_TASK_ERROR);
  }
}
