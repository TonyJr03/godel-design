"use client";

import { useActionState } from "react";
import {
  updatePedidoStatusAction,
  type UpdatePedidoStatusActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import {
  PEDIDO_STATUSES,
  type PedidoStatus,
} from "@/lib/pedidos/status";
import { PEDIDO_STATUS_LABELS } from "@/lib/pedidos/labels";

type PedidoStatusFormProps = {
  pedidoId: string;
  estadoActual: PedidoStatus;
};

const initialState: UpdatePedidoStatusActionState = {
  ok: false,
  message: "",
};

export function PedidoStatusForm({
  pedidoId,
  estadoActual,
}: PedidoStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updatePedidoStatusAction,
    initialState,
  );
  const estadoError = state.fieldErrors?.estado;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-zinc-950">
        Estado del pedido
      </h3>

      <form action={formAction} aria-busy={pending} className="mt-5 space-y-4">
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
          <label htmlFor="estado" className="text-sm font-medium text-zinc-900">
            Estado
          </label>
          <select
            id="estado"
            name="estado"
            defaultValue={estadoActual}
            disabled={pending}
            aria-invalid={Boolean(estadoError)}
            aria-describedby={estadoError ? "estado-pedido-error" : undefined}
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
          >
            {PEDIDO_STATUSES.map((estado) => (
              <option key={estado} value={estado}>
                {PEDIDO_STATUS_LABELS[estado]}
              </option>
            ))}
          </select>
          {estadoError ? (
            <p
              id="estado-pedido-error"
              className="mt-2 text-sm leading-5 text-red-700"
            >
              {estadoError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
        >
          {pending ? "Actualizando..." : "Actualizar estado"}
        </button>
      </form>
    </section>
  );
}
