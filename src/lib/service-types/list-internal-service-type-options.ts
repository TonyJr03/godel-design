import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { mapInternalServiceReference } from "./mappers";
import type {
  InternalServiceReferenceRow,
  InternalServiceTypeOption,
  ListInternalServiceTypeOptionsErrorReason,
} from "./types";

export type ListInternalServiceTypeOptionsResult = ServiceResult<
  { serviceTypes: InternalServiceTypeOption[] },
  ListInternalServiceTypeOptionsErrorReason
>;

const GENERIC_LIST_ERROR =
  "No se pudieron cargar las opciones de servicio. Inténtalo nuevamente.";

export async function listInternalServiceTypeOptions(): Promise<ListInternalServiceTypeOptionsResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("tipos_servicio")
      .select("id, name, workflow_type, is_publicly_available")
      .order("workflow_type", { ascending: true })
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .returns<InternalServiceReferenceRow[]>();

    if (error) {
      console.error("Error listing internal service type options", error);

      return serviceFailure("error", GENERIC_LIST_ERROR);
    }

    return serviceSuccess({
      serviceTypes: (data ?? []).map(mapInternalServiceReference),
    });
  } catch (error) {
    console.error("Unexpected error listing internal service type options", error);

    return serviceFailure("error", GENERIC_LIST_ERROR);
  }
}
