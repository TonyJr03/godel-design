import "server-only";

import { randomUUID } from "node:crypto";

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
      reason:
        | "not_found"
        | "already_in_progress"
        | "auth_error"
        | "rollback_error"
        | "error";
    };

type PasswordResetAuditStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "rate_limited"
  | "attention_required";

type PasswordResetAuditState = {
  attemptId: string;
  status: PasswordResetAuditStatus;
  targetProfileId: string;
  previousIsActive: boolean;
  previousMustChangePassword: boolean;
  currentIsActive: boolean;
  currentMustChangePassword: boolean;
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

type CompleteAttemptResult =
  | { ok: true; attemptId: string }
  | { ok: false; reason: "not_found" | "conflict" | "error" };

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
const PASSWORD_RESET_AUDIT_STATUSES = new Set<PasswordResetAuditStatus>([
  "pending",
  "succeeded",
  "failed",
  "rate_limited",
  "attention_required",
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

function isPasswordResetAuditStatus(
  status: unknown,
): status is PasswordResetAuditStatus {
  return (
    typeof status === "string" &&
    PASSWORD_RESET_AUDIT_STATUSES.has(status as PasswordResetAuditStatus)
  );
}

function mapLimitedScope(
  scope: unknown,
): "actor" | "target" | "global" | null {
  return scope === "actor" || scope === "target" || scope === "global"
    ? scope
    : null;
}

function isSucceededAuditState(state: PasswordResetAuditState): boolean {
  return (
    state.status === "succeeded" &&
    state.currentIsActive === state.previousIsActive &&
    state.currentMustChangePassword === true
  );
}

function isFailedAuditState(state: PasswordResetAuditState): boolean {
  return (
    state.status === "failed" &&
    state.currentIsActive === state.previousIsActive &&
    state.currentMustChangePassword === state.previousMustChangePassword
  );
}

function isAttentionRequiredAuditState(
  state: PasswordResetAuditState,
): boolean {
  return (
    state.status === "attention_required" &&
    state.currentIsActive === false &&
    state.currentMustChangePassword === true
  );
}

async function getPasswordResetAuditState(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    targetId: string;
  },
): Promise<PasswordResetAuditState | null> {
  try {
    const { data, error } = await supabase.rpc(
      "get_internal_user_password_reset_state",
      {
        p_attempt_id: input.attemptId,
      },
    );

    if (error) {
      logSanitizedResetError("resetInternalUserPassword.audit.state", {
        name: "PostgrestError",
        code: error.code,
      });

      return null;
    }

    const state = data?.[0];

    if (!state) {
      return null;
    }

    if (
      state.attempt_id !== input.attemptId ||
      state.target_profile_id !== input.targetId ||
      !isPasswordResetAuditStatus(state.status) ||
      typeof state.previous_is_active !== "boolean" ||
      typeof state.previous_must_change_password !== "boolean" ||
      typeof state.current_is_active !== "boolean" ||
      typeof state.current_must_change_password !== "boolean"
    ) {
      logSanitizedResetError("resetInternalUserPassword.audit.state", {
        name: "InvalidPasswordResetStateResponse",
      });

      return null;
    }

    return {
      attemptId: state.attempt_id,
      status: state.status,
      targetProfileId: state.target_profile_id,
      previousIsActive: state.previous_is_active,
      previousMustChangePassword: state.previous_must_change_password,
      currentIsActive: state.current_is_active,
      currentMustChangePassword: state.current_must_change_password,
    };
  } catch (error) {
    logSanitizedResetError("resetInternalUserPassword.audit.state", {
      name: error instanceof Error ? error.name : "UnexpectedAuditStateError",
    });

    return null;
  }
}

async function beginPasswordResetOnce(
  supabase: SupabaseServerClient,
  input: {
    targetId: string;
    attemptId: string;
  },
): Promise<BeginPasswordResetAttempt> {
  const { data, error } = await supabase.rpc(
    "begin_internal_user_password_reset",
    {
      p_target_profile_id: input.targetId,
      p_attempt_id: input.attemptId,
    },
  );

  if (error) {
    return mapBeginPasswordResetError(error);
  }

  const attempt = data?.[0];

  if (
    !attempt ||
    attempt.attempt_id !== input.attemptId ||
    typeof attempt.previous_is_active !== "boolean" ||
    typeof attempt.previous_must_change_password !== "boolean"
  ) {
    logSanitizedResetError("resetInternalUserPassword.audit.begin", {
      name: "InvalidPasswordResetBeginResponse",
    });

    return { ok: false, reason: "error" };
  }

  if (attempt.allowed === true) {
    return {
      ok: true,
      allowed: true,
      attemptId: attempt.attempt_id,
      previousIsActive: attempt.previous_is_active,
      previousMustChangePassword: attempt.previous_must_change_password,
    };
  }

  if (attempt.allowed === false) {
    return {
      ok: true,
      allowed: false,
      attemptId: attempt.attempt_id,
      limitedScope: mapLimitedScope(attempt.limited_scope),
      previousIsActive: attempt.previous_is_active,
      previousMustChangePassword: attempt.previous_must_change_password,
    };
  }

  logSanitizedResetError("resetInternalUserPassword.audit.begin", {
    name: "InvalidPasswordResetBeginAllowedFlag",
  });

  return { ok: false, reason: "error" };
}

async function completePasswordResetAttempt(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    status: PasswordResetTerminalStatus;
    errorCode: PasswordResetErrorCode | null;
  },
): Promise<CompleteAttemptResult> {
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
    const { data, error } = await supabase.rpc(
      "complete_internal_user_password_reset",
      args,
    );

    if (error) {
      logSanitizedResetError("resetInternalUserPassword.audit.complete", {
        name: "PostgrestError",
        code: error.code,
      });

      if (normalizeErrorToken(error.code) === "p0002") {
        return { ok: false, reason: "not_found" };
      }

      if (normalizeErrorToken(error.code) === "p0001") {
        return { ok: false, reason: "conflict" };
      }

      return { ok: false, reason: "error" };
    }

    if (data !== input.attemptId) {
      logSanitizedResetError("resetInternalUserPassword.audit.complete", {
        name: "InvalidPasswordResetCompleteResponse",
      });

      return { ok: false, reason: "conflict" };
    }

    return { ok: true, attemptId: data };
  } catch (error) {
    logSanitizedResetError("resetInternalUserPassword.audit.complete", {
      name: error instanceof Error ? error.name : "UnexpectedAuditError",
    });

    return { ok: false, reason: "error" };
  }
}

