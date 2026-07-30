import "server-only";

import { getCurrentProfile } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/permissions/permissions";
import {
  serviceFailure,
  serviceSuccess,
  type ServiceResult,
} from "@/lib/service-results";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidUuid } from "@/lib/validators";
import type { Tables } from "@/types/database";
import {
  validateCreateInternalUserInput,
  type CreateInternalUserData,
  type CreateInternalUserFieldErrors,
  type CreateInternalUserInput as CreateInternalUserValidationInput,
} from "./user-validation";

export type CreateInternalUserInput = CreateInternalUserValidationInput;

export type CreateInternalUserErrorReason =
  | "unauthorized"
  | "forbidden"
  | "onboarding_required"
  | "validation_error"
  | "already_exists"
  | "rate_limited"
  | "configuration_error"
  | "provisioning_error"
  | "auth_error"
  | "error";

export type CreateInternalUserResult = ServiceResult<
  { userId: string },
  CreateInternalUserErrorReason,
  Record<never, never>,
  CreateInternalUserFieldErrors
>;

type SanitizedAuthError = {
  context: string;
  name?: string;
  code?: string;
  status?: number;
};

type AuthErrorLike = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
};

type ProvisionedProfile = Pick<
  Tables<"perfiles">,
  | "id"
  | "full_name"
  | "phone"
  | "avatar_url"
  | "role"
  | "is_active"
  | "must_change_password"
  | "created_by"
>;

const GENERIC_CREATE_ERROR =
  "No se pudo crear el usuario interno. Intentalo nuevamente.";
const PROVISIONING_CREATE_ERROR =
  "No se pudo completar la creacion del usuario interno.";
const MANAGE_USERS_ERROR =
  "No tienes permiso para crear usuarios internos.";
const AUTH_DUPLICATE_CODES = new Set([
  "email_exists",
  "user_already_exists",
  "identity_already_exists",
  "conflict",
]);
const AUTH_RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
]);

function getAuthErrorCode(error: AuthErrorLike): string | undefined {
  return typeof error.code === "string" ? error.code : undefined;
}

function getAuthErrorStatus(error: AuthErrorLike): number | undefined {
  return typeof error.status === "number" ? error.status : undefined;
}

function toSanitizedAuthError(
  context: string,
  error: AuthErrorLike,
): SanitizedAuthError {
  return {
    context,
    name: typeof error.name === "string" ? error.name : undefined,
    code: getAuthErrorCode(error),
    status: getAuthErrorStatus(error),
  };
}

function logSanitizedAuthError(context: string, error: AuthErrorLike): void {
  console.error("Supabase Auth admin error", toSanitizedAuthError(context, error));
}

function logSanitizedProvisioningError(
  context: string,
  error: AuthErrorLike,
): void {
  console.error(
    "Internal user provisioning error",
    toSanitizedAuthError(context, error),
  );
}

function profileMatchesProvisioning(
  profile: ProvisionedProfile,
  userId: string,
  data: CreateInternalUserData,
  createdBy: string,
): boolean {
  return (
    profile.id === userId &&
    profile.full_name === data.full_name &&
    profile.phone === data.phone &&
    profile.avatar_url === data.avatar_url &&
    profile.role === data.role &&
    profile.is_active === true &&
    profile.must_change_password === true &&
    profile.created_by === createdBy
  );
}

async function verifyProvisionedProfile(
  userId: string,
  data: CreateInternalUserData,
  createdBy: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("perfiles")
    .select(
      "id, full_name, phone, avatar_url, role, is_active, must_change_password, created_by",
    )
    .eq("id", userId)
    .maybeSingle<ProvisionedProfile>();

  if (error) {
    logSanitizedProvisioningError("createInternalUser.profileVerification", {
      name: "PostgrestError",
      code: error.code,
    });

    return false;
  }

  if (!profile) {
    logSanitizedProvisioningError("createInternalUser.profileVerification", {
      name: "ProvisionedProfileMissing",
    });

    return false;
  }

  if (!profileMatchesProvisioning(profile, userId, data, createdBy)) {
    logSanitizedProvisioningError("createInternalUser.profileVerification", {
      name: "ProvisionedProfileMismatch",
    });

    return false;
  }

  return true;
}

