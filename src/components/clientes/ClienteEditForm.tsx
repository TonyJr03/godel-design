"use client";

import { useActionState } from "react";
import {
  updateClienteAction,
  type UpdateClienteActionState,
} from "@/app/dashboard/clientes/[id]/editar/actions";
import type { ClienteField, InternalClienteDetail } from "@/lib/clientes";

type ClienteEditFormProps = {
  cliente: InternalClienteDetail;
};

const initialState: UpdateClienteActionState = {
  ok: false,
  message: "",
};

type FieldErrorProps = {
  id: string;
  message?: string;
};

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

function getFieldError(state: UpdateClienteActionState, field: ClienteField) {
  return state.fieldErrors?.[field];
}

const baseInputClass =
  "mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

const labelClass = "text-sm font-medium text-zinc-900";

export function ClienteEditForm({ cliente }: ClienteEditFormProps) {
  const [state, formAction, pending] = useActionState(
    updateClienteAction,
    initialState,
  );

  const nombreError = getFieldError(state, "nombre");
  const telefonoError = getFieldError(state, "telefono");
  const emailError = getFieldError(state, "email");
  const notasError = getFieldError(state, "notas");

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="max-w-3xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <input type="hidden" name="cliente_id" value={cliente.id} />

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

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="nombre">
              Nombre <span className="text-red-700">*</span>
            </label>
            <input
              className={baseInputClass}
              id="nombre"
              name="nombre"
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              defaultValue={cliente.nombre}
              aria-invalid={Boolean(nombreError)}
              aria-describedby={nombreError ? "nombre-error" : undefined}
            />
            <FieldError id="nombre-error" message={nombreError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="telefono">
              Teléfono <span className="text-red-700">*</span>
            </label>
            <input
              className={baseInputClass}
              id="telefono"
              name="telefono"
              type="tel"
              autoComplete="tel"
              required
              maxLength={40}
              defaultValue={cliente.telefono}
              aria-invalid={Boolean(telefonoError)}
              aria-describedby={telefonoError ? "telefono-error" : undefined}
            />
            <FieldError id="telefono-error" message={telefonoError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="email">
              Correo electrónico <OptionalMark />
            </label>
            <input
              className={baseInputClass}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={160}
              defaultValue={cliente.email ?? ""}
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            <FieldError id="email-error" message={emailError} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="notas">
              Notas <OptionalMark />
            </label>
            <textarea
              className={`${baseInputClass} min-h-32 resize-y`}
              id="notas"
              name="notas"
              maxLength={1000}
              defaultValue={cliente.notas ?? ""}
              aria-invalid={Boolean(notasError)}
              aria-describedby={notasError ? "notas-error" : undefined}
            />
            <FieldError id="notas-error" message={notasError} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-zinc-500">
            Los campos marcados con * son obligatorios.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </form>
  );
}
