import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
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

export type UpdateInternalClienteResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_id" | "validation" | "not_found" | "error";
      message: string;
      fieldErrors?: ClienteFieldErrors;
    };

const GENERIC_UPDATE_ERROR =
  "No se pudo actualizar el cliente. Inténtalo nuevamente.";

export async function updateInternalCliente(
  input: UpdateInternalClienteInput,
): Promise<UpdateInternalClienteResult> {
  const clienteId = (input.id ?? "").trim();

  if (!isValidUuid(clienteId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "El cliente solicitado no existe.",
    };
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "clientes.manage")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para editar clientes.",
    };
  }

  const validation = validateClienteInput(input);

  if (!validation.ok) {
    return {
      ok: false,
      reason: "validation",
      message: "Revisa los datos del cliente.",
      fieldErrors: validation.fieldErrors,
    };
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

      return {
        ok: false,
        reason: "error",
        message: GENERIC_UPDATE_ERROR,
      };
    }

    if (!data) {
      return {
        ok: false,
        reason: "not_found",
        message: "El cliente solicitado no existe.",
      };
    }

    return {
      ok: true,
    };
  } catch (error) {
    console.error("Unexpected error updating internal cliente", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_UPDATE_ERROR,
    };
  }
}
