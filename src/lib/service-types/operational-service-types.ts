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
  GetOperationalServiceTypeByIdErrorReason,
  InternalServiceTypeRow,
  ListOperationalServiceTypesErrorReason,
  OperationalServiceType,
} from "./types";

export type ListOperationalServiceTypesResult = ServiceResult<
  { serviceTypes: OperationalServiceType[] },
  ListOperationalServiceTypesErrorReason
>;

export type GetOperationalServiceTypeByIdResult = ServiceResult<
  { serviceType: OperationalServiceType },
  GetOperationalServiceTypeByIdErrorReason
>;

const GENERIC_LIST_ERROR =
  "No se pudieron cargar los servicios disponibles para operaciones.";
const GENERIC_GET_ERROR =
  "No se pudo validar el servicio seleccionado. Inténtalo nuevamente.";
const SERVICE_NOT_FOUND_MESSAGE = "El servicio seleccionado no existe.";

function toOperationalServiceType(
  row: InternalServiceTypeRow,
): OperationalServiceType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workflowType: row.workflow_type,
    isPubliclyAvailable: row.is_publicly_available,
  };
}

async function canUseOperationalServices() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false as const,
      reason: "unauthorized" as const,
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (
    !hasPermission(profile.role, "pedidos.manage") &&
    !hasPermission(profile.role, "solicitudes.manage")
  ) {
    return {
      ok: false as const,
      reason: "forbidden" as const,
      message: "No tienes permiso para usar el catálogo de servicios.",
    };
  }

  return { ok: true as const };
}

export async function listOperationalServiceTypes(): Promise<ListOperationalServiceTypesResult> {
  const permission = await canUseOperationalServices();

  if (!permission.ok) {
    return serviceFailure(permission.reason, permission.message);
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
      console.error("Error listing operational service types", error);

      return serviceFailure("error", GENERIC_LIST_ERROR);
    }

    return serviceSuccess({
      serviceTypes: (data ?? []).map(toOperationalServiceType),
    });
  } catch (error) {
    console.error("Unexpected error listing operational service types", error);

    return serviceFailure("error", GENERIC_LIST_ERROR);
  }
}

export async function getOperationalServiceTypeById(
  serviceTypeId: string,
): Promise<GetOperationalServiceTypeByIdResult> {
  const normalizedServiceTypeId = serviceTypeId.trim();

  if (!isValidUuid(normalizedServiceTypeId)) {
    return serviceFailure("invalid_id", SERVICE_NOT_FOUND_MESSAGE);
  }

  const permission = await canUseOperationalServices();

  if (!permission.ok) {
    return serviceFailure(permission.reason, permission.message);
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("tipos_servicio")
      .select(
        "id, name, description, workflow_type, is_publicly_available, created_at, updated_at",
      )
      .eq("id", normalizedServiceTypeId)
      .maybeSingle<InternalServiceTypeRow>();

    if (error) {
      console.error("Error resolving operational service type", error);

      return serviceFailure("error", GENERIC_GET_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", SERVICE_NOT_FOUND_MESSAGE);
    }

    return serviceSuccess({
      serviceType: toOperationalServiceType(data),
    });
  } catch (error) {
    console.error("Unexpected error resolving operational service type", error);

    return serviceFailure("error", GENERIC_GET_ERROR);
  }
}
