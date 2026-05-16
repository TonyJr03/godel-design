import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  validateClienteInput,
  type ClienteFieldErrors,
  type CreateClienteInput,
} from "./client-validation";

export type CreateInternalClienteResult =
  | {
      ok: true;
      clienteId: string;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: ClienteFieldErrors;
    };

const GENERIC_CREATE_ERROR =
  "No se pudo crear el cliente. Inténtalo nuevamente.";

export async function createInternalCliente(
  input: CreateClienteInput,
): Promise<CreateInternalClienteResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return {
      ok: false,
      message: "Debes iniciar sesión con un usuario interno activo.",
    };
  }

  if (!hasPermission(profile.role, "clientes.manage")) {
    return {
      ok: false,
      message: "No tienes permiso para crear clientes.",
    };
  }

  const validation = validateClienteInput(input);

  if (!validation.ok) {
    return {
      ok: false,
      message: "Revisa los datos del cliente.",
      fieldErrors: validation.fieldErrors,
    };
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

      return {
        ok: false,
        message: GENERIC_CREATE_ERROR,
      };
    }

    return {
      ok: true,
      clienteId: data.id,
    };
  } catch (error) {
    console.error("Unexpected error creating internal cliente", error);

    return {
      ok: false,
      message: GENERIC_CREATE_ERROR,
    };
  }
}
