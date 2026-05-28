import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import {
  validateUserInput,
  type UpdateUserInput,
  type UserFieldErrors,
} from "./user-validation";

type EditableUserProfile = Pick<
  Tables<"profiles">,
  "id" | "full_name" | "role" | "phone" | "avatar_url" | "is_active"
>;

export type UpdateInternalUserInput = UpdateUserInput & {
  id?: string | null;
};

export type UpdateInternalUserResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      reason:
        | "unauthorized"
        | "invalid_id"
        | "not_found"
        | "validation_error"
        | "last_admin_guard"
        | "self_guard"
        | "error";
      message: string;
      fieldErrors?: UserFieldErrors;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const GENERIC_UPDATE_ERROR =
  "No se pudo actualizar el usuario interno. Inténtalo nuevamente.";

async function countActiveAdmins(): Promise<
  | {
      ok: true;
      count: number;
    }
  | {
      ok: false;
    }
> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true);

  if (error || count === null) {
    console.error("Error counting active admins", error);

    return { ok: false };
  }

  return {
    ok: true,
    count,
  };
}

export async function updateInternalUser(
  input: UpdateInternalUserInput,
): Promise<UpdateInternalUserResult> {
  const userId = (input.id ?? "").trim();

  if (!UUID_PATTERN.test(userId)) {
    return {
      ok: false,
      reason: "invalid_id",
      message: "El usuario solicitado no existe.",
    };
  }

  const profile = await getCurrentProfile();

  if (!profile || !hasPermission(profile.role, "usuarios.manage")) {
    return {
      ok: false,
      reason: "unauthorized",
      message: "No tienes permiso para editar usuarios internos.",
    };
  }

  const supabase = await createClient();

  try {
    const { data: currentUser, error: loadError } = await supabase
      .from("profiles")
      .select("id, full_name, role, phone, avatar_url, is_active")
      .eq("id", userId)
      .maybeSingle<EditableUserProfile>();

    if (loadError) {
      console.error("Error loading internal user before update", loadError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_UPDATE_ERROR,
      };
    }

    if (!currentUser) {
      return {
        ok: false,
        reason: "not_found",
        message: "El usuario solicitado no existe.",
      };
    }

    const validation = validateUserInput(input);

    if (!validation.ok) {
      return {
        ok: false,
        reason: "validation_error",
        message: "Revisa los datos del usuario.",
        fieldErrors: validation.fieldErrors,
      };
    }

    const isSelfUpdate = currentUser.id === profile.id;
    const targetIsActiveAdmin =
      currentUser.role === "admin" && currentUser.is_active;
    const targetWillRemainActiveAdmin =
      validation.data.role === "admin" && validation.data.is_active;

    if (isSelfUpdate && !validation.data.is_active) {
      return {
        ok: false,
        reason: "self_guard",
        message: "No puedes desactivar tu propio usuario administrador.",
        fieldErrors: {
          is_active: "Mantén tu propio usuario activo.",
        },
      };
    }

    if (isSelfUpdate && validation.data.role !== "admin") {
      return {
        ok: false,
        reason: "self_guard",
        message: "No puedes quitarte tu propio rol de administrador.",
        fieldErrors: {
          role: "Mantén tu propio rol de administrador.",
        },
      };
    }

    if (targetIsActiveAdmin && !targetWillRemainActiveAdmin) {
      const activeAdmins = await countActiveAdmins();

      if (!activeAdmins.ok) {
        return {
          ok: false,
          reason: "error",
          message: GENERIC_UPDATE_ERROR,
        };
      }

      if (activeAdmins.count <= 1) {
        return {
          ok: false,
          reason: "last_admin_guard",
          message: "Debe existir al menos un administrador activo.",
        };
      }
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: validation.data.full_name,
        phone: validation.data.phone,
        avatar_url: validation.data.avatar_url,
        role: validation.data.role,
        is_active: validation.data.is_active,
      })
      .eq("id", userId)
      .select("id")
      .maybeSingle<Pick<Tables<"profiles">, "id">>();

    if (updateError) {
      console.error("Error updating internal user", updateError);

      return {
        ok: false,
        reason: "error",
        message: GENERIC_UPDATE_ERROR,
      };
    }

    if (!updatedUser) {
      return {
        ok: false,
        reason: "not_found",
        message: "El usuario solicitado no existe.",
      };
    }

    return {
      ok: true,
      userId: updatedUser.id,
    };
  } catch (error) {
    console.error("Unexpected error updating internal user", error);

    return {
      ok: false,
      reason: "error",
      message: GENERIC_UPDATE_ERROR,
    };
  }
}
