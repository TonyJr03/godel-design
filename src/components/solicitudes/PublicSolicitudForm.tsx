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

const baseInputClass =
  "mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20";

const labelClass = "text-sm font-medium text-zinc-900";
const helpTextClass = "mt-2 text-sm leading-5 text-zinc-500";

function getTodayInputDate() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

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

  const nombreError = getFieldError(state, "client_name");
  const telefonoError = getFieldError(state, "client_phone");
  const emailError = getFieldError(state, "client_email");
  const tipoServicioError = getFieldError(state, "service_type");
  const descripcionError = getFieldError(state, "description");
  const cantidadError = getFieldError(state, "quantity");
  const fechaDeseadaError = getFieldError(state, "desired_date");
  const observacionesError = getFieldError(state, "notes");
  const filesError = getFieldError(state, "files");
  const solicitudReference = state.solicitudId?.slice(0, 8);
  const todayInputDate = getTodayInputDate();
  const formKey = state.ok
    ? `success-${state.solicitudId ?? "ok"}`
    : `form-${JSON.stringify(state.values ?? {})}`;

  return (
    <form
      key={formKey}
      ref={formRef}
      action={formAction}
      aria-busy={pending}
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
            {state.ok && solicitudReference ? (
              <div className="mt-1 space-y-1 text-teal-800">
                <p>
                  Referencia de solicitud:{" "}
                  <span className="font-mono text-sm font-semibold">
                    {solicitudReference}
                  </span>
                </p>
                {typeof state.uploadedFilesCount === "number" ? (
                  <p>
                    Archivos recibidos:{" "}
                    <span className="font-semibold">
                      {state.uploadedFilesCount}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
            {state.fileWarning ? (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                {state.fileWarning}
              </p>
            ) : null}
            {state.fileErrors && state.fileErrors.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-red-800">
                {state.fileErrors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
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
              <label className={labelClass} htmlFor="client_name">
                Nombre del cliente <span className="text-red-700">*</span>
              </label>
              <input
                className={baseInputClass}
                id="client_name"
                name="client_name"
                type="text"
                autoComplete="name"
                defaultValue={state.values?.client_name ?? ""}
                required
                aria-invalid={Boolean(nombreError)}
                aria-describedby={
                  nombreError ? "client_name-error" : undefined
                }
              />
              <FieldError id="client_name-error" message={nombreError} />
            </div>

            <div>
              <label className={labelClass} htmlFor="client_phone">
                Teléfono <span className="text-red-700">*</span>
              </label>
              <input
                className={baseInputClass}
                id="client_phone"
                name="client_phone"
                type="tel"
                autoComplete="tel"
                defaultValue={state.values?.client_phone ?? ""}
                required
                aria-invalid={Boolean(telefonoError)}
                aria-describedby={
                  telefonoError ? "client_phone-error" : undefined
                }
              />
              <FieldError
                id="client_phone-error"
                message={telefonoError}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="client_email">
                Email <OptionalMark />
              </label>
              <input
                className={baseInputClass}
                id="client_email"
                name="client_email"
                type="email"
                autoComplete="email"
                defaultValue={state.values?.client_email ?? ""}
                aria-invalid={Boolean(emailError)}
                aria-describedby={emailError ? "client_email-error" : undefined}
              />
              <FieldError id="client_email-error" message={emailError} />
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
              <label className={labelClass} htmlFor="service_type">
                Tipo de servicio <span className="text-red-700">*</span>
              </label>
              <select
                className={baseInputClass}
                id="service_type"
                name="service_type"
                required
                aria-invalid={Boolean(tipoServicioError)}
                aria-describedby={
                  tipoServicioError ? "service_type-error" : undefined
                }
                defaultValue={state.values?.service_type ?? ""}
              >
                <option value="" disabled>
                  Selecciona una opción
                </option>
                <option value="Impresion">Impresión</option>
                <option value="Diseno grafico">Diseño gráfico</option>
                <option value="Personalizacion">Personalización</option>
                <option value="Rotulacion">Rotulación</option>
                <option value="Otro">Otro</option>
              </select>
              <FieldError
                id="service_type-error"
                message={tipoServicioError}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="quantity">
                Cantidad <OptionalMark />
              </label>
              <input
                className={baseInputClass}
                id="quantity"
                name="quantity"
                type="number"
                defaultValue={state.values?.quantity ?? ""}
                min="1"
                step="1"
                inputMode="numeric"
                aria-invalid={Boolean(cantidadError)}
                aria-describedby={cantidadError ? "quantity-error" : undefined}
              />
              <FieldError id="quantity-error" message={cantidadError} />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="description">
                Descripción del trabajo{" "}
                <span className="text-red-700">*</span>
              </label>
              <textarea
                className={`${baseInputClass} min-h-36 resize-y`}
                id="description"
                name="description"
                defaultValue={state.values?.description ?? ""}
                required
                aria-invalid={Boolean(descripcionError)}
                aria-describedby={
                  descripcionError ? "description-error" : "description-help"
                }
              />
              <p id="description-help" className={helpTextClass}>
                Incluye medidas, materiales, colores, textos o cualquier detalle
                importante.
              </p>
              <FieldError id="description-error" message={descripcionError} />
            </div>

            <div>
              <label className={labelClass} htmlFor="desired_date">
                Fecha deseada <OptionalMark />
              </label>
              <input
                className={baseInputClass}
                id="desired_date"
                name="desired_date"
                type="date"
                defaultValue={state.values?.desired_date ?? ""}
                min={todayInputDate}
                aria-invalid={Boolean(fechaDeseadaError)}
                aria-describedby={
                  fechaDeseadaError ? "desired_date-error" : undefined
                }
              />
              <FieldError
                id="desired_date-error"
                message={fechaDeseadaError}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="notes">
                Observaciones <OptionalMark />
              </label>
              <textarea
                className={`${baseInputClass} min-h-28 resize-y`}
                id="notes"
                name="notes"
                defaultValue={state.values?.notes ?? ""}
                aria-invalid={Boolean(observacionesError)}
                aria-describedby={
                  observacionesError ? "notes-error" : undefined
                }
              />
              <FieldError
                id="notes-error"
                message={observacionesError}
              />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="files">
                Archivos de referencia <OptionalMark />
              </label>
              <input
                className="mt-2 block w-full rounded-md border border-zinc-300 bg-white text-sm text-zinc-950 shadow-sm file:mr-4 file:min-h-10 file:border-0 file:bg-zinc-100 file:px-4 file:text-sm file:font-semibold file:text-zinc-700 hover:file:bg-zinc-200 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                id="files"
                name="files"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.zip"
                aria-invalid={Boolean(filesError)}
                aria-describedby={filesError ? "files-error" : "files-help"}
                disabled={pending}
              />
              <div id="files-help" className={helpTextClass}>
                <p>Puedes adjuntar hasta 5 archivos.</p>
                <p>
                  Formatos permitidos: PDF, JPG, PNG, WEBP, DOC, DOCX y ZIP.
                </p>
                <p>Tamaño máximo: 20 MB por archivo.</p>
                <p>Los archivos se usarán solo para revisar tu solicitud.</p>
              </div>
              <FieldError id="files-error" message={filesError} />
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
