import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";

export type ToggleTaskTemplateActiveInput = {
  id?: string | null;
  isActive?: boolean | null;
};

export type ToggleTaskTemplateActiveErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "validation"
  | "not_found"
  | "error";

export type ToggleTaskTemplateActiveResult = ServiceResult<
  Record<never, never>,
  ToggleTaskTemplateActiveErrorReason
>;

const GENERIC_TOGGLE_ERROR =
  "No se pudo cambiar el estado de la plantilla. Inténtalo nuevamente.";

export async function toggleTaskTemplateActive(
  input: ToggleTaskTemplateActiveInput,
): Promise<ToggleTaskTemplateActiveResult> {
  const templateId = (input.id ?? "").trim();

  if (!isValidUuid(templateId)) {
    return serviceFailure("invalid_id", "La plantilla solicitada no existe.");
  }

  if (typeof input.isActive !== "boolean") {
    return serviceFailure("validation", "Selecciona un estado válido.");
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
      "No tienes permiso para cambiar el estado de plantillas.",
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("trabajo_plantillas")
      .update({
        is_active: input.isActive,
        updated_by: profile.id,
      })
      .eq("id", templateId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Error toggling task template active state", error);

      return serviceFailure("error", GENERIC_TOGGLE_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "La plantilla solicitada no existe.");
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error toggling task template active state", error);

    return serviceFailure("error", GENERIC_TOGGLE_ERROR);
  }
}
