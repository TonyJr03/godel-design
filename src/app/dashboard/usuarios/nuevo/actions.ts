"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createInternalUserProfile,
  type UserFieldErrors,
} from "@/lib/usuarios";

export type CreateUserProfileActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: UserFieldErrors;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function createUserProfileAction(
  _prevState: CreateUserProfileActionState,
  formData: FormData,
): Promise<CreateUserProfileActionState> {
  const result = await createInternalUserProfile({
    id: getFormValue(formData, "id"),
    full_name: getFormValue(formData, "full_name"),
    phone: getFormValue(formData, "phone"),
    avatar_url: getFormValue(formData, "avatar_url"),
    role: getFormValue(formData, "role"),
    is_active: getFormValue(formData, "is_active"),
  });

  if (!result.ok) {
    return {
      ok: false,
      message: result.message,
      fieldErrors: result.fieldErrors,
    };
  }

  revalidatePath("/dashboard/usuarios");
  revalidatePath(`/dashboard/usuarios/${result.userId}`);

  redirect(`/dashboard/usuarios/${result.userId}`);
}
