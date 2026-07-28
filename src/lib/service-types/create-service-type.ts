import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type {
  CreateServiceTypeErrorReason,
  CreateServiceTypeInput,
  InternalServiceTypeRow,
  InternalServiceType,
  ServiceTypeFieldErrors,
} from "./types";
import { validateCreateServiceTypeInput } from "./validation";

export type CreateServiceTypeResult = ServiceResult<
  { serviceType: InternalServiceType },
  CreateServiceTypeErrorReason,
  Record<never, never>,
  ServiceTypeFieldErrors
>;

const GENERIC_CREATE_ERROR =
  "No se pudo crear el servicio. Inténtalo nuevamente.";

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

export async function createServiceType(
  input: CreateServiceTypeInput,
): Promise<CreateServiceTypeResult> {
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
      "No tienes permiso para crear servicios.",
    );
  }

  const validation = validateCreateServiceTypeInput(input);

  if (!validation.ok) {
    return serviceFailure("validation", "Revisa los datos del servicio.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("tipos_servicio")
      .insert({
        name: validation.data.name,
        description: validation.data.description,
        workflow_type: "encargo",
        is_publicly_available: validation.data.isPubliclyAvailable,
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select(
        "id, name, description, workflow_type, is_publicly_available, created_at, updated_at",
      )
      .single<InternalServiceTypeRow>();

    if (error || !data) {
      if (error && isDuplicateNameError(error)) {
        return serviceFailure("validation", "Revisa los datos del servicio.", {
          fieldErrors: {
            name: "Ya existe un servicio con ese nombre.",
          },
        });
      }

      console.error("Error creating service type", error);

      return serviceFailure("error", GENERIC_CREATE_ERROR);
    }

    return serviceSuccess({
      serviceType: toInternalServiceType(data),
    });
  } catch (error) {
    console.error("Unexpected error creating service type", error);

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }
}
