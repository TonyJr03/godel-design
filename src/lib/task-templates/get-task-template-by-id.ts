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

export type TaskTemplateDetail = Pick<
  Tables<"trabajo_plantillas">,
  | "id"
  | "name"
  | "description"
  | "is_active"
  | "created_at"
  | "updated_at"
>;

export type GetTaskTemplateByIdErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type GetTaskTemplateByIdResult = ServiceResult<
  { template: TaskTemplateDetail },
  GetTaskTemplateByIdErrorReason
>;

const GENERIC_GET_ERROR =
  "No se pudo cargar la plantilla. Inténtalo nuevamente.";

export async function getTaskTemplateById(
  templateIdInput: string,
): Promise<GetTaskTemplateByIdResult> {
  const templateId = templateIdInput.trim();

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

  if (!hasPermission(profile.role, "configuracion.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver configuración.",
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("trabajo_plantillas")
      .select("id, name, description, is_active, created_at, updated_at")
      .eq("id", templateId)
      .maybeSingle<TaskTemplateDetail>();

    if (error) {
      console.error("Error loading task template", error);

      return serviceFailure("error", GENERIC_GET_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "La plantilla solicitada no existe.");
    }

    return serviceSuccess({
      template: data,
    });
  } catch (error) {
    console.error("Unexpected error loading task template", error);

    return serviceFailure("error", GENERIC_GET_ERROR);
  }
}