async function compensateCreatedAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
      logSanitizedProvisioningError(
        "createInternalUser.compensation.deleteUser",
        error,
      );
    }
  } catch {
    logSanitizedProvisioningError(
      "createInternalUser.compensation.deleteUser",
      {
        name: "UnexpectedDeleteUserError",
      },
    );
  }
}

function mapCreateUserAuthError(
  error: AuthErrorLike,
): Extract<CreateInternalUserResult, { ok: false }> {
  const code = getAuthErrorCode(error);
  const status = getAuthErrorStatus(error);

  if (code && AUTH_DUPLICATE_CODES.has(code)) {
    return serviceFailure("already_exists", "Ya existe un usuario con ese correo.", {
      fieldErrors: {
        email: "Ya existe un usuario con ese correo.",
      },
    });
  }

  if (code === "weak_password") {
    return serviceFailure(
      "validation_error",
      "La contrasena temporal no cumple los requisitos de seguridad.",
      {
        fieldErrors: {
          password:
            "La contrasena temporal no cumple los requisitos de seguridad.",
        },
      },
    );
  }

  if ((code && AUTH_RATE_LIMIT_CODES.has(code)) || status === 429) {
    return serviceFailure(
      "rate_limited",
      "Se alcanzaron los limites temporales de Auth. Intentalo mas tarde.",
    );
  }

  logSanitizedAuthError("createInternalUser.auth.admin.createUser", error);

  return serviceFailure("auth_error", GENERIC_CREATE_ERROR);
}

export async function createInternalUser(
  input: CreateInternalUserInput,
): Promise<CreateInternalUserResult> {
  const currentProfile = await getCurrentProfile();

  if (!currentProfile) {
    return serviceFailure("unauthorized", MANAGE_USERS_ERROR);
  }

  if (currentProfile.must_change_password) {
    return serviceFailure(
      "onboarding_required",
      "Completa el cambio de contrasena inicial antes de crear usuarios.",
    );
  }

  if (!hasPermission(currentProfile.role, "usuarios.manage")) {
    return serviceFailure("forbidden", MANAGE_USERS_ERROR);
  }

  const validation = validateCreateInternalUserInput(input);

  if (!validation.ok) {
    return serviceFailure("validation_error", "Revisa los datos del usuario.", {
      fieldErrors: validation.fieldErrors,
    });
  }

  let admin: ReturnType<typeof createAdminClient>;
  let createdUserId: string | null = null;

  try {
    admin = createAdminClient();
  } catch {
    return serviceFailure(
      "configuration_error",
      "El cliente administrativo de usuarios no esta configurado.",
    );
  }

  try {
    const { data, error } = await admin.auth.admin.createUser({
      email: validation.data.email,
      password: validation.data.password,
      email_confirm: true,
      app_metadata: {
        godel_provisioning: {
          version: 1,
          source: "admin_dashboard",
          full_name: validation.data.full_name,
          phone: validation.data.phone,
          avatar_url: validation.data.avatar_url,
          role: validation.data.role,
          created_by: currentProfile.id,
        },
      },
    });

    if (error) {
      return mapCreateUserAuthError(error);
    }

    if (!data.user?.id || !isValidUuid(data.user.id)) {
      logSanitizedAuthError("createInternalUser.auth.admin.invalidResponse", {
        name: "InvalidAuthAdminResponse",
      });

      return serviceFailure("auth_error", GENERIC_CREATE_ERROR);
    }

    createdUserId = data.user.id;

    const profileWasProvisioned = await verifyProvisionedProfile(
      createdUserId,
      validation.data,
      currentProfile.id,
    );

    if (!profileWasProvisioned) {
      await compensateCreatedAuthUser(admin, createdUserId);

      return serviceFailure("provisioning_error", PROVISIONING_CREATE_ERROR);
    }

    return serviceSuccess({ userId: createdUserId });
  } catch {
    if (createdUserId) {
      await compensateCreatedAuthUser(admin, createdUserId);

      return serviceFailure("provisioning_error", PROVISIONING_CREATE_ERROR);
    }

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }
}
