"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createClienteAction,
  type CreateClienteActionState,
} from "@/app/dashboard/clientes/nuevo/actions";
import type { ClienteField } from "@/lib/clientes";

const initialState: CreateClienteActionState = {
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

function getFieldError(state: CreateClienteActionState, field: ClienteField) {
  return state.fieldErrors?.[field];
}

const baseInputClass =
  "mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

const labelClass = "text-sm font-medium text-zinc-900";

export function ClienteForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createClienteAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  const nombreError = getFieldError(state, "name");
  const telefonoError = getFieldError(state, "phone");
  const emailError = getFieldError(state, "email");
  const notasError = getFieldError(state, "notes");

  return (
    <form
      ref={formRef}
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

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="name">
              Nombre <span className="text-red-700">*</span>
            </label>
            <input
              className={baseInputClass}
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              required
              maxLength={120}
              aria-invalid={Boolean(nombreError)}
              aria-describedby={nombreError ? "name-error" : undefined}
            />
            <FieldError id="name-error" message={nombreError} />
          </div>

          <div>
            <label className={labelClass} htmlFor="phone">
              Teléfono <span className="text-red-700">*</span>
            </label>
            <input
              className={baseInputClass}
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              maxLength={40}
              aria-invalid={Boolean(telefonoError)}
              aria-describedby={telefonoError ? "phone-error" : undefined}
            />
            <FieldError id="phone-error" message={telefonoError} />
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
              aria-invalid={Boolean(emailError)}
              aria-describedby={emailError ? "email-error" : undefined}
            />
            <FieldError id="email-error" message={emailError} />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass} htmlFor="notes">
              Notas <OptionalMark />
            </label>
            <textarea
              className={`${baseInputClass} min-h-32 resize-y`}
              id="notes"
              name="notes"
              maxLength={1000}
              aria-invalid={Boolean(notasError)}
              aria-describedby={notasError ? "notes-error" : undefined}
            />
            <FieldError id="notes-error" message={notasError} />
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
            {pending ? "Creando..." : "Crear cliente"}
          </button>
        </div>
      </div>
    </form>
  );
}
