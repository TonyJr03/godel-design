"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  startPublicSolicitudAction,
  type PublicSolicitudSubmittedValues,
} from "@/app/(publico)/solicitud/actions";
import { CopyableCode } from "@/components/common/CopyableCode";
import { PublicSolicitudUploadQueue } from "@/components/solicitudes/PublicSolicitudUploadQueue";
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
import type { PublicServiceType } from "@/lib/service-types";
import {
  PRINT_COLOR_MODE_OPTIONS,
  PRINT_PAPER_SIZE_OPTIONS,
  PRINT_SIDES_OPTIONS,
  type PublicSolicitudField,
  type PublicSolicitudFieldErrors,
} from "@/lib/solicitudes/public-request-validation";
import {
  MAX_STORAGE_FILE_SIZE_BYTES,
  MAX_UPLOAD_SESSION_ITEMS,
  PPO03_MIME_BY_EXTENSION,
  PPO03_STORAGE_FILE_INPUT_ACCEPT,
} from "@/lib/storage/constants";
import { getFileExtension } from "@/lib/storage/file-name";
import type { PublicUploadReservation } from "@/lib/storage/upload-control/types";
import { getTodayDateInputValue } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  type WorkflowType,
} from "@/lib/workflow-types";

type PublicSolicitudFormProps = {
  serviceTypes: PublicServiceType[];
};

type PublicSolicitudFormState = {
  status: "idle" | "error" | "completed" | "reserved";
  message: string;
  fieldErrors?: PublicSolicitudFieldErrors;
  values?: PublicSolicitudSubmittedValues;
  solicitudId?: string;
  publicReference?: string;
};

type PublicSolicitudSubmission =
  | {
      kind: "completed";
      solicitudId: string;
      publicReference: string;
    }
  | {
      kind: "reserved";
      reservation: PublicUploadReservation;
      files: File[];
    };

const initialState: PublicSolicitudFormState = {
  status: "idle",
  message: "",
};

const workflowCopy = {
  [WORKFLOW_TYPES.ENCARGO]: {
    label: "Encargo personalizado",
    description:
      "Cuéntanos los detalles del trabajo a medida que necesitas preparar.",
  },
  [WORKFLOW_TYPES.IMPRESION]: {
    label: "Impresión",
    description:
      "Envía un documento listo para imprimir con sus indicaciones.",
  },
} as const satisfies Record<
  WorkflowType,
  { label: string; description: string }
>;

function getFieldError(
  state: PublicSolicitudFormState,
  field: PublicSolicitudField,
) {
  return state.fieldErrors?.[field];
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getBrowserFileValidationMessage(
  files: readonly File[],
  isPrintWorkflow: boolean,
) {
  if (files.length === 0) {
    return isPrintWorkflow
      ? "Para solicitar una impresión debes adjuntar el documento a imprimir."
      : null;
  }

  if (files.length > MAX_UPLOAD_SESSION_ITEMS) {
    return `Puedes adjuntar hasta ${MAX_UPLOAD_SESSION_ITEMS} archivos.`;
  }

  for (const file of files) {
    if (!file.name.trim() || file.size <= 0) {
      return "Cada archivo debe tener un nombre y contenido válido.";
    }

    if (file.size > MAX_STORAGE_FILE_SIZE_BYTES) {
      return `Cada archivo puede pesar como máximo ${formatFileSize(MAX_STORAGE_FILE_SIZE_BYTES)}.`;
    }

    const extension = getFileExtension(file.name);
    if (!extension || !(extension in PPO03_MIME_BY_EXTENSION)) {
      return "Selecciona archivos PDF, imagen, documento, ZIP, RAR o CDR permitidos.";
    }
  }

  return null;
}

function getSubmittedValues(form: HTMLFormElement): PublicSolicitudSubmittedValues {
  const formData = new FormData(form);
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    service_id: read("service_id"),
    client_name: read("client_name"),
    client_phone: read("client_phone"),
    client_email: read("client_email"),
    description: read("description"),
    desired_date: read("desired_date"),
    notes: read("notes"),
    print_copies: read("print_copies"),
    print_color_mode: read("print_color_mode"),
    print_paper_size: read("print_paper_size"),
    print_sides: read("print_sides"),
  };
}

function getAvailableWorkflows({
  encargoServices,
  printService,
}: {
  encargoServices: PublicServiceType[];
  printService?: PublicServiceType;
}): WorkflowType[] {
  return [
    ...(encargoServices.length > 0 ? [WORKFLOW_TYPES.ENCARGO] : []),
    ...(printService ? [WORKFLOW_TYPES.IMPRESION] : []),
  ];
}

