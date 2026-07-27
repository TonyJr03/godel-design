import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import type {
  ListPublicServiceTypesErrorReason,
  PublicServiceTypeRow,
  PublicServiceType,
} from "./types";

export type ListPublicServiceTypesResult = ServiceResult<
  { serviceTypes: PublicServiceType[] },
  ListPublicServiceTypesErrorReason
>;

const GENERIC_LIST_ERROR =
  "No se pudieron cargar los servicios. Inténtalo nuevamente.";

function toPublicServiceType(row: PublicServiceTypeRow): PublicServiceType {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workflowType: row.workflow_type,
  };
}

export async function listPublicServiceTypes(): Promise<ListPublicServiceTypesResult> {
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("tipos_servicio")
      .select("id, name, description, workflow_type")
      .eq("is_publicly_available", true)
      .order("workflow_type", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .returns<PublicServiceTypeRow[]>();

    if (error) {
      console.error("Error listing public service types", error);

      return serviceFailure("error", GENERIC_LIST_ERROR);
    }

    return serviceSuccess({
      serviceTypes: (data ?? []).map(toPublicServiceType),
    });
  } catch (error) {
    console.error("Unexpected error listing public service types", error);

    return serviceFailure("error", GENERIC_LIST_ERROR);
  }
}
