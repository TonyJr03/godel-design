import "server-only";

import type { AuthError } from "@supabase/supabase-js";

import { serviceFailure, serviceSuccess } from "@/lib/service-results";
import type { ServiceResult } from "@/lib/service-results";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  type InitialPasswordChangeFieldErrors,
  type InitialPasswordChangeInput,
  validateInitialPasswordChangeInput,
} from "./initial-password-validation";

export type CompleteInitialPasswordChangeFailureReason =
  | "unauthorized"
  | "inactive"
  | "not_required"
  | "validation_error"
  | "reauthentication_required"
  | "weak_password"
  | "rate_limited"
  | "auth_error"
  | "completion_error"
  | "error";

export type CompleteInitialPasswordChangeResult = ServiceResult<
  Record<never, never>,
  CompleteInitialPasswordChangeFailureReason,
  { passwordChanged?: boolean },
  InitialPasswordChangeFieldErrors
>;

type ProfilePasswordState = {
  id: string;
  is_active: boolean | null;
  must_change_password: boolean | null;
};

type SanitizedAuthError = {
  code?: string;
  name?: string;
  status?: number;
};

const GENERIC_AUTH_ERROR_MESSAGE =
  "No se pudo actualizar la contraseña. Inténtalo nuevamente.";

const COMPLETION_ERROR_MESSAGE =
  "Tu contraseña se actualizó, pero no pudimos completar la activación del acceso. No vuelvas a utilizar la contraseña temporal. Cierra sesión y contacta al administrador.";

