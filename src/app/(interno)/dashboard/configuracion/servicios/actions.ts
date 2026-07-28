"use server";

import {
  actionFailure,
  actionSuccess,
  type BaseActionState,
} from "@/lib/actions/action-state";
import { revalidateServiceTypesAdmin } from "@/lib/actions/revalidation";
import {
  createServiceType,
  updateServiceType,
  type ServiceTypeFieldErrors,
} from "@/lib/service-types";
import { getFormValue } from "@/lib/utils";

export type ServiceTypeActionState =
  BaseActionState<ServiceTypeFieldErrors>;

export async function createServiceTypeAction(
  _prevState: ServiceTypeActionState,
  formData: FormData,
): Promise<ServiceTypeActionState> {
  const result = await createServiceType({
    name: getFormValue(formData, "name"),
    description: getFormValue(formData, "description"),
    isPubliclyAvailable: getFormValue(formData, "is_publicly_available"),
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidateServiceTypesAdmin();

  return actionSuccess("Servicio creado correctamente.");
}

export async function updateServiceTypeAction(
  _prevState: ServiceTypeActionState,
  formData: FormData,
): Promise<ServiceTypeActionState> {
  const result = await updateServiceType({
    id: getFormValue(formData, "service_type_id"),
    name: getFormValue(formData, "name"),
    description: getFormValue(formData, "description"),
    isPubliclyAvailable: getFormValue(formData, "is_publicly_available"),
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidateServiceTypesAdmin();

  return actionSuccess("Servicio actualizado correctamente.");
}