async function completePasswordResetWithRetry(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    status: PasswordResetTerminalStatus;
    errorCode: PasswordResetErrorCode | null;
  },
): Promise<CompleteAttemptResult> {
  const firstAttempt = await completePasswordResetAttempt(supabase, input);

  if (firstAttempt.ok) {
    return firstAttempt;
  }

  return completePasswordResetAttempt(supabase, input);
}

async function markAttentionRequired(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    targetId: string;
    errorCode: Extract<
      PasswordResetErrorCode,
      "finalization_failed" | "rollback_failed"
    >;
  },
): Promise<boolean> {
  await completePasswordResetWithRetry(supabase, {
    attemptId: input.attemptId,
    status: "attention_required",
    errorCode: input.errorCode,
  });

  const state = await getPasswordResetAuditState(supabase, input);

  if (state && isAttentionRequiredAuditState(state)) {
    return true;
  }

  logSanitizedResetError(
    "resetInternalUserPassword.attention.unconfirmed",
    {
      name: "UnconfirmedAttentionRequiredState",
    },
  );

  return false;
}

async function returnFailureAfterRollback(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    targetId: string;
    failure: MappedAuthFailure;
  },
): Promise<ResetInternalUserPasswordResult> {
  const rollback = await completePasswordResetWithRetry(supabase, {
    attemptId: input.attemptId,
    status: "failed",
    errorCode: input.failure.auditErrorCode,
  });

  if (rollback.ok) {
    return input.failure.result;
  }

  const rollbackState = await getPasswordResetAuditState(supabase, input);

  if (rollbackState && isFailedAuditState(rollbackState)) {
    return input.failure.result;
  }

  await markAttentionRequired(supabase, {
    attemptId: input.attemptId,
    targetId: input.targetId,
    errorCode: "rollback_failed",
  });

  return serviceFailure("rollback_error", ROLLBACK_ERROR_MESSAGE, {
    passwordChanged: false,
  });
}

async function returnCompletionFailure(
  supabase: SupabaseServerClient,
  input: {
    attemptId: string;
    targetId: string;
  },
): Promise<ResetInternalUserPasswordResult> {
  await markAttentionRequired(supabase, {
    ...input,
    errorCode: "finalization_failed",
  });

  return serviceFailure("completion_error", COMPLETION_ERROR_MESSAGE, {
    passwordChanged: true,
  });
}

