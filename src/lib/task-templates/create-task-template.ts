import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  validateTaskTemplateInput,
  type TaskTemplateFieldErrors,
  type TaskTemplateInput,
} from "./task-template-validation";

export type CreateTaskTemplateErrorReason =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "error";

export type CreateTaskTemplateResult = ServiceResult<
  { templateId: string },
  CreateTaskTemplateErrorReason,
  Record<never, never>,
  TaskTemplateFieldErrors
>;

const GENERIC_CREATE_ERROR =
  "No se pudo crear la plantilla. Inténtalo nuevamente.";

export async function createTaskTemplate(
  input: TaskTemplateInput,
): Promise<CreateTaskTemplateResult> {
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
      "No tienes permiso para crear plantillas.",
    );
  }

  const validation = validateTaskTemplateInput(input);

  if (!validation.ok) {
    return serviceFailure("validation", "Revisa los datos de la plantilla.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("trabajo_plantillas")
      .insert({
        name: validation.data.name,
        description: validation.data.description,
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Error creating task template", error);

      return serviceFailure("error", GENERIC_CREATE_ERROR);
    }

    return serviceSuccess({
      templateId: data.id,
    });
  } catch (error) {
    console.error("Unexpected error creating task template", error);

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }
}
