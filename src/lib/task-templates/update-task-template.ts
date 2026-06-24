import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import {
  validateTaskTemplateInput,
  type TaskTemplateFieldErrors,
  type TaskTemplateInput,
} from "./task-template-validation";

export type UpdateTaskTemplateInput = TaskTemplateInput & {
  id?: string | null;
};

export type UpdateTaskTemplateErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "validation"
  | "not_found"
  | "error";

export type UpdateTaskTemplateResult = ServiceResult<
  Record<never, never>,
  UpdateTaskTemplateErrorReason,
  Record<never, never>,
  TaskTemplateFieldErrors
>;

const GENERIC_UPDATE_ERROR =
  "No se pudo actualizar la plantilla. Inténtalo nuevamente.";

export async function updateTaskTemplate(
  input: UpdateTaskTemplateInput,
): Promise<UpdateTaskTemplateResult> {
  const templateId = (input.id ?? "").trim();

  if (!isValidUuid(templateId)) {
    return serviceFailure("invalid_id", "La plantilla solicitada no existe.");
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
      "No tienes permiso para editar plantillas.",
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
      .update({
        name: validation.data.name,
        description: validation.data.description,
        updated_by: profile.id,
      })
      .eq("id", templateId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Error updating task template", error);

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "La plantilla solicitada no existe.");
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error updating task template", error);

    return serviceFailure("error", GENERIC_UPDATE_ERROR);
  }
}
