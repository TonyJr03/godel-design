import "server-only";

import type { AuthError } from "@supabase/supabase-js";

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

import {
  validateResetInternalUserPasswordInput,
  type ResetInternalUserPasswordFieldErrors,
  type ResetInternalUserPasswordInput as ResetInternalUserPasswordValidationInput,
} from "./reset-internal-user-password-validation";

export type ResetInternalUserPasswordInput =
  ResetInternalUserPasswordValidationInput & {
    id?: string | null;
  };

export type ResetInternalUserPasswordFailureReason =
  | "unauthorized"
  | "forbidden"
  | "onboarding_required"
  | "self_reset_forbidden"
  | "validation_error"
  | "not_found"
  | "already_in_progress"
  | "rate_limited"
  | "configuration_error"
  | "auth_user_not_found"
  | "auth_error"
  | "rollback_error"
  | "completion_error"
  | "error";

export type ResetInternalUserPasswordResult = ServiceResult<
  {
    userId: string;
    wasActive: boolean;
  },
  ResetInternalUserPasswordFailureReason,
  { passwordChanged?: boolean },
  ResetInternalUserPasswordFieldErrors
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
  message?: unknown;
};

type BeginPasswordResetAttempt =
  | {
      ok: true;
      allowed: true;
      attemptId: string;
      previousIsActive: boolean;
      previousMustChangePassword: boolean;
    }
  | {
      ok: true;
      allowed: false;
      attemptId: string;
      limitedScope: "actor" | "target" | "global" | null;
      previousIsActive: boolean;
      previousMustChangePassword: boolean;
    }
  | {
      ok: false;
      reason: "not_found" | "already_in_progress" | "auth_error" | "error";
    };

type PasswordResetTerminalStatus =
  | "succeeded"
  | "failed"
  | "attention_required";

type PasswordResetErrorCode =
  | "email_password_match"
  | "auth_user_not_found"
  | "weak_password"
  | "auth_rate_limited"
  | "configuration_error"
  | "auth_error"
  | "unexpected_error"
  | "finalization_failed"
  | "rollback_failed";

type MappedAuthFailure = {
  result: Extract<ResetInternalUserPasswordResult, { ok: false }>;
  auditErrorCode: PasswordResetErrorCode;
};

const RESET_FORBIDDEN_MESSAGE =
  "No tienes permiso para restablecer contraseñas de usuarios internos.";
const GENERIC_RESET_ERROR =
  "No se pudo restablecer la contraseña temporal. Inténtalo nuevamente.";
const RATE_LIMIT_RESET_ERROR =
  "Se alcanzó el límite temporal de restablecimientos. Inténtalo más tarde.";
const ROLLBACK_ERROR_MESSAGE =
  "No se pudo restablecer la contraseña temporal y el usuario quedó bloqueado preventivamente. Requiere revisión administrativa.";
const COMPLETION_ERROR_MESSAGE =
  "La contraseña temporal se actualizó, pero el usuario quedó bloqueado para proteger su acceso. No repitas la operación. Requiere revisión administrativa.";
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

function getErrorMessage(error: ErrorLike): string {
  return typeof error.message === "string" ? error.message : "";
}

