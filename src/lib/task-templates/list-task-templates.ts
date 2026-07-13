import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type {
  ListTaskTemplatesErrorReason,
  TaskTemplateListItem,
} from "./types";

export type ListTaskTemplatesResult = ServiceResult<
  { templates: TaskTemplateListItem[]; q: string | null },
  ListTaskTemplatesErrorReason
>;

export type ListTaskTemplatesOptions = {
  q?: string | null;
};

const GENERIC_LIST_ERROR =
  "No se pudieron cargar las plantillas. Inténtalo nuevamente.";

export async function listTaskTemplates(
  options: ListTaskTemplatesOptions = {},
): Promise<ListTaskTemplatesResult> {
  const q = options.q?.trim() || null;
  const normalizedQuery = q?.toLowerCase() ?? null;
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
    const filteredTemplateRows = normalizedQuery
      ? templateRows.filter((template) => {
          const name = template.name.toLowerCase();
          const description = template.description?.toLowerCase() ?? "";

          return (
            name.includes(normalizedQuery) ||
            description.includes(normalizedQuery)
          );
        })
      : templateRows;
    const templateIds = filteredTemplateRows.map((template) => template.id);
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
      templates: filteredTemplateRows.map((template) => ({
        ...template,
        tasksCount: tasksCountByTemplate.get(template.id) ?? 0,
      })),
      q,
    });
  } catch (error) {
    console.error("Unexpected error listing task templates", error);

    return serviceFailure("error", GENERIC_LIST_ERROR);
  }
}
