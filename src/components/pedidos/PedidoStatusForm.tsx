"use client";

import { useActionState } from "react";
import {
  updatePedidoStatusAction,
  type UpdatePedidoStatusActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import {
  getAllowedPedidoStatusTransitions,
  isPedidoClosedStatus,
  type PedidoStatus,
  type PedidoStatusTransitionContext,
} from "@/lib/pedidos/status";
import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos/labels";

type PedidoStatusFormProps = {
  pedidoId: string;
  estadoActual: PedidoStatus;
  taskProgress?: PedidoStatusTransitionContext | null;
  tasksLoadError?: string;
};

const initialState: UpdatePedidoStatusActionState = {
  ok: false,
  message: "",
};

export function PedidoStatusForm({
  pedidoId,
  estadoActual,
  taskProgress,
  tasksLoadError,
}: PedidoStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updatePedidoStatusAction,
    initialState,
  );
  const estadoError = state.fieldErrors?.status;
  const isClosed = isPedidoClosedStatus(estadoActual);
  const statusOptions = getAllowedPedidoStatusTransitions(
    estadoActual,
    taskProgress,
  );
  const statusReasons = statusOptions
    .filter((option) => option.reason)
    .map((option) => option.reason as string);
  const hasEnabledTransition = statusOptions.some(
    (option) => !option.isCurrent && !option.disabled,
  );

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-zinc-950">
        Estado del pedido
      </h3>

      <p className="mt-2 text-sm leading-6 text-zinc-600">
        Estado actual:{" "}
        <span className="font-semibold text-zinc-900">
          {PEDIDO_STATUS_LABELS[estadoActual]}
        </span>
      </p>

      {isClosed ? (
        <p className="mt-5 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
          Este pedido está cerrado y no admite cambios de estado.
        </p>
      ) : null}

      {estadoActual === "creado" ? (
        <p className="mt-5 rounded-md border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
          Este pedido fue creado manualmente y aún debe revisarse antes de pasar
          a producción.
        </p>
      ) : null}

      {!isClosed && tasksLoadError ? (
        <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          No se pudo cargar el progreso de tareas para orientar el cambio de
          estado. La validación final se realizará en servidor.
        </p>
      ) : null}

      {!isClosed && statusReasons.length > 0 ? (
        <div className="mt-5 space-y-2">
          {statusReasons.map((reason) => (
            <p
              key={reason}
              className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
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
          <input type="hidden" name="pedido_id" value={pedidoId} />

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
              {state.message}
            </div>
          ) : null}

          <div className="max-w-sm">
            <label
              htmlFor="status"
              className="text-sm font-medium text-zinc-900"
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
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
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
                className="mt-2 text-sm leading-5 text-red-700"
              >
                {estadoError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={pending || !hasEnabledTransition}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Actualizando..." : "Actualizar estado"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
