"use client";

import { useActionState } from "react";
import {
  assignPedidoWorkerAction,
  type AssignPedidoWorkerActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { AssignableWorker } from "@/lib/pedidos/list-assignable-workers";

type PedidoWorkerAssignmentFormProps = {
  pedidoId: string;
  trabajadorActualId: string | null;
  trabajadores: AssignableWorker[];
};

const initialState: AssignPedidoWorkerActionState = {
  ok: false,
  message: "",
};

export function PedidoWorkerAssignmentForm({
  pedidoId,
  trabajadorActualId,
  trabajadores,
}: PedidoWorkerAssignmentFormProps) {
  const [state, formAction, pending] = useActionState(
    assignPedidoWorkerAction,
    initialState,
  );
  const trabajadorActual = trabajadores.find(
    (trabajador) => trabajador.id === trabajadorActualId,
  );
  const trabajadorError = state.fieldErrors?.trabajador_id;
  const hasCurrentWorker = Boolean(trabajadorActualId);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-zinc-950">
        Trabajador responsable
      </h3>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        {trabajadorActual
          ? `Responsable actual: ${trabajadorActual.full_name}`
          : "Sin trabajador asignado"}
      </p>

      {trabajadores.length === 0 ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          No hay trabajadores activos disponibles para asignar.
        </p>
      ) : (
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
            <label
              htmlFor="trabajador_id"
              className="text-sm font-medium text-zinc-900"
            >
              Trabajador
            </label>
            <select
              id="trabajador_id"
              name="trabajador_id"
              defaultValue={trabajadorActualId ?? ""}
              disabled={pending}
              required
              aria-invalid={Boolean(trabajadorError)}
              aria-describedby={
                trabajadorError ? "trabajador-id-error" : undefined
              }
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            >
              <option value="" disabled>
                Selecciona un trabajador
              </option>
              {trabajadores.map((trabajador) => (
                <option key={trabajador.id} value={trabajador.id}>
                  {trabajador.full_name}
                </option>
              ))}
            </select>
            {trabajadorError ? (
              <p
                id="trabajador-id-error"
                className="mt-2 text-sm leading-5 text-red-700"
              >
                {trabajadorError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending
              ? "Asignando..."
              : hasCurrentWorker
                ? "Cambiar trabajador"
                : "Asignar trabajador"}
          </button>
        </form>
      )}
    </section>
  );
}
