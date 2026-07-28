"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import {
  createPedidoAction,
  type CreatePedidoActionState,
} from "@/app/(interno)/dashboard/pedidos/actions";
import { ClienteAsyncSelect } from "@/components/clientes/ClienteAsyncSelect";
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
import type { PedidoField, PedidoPrioridad } from "@/lib/pedidos";
import { PEDIDO_PRIORITY_LABELS } from "@/lib/pedidos/labels";
import {
  PRINT_COLOR_MODE_OPTIONS,
  PRINT_PAPER_SIZE_OPTIONS,
  PRINT_SIDES_OPTIONS,
} from "@/lib/pedidos/order-validation";
import type { OperationalServiceType } from "@/lib/service-types";
import { getTodayDateInputValue } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  type WorkflowType,
} from "@/lib/workflow-types";

type PedidoFormProps = {
  prioridades: readonly PedidoPrioridad[];
  serviceTypes: OperationalServiceType[];
  onSuccess?: (state: CreatePedidoActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const initialState: CreatePedidoActionState = {
  ok: false,
  message: "",
};

const WORKFLOW_TAB_LABELS: Record<WorkflowType, string> = {
  [WORKFLOW_TYPES.ENCARGO]: "Encargo",
  [WORKFLOW_TYPES.IMPRESION]: "Impresión",
};

function getFieldError(state: CreatePedidoActionState, field: PedidoField) {
  return state.fieldErrors?.[field];
}

function getAvailableWorkflows({
  encargoServices,
  printService,
}: {
  encargoServices: OperationalServiceType[];
  printService?: OperationalServiceType;
}): WorkflowType[] {
  return [
    ...(encargoServices.length > 0 ? [WORKFLOW_TYPES.ENCARGO] : []),
    ...(printService ? [WORKFLOW_TYPES.IMPRESION] : []),
  ];
}

const blockClassName = "space-y-3";
const separatedBlockClassName = "space-y-3 border-t border-border pt-5";
const headingClassName = "text-base font-semibold text-text-primary";

export function PedidoForm({
  prioridades,
  serviceTypes,
  onSuccess,
  onDirtyChange,
}: PedidoFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
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
  const initialWorkflow =
    availableWorkflows[0] ?? WORKFLOW_TYPES.ENCARGO;
  const [workflowType, setWorkflowType] = useState<WorkflowType>(
    initialWorkflow,
  );
  const [selectedEncargoServiceId, setSelectedEncargoServiceId] = useState(
    encargoServices[0]?.id ?? "",
  );
  const [state, formAction, pending] = useActionState(
    createPedidoAction,
    initialState,
  );
  const currentWorkflow = availableWorkflows.includes(workflowType)
    ? workflowType
    : initialWorkflow;
  const selectedEncargoService =
    encargoServices.find(
      (serviceType) => serviceType.id === selectedEncargoServiceId,
    ) ??
    encargoServices[0] ??
    null;
  const activeService =
    currentWorkflow === WORKFLOW_TYPES.IMPRESION
      ? printService
      : selectedEncargoService;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDirtyChange?.(false);
      onSuccess?.(state);
    }
  }, [onDirtyChange, onSuccess, state]);

  function selectWorkflow(nextWorkflowType: WorkflowType, moveFocus = false) {
    if (nextWorkflowType !== currentWorkflow) {
      onDirtyChange?.(true);
    }

    setWorkflowType(nextWorkflowType);

    if (moveFocus) {
      workflowTabRefs.current[nextWorkflowType]?.focus();
    }
  }

  function handleWorkflowTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentWorkflowType: WorkflowType,
  ) {
    const currentIndex = availableWorkflows.indexOf(currentWorkflowType);
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

  const serviceIdError = getFieldError(state, "service_id");
  const clienteError = getFieldError(state, "cliente_id");
  const tituloError = getFieldError(state, "title");
  const descripcionError = getFieldError(state, "description");
  const totalAmountError = getFieldError(state, "total_amount");
  const prioridadError = getFieldError(state, "priority");
  const fechaEntregaError = getFieldError(state, "estimated_delivery_date");
  const printCopiesError = getFieldError(state, "print_copies");
  const printColorModeError = getFieldError(state, "print_color_mode");
  const printPaperSizeError = getFieldError(state, "print_paper_size");
  const printSidesError = getFieldError(state, "print_sides");
  const printNotesError = getFieldError(state, "print_notes");
  const isPrintWorkflow = currentWorkflow === WORKFLOW_TYPES.IMPRESION;
  const todayInputDate = getTodayDateInputValue();

  const statusAlert = state.message ? (
    <Alert
      variant={state.ok ? "success" : "danger"}
      title={state.ok ? "Pedido creado" : "No se pudo crear el pedido"}
      aria-live="polite"
    >
      <p>{state.message}</p>
      {state.ok && state.publicReference ? (
        <CopyableCode
          code={state.publicReference}
          label="Código de seguimiento para el cliente"
          helperText="Comparte este código con el cliente para que pueda consultar el estado del trabajo cuando la consulta esté disponible."
          className="mt-3 border-success/20 bg-surface"
        />
      ) : null}
      {state.ok && state.pedidoId ? (
        <Link
          href={`/dashboard/pedidos/${state.pedidoId}`}
          className="mt-2 inline-flex min-h-11 items-center font-semibold text-brand-primary underline underline-offset-4"
        >
          Ver detalle del pedido {state.numeroPedido}
        </Link>
      ) : null}
    </Alert>
  ) : null;

  const workflowButtons = availableWorkflows.map((workflow) => {
    const isActive = currentWorkflow === workflow;

    return (
      <button
        key={workflow}
        ref={(element) => {
          workflowTabRefs.current[workflow] = element;
        }}
        id={`pedido-workflow-tab-${workflow}`}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-controls={`pedido-workflow-panel-${workflow}`}
        tabIndex={isActive ? 0 : -1}
        disabled={pending}
        onClick={() => selectWorkflow(workflow)}
        onKeyDown={(event) => handleWorkflowTabKeyDown(event, workflow)}
        className={[
          "min-h-10 cursor-pointer rounded-(--radius-control) border px-3 text-sm font-semibold transition-[background-color,border-color,box-shadow,color] duration-200 disabled:cursor-not-allowed disabled:opacity-60",
          isActive
            ? "border-brand-primary bg-surface text-brand-primary shadow-(--shadow-soft)"
            : "border-transparent bg-transparent text-text-primary hover:border-border-strong hover:bg-surface/70",
        ].join(" ")}
      >
        <span className="block text-sm font-semibold">
          {WORKFLOW_TAB_LABELS[workflow]}
        </span>
      </button>
    );
  });

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      className="w-full"
      onChange={() => onDirtyChange?.(true)}
    >
      <FormSection compact>
        <div className="space-y-5">
          {statusAlert}

          <div className={blockClassName}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className={headingClassName}>
                Tipo de pedido
                <span className="ml-1 text-danger" aria-hidden="true">
                  *
                </span>
              </span>

              <div
                role="tablist"
                aria-label="Tipo de pedido"
                className={[
                  "grid w-full gap-2 rounded-(--radius-control) border border-border bg-surface-muted p-1 sm:w-auto sm:min-w-72",
                  availableWorkflows.length > 1 ? "grid-cols-2" : "grid-cols-1",
                ].join(" ")}
              >
                {workflowButtons}
              </div>
            </div>

            {isPrintWorkflow ? (
              <div className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3 text-sm leading-6 text-text-secondary">
                <input
                  type="hidden"
                  name="service_id"
                  value={printService?.id ?? ""}
                />
                <p>
                  <span className="font-semibold text-text-primary">
                    Servicio:
                  </span>{" "}
                  {printService?.name ?? "Impresión"}
                  {printService && !printService.isPubliclyAvailable ? (
                    <span className="ml-1 text-text-muted">
                      Oculto públicamente
                    </span>
                  ) : null}
                </p>
                {printService?.description ? (
                  <p className="mt-1">{printService.description}</p>
                ) : null}
                {serviceIdError ? (
                  <FieldError id="service_id-error" compact>
                    {serviceIdError}
                  </FieldError>
                ) : null}
              </div>
            ) : (
              <FormField
                id="service_id"
                label="Servicio"
                required
                error={serviceIdError}
                compact
              >
                {({ describedBy, invalid }) => (
                  <Select
                    id="service_id"
                    name="service_id"
                    value={selectedEncargoService?.id ?? ""}
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                    onChange={(event) => {
                      setSelectedEncargoServiceId(event.target.value);
                      onDirtyChange?.(true);
                    }}
                  >
                    {encargoServices.map((serviceType) => (
                      <option key={serviceType.id} value={serviceType.id}>
                        {serviceType.name}
                        {serviceType.isPubliclyAvailable
                          ? ""
                          : " - Oculto públicamente"}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
            )}

            {!activeService ? (
              <Alert variant="warning">
                No hay servicios disponibles para este tipo de pedido.
              </Alert>
            ) : null}
          </div>

          <div
            id={`pedido-workflow-panel-${currentWorkflow}`}
            role="tabpanel"
            aria-labelledby={`pedido-workflow-tab-${currentWorkflow}`}
            className={separatedBlockClassName}
          >
            <h3 className={headingClassName}>
              {isPrintWorkflow ? "Datos de impresión" : "Datos del encargo"}
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="title"
                label="Título del trabajo"
                required={!isPrintWorkflow}
                error={tituloError}
                help={
                  isPrintWorkflow
                    ? "Si lo dejas vacío, el sistema usará un título predeterminado para impresión."
                    : undefined
                }
                className="sm:col-span-2"
                compact
              >
                {({ describedBy, invalid }) => (
                  <Input
                    id="title"
                    name="title"
                    type="text"
                    required={!isPrintWorkflow}
                    maxLength={160}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </FormField>

              {isPrintWorkflow ? (
                <>
                  <FormField
                    id="print_copies"
                    label="Cantidad de copias"
                    required
                    error={printCopiesError}
                    compact
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
                    compact
                  >
                    {({ describedBy, invalid }) => (
                      <Select
                        id="print_color_mode"
                        name="print_color_mode"
                        defaultValue=""
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
                    compact
                  >
                    {({ describedBy, invalid }) => (
                      <Select
                        id="print_paper_size"
                        name="print_paper_size"
                        defaultValue=""
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
                    compact
                  >
                    {({ describedBy, invalid }) => (
                      <Select
                        id="print_sides"
                        name="print_sides"
                        defaultValue=""
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
                    id="print_notes"
                    label="Observaciones"
                    error={printNotesError}
                    help="Añade indicaciones de preparación que deban quedar en el pedido."
                    className="sm:col-span-2"
                    compact
                  >
                    {({ describedBy, invalid }) => (
                      <Textarea
                        id="print_notes"
                        name="print_notes"
                        maxLength={1000}
                        className="min-h-24"
                        invalid={invalid}
                        aria-describedby={describedBy}
                      />
                    )}
                  </FormField>
                </>
              ) : (
                <FormField
                  id="description"
                  label="Descripción"
                  required
                  error={descripcionError}
                  className="sm:col-span-2"
                  compact
                >
                  {({ describedBy, invalid }) => (
                    <Textarea
                      id="description"
                      name="description"
                      required
                      maxLength={3000}
                      className="min-h-28"
                      invalid={invalid}
                      aria-describedby={describedBy}
                    />
                  )}
                </FormField>
              )}
            </div>
          </div>

          <div className={separatedBlockClassName}>
            <h3 className={headingClassName}>Datos del pedido</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="cliente_id"
                label="Cliente"
                help={
                  !clienteError
                    ? "Selecciona un cliente registrado o deja este campo vacío."
                    : undefined
                }
                helpId="cliente-help"
                error={clienteError}
                errorId="cliente-error"
                className="sm:col-span-2"
                compact
              >
                {({ describedBy, invalid }) => (
                  <ClienteAsyncSelect
                    id="cliente_id"
                    name="cliente_id"
                    allowEmpty
                    invalid={invalid}
                    ariaDescribedBy={describedBy}
                    onValueChange={() => onDirtyChange?.(true)}
                  />
                )}
              </FormField>

              <FormField
                id="priority"
                label="Prioridad"
                required
                error={prioridadError}
                compact
              >
                {({ describedBy, invalid }) => (
                  <Select
                    id="priority"
                    name="priority"
                    required
                    defaultValue="normal"
                    invalid={invalid}
                    aria-describedby={describedBy}
                  >
                    {prioridades.map((priority) => (
                      <option key={priority} value={priority}>
                        {PEDIDO_PRIORITY_LABELS[priority]}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>

              <FormField
                id="estimated_delivery_date"
                label="Fecha estimada de entrega"
                error={fechaEntregaError}
                errorId="fecha-entrega-error"
                compact
              >
                {({ describedBy, invalid }) => (
                  <Input
                    id="estimated_delivery_date"
                    name="estimated_delivery_date"
                    type="date"
                    min={todayInputDate}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </FormField>

              <FormField
                id="total_amount"
                label="Precio del pedido"
                required
                error={totalAmountError}
                compact
              >
                {({ describedBy, invalid }) => (
                  <Input
                    id="total_amount"
                    name="total_amount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    required
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </FormField>
            </div>
          </div>

          <FormActions compact note={undefined}>
            <Button
              type="submit"
              disabled={pending || !activeService}
              className="w-full sm:w-auto"
            >
              {pending ? "Creando pedido..." : "Crear pedido"}
            </Button>
          </FormActions>
        </div>
      </FormSection>
    </form>
  );
}
