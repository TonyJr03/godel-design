import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type {
  InternalServiceTypeRow,
  InternalServiceType,
  ServiceTypeFieldErrors,
  UpdateServiceTypeErrorReason,
  UpdateServiceTypeInput,
} from "./types";
import { validateUpdateServiceTypeInput } from "./validation";

export type UpdateServiceTypeResult = ServiceResult<
  { serviceType: InternalServiceType },
  UpdateServiceTypeErrorReason,
  Record<never, never>,
  ServiceTypeFieldErrors
>;

const GENERIC_UPDATE_ERROR =
  "No se pudo actualizar el servicio. Inténtalo nuevamente.";

function isDuplicateNameError(error: {
  code?: string;
  message?: string;
  details?: string | null;
}) {
  const errorText = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  return (
    error.code === "23505" &&
    errorText.includes("tipos_servicio_name_normalized_key")
  );
}

function toInternalServiceType(row: InternalServiceTypeRow): InternalServiceType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workflowType: row.workflow_type,
    isPubliclyAvailable: row.is_publicly_available,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function updateServiceType(
  input: UpdateServiceTypeInput,
): Promise<UpdateServiceTypeResult> {
  const serviceTypeId = (input.id ?? "").trim();

  if (!isValidUuid(serviceTypeId)) {
    return serviceFailure("invalid_id", "El servicio solicitado no existe.");
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
      "No tienes permiso para editar servicios.",
    );
  }

  const validation = validateUpdateServiceTypeInput(input);

  if (!validation.ok) {
    return serviceFailure("validation", "Revisa los datos del servicio.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("tipos_servicio")
      .update({
        name: validation.data.name,
        description: validation.data.description,
        is_publicly_available: validation.data.isPubliclyAvailable,
        updated_by: profile.id,
      })
      .eq("id", serviceTypeId)
      .select(
        "id, name, description, workflow_type, is_publicly_available, created_at, updated_at",
      )
      .maybeSingle<InternalServiceTypeRow>();

    if (error) {
      if (isDuplicateNameError(error)) {
        return serviceFailure("validation", "Revisa los datos del servicio.", {
          fieldErrors: {
            name: "Ya existe un servicio con ese nombre.",
          },
        });
      }

      console.error("Error updating service type", error);

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "El servicio solicitado no existe.");
    }

    return serviceSuccess({
      serviceType: toInternalServiceType(data),
    });
  } catch (error) {
    console.error("Unexpected error updating service type", error);

    return serviceFailure("error", GENERIC_UPDATE_ERROR);
  }
}
