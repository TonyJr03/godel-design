"use client";

import { useActionState, useEffect } from "react";

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
import type { UserField, UserFieldErrors } from "@/lib/usuarios";

type UserCreateFormProps = {
  createAction: UserCreateFormAction;
  onSuccess?: (state: UserCreateFormActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export type UserCreateFormActionState = BaseActionState<UserFieldErrors>;

export type UserCreateFormAction = (
  state: UserCreateFormActionState,
  formData: FormData,
) => Promise<UserCreateFormActionState>;

const initialState: UserCreateFormActionState = {
  ok: false,
  message: "",
};

function getFieldError(state: UserCreateFormActionState, field: UserField) {
  return state.fieldErrors?.[field];
}

export function UserCreateForm({
  createAction,
  onSuccess,
  onDirtyChange,
}: UserCreateFormProps) {
  const [state, formAction, pending] = useActionState(
    createAction,
    initialState,
  );

  useEffect(() => {
    if (!state.ok) {
      return;
    }

    onDirtyChange?.(false);
    onSuccess?.(state);
  }, [onDirtyChange, onSuccess, state]);

  const idError = getFieldError(state, "id");
  const fullNameError = getFieldError(state, "full_name");
  const phoneError = getFieldError(state, "phone");
  const avatarUrlError = getFieldError(state, "avatar_url");
  const roleError = getFieldError(state, "role");
  const activeError = getFieldError(state, "is_active");

  return (
    <form
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
              title={state.ok ? "Perfil creado" : "No se pudo crear el perfil"}
              aria-live="polite"
            >
              <p>{state.message}</p>
            </Alert>
          ) : null}

          <Alert variant="info" className="wrap-break-word leading-6">
            El usuario debe existir previamente en Supabase Auth. Aquí solo se
            registra su perfil interno.
          </Alert>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id="id"
              label="UUID del usuario Auth"
              required
              error={idError}
              help="Pega el UUID del usuario creado en Supabase Auth."
              className="sm:col-span-2"
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="id"
                  name="id"
                  type="text"
                  required
                  invalid={invalid}
                  aria-describedby={describedBy}
                  className="font-mono"
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

            <FormField
              id="phone"
              label="Teléfono"
              error={phoneError}
              compact
            >
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

            <FormField
              id="role"
              label="Rol"
              required
              error={roleError}
              compact
            >
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

            <FormField
              id="is_active"
              label="Estado"
              required
              error={activeError}
              errorId="active-error"
              compact
            >
              {({ describedBy, invalid }) => (
                <Select
                  id="is_active"
                  name="is_active"
                  required
                  defaultValue="true"
                  invalid={invalid}
                  aria-describedby={describedBy}
                >
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </Select>
              )}
            </FormField>
          </div>

          <FormActions compact note={undefined}>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Creando perfil..." : "Crear perfil"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
