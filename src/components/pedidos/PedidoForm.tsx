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
} from "@/app/dashboard/pedidos/nuevo/actions";
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
import { getTodayDateInputValue } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  type WorkflowType,
} from "@/lib/workflow-types";
import { CopyableCode } from "@/components/common/CopyableCode";

export type PedidoFormCliente = {
  id: string;
  name: string;
};

type PedidoFormProps = {
  clientes: PedidoFormCliente[];
  prioridades: readonly PedidoPrioridad[];
};

const initialState: CreatePedidoActionState = {
  ok: false,
  message: "",
};

const WORKFLOW_TABS = [
  {
    value: WORKFLOW_TYPES.ENCARGO,
    label: "Encargo",
    description: "Trabajo personalizado con título y descripción operativa.",
  },
  {
    value: WORKFLOW_TYPES.IMPRESION,
    label: "Impresión",
    description: "Pedido directo con opciones concretas de impresión.",
  },
] as const;

function getFieldError(state: CreatePedidoActionState, field: PedidoField) {
  return state.fieldErrors?.[field];
}

export function PedidoForm({ clientes, prioridades }: PedidoFormProps) {
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
    createPedidoAction,
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
  const clienteError = getFieldError(state, "cliente_id");
  const tituloError = getFieldError(state, "title");
  const descripcionError = getFieldError(state, "description");
  const prioridadError = getFieldError(state, "priority");
  const fechaEntregaError = getFieldError(state, "estimated_delivery_date");
  const printCopiesError = getFieldError(state, "print_copies");
  const printColorModeError = getFieldError(state, "print_color_mode");
  const printPaperSizeError = getFieldError(state, "print_paper_size");
  const printSidesError = getFieldError(state, "print_sides");
  const printNotesError = getFieldError(state, "print_notes");
  const isPrintWorkflow = workflowType === WORKFLOW_TYPES.IMPRESION;
  const todayInputDate = getTodayDateInputValue();

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      className="max-w-3xl space-y-6"
    >
      {state.message ? (
        <Alert
          variant={state.ok ? "success" : "danger"}
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
      ) : null}

      <FormSection
        title="Tipo de pedido"
        description="Selecciona el flujo operativo que tendrá este pedido manual."
      >
        <input type="hidden" name="workflow_type" value={workflowType} />
        <div
          role="tablist"
          aria-label="Tipo de pedido"
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
                id={`pedido-workflow-tab-${tab.value}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`pedido-workflow-panel-${tab.value}`}
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
        title="Datos comunes"
        description="El cliente es opcional. La prioridad y la fecha se aplican a ambos tipos de pedido."
      >
        <div className="grid gap-5 sm:grid-cols-2">
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
          >
            {({ describedBy, invalid }) => (
              <Select
                id="cliente_id"
                name="cliente_id"
                defaultValue=""
                invalid={invalid}
                aria-describedby={describedBy}
              >
                <option value="">Sin cliente asociado</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>

          <FormField
            id="priority"
            label="Prioridad"
            required
            error={prioridadError}
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
        </div>
      </FormSection>

      <FormSection
        id={`pedido-workflow-panel-${workflowType}`}
        role="tabpanel"
        aria-labelledby={`pedido-workflow-tab-${workflowType}`}
        title={isPrintWorkflow ? "Datos de impresión" : "Datos del encargo"}
        description={
          isPrintWorkflow
            ? "La descripción operativa se construirá en servidor con estas opciones."
            : "Registra la información operativa inicial del trabajo personalizado."
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            id="title"
            label="Título del trabajo"
            required={!isPrintWorkflow}
            error={tituloError}
            help={
              isPrintWorkflow
                ? 'Si lo dejas vacío, se usará "Pedido de impresión".'
                : undefined
            }
            className="sm:col-span-2"
          >
            {({ describedBy, invalid }) => (
              <Input
                id="title"
                name="title"
                type="text"
                required={!isPrintWorkflow}
                maxLength={160}
                placeholder={isPrintWorkflow ? "Pedido de impresión" : undefined}
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
              >
                {({ describedBy, invalid }) => (
                  <Textarea
                    id="print_notes"
                    name="print_notes"
                    maxLength={1000}
                    className="min-h-28"
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
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  id="description"
                  name="description"
                  required
                  maxLength={3000}
                  className="min-h-36"
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>
          )}
        </div>
      </FormSection>

      <FormSection
        title="Revisa y crea"
        description="El pedido se registrará como creado, sin solicitud de origen y sin personal asignado."
      >
        <FormActions note="Los campos marcados con * son obligatorios.">
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Creando..." : "Crear pedido"}
          </Button>
        </FormActions>
      </FormSection>
    </form>
  );
}
