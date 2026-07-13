"use server";

import { redirect } from "next/navigation";

import {
  actionFailure,
  type BaseActionState,
} from "@/lib/actions/action-state";
import { revalidateConfiguracionUsuarioEdit } from "@/lib/actions/revalidation";
import {
  createInternalUserProfile,
  type UserFieldErrors,
} from "@/lib/usuarios";
import { getFormValue } from "@/lib/utils";

export type CreateUserProfileActionState = BaseActionState<UserFieldErrors>;

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
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidateConfiguracionUsuarioEdit(result.userId);

  redirect(`/dashboard/configuracion/usuarios/${result.userId}/editar`);
}
