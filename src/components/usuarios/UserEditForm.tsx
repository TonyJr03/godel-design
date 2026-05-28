"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { UpdateUserActionState } from "@/app/dashboard/usuarios/[id]/editar/actions";
import type { InternalUserDetail, UserField } from "@/lib/usuarios";

type UserEditFormProps = {
  user: InternalUserDetail;
  updateAction: (
    state: UpdateUserActionState,
    formData: FormData,
  ) => Promise<UpdateUserActionState>;
};

type FieldErrorProps = {
  id: string;
  message?: string;
};

const initialState: UpdateUserActionState = {
  ok: false,
  message: "",
};

const baseInputClass =
  "mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

const labelClass = "text-sm font-medium text-zinc-900";

function OptionalMark() {
  return (
    <span className="ml-1 text-sm font-normal text-zinc-500">(opcional)</span>
  );
}

function FieldError({ id, message }: FieldErrorProps) {
  if (!message) {
    return null;
  }

  return (
    <p id={id} className="mt-2 text-sm leading-5 text-red-700">
      {message}
    </p>
  );
}

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
    <form
      action={formAction}
      aria-busy={pending}
      className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="space-y-6">
        {state.message ? (
          <div
            className={
              state.ok
                ? "rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900"
                : "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900"
            }
            role={state.ok ? "status" : "alert"}
            aria-live="polite"
          >
            {state.message}
          </div>
        ) : null}

        <section className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
          Esta pantalla gestiona el perfil interno. Las credenciales de acceso
          se administran fuera de esta aplicación.
        </section>

        <div>
          <h2 className="text-lg font-semibold text-zinc-950">
            Datos del perfil interno
          </h2>
          <p className="mt-1 break-all font-mono text-xs text-zinc-500">
            {user.id}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="full_name">
              Nombre completo <span className="text-red-700">*</span>
            </label>
            <input
              className={baseInputClass}
              id="full_name"
              name="full_name"
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              defaultValue={user.full_name}
              aria-invalid={Boolean(fullNameError)}
              aria-describedby={
                fullNameError ? "full-name-error" : undefined
              }
            />
            <FieldError id="full-name-error" message={fullNameError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="phone">
              Teléfono <OptionalMark />
            </label>
            <input
              className={baseInputClass}
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              maxLength={40}
              defaultValue={user.phone ?? ""}
              aria-invalid={Boolean(phoneError)}
              aria-describedby={phoneError ? "phone-error" : undefined}
            />
            <FieldError id="phone-error" message={phoneError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="avatar_url">
              URL de avatar <OptionalMark />
            </label>
            <input
              className={baseInputClass}
              id="avatar_url"
              name="avatar_url"
              type="text"
              maxLength={500}
              defaultValue={user.avatar_url ?? ""}
              aria-invalid={Boolean(avatarUrlError)}
              aria-describedby={
                avatarUrlError ? "avatar-url-error" : undefined
              }
            />
            <FieldError id="avatar-url-error" message={avatarUrlError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="role">
              Rol <span className="text-red-700">*</span>
            </label>
            <select
              className={baseInputClass}
              id="role"
              name="role"
              required
              defaultValue={user.role}
              aria-invalid={Boolean(roleError)}
              aria-describedby={roleError ? "role-error" : undefined}
            >
              <option value="admin">Administrador</option>
              <option value="supervisor">Supervisor</option>
              <option value="trabajador">Trabajador</option>
            </select>
            <FieldError id="role-error" message={roleError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="is_active">
              Estado <span className="text-red-700">*</span>
            </label>
            <select
              className={baseInputClass}
              id="is_active"
              name="is_active"
              required
              defaultValue={user.is_active ? "true" : "false"}
              aria-invalid={Boolean(activeError)}
              aria-describedby={activeError ? "active-error" : undefined}
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
            <FieldError id="active-error" message={activeError} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-zinc-500">
            Los campos marcados con * son obligatorios.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/dashboard/usuarios/${user.id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400"
            >
              Volver al detalle
            </Link>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {pending ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
