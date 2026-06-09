"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { UpdateUserActionState } from "@/app/dashboard/usuarios/[id]/editar/actions";
import {
  Alert,
  Button,
  FormActions,
  FormField,
  FormSection,
  Input,
  Select,
} from "@/components/ui";
import type { InternalUserDetail, UserField } from "@/lib/usuarios";

type UserEditFormProps = {
  user: InternalUserDetail;
  updateAction: (
    state: UpdateUserActionState,
    formData: FormData,
  ) => Promise<UpdateUserActionState>;
};

const initialState: UpdateUserActionState = {
  ok: false,
  message: "",
};

function getFieldError(state: UpdateUserActionState, field: UserField) {
  return state.fieldErrors?.[field];
}

export function UserEditForm({ user, updateAction }: UserEditFormProps) {
  const [state, formAction, pending] = useActionState(
    updateAction,
    initialState,
  );

  const fullNameError = getFieldError(state, "full_name");
  const phoneError = getFieldError(state, "phone");
  const avatarUrlError = getFieldError(state, "avatar_url");
  const roleError = getFieldError(state, "role");
  const activeError = getFieldError(state, "is_active");

  return (
    <form action={formAction} aria-busy={pending} className="max-w-3xl">
      <FormSection
        title="Datos del perfil interno"
        description={
          <span className="break-all font-mono text-xs">{user.id}</span>
        }
      >
        <div className="space-y-6">
          {state.message ? (
            <Alert
              variant={state.ok ? "success" : "danger"}
              aria-live="polite"
            >
              {state.message}
            </Alert>
          ) : null}

          <Alert variant="info">
            Esta pantalla gestiona el perfil interno. Las credenciales de acceso
            se administran fuera de esta aplicación.
          </Alert>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="full_name"
              label="Nombre completo"
              required
              error={fullNameError}
              errorId="full-name-error"
              className="sm:col-span-2"
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="full_name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={120}
                  defaultValue={user.full_name}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField id="phone" label="Teléfono" error={phoneError}>
              {({ describedBy, invalid }) => (
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength={40}
                  defaultValue={user.phone ?? ""}
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
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="avatar_url"
                  name="avatar_url"
                  type="text"
                  inputMode="url"
                  maxLength={500}
                  defaultValue={user.avatar_url ?? ""}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField id="role" label="Rol" required error={roleError}>
              {({ describedBy, invalid }) => (
                <Select
                  id="role"
                  name="role"
                  required
                  defaultValue={user.role}
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
            >
              {({ describedBy, invalid }) => (
                <Select
                  id="is_active"
                  name="is_active"
                  required
                  defaultValue={user.is_active ? "true" : "false"}
                  invalid={invalid}
                  aria-describedby={describedBy}
                >
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </Select>
              )}
            </FormField>
          </div>

          <FormActions note="Los campos marcados con * son obligatorios.">
            <Link
              href={`/dashboard/usuarios/${user.id}`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted sm:w-auto"
            >
              Volver al detalle
            </Link>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Guardando..." : "Guardar cambios"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