export async function completeInitialPasswordChange(
  input: InitialPasswordChangeInput,
): Promise<CompleteInitialPasswordChangeResult> {
  let passwordChanged = false;

  try {
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;

    if (userError) {
      logSanitizedError("initial-password-change:get-user", userError);

      return serviceFailure("auth_error", GENERIC_AUTH_ERROR_MESSAGE);
    }

    if (!user) {
      return serviceFailure(
        "unauthorized",
        "Inicia sesión para cambiar tu contraseña.",
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("perfiles")
      .select("id, is_active, must_change_password")
      .eq("id", user.id)
      .maybeSingle<ProfilePasswordState>();

    if (profileError) {
      logSanitizedError("initial-password-change:profile", profileError);

      return serviceFailure(
        "auth_error",
        "No pudimos comprobar el estado de tu usuario. Inténtalo nuevamente.",
      );
    }

    if (!profile?.is_active) {
      return serviceFailure(
        "inactive",
        "Tu usuario no tiene acceso interno activo. Contacta al administrador.",
      );
    }

    if (profile.must_change_password !== true) {
      return serviceFailure(
        "not_required",
        "Tu contraseña inicial ya fue actualizada.",
      );
    }

    const validation = validateInitialPasswordChangeInput(input, {
      email: user.email,
    });

    if (!validation.ok) {
      return serviceFailure(
        "validation_error",
        "Revisa los datos del formulario.",
        {
          fieldErrors: validation.fieldErrors,
        },
      );
    }

    const updateResult = await supabase.auth.updateUser({
      password: validation.data.password,
    });

    if (updateResult.error) {
      return mapUpdatePasswordFailure(updateResult.error);
    }

    if (updateResult.data.user?.id !== user.id) {
      logSanitizedError("initial-password-change:update-user-mismatch", null);

      return serviceFailure("auth_error", GENERIC_AUTH_ERROR_MESSAGE);
    }

    passwordChanged = true;

    const completionOk = await completeProfileFlagWithRetry(supabase, user.id);

    if (!completionOk) {
      return serviceFailure("completion_error", COMPLETION_ERROR_MESSAGE, {
        passwordChanged: true,
      });
    }

    return serviceSuccess();
  } catch (error) {
    logSanitizedError(
      passwordChanged
        ? "initial-password-change:unexpected-after-auth-change"
        : "initial-password-change:unexpected-before-auth-change",
      error,
    );

    if (!passwordChanged) {
      return serviceFailure("error", GENERIC_AUTH_ERROR_MESSAGE);
    }

    return serviceFailure("completion_error", COMPLETION_ERROR_MESSAGE, {
      passwordChanged: true,
    });
  }
}

function mapUpdatePasswordFailure(
  error: AuthError,
): CompleteInitialPasswordChangeResult {
  logSanitizedError("initial-password-change:update-user", error);

  if (isRateLimitError(error)) {
    return serviceFailure(
      "rate_limited",
      "Se alcanzó el límite temporal de intentos. Inténtalo más tarde.",
    );
  }

  if (isSamePasswordError(error)) {
    return serviceFailure(
      "validation_error",
      "Revisa los datos del formulario.",
      {
        fieldErrors: {
          password:
            "La nueva contraseña debe ser diferente de la contraseña actual.",
        },
      },
    );
  }

  if (isReauthenticationNeededError(error)) {
    return serviceFailure(
      "reauthentication_required",
      "Por seguridad, vuelve a iniciar sesión con la contraseña temporal antes de continuar.",
    );
  }

  if (isWeakPasswordError(error)) {
    return serviceFailure(
      "weak_password",
      "La nueva contraseña no cumple los requisitos de seguridad.",
      {
        fieldErrors: {
          password: "La nueva contraseña no cumple los requisitos de seguridad.",
        },
      },
    );
  }

  return serviceFailure("auth_error", GENERIC_AUTH_ERROR_MESSAGE);
}

async function completeProfileFlagWithRetry(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  let privilegedClient: ReturnType<typeof createAdminClient>;

  try {
    privilegedClient = createAdminClient();
  } catch (error) {
    logSanitizedError(
      "initial-password-change:create-privileged-client",
      error,
    );

    return hasCompletedProfileFlag(supabase, userId);
  }

  const firstAttemptOk = await callCompletionRpc(
    privilegedClient,
    userId,
    "initial-password-change:complete-flag:first",
  );

  if (firstAttemptOk) {
    return true;
  }

  const secondAttemptOk = await callCompletionRpc(
    privilegedClient,
    userId,
    "initial-password-change:complete-flag:second",
  );

  if (secondAttemptOk) {
    return true;
  }

  return hasCompletedProfileFlag(supabase, userId);
}

async function callCompletionRpc(
  privilegedClient: ReturnType<typeof createAdminClient>,
  userId: string,
  context: string,
): Promise<boolean> {
  try {
    const { data, error } = await privilegedClient.rpc(
      "complete_initial_password_change",
      {
        p_user_id: userId,
      },
    );

    if (!error && data === userId) {
      return true;
    }

    logSanitizedError(context, error);
  } catch (error) {
    logSanitizedError(context, error);
  }

  return false;
}

async function hasCompletedProfileFlag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("perfiles")
    .select("must_change_password")
    .eq("id", userId)
    .maybeSingle<{ must_change_password: boolean | null }>();

  if (error) {
    logSanitizedError("initial-password-change:confirm-flag", error);
    return false;
  }

  return data?.must_change_password === false;
}

function isSamePasswordError(error: AuthError): boolean {
  return normalizeErrorToken(error.code) === "same_password";
}

function isReauthenticationNeededError(error: AuthError): boolean {
  return normalizeErrorToken(error.code) === "reauthentication_needed";
}

function isWeakPasswordError(error: AuthError): boolean {
  const code = normalizeErrorToken(error.code);
  const message = normalizeErrorToken(error.message);

  return code === "weak_password" || message.includes("weak");
}

function isRateLimitError(error: AuthError): boolean {
  const code = normalizeErrorToken(error.code);

  return (
    error.status === 429 ||
    code === "over_request_rate_limit" ||
    code === "over_email_send_rate_limit" ||
    code === "over_sms_send_rate_limit"
  );
}

function normalizeErrorToken(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function logSanitizedError(context: string, error: unknown): void {
  console.error("[auth]", context, sanitizeAuthError(error));
}

function sanitizeAuthError(error: unknown): SanitizedAuthError {
  if (!error || typeof error !== "object") {
    return {};
  }

  const maybeError = error as Partial<AuthError>;

  return {
    code: typeof maybeError.code === "string" ? maybeError.code : undefined,
    name: typeof maybeError.name === "string" ? maybeError.name : undefined,
    status: typeof maybeError.status === "number" ? maybeError.status : undefined,
  };
}
