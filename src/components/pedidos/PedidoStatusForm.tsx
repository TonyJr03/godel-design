"use client";

import { useActionState } from "react";
import type {
  PedidoDetailAction,
  UpdatePedidoStatusActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import { Alert, Button, FormField, Select } from "@/components/ui";
import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos/labels";
import {
  DELIVERY_PAYMENT_PENDING_REASON,
  getAllowedPedidoStatusTransitions,
  isPedidoClosedStatus,
  type PedidoPaymentStatus,
  type PedidoStatus,
  type PedidoStatusTransitionContext,
} from "@/lib/pedidos/status";
import {
  WORKFLOW_TYPES,
  type WorkflowType,
} from "@/lib/workflow-types";

type PedidoStatusFormProps = {
  updateStatusAction: PedidoDetailAction<UpdatePedidoStatusActionState>;
  estadoActual: PedidoStatus;
  workflowType: WorkflowType;
  paymentStatus?: PedidoPaymentStatus;
  taskProgress?: PedidoStatusTransitionContext | null;
  tasksLoadError?: string;
  presentation?: "card" | "panel";
};

const initialState: UpdatePedidoStatusActionState = {
  ok: false,
  message: "",
};

export function PedidoStatusForm({
  updateStatusAction,
  estadoActual,
  workflowType,
  paymentStatus,
  taskProgress,
  tasksLoadError,
  presentation = "card",
}: PedidoStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updateStatusAction,
    initialState,
  );
  const estadoError = state.fieldErrors?.status;
  const isClosed = isPedidoClosedStatus(estadoActual);
  const statusOptions = getAllowedPedidoStatusTransitions(
    estadoActual,
    taskProgress,
    workflowType,
    paymentStatus,
  );
  const isPrintWorkflow = workflowType === WORKFLOW_TYPES.IMPRESION;
  const statusReasons = statusOptions
    .filter((option) => option.reason)
    .map((option) => option.reason as string);
  const blocksDeliveryByPayment = statusReasons.includes(
    DELIVERY_PAYMENT_PENDING_REASON,
  );
  const visibleStatusReasons = statusReasons.filter(
    (reason) => reason !== DELIVERY_PAYMENT_PENDING_REASON,
  );
  const hasEnabledTransition = statusOptions.some(
    (option) => !option.isCurrent && !option.disabled,
  );
  const isPanelPresentation = presentation === "panel";

  return (
    <section
      className={
        isPanelPresentation
          ? "min-w-0"
          : "rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
      }
    >
      {!isPanelPresentation ? (
        <h2 className="text-lg font-semibold text-text-primary">
          Estado del pedido
        </h2>
      ) : null}

      <p
        className={[
          "text-sm leading-6 text-text-secondary",
          isPanelPresentation ? "" : "mt-2",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        Estado actual:{" "}
        <span className="font-semibold text-text-primary">
          {PEDIDO_STATUS_LABELS[estadoActual]}
        </span>
      </p>

      <div className="mt-4 space-y-3">
        {isClosed ? (
          <Alert variant="info">
            Este pedido está cerrado y no admite cambios de estado.
          </Alert>
        ) : null}

        {estadoActual === "creado" ? (
          <Alert variant="info">
            Este pedido fue creado manualmente y aún debe revisarse antes de
            pasar a producción.
          </Alert>
        ) : null}

        {!isClosed && isPrintWorkflow ? (
          <Alert variant="info">
            Este pedido es de impresión directa y no requiere tareas para
            avanzar.
          </Alert>
        ) : null}

        {!isClosed && !isPrintWorkflow && tasksLoadError ? (
          <Alert variant="warning">
            No se pudo cargar el progreso de tareas. La validación final se
            realizará en servidor.
          </Alert>
        ) : null}

        {!isClosed && blocksDeliveryByPayment ? (
          <Alert variant="warning" title="Pago pendiente">
            Este pedido todavía no puede marcarse como entregado porque el pago
            no está completo.
          </Alert>
        ) : null}

        {!isClosed && visibleStatusReasons.length > 0
          ? visibleStatusReasons.map((reason) => (
              <Alert key={reason} variant="warning">
                {reason}
              </Alert>
            ))
          : null}
      </div>

      {!isClosed ? (
        <form
          action={formAction}
          aria-busy={pending}
          className="mt-5 space-y-4"
        >
          {state.message ? (
            <Alert
              variant={state.ok ? "success" : "danger"}
              title={
                state.ok
                  ? "Estado actualizado"
                  : "No se pudo actualizar el estado"
              }
              aria-live="polite"
            >
              <p>{state.message}</p>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <FormField
              id="status"
              label="Estado"
              required
              error={estadoError}
              errorId="status-pedido-error"
              compact
            >
              {({ describedBy, invalid }) => (
                <Select
                  id="status"
                  name="status"
                  defaultValue={estadoActual}
                  disabled={pending}
                  required
                  invalid={invalid}
                  aria-describedby={describedBy}
                >
                  {statusOptions.map((option) => (
                    <option
                      key={option.status}
                      value={option.status}
                      disabled={option.disabled}
                    >
                      {option.isCurrent
                        ? `${PEDIDO_STATUS_LABELS[option.status]} (actual)`
                        : PEDIDO_STATUS_LABELS[option.status]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <Button
              type="submit"
              disabled={pending || !hasEnabledTransition}
              className="w-full sm:w-auto"
            >
              {pending ? "Actualizando estado..." : "Actualizar estado"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
