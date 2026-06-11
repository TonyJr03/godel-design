"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  submitPublicSolicitudAction,
  type SubmitPublicSolicitudActionState,
} from "@/app/solicitud/actions";
import { getTodayDateInputValue } from "@/lib/utils";
import { SOLICITUD_SERVICE_TYPE_OPTIONS } from "@/lib/solicitudes/labels";
import type { PublicSolicitudField } from "@/lib/solicitudes";
import { STORAGE_FILE_INPUT_ACCEPT } from "@/lib/storage/constants";
import {
  Alert,
  Button,
  FormActions,
  FormField,
  FormSection,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

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
  const fechaDeseadaError = getFieldError(state, "desired_date");
  const observacionesError = getFieldError(state, "notes");
  const filesError = getFieldError(state, "files");
  const solicitudReference = state.solicitudId?.slice(0, 8);
  const todayInputDate = getTodayDateInputValue();
  const formKey = state.ok
    ? `success-${state.solicitudId ?? "ok"}`
    : `form-${JSON.stringify(state.values ?? {})}`;

  return (
    <form
      key={formKey}
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      className="space-y-6"
    >
      {state.message ? (
        <Alert
          variant={state.ok ? "success" : "danger"}
          title={state.ok ? "Hemos recibido tu solicitud" : "Revisa la solicitud"}
          aria-live="polite"
          className="px-5 py-4"
        >
          <p className="leading-6">{state.message}</p>
          {state.ok && solicitudReference ? (
            <div className="mt-3 rounded-(--radius-control) border border-success/20 bg-surface/70 px-3 py-3">
              <p className="text-sm text-text-secondary">
                Guarda esta referencia por si necesitas identificar la
                solicitud:
              </p>
              <p className="mt-1 font-mono text-base font-semibold text-text-primary">
                {solicitudReference}
              </p>
              {typeof state.uploadedFilesCount === "number" ? (
                <p className="mt-2 text-sm text-text-secondary">
                  Archivos recibidos:{" "}
                  <span className="font-semibold text-text-primary">
                    {state.uploadedFilesCount}
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          {state.fileWarning ? (
            <div className="mt-3 rounded-(--radius-control) border border-warning/30 bg-warning-soft px-3 py-2 text-warning">
              {state.fileWarning}
            </div>
          ) : null}
          {state.fileErrors && state.fileErrors.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-danger">
              {state.fileErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
          {state.ok ? (
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              El equipo revisará la información y se pondrá en contacto contigo
              para confirmar los siguientes pasos.
            </p>
          ) : null}
        </Alert>
      ) : null}

      <FormSection
        title="1. Datos de contacto"
        description="Indícanos cómo podemos comunicarnos contigo para revisar la solicitud."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="client_name"
            label="Nombre del cliente"
            required
            error={nombreError}
          >
            {({ describedBy, invalid }) => (
              <Input
                id="client_name"
                name="client_name"
                type="text"
                autoComplete="name"
                defaultValue={state.values?.client_name ?? ""}
                required
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </FormField>

          <FormField
            id="client_phone"
            label="Teléfono"
            required
            error={telefonoError}
          >
            {({ describedBy, invalid }) => (
              <Input
                id="client_phone"
                name="client_phone"
                type="tel"
                autoComplete="tel"
                defaultValue={state.values?.client_phone ?? ""}
                required
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </FormField>

          <FormField
            id="client_email"
            label="Correo electrónico"
            error={emailError}
            help="Si lo indicas, también podremos responderte por correo."
            className="sm:col-span-2"
          >
            {({ describedBy, invalid }) => (
              <Input
                id="client_email"
                name="client_email"
                type="email"
                autoComplete="email"
                defaultValue={state.values?.client_email ?? ""}
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title="2. Detalles del trabajo"
        description="No necesitas tenerlo todo decidido. Comparte lo que sabes y aclararemos el resto contigo."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="service_type"
            label="Tipo de servicio"
            required
            error={tipoServicioError}
          >
            {({ describedBy, invalid }) => (
              <Select
                id="service_type"
                name="service_type"
                required
                invalid={invalid}
                aria-describedby={describedBy}
                defaultValue={state.values?.service_type ?? ""}
              >
                <option value="" disabled>
                  Selecciona una opción
                </option>
                {SOLICITUD_SERVICE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField
            id="desired_date"
            label="Fecha deseada"
            error={fechaDeseadaError}
            help="La disponibilidad y la fecha final se confirmarán contigo."
          >
            {({ describedBy, invalid }) => (
              <Input
                id="desired_date"
                name="desired_date"
                type="date"
                defaultValue={state.values?.desired_date ?? ""}
                min={todayInputDate}
                invalid={invalid}
                aria-describedby={describedBy}
              />
            )}
          </FormField>

          <FormField
            id="description"
            label="Descripción del trabajo"
            required
            error={descripcionError}
            help="Incluye cantidades, medidas, colores, materiales, textos o cualquier indicación importante."
            className="sm:col-span-2"
          >
            {({ describedBy, invalid }) => (
              <Textarea
                id="description"
                name="description"
                defaultValue={state.values?.description ?? ""}
                required
                invalid={invalid}
                aria-describedby={describedBy}
                className="min-h-40"
              />
            )}
          </FormField>

          <FormField
            id="notes"
            label="Observaciones adicionales"
            error={observacionesError}
            help="Añade aquí cualquier contexto que no encaje en la descripción."
            className="sm:col-span-2"
          >
            {({ describedBy, invalid }) => (
              <Textarea
                id="notes"
                name="notes"
                defaultValue={state.values?.notes ?? ""}
                invalid={invalid}
                aria-describedby={describedBy}
                className="min-h-28"
              />
            )}
          </FormField>
        </div>
      </FormSection>

      <FormSection
        title="3. Archivos de referencia"
        description="Adjunta diseños, imágenes, logos, documentos o referencias que nos ayuden a entender mejor el trabajo."
      >
        <FormField
          id="files"
          label="Seleccionar archivos"
          error={filesError}
          help={
            <span className="block space-y-1">
              <span className="block">Hasta 5 archivos, con un máximo de 20 MB por archivo.</span>
              <span className="block">
                Formatos permitidos: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX y ZIP.
              </span>
              <span className="block">
                Los archivos se usarán únicamente para revisar tu solicitud.
              </span>
            </span>
          }
        >
          {({ describedBy, invalid }) => (
            <Input
              id="files"
              name="files"
              type="file"
              multiple
              accept={STORAGE_FILE_INPUT_ACCEPT}
              invalid={invalid}
              aria-describedby={describedBy}
              disabled={pending}
              className="min-h-12 cursor-pointer p-1 text-sm file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-(--radius-control) file:border-0 file:bg-brand-primary-soft file:px-4 file:text-sm file:font-semibold file:text-brand-primary hover:file:bg-info-soft"
            />
          )}
        </FormField>
      </FormSection>

      <FormSection
        title="4. Revisa y envía"
        description="Al enviar, registraremos la solicitud para que el equipo pueda revisarla y contactarte."
      >
        <div className="rounded-(--radius-control) border border-border bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
          <p>
            La solicitud no confirma todavía el precio, la fecha ni el inicio
            del trabajo. Esos detalles se acordarán contigo antes de preparar
            el pedido.
          </p>
        </div>
        <FormActions
          note="Los campos marcados con * son obligatorios."
          className="mt-6"
        >
          <Button
            type="submit"
            size="lg"
            disabled={pending}
            className="w-full sm:w-auto"
          >
            {pending ? "Enviando solicitud..." : "Enviar solicitud"}
          </Button>
        </FormActions>
      </FormSection>
    </form>
  );
}
