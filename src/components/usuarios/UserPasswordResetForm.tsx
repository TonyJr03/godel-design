"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  Alert,
  Button,
  FormActions,
  FormField,
  FormSection,
  Input,
} from "@/components/ui";
import type { ResetUserPasswordActionState } from "@/app/(interno)/dashboard/configuracion/usuarios/actions";
import type {
  InternalUserDetail,
  ResetInternalUserPasswordField,
  ResetInternalUserPasswordFieldErrors,
} from "@/lib/usuarios";

type UserPasswordResetFormProps = {
  user: InternalUserDetail;
  resetAction: UserPasswordResetFormAction;
  onSuccess?: (state: UserPasswordResetFormActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export type UserPasswordResetFormActionState =
  ResetUserPasswordActionState;

export type UserPasswordResetFormAction = (
  state: UserPasswordResetFormActionState,
  formData: FormData,
) => Promise<UserPasswordResetFormActionState>;

const initialState: UserPasswordResetFormActionState = {
  ok: false,
  message: "",
};

function getFieldError(
  state: UserPasswordResetFormActionState,
  field: ResetInternalUserPasswordField,
) {
  return state.fieldErrors?.[field];
}

function focusField(
  form: HTMLFormElement | null,
  fieldErrors: ResetInternalUserPasswordFieldErrors | undefined,
) {
  if (!form || !fieldErrors) {
    return;
  }

  const firstErrorField = [
    "password",
    "password_confirmation",
    "confirm_reset",
  ].find((field) => fieldErrors[field as ResetInternalUserPasswordField]);

  if (!firstErrorField) {
    return;
  }

  const field = form.elements.namedItem(firstErrorField);

  if (field instanceof HTMLElement) {
    field.focus();
  }
}

function clearPasswordInputs(form: HTMLFormElement | null) {
  const passwordInput = form?.elements.namedItem("password");
  const confirmationInput = form?.elements.namedItem("password_confirmation");

  if (passwordInput instanceof HTMLInputElement) {
    passwordInput.value = "";
  }

  if (confirmationInput instanceof HTMLInputElement) {
    confirmationInput.value = "";
  }
}

export function UserPasswordResetForm({
  user,
  resetAction,
  onSuccess,
  onDirtyChange,
}: UserPasswordResetFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const lastHandledStateRef =
    useRef<UserPasswordResetFormActionState>(initialState);
  const [state, formAction, pending] = useActionState(
    resetAction,
    initialState,
  );
  const passwordChanged = state.passwordChanged === true;

  useEffect(() => {
    if (lastHandledStateRef.current === state) {
      return;
    }

    lastHandledStateRef.current = state;
    clearPasswordInputs(formRef.current);

    if (state.ok) {
      onDirtyChange?.(false);
      onSuccess?.(state);
      return;
    }

    if (state.message) {
      focusField(formRef.current, state.fieldErrors);
    }
  }, [onDirtyChange, onSuccess, state]);

  const passwordError = getFieldError(state, "password");
  const confirmationError = getFieldError(state, "password_confirmation");
  const confirmResetError = getFieldError(state, "confirm_reset");

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      className="w-full"
      onChange={() => onDirtyChange?.(true)}
    >
      <FormSection compact>
        <div className="space-y-4">
          {state.message ? (
            <Alert
              variant={state.ok ? "success" : passwordChanged ? "warning" : "danger"}
              title={
                state.ok
                  ? "Contraseña restablecida"
                  : passwordChanged
                    ? "Revisión administrativa requerida"
                    : "No se pudo restablecer la contraseña"
              }
              aria-live="polite"
            >
              <p>{state.message}</p>
            </Alert>
          ) : null}

          <Alert variant="info" className="wrap-break-word leading-6">
            Entrega la nueva contraseña por un canal seguro. El sistema no
            volverá a mostrarla.
          </Alert>

          {user.must_change_password ? (
            <Alert variant="warning" className="wrap-break-word leading-6">
              Este usuario ya tiene un cambio inicial pendiente. La operación
              reemplazará su contraseña temporal actual.
            </Alert>
          ) : null}

          {!user.is_active ? (
            <Alert variant="warning" className="wrap-break-word leading-6">
              El usuario permanecerá inactivo después del restablecimiento.
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="password"
              label="Contraseña temporal"
              required
              error={passwordError}
              help="La contraseña temporal debe tener entre 12 y 72 caracteres e incluir mayúscula, minúscula, número y símbolo."
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={72}
                  disabled={passwordChanged}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="password_confirmation"
              label="Confirmar contraseña"
              required
              error={confirmationError}
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="password_confirmation"
                  name="password_confirmation"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={72}
                  disabled={passwordChanged}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <div className="sm:col-span-2">
              <label
                htmlFor="confirm_reset"
                className="flex items-start gap-3 rounded-(--radius-control) border border-warning/35 bg-warning-soft p-3 text-sm text-text-primary"
              >
                <input
                  id="confirm_reset"
                  name="confirm_reset"
                  type="checkbox"
                  value="true"
                  required
                  disabled={passwordChanged}
                  aria-invalid={confirmResetError ? true : undefined}
                  aria-describedby={
                    confirmResetError ? "confirm-reset-error" : undefined
                  }
                  className="mt-1 size-4 shrink-0 accent-brand-primary"
                />
                <span>
                  Confirmo que deseo reemplazar la contraseña actual de este
                  usuario.
                </span>
              </label>
              {confirmResetError ? (
                <p
                  id="confirm-reset-error"
                  className="mt-1 text-sm font-medium leading-5 text-danger"
                >
                  {confirmResetError}
                </p>
              ) : null}
            </div>
          </div>

          <FormActions compact note={undefined}>
            <Button
              type="submit"
              disabled={pending || passwordChanged}
              className="w-full sm:w-auto"
            >
              {pending ? "Restableciendo..." : "Restablecer contraseña"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
