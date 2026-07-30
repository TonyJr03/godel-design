"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  completeInitialPasswordChange,
  type InitialPasswordChangeFieldErrors,
} from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getFormValue } from "@/lib/utils";

export type InitialPasswordChangeActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: InitialPasswordChangeFieldErrors;
  passwordChanged?: boolean;
};

export async function changeInitialPasswordAction(
  _previousState: InitialPasswordChangeActionState,
  formData: FormData,
): Promise<InitialPasswordChangeActionState> {
  const result = await completeInitialPasswordChange({
    password: getFormValue(formData, "password"),
    password_confirmation: getFormValue(formData, "password_confirmation"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
      passwordChanged: result.passwordChanged,
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/cambiar-contrasena-inicial");
  redirect("/dashboard");
}

export async function logoutFromInitialPasswordChange(): Promise<void> {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/dashboard");
  revalidatePath("/cambiar-contrasena-inicial");
  redirect("/login");
}