function normalizeErrorToken(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function toSanitizedError(context: string, error: ErrorLike): SanitizedError {
  return {
    context,
    name: typeof error.name === "string" ? error.name : undefined,
    code: getErrorCode(error),
    status: getErrorStatus(error),
  };
}

function logSanitizedResetError(context: string, error: ErrorLike): void {
  console.error(
    "Internal user password reset error",
    toSanitizedError(context, error),
  );
}

function isRateLimitError(error: ErrorLike): boolean {
  const code = normalizeErrorToken(getErrorCode(error));

  return error.status === 429 || AUTH_RATE_LIMIT_CODES.has(code);
}

function isWeakPasswordError(error: ErrorLike): boolean {
  const code = normalizeErrorToken(getErrorCode(error));
  const message = normalizeErrorToken(getErrorMessage(error));

  return code === "weak_password" || message.includes("weak");
}

function isAuthUserNotFoundError(error: ErrorLike): boolean {
  const code = normalizeErrorToken(getErrorCode(error));
  const message = normalizeErrorToken(getErrorMessage(error));

  return (
    code === "user_not_found" ||
    code === "not_found" ||
    error.status === 404 ||
    message.includes("user not found")
  );
}

function mapBeginPasswordResetError(error: ErrorLike): BeginPasswordResetAttempt {
  const code = normalizeErrorToken(getErrorCode(error));
  const message = normalizeErrorToken(getErrorMessage(error));

  if (message === "reset_in_progress") {
    return { ok: false, reason: "already_in_progress" };
  }

  if (code === "p0002") {
    return { ok: false, reason: "not_found" };
  }

  if (code === "42501") {
    return { ok: false, reason: "auth_error" };
  }

  logSanitizedResetError("resetInternalUserPassword.audit.begin", error);

  return { ok: false, reason: "error" };
}

function mapAuthFailure(error: AuthError): MappedAuthFailure {
  if (isAuthUserNotFoundError(error)) {
    return {
      result: serviceFailure(
        "auth_user_not_found",
        "No existe el usuario de autenticación asociado.",
      ),
      auditErrorCode: "auth_user_not_found",
    };
  }

  if (isWeakPasswordError(error)) {
    return {
      result: serviceFailure(
        "validation_error",
        "La contraseña temporal no cumple los requisitos de seguridad.",
        {
          fieldErrors: {
            password:
              "La contraseña temporal no cumple los requisitos de seguridad.",
          },
        },
      ),
      auditErrorCode: "weak_password",
    };
  }

  if (isRateLimitError(error)) {
    return {
      result: serviceFailure("rate_limited", RATE_LIMIT_RESET_ERROR),
      auditErrorCode: "auth_rate_limited",
    };
  }

  logSanitizedResetError("resetInternalUserPassword.auth.admin", error);

  return {
    result: serviceFailure("auth_error", GENERIC_RESET_ERROR),
    auditErrorCode: "auth_error",
  };
}

async function beginPasswordResetAttempt(
  supabase: SupabaseServerClient,
  targetId: string,
): Promise<BeginPasswordResetAttempt> {
  const { data, error } = await supabase.rpc(
    "begin_internal_user_password_reset",
    {
      p_target_profile_id: targetId,
    },
  );

  if (error) {
    return mapBeginPasswordResetError(error);
  }

  const attempt = data?.[0];

  if (!attempt?.attempt_id) {
    logSanitizedResetError("resetInternalUserPassword.audit.begin", {
      name: "InvalidPasswordResetBeginResponse",
    });

    return { ok: false, reason: "error" };
  }

  if (attempt.allowed) {
    return {
      ok: true,
      allowed: true,
      attemptId: attempt.attempt_id,
      previousIsActive: attempt.previous_is_active,
      previousMustChangePassword: attempt.previous_must_change_password,
    };
  }

  return {
    ok: true,
    allowed: false,
    attemptId: attempt.attempt_id,
    limitedScope:
      attempt.limited_scope === "actor" ||
      attempt.limited_scope === "target" ||
      attempt.limited_scope === "global"
        ? attempt.limited_scope
        : null,
    previousIsActive: attempt.previous_is_active,
    previousMustChangePassword: attempt.previous_must_change_password,
  };
}

async function completePasswordResetAttempt(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    status: PasswordResetTerminalStatus;
    errorCode: PasswordResetErrorCode | null;
  },
): Promise<boolean> {
  const args: {
    p_attempt_id: string;
    p_status: string;
    p_error_code?: string;
  } = {
    p_attempt_id: input.attemptId,
    p_status: input.status,
  };

  if (input.errorCode) {
    args.p_error_code = input.errorCode;
  }

  try {
    const { error } = await supabase.rpc(
      "complete_internal_user_password_reset",
      args,
    );

    if (error) {
      logSanitizedResetError("resetInternalUserPassword.audit.complete", {
        name: "PostgrestError",
        code: error.code,
      });

      return false;
    }
  } catch (error) {
    logSanitizedResetError("resetInternalUserPassword.audit.complete", {
      name: error instanceof Error ? error.name : "UnexpectedAuditError",
    });

    return false;
  }

  return true;
}

