"use client";

import Link from "next/link";
import { useActionState } from "react";
import type {
  ConvertSolicitudToPedidoActionState,
  SolicitudDetailAction,
} from "@/app/(interno)/dashboard/solicitudes/[id]/actions";
import {
  Alert,
  Button,
  FormField,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
import { PEDIDO_PRIORITY_LABELS } from "@/lib/pedidos/labels";
import { PEDIDO_PRIORITIES } from "@/lib/pedidos/status";
import { getSolicitudServiceTypeLabel } from "@/lib/solicitudes/labels";
import { getTodayDateInputValue } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
  type WorkflowType,
} from "@/lib/workflow-types";
import type { Enums } from "@/types/database";

type SolicitudConvertPedidoFormProps = {
  convertAction: SolicitudDetailAction<ConvertSolicitudToPedidoActionState>;
  status: Enums<"solicitud_estado">;
  clienteId: string | null;
  convertedOrderId: string | null;
  workflowType: WorkflowType;
  serviceType: string;
  solicitudDescription: string;
  solicitudDesiredDate: string | null;
  presentation?: "card" | "panel";
};

const DEFAULT_PRINT_PEDIDO_TITLE = "Pedido de impresión";

const initialState: ConvertSolicitudToPedidoActionState = {
  ok: false,
  message: "",
};

