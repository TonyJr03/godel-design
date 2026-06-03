import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  validateClienteInput,
  type ClienteFieldErrors,
  type CreateClienteInput,
} from "./client-validation";

export type CreateInternalClienteErrorReason =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "error";

export type CreateInternalClienteResult = ServiceResult<
  {
    clienteId: string;
  },
  CreateInternalClienteErrorReason,
  Record<never, never>,
  ClienteFieldErrors
>;

const GENERIC_CREATE_ERROR =
  "No se pudo crear el cliente. Inténtalo nuevamente.";

export async function createInternalCliente(
  input: CreateClienteInput,
): Promise<CreateInternalClienteResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "Debes iniciar sesión con un usuario interno activo.",
    );
  }

  if (!hasPermission(profile.role, "clientes.manage")) {
    return serviceFailure("forbidden", "No tienes permiso para crear clientes.");
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
      .insert(validation.data)
      .select("id")
      .single();

    if (error || !data) {
      console.error("Error creating internal cliente", error);

      return serviceFailure("error", GENERIC_CREATE_ERROR);
    }

    return serviceSuccess({
      clienteId: data.id,
    });
  } catch (error) {
    console.error("Unexpected error creating internal cliente", error);

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }
}
