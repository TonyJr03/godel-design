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
  createInternalUser,
  resetInternalUserPassword,
  updateInternalUser,
  type CreateInternalUserFieldErrors,
  type ResetInternalUserPasswordFieldErrors,
  type UserFieldErrors,
} from "@/lib/usuarios";
import { getFormValue } from "@/lib/utils";

export type CreateUserActionState =
  BaseActionState<CreateInternalUserFieldErrors> & {
    userId?: string;
  };

export async function createUserAction(
  _prevState: CreateUserActionState,
  formData: FormData,
): Promise<CreateUserActionState> {
  const result = await createInternalUser({
    email: getFormValue(formData, "email"),
    password: getFormValue(formData, "password"),
    password_confirmation: getFormValue(formData, "password_confirmation"),
    full_name: getFormValue(formData, "full_name"),
    phone: getFormValue(formData, "phone"),
    avatar_url: getFormValue(formData, "avatar_url"),
    role: getFormValue(formData, "role"),
    confirm_admin: getFormValue(formData, "confirm_admin"),
  });

  if (!result.ok) {
    return actionFailure(result.message, {
      fieldErrors: result.fieldErrors,
    });
  }

  revalidateConfiguracionUsuariosList();

  return actionSuccess(
    "Usuario creado correctamente. Deberá cambiar su contraseña temporal en el primer acceso.",
    {
      userId: result.userId,
    },
  );
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

export type ResetUserPasswordActionState =
  BaseActionState<ResetInternalUserPasswordFieldErrors> & {
    passwordChanged?: boolean;
  };

export async function resetUserPasswordAction(
  userId: string,
  _prevState: ResetUserPasswordActionState,
  formData: FormData,
): Promise<ResetUserPasswordActionState> {
  const result = await resetInternalUserPassword({
    id: userId,
    password: getFormValue(formData, "password"),
    password_confirmation: getFormValue(formData, "password_confirmation"),
    confirm_reset: getFormValue(formData, "confirm_reset"),
  });

  if (!result.ok) {
    return {
      ...actionFailure(result.message, {
        fieldErrors: result.fieldErrors,
      }),
      passwordChanged: result.passwordChanged,
    };
  }

  return actionSuccess(
    "Contraseña temporal restablecida. El usuario deberá cambiarla en su próximo acceso.",
  );
}