async function recoverUnconfirmedBegin(
  supabase: SupabaseServerClient,
  input: {
    targetId: string;
    attemptId: string;
  },
): Promise<BeginPasswordResetAttempt> {
  const state = await getPasswordResetAuditState(supabase, input);

  if (!state) {
    return { ok: false, reason: "error" };
  }

  if (state.status === "rate_limited") {
    return {
      ok: true,
      allowed: false,
      attemptId: state.attemptId,
      limitedScope: null,
      previousIsActive: state.previousIsActive,
      previousMustChangePassword: state.previousMustChangePassword,
    };
  }

  if (
    state.status === "pending" &&
    state.currentIsActive === false &&
    state.currentMustChangePassword === true
  ) {
    const rollback = await completePasswordResetWithRetry(supabase, {
      attemptId: input.attemptId,
      status: "failed",
      errorCode: "unexpected_error",
    });

    if (rollback.ok) {
      return { ok: false, reason: "error" };
    }

    const rollbackState = await getPasswordResetAuditState(supabase, input);

    if (rollbackState && isFailedAuditState(rollbackState)) {
      return { ok: false, reason: "error" };
    }

    await markAttentionRequired(supabase, {
      ...input,
      errorCode: "rollback_failed",
    });

    return { ok: false, reason: "rollback_error" };
  }

  return { ok: false, reason: "error" };
}

async function beginPasswordResetAttempt(
  supabase: SupabaseServerClient,
  input: {
    targetId: string;
    attemptId: string;
  },
): Promise<BeginPasswordResetAttempt> {
  let shouldRecover = false;

  for (let index = 0; index < 2; index += 1) {
    try {
      const attempt = await beginPasswordResetOnce(supabase, input);

      if (attempt.ok || attempt.reason !== "error") {
        return attempt;
      }

      shouldRecover = true;
    } catch (error) {
      shouldRecover = true;
      logSanitizedResetError("resetInternalUserPassword.audit.begin", {
        name: error instanceof Error ? error.name : "UnexpectedBeginError",
      });
    }
  }

  if (!shouldRecover) {
    return { ok: false, reason: "error" };
  }

  return recoverUnconfirmedBegin(supabase, input);
}

export async function resetInternalUserPassword(
  input: ResetInternalUserPasswordInput,
): Promise<ResetInternalUserPasswordResult> {
  const attemptId = randomUUID();
  let supabase: SupabaseServerClient | null = null;
  let targetId = "";
  let attemptConfirmed = false;
  let passwordChanged = false;

  try {
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

    targetId = (input.id ?? "").trim();

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

    supabase = await createClient();

    const auditAttempt = await beginPasswordResetAttempt(supabase, {
      targetId,
      attemptId,
    });

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

      if (auditAttempt.reason === "rollback_error") {
        return serviceFailure("rollback_error", ROLLBACK_ERROR_MESSAGE, {
          passwordChanged: false,
        });
      }

      return serviceFailure("error", GENERIC_RESET_ERROR);
    }

    if (!auditAttempt.allowed) {
      return serviceFailure("rate_limited", RATE_LIMIT_RESET_ERROR);
    }

    attemptConfirmed = true;

    try {
      const admin = createAdminClient();
      const { data: authUserData, error: getUserError } =
        await admin.auth.admin.getUserById(targetId);

      if (getUserError) {
        return returnFailureAfterRollback(supabase, {
          attemptId,
          targetId,
          failure: mapAuthFailure(getUserError),
        });
      }

      const authUser = authUserData.user;

      if (!authUser) {
        return returnFailureAfterRollback(supabase, {
          attemptId,
          targetId,
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
          attemptId,
          targetId,
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
          attemptId,
          targetId,
          failure: mapAuthFailure(updateUserError),
        });
      }
    } catch {
      const failure: MappedAuthFailure = {
        result: serviceFailure(
          "configuration_error",
          "El cliente administrativo de usuarios no está configurado.",
        ),
        auditErrorCode: "configuration_error",
      };

      return returnFailureAfterRollback(supabase, {
        attemptId,
        targetId,
        failure,
      });
    }

    passwordChanged = true;

    const finalization = await completePasswordResetWithRetry(supabase, {
      attemptId,
      status: "succeeded",
      errorCode: null,
    });

    if (finalization.ok) {
      return serviceSuccess({
        userId: targetId,
        wasActive: auditAttempt.previousIsActive,
      });
    }

    const finalState = await getPasswordResetAuditState(supabase, {
      attemptId,
      targetId,
    });

    if (finalState && isSucceededAuditState(finalState)) {
      return serviceSuccess({
        userId: targetId,
        wasActive: auditAttempt.previousIsActive,
      });
    }

    return returnCompletionFailure(supabase, { attemptId, targetId });
  } catch (error) {
    logSanitizedResetError("resetInternalUserPassword.unexpected", {
      name: error instanceof Error ? error.name : "UnexpectedResetError",
    });

    if (!supabase || !attemptConfirmed || !targetId) {
      return serviceFailure("error", GENERIC_RESET_ERROR, {
        passwordChanged: false,
      });
    }

    if (passwordChanged) {
      return returnCompletionFailure(supabase, { attemptId, targetId });
    }

    return returnFailureAfterRollback(supabase, {
      attemptId,
      targetId,
      failure: {
        result: serviceFailure("error", GENERIC_RESET_ERROR),
        auditErrorCode: "unexpected_error",
      },
    });
  }
}
