import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";

export type InternalUserDetail = Pick<
  Tables<"profiles">,
  | "id"
  | "full_name"
  | "role"
  | "phone"
  | "avatar_url"
  | "is_active"
  | "created_at"
  | "updated_at"
>;

export type GetInternalUserByIdResult =
  | {
      ok: true;
      user: InternalUserDetail;
    }
  | {
      ok: false;
      reason: "unauthorized" | "invalid_id" | "not_found" | "error";
      message: string;
    };

const GENERIC_DETAIL_ERROR =
  "No se pudo cargar el usuario interno. Inténtalo nuevamente.";

export async function getInternalUserById(
  id: string,
): Promise<GetInternalUserByIdResult> {
  const userId = id.trim();

  if (!isValidUuid(userId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "El usuario solicitado no existe.",
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "usuarios.view")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para ver usuarios internos.",
    };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, role, phone, avatar_url, is_active, created_at, updated_at",
      )
      .eq("id", userId)
      .maybeSingle<InternalUserDetail>();

    if (error) {
      console.error("Error loading internal user detail", error);

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
        message: "El usuario solicitado no existe.",
      };
    }

    return {
      ok: true,
      user: data,
    };
  } catch (error) {
    console.error("Unexpected error loading internal user detail", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_DETAIL_ERROR,
    };
  }
}
