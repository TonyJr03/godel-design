"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFormValue } from "@/lib/utils";

export type LoginActionState = {
  message?: string;
};

const EMPTY_CREDENTIALS_MESSAGE = "Ingresa tu correo y contraseña.";
const INVALID_CREDENTIALS_MESSAGE = "Correo o contraseña incorrectos.";
const TEMPORARY_LOGIN_ERROR_MESSAGE =
  "No pudimos iniciar sesión en este momento. Inténtalo nuevamente en unos minutos.";
const INACTIVE_PROFILE_MESSAGE =
  "Tu usuario no tiene acceso interno activo. Contacta al administrador.";

function getErrorField(error: unknown, field: "name" | "message" | "code") {
  if (typeof error !== "object" || error === null || !(field in error)) {
    return "";
  }

  const value = (error as Record<string, unknown>)[field];
  return typeof value === "string" ? value : "";
}

function getErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }

  const status = (error as Record<string, unknown>).status;
  return typeof status === "number" ? status : undefined;
}

function isNetworkAuthError(error: unknown) {
  if (error instanceof TypeError) {
    return true;
  }

  const name = getErrorField(error, "name").toLowerCase();
  const message = getErrorField(error, "message").toLowerCase();
  const status = getErrorStatus(error);

  return (
    name.includes("retryable") ||
    status === 0 ||
    (typeof status === "number" && status >= 500) ||
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("enotfound") ||
    message.includes("network")
  );
}

function logUnexpectedLoginError(context: string, error: unknown) {
  console.error("[login]", context, {
    name: getErrorField(error, "name") || undefined,
    code: getErrorField(error, "code") || undefined,
    status: getErrorStatus(error),
    message: getErrorField(error, "message") || undefined,
  });
}

export async function login(
  _state: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = getFormValue(formData, "email").trim();
  const password = getFormValue(formData, "password");

  if (!email || !password.trim()) {
    return {
      message: EMPTY_CREDENTIALS_MESSAGE,
    };
  }

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (isNetworkAuthError(error)) {
        logUnexpectedLoginError("auth sign-in unavailable", error);

        return {
          message: TEMPORARY_LOGIN_ERROR_MESSAGE,
        };
      }

      return {
        message: INVALID_CREDENTIALS_MESSAGE,
      };
    }

    const userId = data.user?.id;

    if (!userId) {
      await supabase.auth.signOut();

      return {
        message: TEMPORARY_LOGIN_ERROR_MESSAGE,
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from("perfiles")
      .select("id, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      logUnexpectedLoginError("profile lookup failed", profileError);
      await supabase.auth.signOut();

      return {
        message: TEMPORARY_LOGIN_ERROR_MESSAGE,
      };
    }

    if (!profile?.is_active) {
      await supabase.auth.signOut();

      return {
        message: INACTIVE_PROFILE_MESSAGE,
      };
    }
  } catch (error) {
    logUnexpectedLoginError("unexpected login failure", error);

    return {
      message: TEMPORARY_LOGIN_ERROR_MESSAGE,
    };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/login");
  revalidatePath("/dashboard");
  redirect("/login");
}