function getServiceById(serviceTypes: PublicServiceType[], serviceId?: string) {
  if (!serviceId) {
    return undefined;
  }

  return serviceTypes.find((serviceType) => serviceType.id === serviceId);
}

export function PublicSolicitudForm({
  serviceTypes,
}: PublicSolicitudFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const lastServiceIdErrorRefreshStateRef =
    useRef<PublicSolicitudFormState | null>(null);
  const workflowTabRefs = useRef<
    Partial<Record<WorkflowType, HTMLButtonElement | null>>
  >({});
  const encargoServices = serviceTypes.filter(
    (serviceType) => serviceType.workflowType === WORKFLOW_TYPES.ENCARGO,
  );
  const printService = serviceTypes.find(
    (serviceType) => serviceType.workflowType === WORKFLOW_TYPES.IMPRESION,
  );
  const availableWorkflows = getAvailableWorkflows({
    encargoServices,
    printService,
  });
  const [state, setState] = useState<PublicSolicitudFormState>(initialState);
  const [submission, setSubmission] = useState<PublicSolicitudSubmission | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const preservedService = getServiceById(
    serviceTypes,
    state.values?.service_id,
  );
  const initialWorkflow =
    preservedService?.workflowType ??
    availableWorkflows[0] ??
    WORKFLOW_TYPES.ENCARGO;
  const [workflowType, setWorkflowType] =
    useState<WorkflowType>(initialWorkflow);
  const initialEncargoServiceId =
    preservedService?.workflowType === WORKFLOW_TYPES.ENCARGO
      ? preservedService.id
      : encargoServices[0]?.id ?? "";
  const [selectedEncargoServiceId, setSelectedEncargoServiceId] = useState(
    initialEncargoServiceId,
  );
  const currentWorkflow = availableWorkflows.includes(workflowType)
    ? workflowType
    : initialWorkflow;
  const effectiveSelectedEncargoServiceId = encargoServices.some(
    (serviceType) => serviceType.id === selectedEncargoServiceId,
  )
    ? selectedEncargoServiceId
    : encargoServices[0]?.id ?? "";
  const selectedEncargoService =
    encargoServices.find(
      (serviceType) => serviceType.id === effectiveSelectedEncargoServiceId,
    ) ??
    encargoServices[0] ??
    null;
  const activeService =
    currentWorkflow === WORKFLOW_TYPES.IMPRESION
      ? printService
      : selectedEncargoService;
  const hasTwoWorkflows = availableWorkflows.length > 1;
  const serviceIdError = getFieldError(state, "service_id");

  useEffect(() => {
    if (
      state.status === "error" &&
      serviceIdError &&
      lastServiceIdErrorRefreshStateRef.current !== state
    ) {
      lastServiceIdErrorRefreshStateRef.current = state;
      router.refresh();
    }
  }, [router, serviceIdError, state]);

  function selectWorkflow(nextWorkflowType: WorkflowType, moveFocus = false) {
    if (isStarting || submission) return;
    setWorkflowType(nextWorkflowType);

    if (moveFocus) {
      workflowTabRefs.current[nextWorkflowType]?.focus();
    }
  }

  function handleWorkflowTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTabWorkflowType: WorkflowType,
  ) {
    const currentIndex = availableWorkflows.indexOf(currentTabWorkflowType);
    let nextIndex: number | null = null;

    if (event.key === "ArrowLeft") {
      nextIndex =
        (currentIndex - 1 + availableWorkflows.length) %
        availableWorkflows.length;
    } else if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % availableWorkflows.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = availableWorkflows.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      selectWorkflow(availableWorkflows[nextIndex], true);
    }
  }

  const nombreError = getFieldError(state, "client_name");
  const telefonoError = getFieldError(state, "client_phone");
  const emailError = getFieldError(state, "client_email");
  const descripcionError = getFieldError(state, "description");
  const fechaDeseadaError = getFieldError(state, "desired_date");
  const observacionesError = getFieldError(state, "notes");
  const printCopiesError = getFieldError(state, "print_copies");
  const printColorModeError = getFieldError(state, "print_color_mode");
  const printPaperSizeError = getFieldError(state, "print_paper_size");
  const printSidesError = getFieldError(state, "print_sides");
  const filesError = getFieldError(state, "files");
  const isPrintWorkflow = currentWorkflow === WORKFLOW_TYPES.IMPRESION;
  const todayInputDate = getTodayDateInputValue();
  const isSubmissionLocked = submission !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isStarting || isSubmissionLocked) return;

    const files = selectedFiles;
    const browserError = getBrowserFileValidationMessage(files, isPrintWorkflow);
    const values = getSubmittedValues(event.currentTarget);

    if (browserError) {
      setState({
        status: "error",
        message: "Revisa los archivos adjuntos antes de enviar la solicitud.",
        fieldErrors: { files: browserError },
        values,
      });
      return;
    }

    setIsStarting(true);
    setState({ status: "idle", message: "" });
    try {
      const result = await startPublicSolicitudAction({
        values,
        candidates: files.map((file) => ({ name: file.name, size: file.size })),
      });

      if (!result.ok) {
        setState({
          status: "error",
          message: result.message,
          fieldErrors: result.fieldErrors,
          values,
        });
        return;
      }

      if (result.kind === "completed") {
        setSubmission({
          kind: "completed",
          solicitudId: result.solicitudId,
          publicReference: result.publicReference,
        });
        setState({
          status: "completed",
          message: "Solicitud enviada correctamente. Nos pondremos en contacto contigo.",
          solicitudId: result.solicitudId,
          publicReference: result.publicReference,
        });
        return;
      }

      setSubmission({ kind: "reserved", reservation: result.reservation, files });
      setState({
        status: "reserved",
        message: "Solicitud registrada. Estamos adjuntando tus archivos.",
        solicitudId: result.reservation.solicitudId,
        publicReference: result.reservation.publicReference,
      });
      setSelectedFiles([]);
    } catch {
      setState({
        status: "error",
        message: "No se pudo registrar la solicitud. Inténtalo nuevamente.",
        values,
      });
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      aria-busy={isStarting}
      className="space-y-5 sm:space-y-6"
    >
      {state.message ? (
        <Alert
          variant={state.status === "error" ? "danger" : "success"}
          title={state.status === "error" ? "Revisa la solicitud" : "Solicitud registrada"}
          aria-live="polite"
          className="px-5 py-4 shadow-(--shadow-soft)"
        >
          <p className="leading-6">{state.message}</p>
          {state.status !== "error" && state.publicReference ? (
            <div className="mt-3 space-y-3">
              <CopyableCode
                code={state.publicReference}
                label="Código de seguimiento"
                helperText="Guarda este código. Lo usarás para consultar el estado de tu solicitud o pedido cuando la consulta esté disponible en el sistema."
                className="border-success/25 bg-surface shadow-(--shadow-soft)"
              />
              {state.status === "completed" ? (
                <p className="text-sm text-text-secondary">
                  Archivos recibidos:{" "}
                  <span className="font-semibold text-text-primary">
                    0
                  </span>
                </p>
              ) : null}
            </div>
          ) : null}
          {state.status === "completed" ? (
            <p className="mt-3 text-sm leading-6 text-text-secondary">
              El equipo revisará la información y se pondrá en contacto contigo
              para confirmar los siguientes pasos.
            </p>
          ) : null}
        </Alert>
      ) : null}

      <fieldset
        disabled={isStarting || isSubmissionLocked}
        className="space-y-5 border-0 p-0 sm:space-y-6"
      >
      <FormSection
        title="¿Qué necesitas?"
        description={
          hasTwoWorkflows
            ? "Elige la opción que mejor describe tu solicitud."
            : workflowCopy[currentWorkflow].description
        }
        className="border-brand-primary/12"
      >
        {hasTwoWorkflows ? (
          <div
            role="tablist"
            aria-label="Tipo de solicitud"
            className="grid gap-2 rounded-(--radius-card) border border-brand-primary/15 bg-brand-primary-soft p-2 sm:grid-cols-2"
          >
            {availableWorkflows.map((availableWorkflow) => {
              const tab = workflowCopy[availableWorkflow];
              const isActive = currentWorkflow === availableWorkflow;

              return (
                <button
                  key={availableWorkflow}
                  ref={(element) => {
                    workflowTabRefs.current[availableWorkflow] = element;
                  }}
                  id={`workflow-tab-${availableWorkflow}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`workflow-panel-${availableWorkflow}`}
                  tabIndex={isActive ? 0 : -1}
                  disabled={isStarting || isSubmissionLocked}
                  onClick={() => selectWorkflow(availableWorkflow)}
                  onKeyDown={(event) =>
                    handleWorkflowTabKeyDown(event, availableWorkflow)
                  }
                  className={[
                    "min-h-24 cursor-pointer rounded-(--radius-control) border px-4 py-3 text-left transition-[background-color,border-color,box-shadow,color] duration-200 motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-60",
                    isActive
                      ? "border-brand-primary bg-brand-primary text-white shadow-(--shadow-soft)"
                      : "border-transparent bg-surface text-text-primary hover:border-brand-primary/35 hover:bg-surface-raised",
                  ].join(" ")}
                >
                  <span className="block text-sm font-semibold">
                    {tab.label}
                  </span>
                  <span
                    className={[
                      "mt-1 block text-sm leading-5",
                      isActive ? "text-white/80" : "text-text-secondary",
                    ].join(" ")}
                  >
                    {tab.description}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-(--radius-card) border border-brand-primary/15 bg-brand-primary-soft p-4">
            <p className="text-sm font-semibold text-text-primary">
              {workflowCopy[currentWorkflow].label}
            </p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {workflowCopy[currentWorkflow].description}
            </p>
          </div>
        )}
      </FormSection>

      <FormSection
        title="1. Datos de contacto"
        description="Indícanos cómo podemos comunicarnos contigo para revisar la solicitud."
        className="border-brand-primary/12"
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
        id={`workflow-panel-${currentWorkflow}`}
        role={hasTwoWorkflows ? "tabpanel" : undefined}
        aria-labelledby={
          hasTwoWorkflows ? `workflow-tab-${currentWorkflow}` : undefined
        }
        className="space-y-6"
      >
        {isPrintWorkflow && printService ? (
          <FormSection
            title="2. Datos de impresión"
            description="Indica cómo debemos preparar el documento. Confirmaremos contigo cualquier detalle antes de producirlo."
            className="border-brand-primary/12"
          >
            <input type="hidden" name="service_id" value={printService.id} />
            {serviceIdError ? (
              <div className="mb-5">
                <FieldError id="service_id-error">
                  {serviceIdError}
                </FieldError>
              </div>
            ) : null}
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
        ) : selectedEncargoService ? (
          <FormSection
            title="2. Detalles del encargo"
            description="No necesitas tenerlo todo decidido. Comparte lo que sabes y aclararemos el resto contigo."
            className="border-brand-primary/12"
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                id="service_id"
                label="Servicio"
                required
                error={serviceIdError}
              >
                {({ describedBy, invalid }) => (
                  <Select
                    id="service_id"
                    name="service_id"
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                    value={selectedEncargoService.id}
                    onChange={(event) =>
                      setSelectedEncargoServiceId(event.target.value)
                    }
                  >
                    {encargoServices.map((serviceType) => (
                      <option key={serviceType.id} value={serviceType.id}>
                        {serviceType.name}
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
        ) : null}

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
          className="border-brand-primary/12"
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
                  Hasta {MAX_UPLOAD_SESSION_ITEMS} archivos, con un máximo de {formatFileSize(MAX_STORAGE_FILE_SIZE_BYTES)} por archivo.
                </span>
                <span className="block">
                  Formatos permitidos: PDF, JPG, JPEG, PNG, WEBP, DOC, DOCX,
                  ZIP, RAR y CDR.
                </span>
                {selectedFiles.length > 0 ? (
                  <span className="block">{selectedFiles.length} seleccionados.</span>
                ) : null}
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
                invalid={invalid}
                aria-describedby={describedBy}
                accept={PPO03_STORAGE_FILE_INPUT_ACCEPT}
                disabled={isStarting || isSubmissionLocked}
                onChange={(event) => setSelectedFiles(Array.from(event.currentTarget.files ?? []))}
                className="min-h-12 cursor-pointer p-1 text-sm file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-(--radius-control) file:border-0 file:bg-brand-primary file:px-4 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-primary-hover"
              />
            )}
          </FormField>
        </FormSection>
      </div>

      <FormSection
        title="4. Revisa y envía"
        description="Al enviar, registraremos la solicitud para que el equipo pueda revisarla y contactarte."
        className="border-brand-primary/12"
      >
        <div className="rounded-(--radius-control) border border-brand-primary/15 bg-brand-primary-soft px-4 py-3 text-sm leading-6 text-text-secondary">
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
            disabled={isStarting || isSubmissionLocked || !activeService}
            className="w-full shadow-(--shadow-soft) sm:w-auto sm:min-w-56"
          >
            {isStarting ? "Registrando solicitud..." : "Enviar solicitud"}
          </Button>
        </FormActions>
      </FormSection>
      </fieldset>

      {submission?.kind === "reserved" ? (
        <PublicSolicitudUploadQueue
          reservation={submission.reservation}
          files={submission.files}
        />
      ) : null}
    </form>
  );
}
