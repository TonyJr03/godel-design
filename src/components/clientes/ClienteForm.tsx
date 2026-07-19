"use client";

import { useActionState, useEffect, useRef } from "react";

import {
  createClienteAction,
  type CreateClienteActionState,
} from "@/app/(interno)/dashboard/clientes/actions";
import {
  Alert,
  Button,
  FormActions,
  FormField,
  FormSection,
  Input,
  Textarea,
} from "@/components/ui";
import type { ClienteField } from "@/lib/clientes";

type ClienteFormProps = {
  onSuccess?: (state: CreateClienteActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const initialState: CreateClienteActionState = {
  ok: false,
  message: "",
};

function getFieldError(state: CreateClienteActionState, field: ClienteField) {
  return state.fieldErrors?.[field];
}

export function ClienteForm({
  onSuccess,
  onDirtyChange,
}: ClienteFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createClienteAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDirtyChange?.(false);
      onSuccess?.(state);
    }
  }, [onDirtyChange, onSuccess, state]);

  const nombreError = getFieldError(state, "name");
  const telefonoError = getFieldError(state, "phone");
  const emailError = getFieldError(state, "email");
  const notasError = getFieldError(state, "notes");

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
              variant={state.ok ? "success" : "danger"}
              title={state.ok ? "Cliente creado" : "No se pudo crear el cliente"}
              aria-live="polite"
            >
              <p>{state.message}</p>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="name"
              label="Nombre"
              required
              error={nombreError}
              className="sm:col-span-2"
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={120}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="phone"
              label="Teléfono"
              required
              error={telefonoError}
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  maxLength={40}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="email"
              label="Correo electrónico"
              error={emailError}
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  maxLength={160}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="notes"
              label="Notas"
              error={notasError}
              className="sm:col-span-2"
              compact
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  id="notes"
                  name="notes"
                  maxLength={1000}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>
          </div>

          <FormActions compact note={undefined}>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Creando cliente..." : "Crear cliente"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
