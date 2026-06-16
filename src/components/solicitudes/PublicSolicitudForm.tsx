"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  submitPublicSolicitudAction,
  type SubmitPublicSolicitudActionState,
} from "@/app/solicitud/actions";
import {
  PRINT_COLOR_MODE_OPTIONS,
  PRINT_PAPER_SIZE_OPTIONS,
  PRINT_SIDES_OPTIONS,
  type PublicSolicitudField,
} from "@/lib/solicitudes/public-request-validation";
import { ENCARGO_SERVICE_TYPE_OPTIONS } from "@/lib/solicitudes/labels";
import { STORAGE_FILE_INPUT_ACCEPT } from "@/lib/storage/constants";
import { getTodayDateInputValue } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  type WorkflowType,
} from "@/lib/workflow-types";
import { CopyableCode } from "@/components/common/CopyableCode";
import {
  Alert,
  Button,
  FieldError,
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

const WORKFLOW_TABS = [
  {
    value: WORKFLOW_TYPES.ENCARGO,
    label: "Encargo personalizado",
    description: "Diseño, personalización, rotulación u otro trabajo a medida.",
  },
  {
    value: WORKFLOW_TYPES.IMPRESION,
    label: "Impresión",
    description: "Envía un documento listo para imprimir con sus indicaciones.",
  },
] as const;

function getFieldError(
  state: SubmitPublicSolicitudActionState,
  field: PublicSolicitudField,
) {
  return state.fieldErrors?.[field];
}

export function PublicSolicitudForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const workflowTabRefs = useRef<
    Record<WorkflowType, HTMLButtonElement | null>
  >({
    encargo: null,
    impresion: null,
  });
  const [workflowType, setWorkflowType] = useState<WorkflowType>(
    WORKFLOW_TYPES.ENCARGO,
  );
  const [state, formAction, pending] = useActionState(
    submitPublicSolicitudAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  function selectWorkflow(nextWorkflowType: WorkflowType, moveFocus = false) {
    setWorkflowType(nextWorkflowType);

    if (moveFocus) {
      workflowTabRefs.current[nextWorkflowType]?.focus();
    }
  }

  function handleWorkflowTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentWorkflowType: WorkflowType,
  ) {
    let nextWorkflowType: WorkflowType | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextWorkflowType =
        currentWorkflowType === WORKFLOW_TYPES.ENCARGO
          ? WORKFLOW_TYPES.IMPRESION
          : WORKFLOW_TYPES.ENCARGO;
    } else if (event.key === "Home") {
      nextWorkflowType = WORKFLOW_TYPES.ENCARGO;
    } else if (event.key === "End") {
      nextWorkflowType = WORKFLOW_TYPES.IMPRESION;
    }

    if (nextWorkflowType) {
      event.preventDefault();
      selectWorkflow(nextWorkflowType, true);
    }
  }

  const workflowTypeError = getFieldError(state, "workflow_type");
  const nombreError = getFieldError(state, "client_name");
  const telefonoError = getFieldError(state, "client_phone");
  const emailError = getFieldError(state, "client_email");
  const tipoServicioError = getFieldError(state, "service_type");
  const descripcionError = getFieldError(state, "description");
  const fechaDeseadaError = getFieldError(state, "desired_date");
  const observacionesError = getFieldError(state, "notes");
  const printCopiesError = getFieldError(state, "print_copies");
  const printColorModeError = getFieldError(state, "print_color_mode");
  const printPaperSizeError = getFieldError(state, "print_paper_size");
  const printSidesError = getFieldError(state, "print_sides");
  const filesError = getFieldError(state, "files");
  const isPrintWorkflow = workflowType === WORKFLOW_TYPES.IMPRESION;
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
          {state.ok && state.publicReference ? (
            <div className="mt-3 space-y-3">
              <CopyableCode
                code={state.publicReference}
                label="Código de seguimiento"
                helperText="Guarda este código. Lo usarás para consultar el estado de tu solicitud o pedido cuando la consulta esté disponible en el sistema."
                className="border-success/20 bg-surface"
              />
              {typeof state.uploadedFilesCount === "number" ? (
                <p className="text-sm text-text-secondary">
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
        title="¿Qué necesitas?"
        description="Elige la opción que mejor describe tu solicitud. Ambas llegan al mismo equipo para su revisión."
      >
        <input type="hidden" name="workflow_type" value={workflowType} />
        <div
          role="tablist"
          aria-label="Tipo de solicitud"
          aria-describedby={workflowTypeError ? "workflow_type-error" : undefined}
          className="grid gap-2 rounded-(--radius-card) border border-border bg-surface-muted p-2 sm:grid-cols-2"
        >
          {WORKFLOW_TABS.map((tab) => {
            const isActive = workflowType === tab.value;

            return (
              <button
                key={tab.value}
                ref={(element) => {
                  workflowTabRefs.current[tab.value] = element;
                }}
                id={`workflow-tab-${tab.value}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`workflow-panel-${tab.value}`}
                tabIndex={isActive ? 0 : -1}
                disabled={pending}
                onClick={() => selectWorkflow(tab.value)}
                onKeyDown={(event) =>
                  handleWorkflowTabKeyDown(event, tab.value)
                }
                className={[
                  "min-h-24 cursor-pointer rounded-(--radius-control) border px-4 py-3 text-left transition-[background-color,border-color,box-shadow,color] duration-200 disabled:cursor-not-allowed disabled:opacity-60",
                  isActive
                    ? "border-brand-primary bg-surface text-brand-primary shadow-(--shadow-soft)"
                    : "border-transparent bg-transparent text-text-primary hover:border-border-strong hover:bg-surface/70",
                ].join(" ")}
              >
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span
                  className={[
                    "mt-1 block text-sm leading-5",
                    isActive ? "text-text-primary" : "text-text-secondary",
                  ].join(" ")}
                >
                  {tab.description}
                </span>
              </button>
            );
          })}
        </div>
        {workflowTypeError ? (
          <FieldError id="workflow_type-error">{workflowTypeError}</FieldError>
        ) : null}
      </FormSection>

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

      <div
        id={`workflow-panel-${workflowType}`}
        role="tabpanel"
        aria-labelledby={`workflow-tab-${workflowType}`}
        className="space-y-6"
      >
        {isPrintWorkflow ? (
          <FormSection
            title="2. Datos de impresión"
            description="Indica cómo debemos preparar el documento. Confirmaremos contigo cualquier detalle antes de producirlo."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                id="print_copies"
                label="Cantidad de copias"
                required
                error={printCopiesError}
              >
                {({ describedBy, invalid }) => (
                  <Input
                    id="print_copies"
                    name="print_copies"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={10000}
                    step={1}
                    defaultValue={state.values?.print_copies ?? ""}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </FormField>

              <FormField
                id="print_color_mode"
                label="Modo de color"
                required
                error={printColorModeError}
              >
                {({ describedBy, invalid }) => (
                  <Select
                    id="print_color_mode"
                    name="print_color_mode"
                    defaultValue={state.values?.print_color_mode ?? ""}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                  >
                    <option value="" disabled>
                      Selecciona una opción
                    </option>
                    {PRINT_COLOR_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>

              <FormField
                id="print_paper_size"
                label="Tamaño de papel"
                required
                error={printPaperSizeError}
              >
                {({ describedBy, invalid }) => (
                  <Select
                    id="print_paper_size"
                    name="print_paper_size"
                    defaultValue={state.values?.print_paper_size ?? ""}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                  >
                    <option value="" disabled>
                      Selecciona una opción
                    </option>
                    {PRINT_PAPER_SIZE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>

              <FormField
                id="print_sides"
                label="Caras"
                required
                error={printSidesError}
              >
                {({ describedBy, invalid }) => (
                  <Select
                    id="print_sides"
                    name="print_sides"
                    defaultValue={state.values?.print_sides ?? ""}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                  >
                    <option value="" disabled>
                      Selecciona una opción
                    </option>
                    {PRINT_SIDES_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>

              <FormField
                id="notes"
                label="Observaciones"
                error={observacionesError}
                help="Por ejemplo: grapar, ordenar páginas o cualquier indicación especial."
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
        ) : (
          <FormSection
            title="2. Detalles del encargo"
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
                    {ENCARGO_SERVICE_TYPE_OPTIONS.map((option) => (
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
        )}

        <FormSection
          title={
            isPrintWorkflow
              ? "3. Documento para imprimir"
              : "3. Archivos de referencia"
          }
          description={
            isPrintWorkflow
              ? "Adjunta el documento que deseas imprimir. El archivo es obligatorio para enviar esta solicitud."
              : "Adjunta diseños, imágenes, logos, documentos o referencias que nos ayuden a entender mejor el trabajo."
          }
        >
          <FormField
            id="files"
            label={
              isPrintWorkflow
                ? "Seleccionar documento"
                : "Seleccionar archivos"
            }
            required={isPrintWorkflow}
            error={filesError}
            help={
              <span className="block space-y-1">
                <span className="block">
                  Hasta 5 archivos, con un máximo de 20 MB por archivo.
                </span>
                <span className="block">
                  Formatos permitidos: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX y
                  ZIP.
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
                required={isPrintWorkflow}
                accept={STORAGE_FILE_INPUT_ACCEPT}
                invalid={invalid}
                aria-describedby={describedBy}
                disabled={pending}
                className="min-h-12 cursor-pointer p-1 text-sm file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-(--radius-control) file:border-0 file:bg-brand-primary-soft file:px-4 file:text-sm file:font-semibold file:text-brand-primary hover:file:bg-info-soft"
              />
            )}
          </FormField>
        </FormSection>
      </div>

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
