import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export type ActiveTaskTemplateForOrder = Pick<
  Tables<"trabajo_plantillas">,
  "id" | "name" | "description"
> & {
  tasksCount: number;
};

export type ListActiveTaskTemplatesForOrderErrorReason =
  | "unauthorized"
  | "error";

export type ListActiveTaskTemplatesForOrderResult = ServiceResult<
  { templates: ActiveTaskTemplateForOrder[] },
  ListActiveTaskTemplatesForOrderErrorReason,
  { templates: [] }
>;

const emptyTemplates = {
  templates: [] as [],
};

const GENERIC_LIST_ACTIVE_ERROR =
  "No se pudieron cargar las plantillas disponibles.";

export async function listActiveTaskTemplatesForOrder(): Promise<
  ListActiveTaskTemplatesForOrderResult
> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
      emptyTemplates,
    );
  }

  const supabase = await createClient();

  try {
    const { data: templates, error } = await supabase
      .from("trabajo_plantillas")
      .select("id, name, description")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .returns<
        Array<Pick<ActiveTaskTemplateForOrder, "id" | "name" | "description">>
      >();

    if (error) {
      console.error("Error listing active task templates for order", error);

      return serviceFailure(
        "error",
        GENERIC_LIST_ACTIVE_ERROR,
        emptyTemplates,
      );
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
        console.error(
          "Error counting active task template tasks for order",
          taskError,
        );

        return serviceFailure(
          "error",
          GENERIC_LIST_ACTIVE_ERROR,
          emptyTemplates,
        );
      }

      for (const taskRow of taskRows ?? []) {
        tasksCountByTemplate.set(
          taskRow.template_id,
          (tasksCountByTemplate.get(taskRow.template_id) ?? 0) + 1,
        );
      }
    }

    return serviceSuccess({
      templates: templateRows
        .map((template) => ({
          ...template,
          tasksCount: tasksCountByTemplate.get(template.id) ?? 0,
        }))
        .filter((template) => template.tasksCount > 0),
    });
  } catch (error) {
    console.error(
      "Unexpected error listing active task templates for order",
      error,
    );

    return serviceFailure("error", GENERIC_LIST_ACTIVE_ERROR, emptyTemplates);
  }
}