async function completePasswordResetWithRetry(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    status: PasswordResetTerminalStatus;
    errorCode: PasswordResetErrorCode | null;
  },
): Promise<boolean> {
  const firstAttemptOk = await completePasswordResetAttempt(supabase, input);

  if (firstAttemptOk) {
    return true;
  }

  return completePasswordResetAttempt(supabase, input);
}

async function hasProfileState(
  supabase: SupabaseServerClient,
  targetId: string,
  expected: {
    isActive: boolean;
    mustChangePassword: boolean;
  },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("is_active, must_change_password")
    .eq("id", targetId)
    .maybeSingle<{
      is_active: boolean | null;
      must_change_password: boolean | null;
    }>();

  if (error) {
    logSanitizedResetError("resetInternalUserPassword.profile.confirm", {
      name: "PostgrestError",
      code: error.code,
    });

    return false;
  }

  return (
    data?.is_active === expected.isActive &&
    data.must_change_password === expected.mustChangePassword
  );
}

async function markAttentionRequired(
  supabase: SupabaseServerClient,
  attemptId: string,
  errorCode: Extract<
    PasswordResetErrorCode,
    "finalization_failed" | "rollback_failed"
  >,
): Promise<void> {
  await completePasswordResetWithRetry(supabase, {
    attemptId,
    status: "attention_required",
    errorCode,
  });
}

async function returnFailureAfterRollback(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    targetId: string;
    previousIsActive: boolean;
    previousMustChangePassword: boolean;
    failure: MappedAuthFailure;
  },
): Promise<ResetInternalUserPasswordResult> {
  const rollbackOk = await completePasswordResetWithRetry(supabase, {
    attemptId: input.attemptId,
    status: "failed",
    errorCode: input.failure.auditErrorCode,
  });

  if (
    rollbackOk ||
    (await hasProfileState(supabase, input.targetId, {
      isActive: input.previousIsActive,
      mustChangePassword: input.previousMustChangePassword,
    }))
  ) {
    return input.failure.result;
  }

  await markAttentionRequired(supabase, input.attemptId, "rollback_failed");

  return serviceFailure("rollback_error", ROLLBACK_ERROR_MESSAGE, {
    passwordChanged: false,
  });
}

