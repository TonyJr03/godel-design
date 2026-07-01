import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";
import type { EditableUserProfile } from "./types";
import {
  validateUserInput,
  type UpdateUserInput,
  type UserFieldErrors,
} from "./user-validation";

export type UpdateInternalUserInput = UpdateUserInput & {
  id?: string | null;
};

export type UpdateInternalUserErrorReason =
  | "unauthorized"
  | "forbidden"
  | "invalid_id"
  | "not_found"
  | "validation_error"
  | "last_admin_guard"
  | "self_guard"
  | "error";

export type UpdateInternalUserResult = ServiceResult<
  { userId: string },
  UpdateInternalUserErrorReason,
  Record<never, never>,
  UserFieldErrors
>;

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
    .from("perfiles")
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

  if (!isValidUuid(userId)) {
    return serviceFailure("invalid_id", "El usuario solicitado no existe.");
  }

  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para editar usuarios internos.",
    );
  }

  if (!hasPermission(profile.role, "usuarios.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para editar usuarios internos.",
    );
  }

  const supabase = await createClient();

  try {
    const { data: currentUser, error: loadError } = await supabase
      .from("perfiles")
      .select("id, full_name, role, phone, avatar_url, is_active")
      .eq("id", userId)
      .maybeSingle<EditableUserProfile>();

    if (loadError) {
      console.error("Error loading internal user before update", loadError);

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    if (!currentUser) {
      return serviceFailure("not_found", "El usuario solicitado no existe.");
    }

    const validation = validateUserInput(input);

    if (!validation.ok) {
      return serviceFailure("validation_error", "Revisa los datos del usuario.", {
        fieldErrors: validation.fieldErrors,
      });
    }

    const isSelfUpdate = currentUser.id === profile.id;
    const targetIsActiveAdmin =
      currentUser.role === "admin" && currentUser.is_active;
    const targetWillRemainActiveAdmin =
      validation.data.role === "admin" && validation.data.is_active;

    if (isSelfUpdate && !validation.data.is_active) {
      return serviceFailure("self_guard", "No puedes desactivar tu propio usuario administrador.", {
        fieldErrors: {
          is_active: "Mantén tu propio usuario activo.",
        },
      });
    }

    if (isSelfUpdate && validation.data.role !== "admin") {
      return serviceFailure("self_guard", "No puedes quitarte tu propio rol de administrador.", {
        fieldErrors: {
          role: "Mantén tu propio rol de administrador.",
        },
      });
    }

    if (targetIsActiveAdmin && !targetWillRemainActiveAdmin) {
      const activeAdmins = await countActiveAdmins();

      if (!activeAdmins.ok) {
        return serviceFailure("error", GENERIC_UPDATE_ERROR);
      }

      if (activeAdmins.count <= 1) {
        return serviceFailure(
          "last_admin_guard",
          "Debe existir al menos un administrador activo.",
        );
      }
    }

    const { data: updatedUser, error: updateError } = await supabase
      .from("perfiles")
      .update({
        full_name: validation.data.full_name,
        phone: validation.data.phone,
        avatar_url: validation.data.avatar_url,
        role: validation.data.role,
        is_active: validation.data.is_active,
      })
      .eq("id", userId)
      .select("id")
      .maybeSingle<Pick<Tables<"perfiles">, "id">>();

    if (updateError) {
      console.error("Error updating internal user", updateError);

      return serviceFailure("error", GENERIC_UPDATE_ERROR);
    }

    if (!updatedUser) {
      return serviceFailure("not_found", "El usuario solicitado no existe.");
    }

    return serviceSuccess({ userId: updatedUser.id });
  } catch (error) {
    console.error("Unexpected error updating internal user", error);

    return serviceFailure("error", GENERIC_UPDATE_ERROR);
  }
}
