import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";

export type InternalClienteDetail = Pick<
  Tables<"clientes">,
  | "id"
  | "nombre"
  | "telefono"
  | "email"
  | "notas"
  | "created_at"
  | "updated_at"
>;

export type GetInternalClienteByIdResult =
  | {
      ok: true;
      cliente: InternalClienteDetail;
    }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_id" | "not_found" | "error";
      message: string;
    };

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar el cliente. Inténtalo nuevamente.";

export async function getInternalClienteById(
  id: string,
): Promise<GetInternalClienteByIdResult> {
  const clienteId = id.trim();

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

  if (!hasPermission(profile.role, "clientes.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver clientes.",
    };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre, telefono, email, notas, created_at, updated_at")
      .eq("id", clienteId)
      .maybeSingle<InternalClienteDetail>();

    if (error) {
      console.error("Error loading internal cliente detail", error);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_DETAIL_ERROR,
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
      cliente: data,
    };
  } catch (error) {
    console.error("Unexpected error loading internal cliente detail", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_DETAIL_ERROR,
    };
  }
}
