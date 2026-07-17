"use server";

import {
  actionFailure,
  actionSuccess,
  type BaseActionState,
} from "@/lib/actions/action-state";
import {
  revalidateConfiguracionUsuario,
  revalidateConfiguracionUsuariosList,
} from "@/lib/actions/revalidation";
import {
  createInternalUserProfile,
  updateInternalUser,
  type UserFieldErrors,
} from "@/lib/usuarios";
import { getFormValue } from "@/lib/utils";

export type CreateUserProfileActionState = BaseActionState<UserFieldErrors> & {
  userId?: string;
};

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

  revalidateConfiguracionUsuariosList();

  return actionSuccess("Usuario creado correctamente.", {
    userId: result.userId,
  });
}

export type UpdateUserActionState = BaseActionState<UserFieldErrors>;

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
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidateConfiguracionUsuario();

  return actionSuccess("Usuario actualizado correctamente.");
}
