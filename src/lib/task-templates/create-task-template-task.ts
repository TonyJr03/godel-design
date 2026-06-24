import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { TablesInsert } from "@/types/database";
import {
  parseTaskTemplateTaskTitle,
  type TaskTemplateTaskFieldErrors,
} from "./task-template-task-validation";

export type CreateTaskTemplateTaskInput = {
  templateId: string;
  title: string;
};

export type TaskTemplateTaskActionValues = {
  title?: string;
};

export type CreateTaskTemplateTaskErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "validation"
  | "error";

export type CreateTaskTemplateTaskResult = ServiceResult<
  { taskId: string },
  CreateTaskTemplateTaskErrorReason,
  { values?: TaskTemplateTaskActionValues },
  TaskTemplateTaskFieldErrors
>;

const GENERIC_CREATE_TASK_ERROR =
  "No se pudo crear la tarea de plantilla. Inténtalo nuevamente.";

async function getNextTaskTemplateTaskSortOrder(
  templateId: string,
): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trabajo_plantilla_tareas")
    .select("sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle<{ sort_order: number }>();

  if (error) {
    console.error("Error loading last task template task sort order", error);

    return null;
  }

  return (data?.sort_order ?? -1) + 1;
}

export async function createTaskTemplateTask(
  input: CreateTaskTemplateTaskInput,
): Promise<CreateTaskTemplateTaskResult> {
  const templateId = input.templateId.trim();
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

  const supabase = await createClient();

  try {
    const { data: template, error: templateError } = await supabase
      .from("trabajo_plantillas")
      .select("id")
      .eq("id", templateId)
      .maybeSingle<{ id: string }>();

    if (templateError) {
      console.error(
        "Error checking task template before task create",
        templateError,
      );

      return serviceFailure("error", GENERIC_CREATE_TASK_ERROR, { values });
    }

    if (!template) {
      return serviceFailure(
        "not_found",
        "La plantilla solicitada no existe.",
        { values },
      );
    }

    const sortOrder = await getNextTaskTemplateTaskSortOrder(templateId);

    if (sortOrder === null) {
      return serviceFailure("error", GENERIC_CREATE_TASK_ERROR, { values });
    }

    const taskInsert: TablesInsert<"trabajo_plantilla_tareas"> = {
      template_id: templateId,
      title: parsedTitle.data.title,
      task_type: parsedTitle.data.taskType,
      target_quantity: parsedTitle.data.targetQuantity,
      sort_order: sortOrder,
    };

    const { data, error } = await supabase
      .from("trabajo_plantilla_tareas")
      .insert(taskInsert)
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      console.error("Error creating task template task", error);

      return serviceFailure("error", GENERIC_CREATE_TASK_ERROR, { values });
    }

    return serviceSuccess({
      taskId: data.id,
    });
  } catch (error) {
    console.error("Unexpected error creating task template task", error);

    return serviceFailure("error", GENERIC_CREATE_TASK_ERROR, { values });
  }
}
