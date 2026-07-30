"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  Alert,
  Button,
  FormActions,
  FormField,
  FormSection,
  Input,
  Select,
} from "@/components/ui";
import type { BaseActionState } from "@/lib/actions/action-state";
import type {
  CreateInternalUserField,
  CreateInternalUserFieldErrors,
} from "@/lib/usuarios";

type UserCreateFormProps = {
  createAction: UserCreateFormAction;
  onSuccess?: (state: UserCreateFormActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export type UserCreateFormActionState =
  BaseActionState<CreateInternalUserFieldErrors>;

export type UserCreateFormAction = (
  state: UserCreateFormActionState,
  formData: FormData,
) => Promise<UserCreateFormActionState>;

const initialState: UserCreateFormActionState = {
  ok: false,
  message: "",
};

function getFieldError(
  state: UserCreateFormActionState,
  field: CreateInternalUserField,
) {
  return state.fieldErrors?.[field];
}

export function UserCreateForm({
  createAction,
  onSuccess,
  onDirtyChange,
}: UserCreateFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const lastHandledStateRef = useRef<UserCreateFormActionState>(initialState);
  const [selectedRole, setSelectedRole] = useState("trabajador");
  const [state, formAction, pending] = useActionState(
    createAction,
    initialState,
  );

  useEffect(() => {
    if (lastHandledStateRef.current === state) {
      return;
    }

    lastHandledStateRef.current = state;

    if (state.ok) {
      onDirtyChange?.(false);
      onSuccess?.(state);
      return;
    }

    if (!state.message) {
      return;
    }

    const form = formRef.current;
    const passwordInput = form?.elements.namedItem("password");
    const passwordConfirmationInput = form?.elements.namedItem(
      "password_confirmation",
    );

    if (passwordInput instanceof HTMLInputElement) {
      passwordInput.value = "";
    }

    if (passwordConfirmationInput instanceof HTMLInputElement) {
      passwordConfirmationInput.value = "";
    }

    if (
      state.fieldErrors?.password &&
      passwordInput instanceof HTMLInputElement
    ) {
      passwordInput.focus();
      return;
    }

    if (
      state.fieldErrors?.password_confirmation &&
      passwordConfirmationInput instanceof HTMLInputElement
    ) {
      passwordConfirmationInput.focus();
    }
  }, [onDirtyChange, onSuccess, state]);

  const emailError = getFieldError(state, "email");
  const passwordError = getFieldError(state, "password");
  const passwordConfirmationError = getFieldError(
    state,
    "password_confirmation",
  );
  const fullNameError = getFieldError(state, "full_name");
  const phoneError = getFieldError(state, "phone");
  const avatarUrlError = getFieldError(state, "avatar_url");
  const roleError = getFieldError(state, "role");
  const confirmAdminError = getFieldError(state, "confirm_admin");

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      className="w-full"
      onChange={(event) => {
        onDirtyChange?.(true);

        if (
          event.target instanceof HTMLSelectElement &&
          event.target.name === "role"
        ) {
          setSelectedRole(event.target.value);
        }
      }}
    >
      <FormSection compact>
        <div className="space-y-4">
          {state.message ? (
            <Alert
              variant={state.ok ? "success" : "danger"}
              title={state.ok ? "Usuario creado" : "No se pudo crear el usuario"}
              aria-live="polite"
            >
              <p>{state.message}</p>
            </Alert>
          ) : null}

          <Alert variant="info" className="wrap-break-word leading-6">
            Entrega esta contrasena al usuario por un canal seguro. El sistema
            no volvera a mostrarla.
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="email"
              label="Correo electronico"
              required
              error={emailError}
              help="Se utilizara para iniciar sesion. No se enviara un correo de confirmacion."
              className="sm:col-span-2"
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="password"
              label="Contrasena temporal"
              required
              error={passwordError}
              help="Entre 12 y 72 caracteres, con mayuscula, minuscula, numero y simbolo."
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
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="password_confirmation"
              label="Confirmar contrasena"
              required
              error={passwordConfirmationError}
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
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="full_name"
              label="Nombre completo"
              required
              error={fullNameError}
              errorId="full-name-error"
              className="sm:col-span-2"
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="full_name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={120}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField id="phone" label="Telefono" error={phoneError} compact>
              {({ describedBy, invalid }) => (
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={40}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="avatar_url"
              label="URL de avatar"
              error={avatarUrlError}
              errorId="avatar-url-error"
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="avatar_url"
                  name="avatar_url"
                  type="text"
                  inputMode="url"
                  maxLength={500}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField id="role" label="Rol" required error={roleError} compact>
              {({ describedBy, invalid }) => (
                <Select
                  id="role"
                  name="role"
                  required
                  defaultValue="trabajador"
                  invalid={invalid}
                  aria-describedby={describedBy}
                >
                  <option value="admin">Administrador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="trabajador">Trabajador</option>
                </Select>
              )}
            </FormField>

            {selectedRole === "admin" ? (
              <div className="sm:col-span-2">
                <label
                  htmlFor="confirm_admin"
                  className="flex items-start gap-3 rounded-(--radius-control) border border-warning/35 bg-warning-soft p-3 text-sm text-text-primary"
                >
                  <input
                    id="confirm_admin"
                    name="confirm_admin"
                    type="checkbox"
                    value="true"
                    required
                    aria-invalid={confirmAdminError ? true : undefined}
                    aria-describedby={
                      confirmAdminError ? "confirm-admin-error" : undefined
                    }
                    className="mt-1 size-4 shrink-0 accent-brand-primary"
                  />
                  <span>
                    Confirmo que este usuario tendra acceso administrativo
                    completo.
                  </span>
                </label>
                {confirmAdminError ? (
                  <p
                    id="confirm-admin-error"
                    className="mt-1 text-sm font-medium leading-5 text-danger"
                  >
                    {confirmAdminError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <FormActions compact note={undefined}>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Creando usuario..." : "Crear usuario"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
