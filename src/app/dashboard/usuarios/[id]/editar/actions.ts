"use server";

import { revalidatePath } from "next/cache";
import {
  updateInternalUser,
  type UserFieldErrors,
} from "@/lib/usuarios";

export type UpdateUserActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: UserFieldErrors;
};

function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

export async function updateUserAction(
  userId: string,
  _prevState: UpdateUserActionState,
  formData: FormData,
): Promise<UpdateUserActionState> {
  const result = await updateInternalUser({
    id: userId,
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
  revalidatePath(`/dashboard/usuarios/${result.userId}/editar`);

  return {
    ok: true,
    message: "Usuario actualizado correctamente.",
  };
}
