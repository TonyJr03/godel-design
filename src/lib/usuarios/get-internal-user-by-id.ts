import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { InternalUserDetail } from "./types";

export type GetInternalUserByIdErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "error";

export type GetInternalUserByIdResult = ServiceResult<
  { user: InternalUserDetail },
  GetInternalUserByIdErrorReason
>;

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar el usuario interno. Inténtalo nuevamente.";

export async function getInternalUserById(
  id: string,
): Promise<GetInternalUserByIdResult> {
  const userId = id.trim();

  if (!isValidUuid(userId)) {
    return serviceFailure("invalid_id", "El usuario solicitado no existe.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para ver usuarios internos.",
    );
  }

  if (!hasPermission(profile.role, "usuarios.view")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para ver usuarios internos.",
    );
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("perfiles")
      .select(
        "id, full_name, role, phone, avatar_url, is_active, created_at, updated_at",
      )
      .eq("id", userId)
      .maybeSingle<InternalUserDetail>();

    if (error) {
      console.error("Error loading internal user detail", error);

      return serviceFailure("error", GENERIC_DETAIL_ERROR);
    }

    if (!data) {
      return serviceFailure("not_found", "El usuario solicitado no existe.");
    }

    return serviceSuccess({ user: data });
  } catch (error) {
    console.error("Unexpected error loading internal user detail", error);

    return serviceFailure("error", GENERIC_DETAIL_ERROR);
  }
}
