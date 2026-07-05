import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { InternalClienteDetail } from "./types";

export type GetInternalClienteByIdErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type GetInternalClienteByIdResult = ServiceResult<
  {
    cliente: InternalClienteDetail;
  },
  GetInternalClienteByIdErrorReason
>;

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar el cliente. Inténtalo nuevamente.";

export async function getInternalClienteById(
  id: string,
): Promise<GetInternalClienteByIdResult> {
  const clienteId = id.trim();

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

  if (!hasPermission(profile.role, "clientes.view")) {
    return serviceFailure("forbidden", "No tienes permiso para ver clientes.");
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, name, phone, email, notes, created_at, updated_at")
      .eq("id", clienteId)
      .maybeSingle<InternalClienteDetail>();

    if (error) {
      console.error("Error loading internal cliente detail", error);

      return serviceFailure("error", GENERIC_DETAIL_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "El cliente solicitado no existe.");
    }

    return serviceSuccess({
      cliente: data,
    });
  } catch (error) {
    console.error("Unexpected error loading internal cliente detail", error);

    return serviceFailure("error", GENERIC_DETAIL_ERROR);
  }
}
