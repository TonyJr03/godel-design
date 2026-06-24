"use client";

import { useActionState } from "react";
import type {
  PedidoDetailAction,
  UpdatePedidoStatusActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import {
  DELIVERY_PAYMENT_PENDING_REASON,
  getAllowedPedidoStatusTransitions,
  isPedidoClosedStatus,
  type PedidoPaymentStatus,
  type PedidoStatus,
  type PedidoStatusTransitionContext,
} from "@/lib/pedidos/status";
import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos/labels";
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

  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <h2 className="text-lg font-semibold text-text-primary">
        Estado del pedido
      </h2>

      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Estado actual:{" "}
        <span className="font-semibold text-text-primary">
          {PEDIDO_STATUS_LABELS[estadoActual]}
        </span>
      </p>

      {isClosed ? (
        <p className="mt-5 rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3 text-sm leading-6 text-text-secondary">
          Este pedido está cerrado y no admite cambios de estado.
        </p>
      ) : null}

      {estadoActual === "creado" ? (
        <p className="mt-5 rounded-(--radius-control) border border-info/30 bg-info-soft px-4 py-3 text-sm leading-6 text-text-primary">
          Este pedido fue creado manualmente y aún debe revisarse antes de pasar
          a producción.
        </p>
      ) : null}

      {!isClosed && isPrintWorkflow ? (
        <p className="mt-5 rounded-(--radius-control) border border-info/30 bg-info-soft px-4 py-3 text-sm leading-6 text-text-primary">
          Este pedido es de impresión directa y no requiere tareas para avanzar.
        </p>
      ) : null}

      {!isClosed && !isPrintWorkflow && tasksLoadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
          No se pudo cargar el progreso de tareas para orientar el cambio de
          estado. La validación final se realizará en servidor.
        </p>
      ) : null}

      {!isClosed && blocksDeliveryByPayment ? (
        <div className="mt-5 rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
          <p className="font-semibold">Pago pendiente</p>
          <p className="mt-1">
            Este pedido todavía no puede marcarse como entregado porque el pago
            no está completo.
          </p>
        </div>
      ) : null}

      {!isClosed && visibleStatusReasons.length > 0 ? (
        <div className="mt-5 space-y-2">
          {visibleStatusReasons.map((reason) => (
            <p
              key={reason}
              className="rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary"
            >
              {reason}
            </p>
          ))}
        </div>
      ) : null}

      {!isClosed ? (
        <form
          action={formAction}
          aria-busy={pending}
          className="mt-5 space-y-4"
        >
          {state.message ? (
            <div
              className={
                state.ok
                  ? "rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3 text-sm leading-6 text-success"
                  : "rounded-(--radius-control) border border-danger/30 bg-danger-soft px-4 py-3 text-sm leading-6 text-danger"
              }
              role={state.ok ? "status" : "alert"}
              aria-live="polite"
            >
              {state.message}
            </div>
          ) : null}

          <div className="max-w-sm">
            <label
              htmlFor="status"
              className="text-sm font-medium text-text-primary"
            >
              Estado
            </label>
            <select
              id="status"
              name="status"
              defaultValue={estadoActual}
              disabled={pending}
              aria-invalid={Boolean(estadoError)}
              aria-describedby={estadoError ? "status-pedido-error" : undefined}
              className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
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
            </select>
            {estadoError ? (
              <p
                id="status-pedido-error"
                className="mt-2 text-sm leading-5 text-danger"
              >
                {estadoError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={pending || !hasEnabledTransition}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {pending ? "Actualizando..." : "Actualizar estado"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