export async function resetInternalUserPassword(
  input: ResetInternalUserPasswordInput,
): Promise<ResetInternalUserPasswordResult> {
  const currentProfile = await getCurrentProfile();

  if (!currentProfile) {
    return serviceFailure("unauthorized", RESET_FORBIDDEN_MESSAGE);
  }

  if (currentProfile.must_change_password) {
    return serviceFailure(
      "onboarding_required",
      "Completa el cambio de contraseña inicial antes de restablecer contraseñas.",
    );
  }

  if (!hasPermission(currentProfile.role, "usuarios.manage")) {
    return serviceFailure("forbidden", RESET_FORBIDDEN_MESSAGE);
  }

  const targetId = (input.id ?? "").trim();

  if (!isValidUuid(targetId)) {
    return serviceFailure("not_found", "El usuario solicitado no existe.");
  }

  if (targetId === currentProfile.id) {
    return serviceFailure(
      "self_reset_forbidden",
      "No puedes restablecer tu propia contraseña.",
    );
  }

  const validation = validateResetInternalUserPasswordInput(input);

  if (!validation.ok) {
    return serviceFailure(
      "validation_error",
      "Revisa los datos del formulario.",
      {
        fieldErrors: validation.fieldErrors,
      },
    );
  }

  const supabase = await createClient();
  const auditAttempt = await beginPasswordResetAttempt(supabase, targetId);

  if (!auditAttempt.ok) {
    if (auditAttempt.reason === "not_found") {
      return serviceFailure("not_found", "El usuario solicitado no existe.");
    }

    if (auditAttempt.reason === "already_in_progress") {
      return serviceFailure(
        "already_in_progress",
        "Ya existe un restablecimiento de contraseña en curso para este usuario.",
      );
    }

    return serviceFailure("error", GENERIC_RESET_ERROR);
  }

  if (!auditAttempt.allowed) {
    return serviceFailure("rate_limited", RATE_LIMIT_RESET_ERROR);
  }

  let admin: ReturnType<typeof createAdminClient>;

  try {
    admin = createAdminClient();
  } catch {
    const failure: MappedAuthFailure = {
      result: serviceFailure(
        "configuration_error",
        "El cliente administrativo de usuarios no está configurado.",
      ),
      auditErrorCode: "configuration_error",
    };

    return returnFailureAfterRollback(supabase, {
      attemptId: auditAttempt.attemptId,
      targetId,
      previousIsActive: auditAttempt.previousIsActive,
      previousMustChangePassword: auditAttempt.previousMustChangePassword,
      failure,
    });
  }

  let passwordChanged = false;

  try {
    const { data: authUserData, error: getUserError } =
      await admin.auth.admin.getUserById(targetId);

    if (getUserError) {
      return returnFailureAfterRollback(supabase, {
        attemptId: auditAttempt.attemptId,
        targetId,
        previousIsActive: auditAttempt.previousIsActive,
        previousMustChangePassword: auditAttempt.previousMustChangePassword,
        failure: mapAuthFailure(getUserError),
      });
    }

    const authUser = authUserData.user;

    if (!authUser) {
      return returnFailureAfterRollback(supabase, {
        attemptId: auditAttempt.attemptId,
        targetId,
        previousIsActive: auditAttempt.previousIsActive,
        previousMustChangePassword: auditAttempt.previousMustChangePassword,
        failure: {
          result: serviceFailure(
            "auth_user_not_found",
            "No existe el usuario de autenticación asociado.",
          ),
          auditErrorCode: "auth_user_not_found",
        },
      });
    }

    if (
      authUser.email &&
      validation.data.password.toLowerCase() === authUser.email.toLowerCase()
    ) {
      return returnFailureAfterRollback(supabase, {
        attemptId: auditAttempt.attemptId,
        targetId,
        previousIsActive: auditAttempt.previousIsActive,
        previousMustChangePassword: auditAttempt.previousMustChangePassword,
        failure: {
          result: serviceFailure(
            "validation_error",
            "Revisa los datos del formulario.",
            {
              fieldErrors: {
                password:
                  "La contraseña temporal no puede ser igual al correo.",
              },
            },
          ),
          auditErrorCode: "email_password_match",
        },
      });
    }

    const { error: updateUserError } = await admin.auth.admin.updateUserById(
      targetId,
      {
        password: validation.data.password,
      },
    );

    if (updateUserError) {
      return returnFailureAfterRollback(supabase, {
        attemptId: auditAttempt.attemptId,
        targetId,
        previousIsActive: auditAttempt.previousIsActive,
        previousMustChangePassword: auditAttempt.previousMustChangePassword,
        failure: mapAuthFailure(updateUserError),
      });
    }

    passwordChanged = true;

    const finalizationOk = await completePasswordResetWithRetry(supabase, {
      attemptId: auditAttempt.attemptId,
      status: "succeeded",
      errorCode: null,
    });

    const expectedFinalStateOk = await hasProfileState(supabase, targetId, {
      isActive: auditAttempt.previousIsActive,
      mustChangePassword: true,
    });

    if (finalizationOk || expectedFinalStateOk) {
      return serviceSuccess({
        userId: targetId,
        wasActive: auditAttempt.previousIsActive,
      });
    }

    await markAttentionRequired(
      supabase,
      auditAttempt.attemptId,
      "finalization_failed",
    );

    return serviceFailure("completion_error", COMPLETION_ERROR_MESSAGE, {
      passwordChanged: true,
    });
  } catch (error) {
    logSanitizedResetError("resetInternalUserPassword.unexpected", {
      name: error instanceof Error ? error.name : "UnexpectedResetError",
    });

    if (passwordChanged) {
      await markAttentionRequired(
        supabase,
        auditAttempt.attemptId,
        "finalization_failed",
      );

      return serviceFailure("completion_error", COMPLETION_ERROR_MESSAGE, {
        passwordChanged: true,
      });
    }

    const failure: MappedAuthFailure = {
      result: serviceFailure("error", GENERIC_RESET_ERROR),
      auditErrorCode: "unexpected_error",
    };

    return returnFailureAfterRollback(supabase, {
      attemptId: auditAttempt.attemptId,
      targetId,
      previousIsActive: auditAttempt.previousIsActive,
      previousMustChangePassword: auditAttempt.previousMustChangePassword,
      failure,
    });
  }
}
