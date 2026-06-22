import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";

export type TaskTemplateTask = Pick<
  Tables<"trabajo_plantilla_tareas">,
  | "id"
  | "template_id"
  | "title"
  | "task_type"
  | "target_quantity"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

export type ListTaskTemplateTasksErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type ListTaskTemplateTasksResult = ServiceResult<
  { tasks: TaskTemplateTask[] },
  ListTaskTemplateTasksErrorReason,
  { tasks: [] }
>;

const emptyTasks = {
  tasks: [] as [],
};

const GENERIC_LIST_TASKS_ERROR =
  "No se pudieron cargar las tareas de la plantilla.";

export async function listTaskTemplateTasks(
  templateIdInput: string,
): Promise<ListTaskTemplateTasksResult> {
  const templateId = templateIdInput.trim();

  if (!isValidUuid(templateId)) {
    return serviceFailure(
      "invalid_id",
      "La plantilla solicitada no existe.",
      emptyTasks,
    );
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      emptyTasks,
    );
  }

  if (!hasPermission(profile.role, "configuracion.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver configuración.",
      emptyTasks,
    );
  }

  const supabase = await createClient();

  try {
    const { data: template, error: templateError } = await supabase
      .from("trabajo_plantillas")
      .select("id")
      .eq("id", templateId)
      .maybeSingle<{ id: string }>();

    if (templateError) {
      console.error(
        "Error checking task template before listing tasks",
        templateError,
      );

      return serviceFailure("error", GENERIC_LIST_TASKS_ERROR, emptyTasks);
    }

    if (!template) {
      return serviceFailure(
        "not_found",
        "La plantilla solicitada no existe.",
        emptyTasks,
      );
    }

    const { data, error } = await supabase
      .from("trabajo_plantilla_tareas")
      .select(
        [
          "id",
          "template_id",
          "title",
          "task_type",
          "target_quantity",
          "sort_order",
          "created_at",
          "updated_at",
        ].join(", "),
      )
      .eq("template_id", templateId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .returns<TaskTemplateTask[]>();

    if (error) {
      console.error("Error listing task template tasks", error);

      return serviceFailure("error", GENERIC_LIST_TASKS_ERROR, emptyTasks);
    }

    return serviceSuccess({
      tasks: data ?? [],
    });
  } catch (error) {
    console.error("Unexpected error listing task template tasks", error);

    return serviceFailure("error", GENERIC_LIST_TASKS_ERROR, emptyTasks);
  }
}
