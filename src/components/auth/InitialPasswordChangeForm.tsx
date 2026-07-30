"use client";

import { useActionState, useEffect, useRef } from "react";

import type {
  InitialPasswordChangeActionState,
  changeInitialPasswordAction,
} from "@/app/(interno)/cambiar-contrasena-inicial/actions";
import { Alert, Button, FormField, Input } from "@/components/ui";

type InitialPasswordChangeFormProps = {
  action: typeof changeInitialPasswordAction;
};

const INITIAL_STATE: InitialPasswordChangeActionState = {
  ok: false,
};

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

    if (state.fieldErrors?.current_password) {
      focusField(formRef.current, "current_password");
      return;
    }

    if (state.fieldErrors?.password) {
      focusField(formRef.current, "password");
      return;
    }

    if (state.fieldErrors?.password_confirmation) {
      focusField(formRef.current, "password_confirmation");
      return;
    }

    focusField(formRef.current, "current_password");
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
        id="current_password"
        label="Contraseña temporal actual"
        required
        error={state.fieldErrors?.current_password}
      >
        {({ describedBy, invalid }) => (
          <Input
            id="current_password"
            name="current_password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={72}
            disabled={disabled}
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </FormField>

      <FormField
        id="password"
        label="Nueva contraseña"
        required
        help="Usa al menos 12 caracteres con mayúscula, minúscula, número y carácter especial."
        error={state.fieldErrors?.password}
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
            disabled={disabled}
            invalid={invalid}
            aria-describedby={describedBy}
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
          <Input
            id="password_confirmation"
            name="password_confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={72}
            disabled={disabled}
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </FormField>

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
