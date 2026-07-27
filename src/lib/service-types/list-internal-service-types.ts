import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type {
  InternalServiceTypeRow,
  InternalServiceType,
  ListInternalServiceTypesErrorReason,
} from "./types";

export type ListInternalServiceTypesResult = ServiceResult<
  { serviceTypes: InternalServiceType[] },
  ListInternalServiceTypesErrorReason
>;

const GENERIC_LIST_ERROR =
  "No se pudieron cargar los servicios. Inténtalo nuevamente.";

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

export async function listInternalServiceTypes(): Promise<ListInternalServiceTypesResult> {
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
      .from("tipos_servicio")
      .select(
        "id, name, description, workflow_type, is_publicly_available, created_at, updated_at",
      )
      .order("workflow_type", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .returns<InternalServiceTypeRow[]>();

    if (error) {
      console.error("Error listing internal service types", error);

      return serviceFailure("error", GENERIC_LIST_ERROR);
    }

    return serviceSuccess({
      serviceTypes: (data ?? []).map(toInternalServiceType),
    });
  } catch (error) {
    console.error("Unexpected error listing internal service types", error);

    return serviceFailure("error", GENERIC_LIST_ERROR);
  }
}
