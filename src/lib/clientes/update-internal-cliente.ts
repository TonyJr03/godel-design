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
  validateClienteInput,
  type ClienteFieldErrors,
  type CreateClienteInput,
} from "./client-validation";

export type UpdateInternalClienteInput = CreateClienteInput & {
  id?: string | null;
};

export type UpdateInternalClienteErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "validation"
  | "not_found"
  | "error";

export type UpdateInternalClienteResult = ServiceResult<
  Record<never, never>,
  UpdateInternalClienteErrorReason,
  Record<never, never>,
  ClienteFieldErrors
>;

const GENERIC_UPDATE_ERROR =
  "No se pudo actualizar el cliente. Inténtalo nuevamente.";

export async function updateInternalCliente(
  input: UpdateInternalClienteInput,
): Promise<UpdateInternalClienteResult> {
  const clienteId = (input.id ?? "").trim();

  if (!isValidUuid(clienteId)) {
    return serviceFailure("invalid_id", "El cliente solicitado no existe.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "clientes.manage")) {
    return serviceFailure("forbidden", "No tienes permiso para editar clientes.");
  }

  const validation = validateClienteInput(input);

  if (!validation.ok) {
    return serviceFailure("validation", "Revisa los datos del cliente.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("clientes")
      .update({
        nombre: validation.data.nombre,
        telefono: validation.data.telefono,
        email: validation.data.email,
        notas: validation.data.notas,
      })
      .eq("id", clienteId)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Error updating internal cliente", error);

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "El cliente solicitado no existe.");
    }

    return serviceSuccess();
  } catch (error) {
    console.error("Unexpected error updating internal cliente", error);

    return serviceFailure("error", GENERIC_UPDATE_ERROR);
  }
}
