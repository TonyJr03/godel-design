"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  submitPublicSolicitudAction,
  type SubmitPublicSolicitudActionState,
} from "@/app/solicitud/actions";
import type { PublicSolicitudField } from "@/lib/solicitudes";

const initialState: SubmitPublicSolicitudActionState = {
  ok: false,
  message: "",
};

function getFieldError(
  state: SubmitPublicSolicitudActionState,
  field: PublicSolicitudField,
) {
  return state.fieldErrors?.[field];
}

type FieldErrorProps = {
  id: string;
  message?: string;
};

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

const baseInputClass =
  "mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

const labelClass = "text-sm font-medium text-zinc-900";
const helpTextClass = "mt-2 text-sm leading-5 text-zinc-500";

export function PublicSolicitudForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    submitPublicSolicitudAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  const nombreError = getFieldError(state, "cliente_nombre");
  const telefonoError = getFieldError(state, "cliente_telefono");
  const emailError = getFieldError(state, "cliente_email");
  const tipoServicioError = getFieldError(state, "tipo_servicio");
  const descripcionError = getFieldError(state, "descripcion");
  const cantidadError = getFieldError(state, "cantidad");
  const fechaDeseadaError = getFieldError(state, "fecha_deseada");
  const observacionesError = getFieldError(state, "observaciones");

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="space-y-8">
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
            <p className="font-medium">{state.message}</p>
            {state.ok && state.solicitudId ? (
              <p className="mt-1 text-teal-800">
                Referencia:{" "}
                <span className="font-mono text-xs font-semibold">
                  {state.solicitudId}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

        <section aria-labelledby="contacto-heading">
          <h2
            id="contacto-heading"
            className="text-lg font-semibold text-zinc-950"
          >
            Datos de contacto
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="cliente_nombre">
                Nombre del cliente <span className="text-red-700">*</span>
              </label>
              <input
                className={baseInputClass}
                id="cliente_nombre"
                name="cliente_nombre"
                type="text"
                autoComplete="name"
                required
                aria-invalid={Boolean(nombreError)}
                aria-describedby={
                  nombreError ? "cliente_nombre-error" : undefined
                }
              />
              <FieldError id="cliente_nombre-error" message={nombreError} />
            </div>

            <div>
              <label className={labelClass} htmlFor="cliente_telefono">
                Telefono <span className="text-red-700">*</span>
              </label>
              <input
                className={baseInputClass}
                id="cliente_telefono"
                name="cliente_telefono"
                type="tel"
                autoComplete="tel"
                required
                aria-invalid={Boolean(telefonoError)}
                aria-describedby={
                  telefonoError ? "cliente_telefono-error" : undefined
                }
              />
              <FieldError
                id="cliente_telefono-error"
                message={telefonoError}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="cliente_email">
                Email opcional
              </label>
              <input
                className={baseInputClass}
                id="cliente_email"
                name="cliente_email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "cliente_email-error" : undefined}
              />
              <FieldError id="cliente_email-error" message={emailError} />
            </div>
          </div>
        </section>

        <section aria-labelledby="trabajo-heading">
          <h2
            id="trabajo-heading"
            className="text-lg font-semibold text-zinc-950"
          >
            Detalles del trabajo
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="tipo_servicio">
                Tipo de servicio <span className="text-red-700">*</span>
              </label>
              <select
                className={baseInputClass}
                id="tipo_servicio"
                name="tipo_servicio"
                required
                aria-invalid={Boolean(tipoServicioError)}
                aria-describedby={
                  tipoServicioError ? "tipo_servicio-error" : undefined
                }
                defaultValue=""
              >
                <option value="" disabled>
                  Selecciona una opcion
                </option>
                <option value="Impresion">Impresion</option>
                <option value="Diseno grafico">Diseno grafico</option>
                <option value="Personalizacion">Personalizacion</option>
                <option value="Rotulacion">Rotulacion</option>
                <option value="Otro">Otro</option>
              </select>
              <FieldError
                id="tipo_servicio-error"
                message={tipoServicioError}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="cantidad">
                Cantidad opcional
              </label>
              <input
                className={baseInputClass}
                id="cantidad"
                name="cantidad"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                aria-invalid={Boolean(cantidadError)}
                aria-describedby={cantidadError ? "cantidad-error" : undefined}
              />
              <FieldError id="cantidad-error" message={cantidadError} />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="descripcion">
                Descripcion del trabajo{" "}
                <span className="text-red-700">*</span>
              </label>
              <textarea
                className={`${baseInputClass} min-h-36 resize-y`}
                id="descripcion"
                name="descripcion"
                required
                aria-invalid={Boolean(descripcionError)}
                aria-describedby={
                  descripcionError ? "descripcion-error" : "descripcion-help"
                }
              />
              <p id="descripcion-help" className={helpTextClass}>
                Incluye medidas, materiales, colores, textos o cualquier detalle
                importante.
              </p>
              <FieldError id="descripcion-error" message={descripcionError} />
            </div>

            <div>
              <label className={labelClass} htmlFor="fecha_deseada">
                Fecha deseada opcional
              </label>
              <input
                className={baseInputClass}
                id="fecha_deseada"
                name="fecha_deseada"
                type="date"
                aria-invalid={Boolean(fechaDeseadaError)}
                aria-describedby={
                  fechaDeseadaError ? "fecha_deseada-error" : undefined
                }
              />
              <FieldError
                id="fecha_deseada-error"
                message={fechaDeseadaError}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="observaciones">
                Observaciones opcionales
              </label>
              <textarea
                className={`${baseInputClass} min-h-28 resize-y`}
                id="observaciones"
                name="observaciones"
                aria-invalid={Boolean(observacionesError)}
                aria-describedby={
                  observacionesError ? "observaciones-error" : undefined
                }
              />
              <FieldError
                id="observaciones-error"
                message={observacionesError}
              />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-3 border-t border-zinc-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-zinc-500">
            Los campos marcados con * son obligatorios.
          </p>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Enviando..." : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </form>
  );
}
