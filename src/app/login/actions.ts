"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginActionState = {
  message?: string;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function login(
  _state: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = getFormValue(formData, "email").trim();
  const password = getFormValue(formData, "password");

  if (!email || !password.trim()) {
    return {
      message: "Ingresa tu correo y contraseña.",
    };
  }

  const supabase = await createClient();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return {
        message: "Credenciales inválidas.",
      };
    }

    const userId = data.user?.id;

    if (!userId) {
      await supabase.auth.signOut();

      return {
        message: "No se pudo iniciar sesión. Inténtalo nuevamente.",
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile?.is_active) {
      await supabase.auth.signOut();

      return {
        message:
          "Tu usuario no tiene acceso interno activo. Contacta al administrador.",
      };
    }
  } catch {
    return {
      message: "No se pudo iniciar sesión. Inténtalo nuevamente.",
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
