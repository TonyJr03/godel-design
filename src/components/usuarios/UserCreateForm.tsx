"use client";

import Link from "next/link";
import { useActionState } from "react";

import {
  createUserProfileAction,
  type CreateUserProfileActionState,
} from "@/app/dashboard/usuarios/nuevo/actions";
import {
  Alert,
  Button,
  FormActions,
  FormField,
  FormSection,
  Input,
  Select,
} from "@/components/ui";
import type { UserField } from "@/lib/usuarios";

const initialState: CreateUserProfileActionState = {
  ok: false,
  message: "",
};

function getFieldError(state: CreateUserProfileActionState, field: UserField) {
  return state.fieldErrors?.[field];
}

export function UserCreateForm() {
  const [state, formAction, pending] = useActionState(
    createUserProfileAction,
    initialState,
  );

  const idError = getFieldError(state, "id");
  const fullNameError = getFieldError(state, "full_name");
  const phoneError = getFieldError(state, "phone");
  const avatarUrlError = getFieldError(state, "avatar_url");
  const roleError = getFieldError(state, "role");
  const activeError = getFieldError(state, "is_active");

  return (
    <form action={formAction} aria-busy={pending} className="max-w-3xl">
      <FormSection
        title="Crear perfil para usuario Auth existente"
        description="Solo se guardarán datos del perfil interno en public.perfiles."
      >
        <div className="space-y-6">
          {state.message ? (
            <Alert variant="danger" aria-live="polite">
              {state.message}
            </Alert>
          ) : null}

          <Alert variant="info">
            Primero crea el usuario en Supabase Auth y copia aquí su UUID. Esta
            pantalla no crea credenciales ni contraseñas.
          </Alert>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              id="id"
              label="UUID del usuario Auth"
              required
              error={idError}
              className="sm:col-span-2"
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="id"
                  name="id"
                  type="text"
                  required
                  placeholder="00000000-0000-0000-0000-000000000000"
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

            <FormField id="phone" label="Teléfono" error={phoneError}>
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

            <FormField id="role" label="Rol" required error={roleError}>
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

          <FormActions note="Los campos marcados con * son obligatorios.">
            <Link
              href="/dashboard/usuarios"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted sm:w-auto"
            >
              Volver al listado
            </Link>
            <Button type="submit" disabled={pending} className="w-full sm:w-auto">
              {pending ? "Creando..." : "Crear perfil"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