export function SolicitudConvertPedidoForm({
  convertAction,
  status,
  clienteId,
  convertedOrderId,
  workflowType,
  serviceType,
  solicitudDescription,
  solicitudDesiredDate,
  presentation = "card",
}: SolicitudConvertPedidoFormProps) {
  const [state, formAction, pending] = useActionState(
    convertAction,
    initialState,
  );
  const currentPedidoId = state.pedidoId ?? convertedOrderId;
  const canConvert =
    status === "aprobada" && Boolean(clienteId) && !currentPedidoId;
  const titleError = state.fieldErrors?.title;
  const descriptionError = state.fieldErrors?.description;
  const totalAmountError = state.fieldErrors?.total_amount;
  const priorityError = state.fieldErrors?.priority;
  const estimatedDeliveryDateError =
    state.fieldErrors?.estimated_delivery_date;
  const isPrintWorkflow = workflowType === WORKFLOW_TYPES.IMPRESION;
  const hasFreshConversionSuccess = state.ok && Boolean(state.pedidoId);
  const titleValue = state.values?.title ?? "";
  const descriptionValue = state.values?.description ?? solicitudDescription;
  const totalAmountValue = state.values?.total_amount ?? "";
  const priorityValue = state.values?.priority ?? "normal";
  const estimatedDeliveryDateValue =
    state.values?.estimated_delivery_date ?? solicitudDesiredDate ?? "";
  const serviceTypeLabel = getSolicitudServiceTypeLabel(serviceType);
  const todayInputDate = getTodayDateInputValue();
  const isPanel = presentation === "panel";

  return (
    <section
      className={
        isPanel
          ? "space-y-5"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      {isPanel ? null : (
        <h2 className="text-lg font-semibold text-text-primary">
          Conversión a pedido
        </h2>
      )}

      {state.message ? (
        <Alert
          variant={state.ok ? "success" : "danger"}
          title={state.ok ? "Pedido creado" : "No se pudo convertir la solicitud"}
          aria-live="polite"
          className={isPanel ? "" : "mt-4"}
        >
          <p>{state.message}</p>
          {state.ok && currentPedidoId ? (
            <Link
              href={`/dashboard/pedidos/${currentPedidoId}`}
              aria-label="Ver pedido"
              className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold text-brand-primary underline underline-offset-4"
            >
              Ver pedido {state.numeroPedido}
            </Link>
          ) : null}
        </Alert>
      ) : null}

      {hasFreshConversionSuccess ? null : currentPedidoId ? (
        <Alert
          variant="success"
          title="Solicitud convertida"
          className={isPanel ? "" : "mt-4"}
        >
          <p>Esta solicitud ya fue convertida en pedido.</p>
          <Link
            href={`/dashboard/pedidos/${currentPedidoId}`}
            className="mt-2 inline-flex min-h-10 items-center font-semibold underline underline-offset-4"
          >
            Ver pedido
          </Link>
        </Alert>
      ) : status !== "aprobada" ? (
        <Alert variant="warning" className={isPanel ? "" : "mt-4"}>
          La solicitud debe estar aprobada antes de convertirse en pedido.
        </Alert>
      ) : !clienteId ? (
        <Alert variant="warning" className={isPanel ? "" : "mt-4"}>
          Asocia un cliente antes de convertir esta solicitud en pedido.
        </Alert>
      ) : (
        <form action={formAction} aria-busy={pending} className="space-y-5">
          <div className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3 text-sm leading-6 text-text-secondary">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-text-primary">
                Pedido de {WORKFLOW_TYPE_LABELS[workflowType].toLowerCase()}
              </span>
              <WorkflowTypeBadge workflowType={workflowType} />
            </p>
            <p className="mt-1">Solicitud: {serviceTypeLabel}</p>
          </div>

          <section
            aria-labelledby="convert-workflow-data-title"
            className="border-t border-border pt-5"
          >
            <h3
              id="convert-workflow-data-title"
              className="text-base font-semibold text-text-primary"
            >
              {isPrintWorkflow ? "Datos de impresión" : "Datos del encargo"}
            </h3>

            <FormField
              id="title"
              label="Título del pedido"
              required={!isPrintWorkflow}
              help={
                isPrintWorkflow
                  ? `Si lo dejas vacío, el sistema usará "${DEFAULT_PRINT_PEDIDO_TITLE}".`
                  : "Define un nombre claro para identificar este trabajo internamente."
              }
              error={titleError}
              errorId="convert-title-error"
              helpId="convert-title-help"
              className="mt-4"
              compact
            >
              {({ describedBy, invalid }) => (
                <Input
                  id="title"
                  name="title"
                  type="text"
                  defaultValue={titleValue}
                  maxLength={160}
                  required={!isPrintWorkflow}
                  invalid={invalid}
                  aria-describedby={describedBy}
                />
              )}
            </FormField>

            <FormField
              id="description"
              label="Descripción del pedido"
              required={!isPrintWorkflow}
              help={
                isPrintWorkflow
                  ? "Puedes ajustar la descripción original. Si la dejas vacía, el servidor conservará la descripción original."
                  : "Puedes ajustar la descripción original antes de crear el pedido."
              }
              error={descriptionError}
              errorId="convert-description-error"
              helpId="convert-description-help"
              className="mt-4"
              compact
            >
              {({ describedBy, invalid }) => (
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={descriptionValue}
                  maxLength={3000}
                  required={!isPrintWorkflow}
                  invalid={invalid}
                  aria-describedby={describedBy}
                  className="min-h-28"
                />
              )}
            </FormField>
          </section>

          <section
            aria-labelledby="convert-order-data-title"
            className="border-t border-border pt-5"
          >
            <h3
              id="convert-order-data-title"
              className="text-base font-semibold text-text-primary"
            >
              Datos del pedido
            </h3>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FormField
                id="priority"
                label="Prioridad"
                required
                error={priorityError}
                errorId="convert-priority-error"
                compact
              >
                {({ describedBy, invalid }) => (
                  <Select
                    id="priority"
                    name="priority"
                    required
                    defaultValue={priorityValue}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  >
                    {PEDIDO_PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {PEDIDO_PRIORITY_LABELS[priority]}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>

              <FormField
                id="estimated_delivery_date"
                label="Entrega estimada"
                error={estimatedDeliveryDateError}
                errorId="convert-estimated-delivery-date-error"
                compact
              >
                {({ describedBy, invalid }) => (
                  <Input
                    id="estimated_delivery_date"
                    name="estimated_delivery_date"
                    type="date"
                    defaultValue={estimatedDeliveryDateValue}
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
                help="Puede ser 0 si no tendrá cobro."
                error={totalAmountError}
                errorId="convert-total-amount-error"
                helpId="convert-total-amount-help"
                className="sm:col-span-2"
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
                    defaultValue={totalAmountValue}
                    invalid={invalid}
                    aria-describedby={describedBy}
                  />
                )}
              </FormField>
            </div>
          </section>
          
          <div className="border-t border-border pt-5">
            <Button
              type="submit"
              disabled={!canConvert || pending}
              className="w-full"
            >
              {pending ? "Convirtiendo en pedido..." : "Convertir en pedido"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
