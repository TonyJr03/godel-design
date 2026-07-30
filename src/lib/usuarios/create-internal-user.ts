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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type SanitizedError = {
  context: string;
  name?: string;
  code?: string;
  status?: number;
};

type ErrorLike = {
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

type BeginCreationAttemptResult =
  | {
      ok: true;
      allowed: true;
      attemptId: string;
    }
  | {
      ok: true;
      allowed: false;
      attemptId: string;
    }
  | {
      ok: false;
    };

type AuditTerminalStatus = "succeeded" | "failed" | "compensation_failed";

type AuditErrorCode =
  | "already_exists"
  | "weak_password"
  | "auth_rate_limited"
  | "configuration_error"
  | "auth_error"
  | "invalid_auth_response"
  | "provisioning_error"
  | "unexpected_error"
  | "provisioning_compensation_failed";

type MappedAuthFailure = Extract<CreateInternalUserResult, { ok: false }> & {
  auditErrorCode: AuditErrorCode;
};

const GENERIC_CREATE_ERROR =
  "No se pudo crear el usuario interno. Intentalo nuevamente.";
const PROVISIONING_CREATE_ERROR =
  "No se pudo completar la creacion del usuario interno.";
const MANAGE_USERS_ERROR =
  "No tienes permiso para crear usuarios internos.";
const RATE_LIMIT_CREATE_ERROR =
  "Se alcanzo el limite temporal de creacion de usuarios. Intentalo mas tarde.";
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

function getErrorCode(error: ErrorLike): string | undefined {
  return typeof error.code === "string" ? error.code : undefined;
}

function getErrorStatus(error: ErrorLike): number | undefined {
  return typeof error.status === "number" ? error.status : undefined;
}

function toSanitizedError(context: string, error: ErrorLike): SanitizedError {
  return {
    context,
    name: typeof error.name === "string" ? error.name : undefined,
    code: getErrorCode(error),
    status: getErrorStatus(error),
  };
}

function logSanitizedAuthError(context: string, error: ErrorLike): void {
  console.error("Supabase Auth admin error", toSanitizedError(context, error));
}

function logSanitizedAuditError(context: string, error: ErrorLike): void {
  console.error(
    "Internal user creation audit error",
    toSanitizedError(context, error),
  );
}

function logSanitizedProvisioningError(
  context: string,
  error: ErrorLike,
): void {
  console.error(
    "Internal user provisioning error",
    toSanitizedError(context, error),
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
  supabase: SupabaseServerClient,
  userId: string,
  data: CreateInternalUserData,
  createdBy: string,
): Promise<boolean> {
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
): Promise<boolean> {
  try {
    const { error } = await admin.auth.admin.deleteUser(userId);

    if (error) {
      logSanitizedProvisioningError(
        "createInternalUser.compensation.deleteUser",
        error,
      );

      return false;
    }

    return true;
  } catch {
    logSanitizedProvisioningError(
      "createInternalUser.compensation.deleteUser",
      {
        name: "UnexpectedDeleteUserError",
      },
    );

    return false;
  }
}

async function beginCreationAttempt(
  supabase: SupabaseServerClient,
  targetRole: CreateInternalUserData["role"],
): Promise<BeginCreationAttemptResult> {
  const { data, error } = await supabase.rpc(
    "begin_internal_user_creation_attempt",
    {
      p_target_role: targetRole,
    },
  );

  if (error) {
    logSanitizedAuditError("createInternalUser.audit.begin", {
      name: "PostgrestError",
      code: error.code,
    });

    return { ok: false };
  }

  const attempt = data?.[0];

  if (!attempt?.attempt_id) {
    logSanitizedAuditError("createInternalUser.audit.begin", {
      name: "InvalidAuditBeginResponse",
    });

    return { ok: false };
  }

  return {
    ok: true,
    allowed: attempt.allowed,
    attemptId: attempt.attempt_id,
  };
}

async function completeCreationAttempt(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    status: AuditTerminalStatus;
    errorCode: AuditErrorCode | null;
    targetAuthUserId: string | null;
  },
): Promise<boolean> {
  const args: {
    p_attempt_id: string;
    p_status: string;
    p_error_code?: string;
    p_target_auth_user_id?: string;
  } = {
    p_attempt_id: input.attemptId,
    p_status: input.status,
  };

  if (input.errorCode) {
    args.p_error_code = input.errorCode;
  }

  if (input.targetAuthUserId) {
    args.p_target_auth_user_id = input.targetAuthUserId;
  }

  try {
    const { error } = await supabase.rpc(
      "complete_internal_user_creation_attempt",
      args,
    );

    if (error) {
      logSanitizedAuditError("createInternalUser.audit.complete", {
        name: "PostgrestError",
        code: error.code,
      });

      return false;
    }
  } catch (error) {
    logSanitizedAuditError("createInternalUser.audit.complete", {
      name: error instanceof Error ? error.name : "UnexpectedAuditError",
    });

    return false;
  }

  return true;
}

async function finalizeFailedAttempt(
  supabase: SupabaseServerClient,
  attemptId: string,
  errorCode: AuditErrorCode,
  targetAuthUserId: string | null,
): Promise<void> {
  await completeCreationAttempt(supabase, {
    attemptId,
    status: "failed",
    errorCode,
    targetAuthUserId,
  });
}

async function finalizeProvisioningFailure(
  supabase: SupabaseServerClient,
  attemptId: string,
  compensationSucceeded: boolean,
  targetAuthUserId: string,
): Promise<void> {
  if (compensationSucceeded) {
    await finalizeFailedAttempt(
      supabase,
      attemptId,
      "provisioning_error",
      targetAuthUserId,
    );

    return;
  }

  await completeCreationAttempt(supabase, {
    attemptId,
    status: "compensation_failed",
    errorCode: "provisioning_compensation_failed",
    targetAuthUserId,
  });
}

function mapCreateUserAuthError(error: ErrorLike): MappedAuthFailure {
  const code = getErrorCode(error);
  const status = getErrorStatus(error);

  if (code && AUTH_DUPLICATE_CODES.has(code)) {
    return {
      ...serviceFailure("already_exists", "Ya existe un usuario con ese correo.", {
        fieldErrors: {
          email: "Ya existe un usuario con ese correo.",
        },
      }),
      auditErrorCode: "already_exists",
    };
  }

  if (code === "weak_password") {
    return {
      ...serviceFailure(
        "validation_error",
        "La contrasena temporal no cumple los requisitos de seguridad.",
        {
          fieldErrors: {
            password:
              "La contrasena temporal no cumple los requisitos de seguridad.",
          },
        },
      ),
      auditErrorCode: "weak_password",
    };
  }

  if ((code && AUTH_RATE_LIMIT_CODES.has(code)) || status === 429) {
    return {
      ...serviceFailure("rate_limited", RATE_LIMIT_CREATE_ERROR),
      auditErrorCode: "auth_rate_limited",
    };
  }

  logSanitizedAuthError("createInternalUser.auth.admin.createUser", error);

  return {
    ...serviceFailure("auth_error", GENERIC_CREATE_ERROR),
    auditErrorCode: "auth_error",
  };
}

function withoutAuditCode(
  failure: MappedAuthFailure,
): Extract<CreateInternalUserResult, { ok: false }> {
  const { auditErrorCode, ...result } = failure;
  void auditErrorCode;

  return result;
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

  const supabase = await createClient();
  const auditAttempt = await beginCreationAttempt(
    supabase,
    validation.data.role,
  );

  if (!auditAttempt.ok) {
    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }

  if (!auditAttempt.allowed) {
    return serviceFailure("rate_limited", RATE_LIMIT_CREATE_ERROR);
  }

  let admin: ReturnType<typeof createAdminClient>;
  let createdUserId: string | null = null;

  try {
    admin = createAdminClient();
  } catch {
    await finalizeFailedAttempt(
      supabase,
      auditAttempt.attemptId,
      "configuration_error",
      null,
    );

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
      const failure = mapCreateUserAuthError(error);

      await finalizeFailedAttempt(
        supabase,
        auditAttempt.attemptId,
        failure.auditErrorCode,
        null,
      );

      return withoutAuditCode(failure);
    }

    if (!data.user?.id || !isValidUuid(data.user.id)) {
      logSanitizedAuthError("createInternalUser.auth.admin.invalidResponse", {
        name: "InvalidAuthAdminResponse",
      });

      await finalizeFailedAttempt(
        supabase,
        auditAttempt.attemptId,
        "invalid_auth_response",
        null,
      );

      return serviceFailure("auth_error", GENERIC_CREATE_ERROR);
    }

    createdUserId = data.user.id;

    const profileWasProvisioned = await verifyProvisionedProfile(
      supabase,
      createdUserId,
      validation.data,
      currentProfile.id,
    );

    if (!profileWasProvisioned) {
      const compensationSucceeded = await compensateCreatedAuthUser(
        admin,
        createdUserId,
      );

      await finalizeProvisioningFailure(
        supabase,
        auditAttempt.attemptId,
        compensationSucceeded,
        createdUserId,
      );

      return serviceFailure("provisioning_error", PROVISIONING_CREATE_ERROR);
    }

    await completeCreationAttempt(supabase, {
      attemptId: auditAttempt.attemptId,
      status: "succeeded",
      errorCode: null,
      targetAuthUserId: createdUserId,
    });

    return serviceSuccess({ userId: createdUserId });
  } catch {
    if (createdUserId) {
      const compensationSucceeded = await compensateCreatedAuthUser(
        admin,
        createdUserId,
      );

      await finalizeProvisioningFailure(
        supabase,
        auditAttempt.attemptId,
        compensationSucceeded,
        createdUserId,
      );

      return serviceFailure("provisioning_error", PROVISIONING_CREATE_ERROR);
    }

    await finalizeFailedAttempt(
      supabase,
      auditAttempt.attemptId,
      "unexpected_error",
      null,
    );

    return serviceFailure("error", GENERIC_CREATE_ERROR);
  }
}
