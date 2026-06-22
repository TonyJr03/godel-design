import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type TaskTemplateListItem = Pick<
  Tables<"trabajo_plantillas">,
  | "id"
  | "name"
  | "description"
  | "is_active"
  | "created_at"
  | "updated_at"
> & {
  tasksCount: number;
};

export type ListTaskTemplatesErrorReason =
  | "unauthorized"
  | "forbidden"
  | "error";

export type ListTaskTemplatesResult = ServiceResult<
  { templates: TaskTemplateListItem[] },
  ListTaskTemplatesErrorReason
>;

const GENERIC_LIST_ERROR =
  "No se pudieron cargar las plantillas. Inténtalo nuevamente.";

export async function listTaskTemplates(): Promise<ListTaskTemplatesResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "configuracion.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver configuración.",
    );
  }

  const supabase = await createClient();

  try {
    const { data: templates, error } = await supabase
      .from("trabajo_plantillas")
      .select("id, name, description, is_active, created_at, updated_at")
      .order("is_active", { ascending: false })
      .order("name", { ascending: true })
      .returns<
        Omit<TaskTemplateListItem, "tasksCount">[]
      >();

    if (error) {
      console.error("Error listing task templates", error);

      return serviceFailure("error", GENERIC_LIST_ERROR);
    }

    const templateRows = templates ?? [];
    const templateIds = templateRows.map((template) => template.id);
    const tasksCountByTemplate = new Map<string, number>();

    if (templateIds.length > 0) {
      const { data: taskRows, error: taskError } = await supabase
        .from("trabajo_plantilla_tareas")
        .select("template_id")
        .in("template_id", templateIds)
        .returns<Array<{ template_id: string }>>();

      if (taskError) {
        console.error("Error counting task template tasks", taskError);

        return serviceFailure("error", GENERIC_LIST_ERROR);
      }

      for (const taskRow of taskRows ?? []) {
        tasksCountByTemplate.set(
          taskRow.template_id,
          (tasksCountByTemplate.get(taskRow.template_id) ?? 0) + 1,
        );
      }
    }

    return serviceSuccess({
      templates: templateRows.map((template) => ({
        ...template,
        tasksCount: tasksCountByTemplate.get(template.id) ?? 0,
      })),
    });
  } catch (error) {
    console.error("Unexpected error listing task templates", error);

    return serviceFailure("error", GENERIC_LIST_ERROR);
  }
}
