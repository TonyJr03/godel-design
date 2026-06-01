import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createClient } from "@/lib/supabase/server";
import {
  validateCreateUserProfileInput,
  type CreateUserProfileInput,
  type UserFieldErrors,
} from "./user-validation";

export type CreateInternalUserProfileInput = CreateUserProfileInput;

export type CreateInternalUserProfileErrorReason =
  | "unauthorized"
  | "forbidden"
  | "validation_error"
  | "already_exists"
  | "auth_user_not_found"
  | "error";

export type CreateInternalUserProfileResult = ServiceResult<
  { userId: string },
  CreateInternalUserProfileErrorReason,
  Record<never, never>,
  UserFieldErrors
>;

const POSTGRES_UNIQUE_VIOLATION = "23505";
const POSTGRES_FOREIGN_KEY_VIOLATION = "23503";
const GENERIC_CREATE_ERROR =
  "No se pudo crear el perfil interno. Inténtalo nuevamente.";

export async function createInternalUserProfile(
  input: CreateInternalUserProfileInput,
): Promise<CreateInternalUserProfileResult> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return serviceFailure(
      "unauthorized",
      "No tienes permiso para crear perfiles internos.",
    );
  }

  if (!hasPermission(profile.role, "usuarios.manage")) {
    return serviceFailure(
      "forbidden",
      "No tienes permiso para crear perfiles internos.",
    );
  }

  const validation = validateCreateUserProfileInput(input);

  if (!validation.ok) {
    return serviceFailure("validation_error", "Revisa los datos del perfil interno.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from("perfiles")
      .insert({
        id: validation.data.id,
        full_name: validation.data.full_name,
        phone: validation.data.phone,
        avatar_url: validation.data.avatar_url,
        role: validation.data.role,
        is_active: validation.data.is_active,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === POSTGRES_UNIQUE_VIOLATION) {
        return serviceFailure("already_exists", "Ya existe un perfil interno para ese UUID.", {
          fieldErrors: {
            id: "Este usuario ya tiene perfil interno.",
          },
        });
      }

      if (error.code === POSTGRES_FOREIGN_KEY_VIOLATION) {
        return serviceFailure("auth_user_not_found", "No existe un usuario Auth con ese UUID. Créalo primero en Supabase Auth.", {
          fieldErrors: {
            id: "No se encontró un usuario Auth con este UUID.",
          },
        });
      }

      console.error("Error creating internal user profile", error);

      return serviceFailure("error", GENERIC_CREATE_ERROR);
    }

    if (!data) {
      return serviceFailure("error", GENERIC_CREATE_ERROR);
    }

    return serviceSuccess({ userId: data.id });
  } catch (error) {
    console.error("Unexpected error creating internal user profile", error);

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }
}
