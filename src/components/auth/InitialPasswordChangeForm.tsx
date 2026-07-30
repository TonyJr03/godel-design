"use client";

import { useActionState, useEffect, useRef } from "react";

import type {
  InitialPasswordChangeActionState,
  changeInitialPasswordAction,
} from "@/app/(interno)/cambiar-contrasena-inicial/actions";
import { Alert, Button, FormField, PasswordInput } from "@/components/ui";

type InitialPasswordChangeFormProps = {
  action: typeof changeInitialPasswordAction;
};

const INITIAL_STATE: InitialPasswordChangeActionState = {
  ok: false,
};
const PASSWORD_REQUIREMENTS_ID = "initial-password-requirements";
const PASSWORD_REQUIREMENTS_TEXT =
  "Usa al menos 8 caracteres e incluye mayúscula, minúscula, número y símbolo.";

export function InitialPasswordChangeForm({
  action,
}: InitialPasswordChangeFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const disabled = pending || state.passwordChanged === true;

  useEffect(() => {
    if (!state.message) {
      return;
    }

    formRef.current?.reset();

    if (state.fieldErrors?.password) {
      focusField(formRef.current, "password");
      return;
    }

    if (state.fieldErrors?.password_confirmation) {
      focusField(formRef.current, "password_confirmation");
      return;
    }

    focusField(formRef.current, "password");
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      className="space-y-5"
    >
      {state.message ? (
        <Alert
          variant={state.passwordChanged ? "danger" : "warning"}
          aria-live="polite"
        >
          {state.message}
        </Alert>
      ) : null}

      <FormField
        id="password"
        label="Nueva contraseña"
        required
        error={state.fieldErrors?.password}
      >
        {({ describedBy, invalid }) => (
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            disabled={disabled}
            invalid={invalid}
            aria-describedby={joinDescriptionIds(
              describedBy,
              PASSWORD_REQUIREMENTS_ID,
            )}
            visibilityResetKey={state}
          />
        )}
      </FormField>

      <FormField
        id="password_confirmation"
        label="Confirmar nueva contraseña"
        required
        error={state.fieldErrors?.password_confirmation}
      >
        {({ describedBy, invalid }) => (
          <PasswordInput
            id="password_confirmation"
            name="password_confirmation"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            disabled={disabled}
            invalid={invalid}
            aria-describedby={joinDescriptionIds(
              describedBy,
              PASSWORD_REQUIREMENTS_ID,
            )}
            visibilityResetKey={state}
          />
        )}
      </FormField>

      <p
        id={PASSWORD_REQUIREMENTS_ID}
        className="text-sm leading-5 text-text-secondary"
      >
        {PASSWORD_REQUIREMENTS_TEXT}
      </p>

      <Button type="submit" size="lg" className="w-full" disabled={disabled}>
        {pending ? "Actualizando..." : "Actualizar contraseña"}
      </Button>
    </form>
  );
}

function focusField(form: HTMLFormElement | null, name: string): void {
  const field = form?.elements.namedItem(name);

  if (field instanceof HTMLInputElement) {
    field.focus();
  }
}

function joinDescriptionIds(
  ...ids: Array<string | undefined>
): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}
