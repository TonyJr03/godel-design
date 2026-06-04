"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createPedidoTaskAction,
  type CreatePedidoTaskActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { PedidoTask, PedidoTasksProgress } from "@/lib/pedidos";
import { PedidoProgressBar } from "./PedidoProgressBar";
import { PedidoTaskItem } from "./PedidoTaskItem";

type PedidoTasksSectionProps = {
  pedidoId: string;
  tasks: PedidoTask[];
  progress: PedidoTasksProgress;
  loadError?: string;
};

const createInitialState: CreatePedidoTaskActionState = {
  ok: false,
  message: "",
  values: {
    title: "",
  },
};

export function PedidoTasksSection({
  pedidoId,
  tasks,
  progress,
  loadError,
}: PedidoTasksSectionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createPedidoTaskAction,
    createInitialState,
  );
  const titleError = state.fieldErrors?.title;

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-lg font-semibold text-zinc-950">
          Tareas del pedido
        </h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Escribe cada paso del trabajo como una tarea. Si incluyes una
          cantidad, el sistema la detectará automáticamente.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-zinc-600">
          <span className="rounded-md bg-zinc-100 px-2 py-1">
            Diseñar el logo
          </span>
          <span className="rounded-md bg-zinc-100 px-2 py-1">
            Imprimir 40 páginas
          </span>
          <span className="rounded-md bg-zinc-100 px-2 py-1">
            Encuadernar 2 libretas
          </span>
        </div>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          {loadError}
        </p>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        aria-busy={pending}
        className="mt-6 border-t border-zinc-200 pt-5"
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

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="flex-1">
            <label
              htmlFor="pedido-task-title"
              className="text-sm font-medium text-zinc-900"
            >
              Nueva tarea
            </label>
            <input
              id="pedido-task-title"
              name="title"
              type="text"
              maxLength={160}
              required
              disabled={pending}
              defaultValue={state.values?.title ?? ""}
              placeholder="Ej. Imprimir 40 páginas"
              aria-invalid={Boolean(titleError)}
              aria-describedby={
                titleError ? "pedido-task-title-error" : undefined
              }
              className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            />
            {titleError ? (
              <p
                id="pedido-task-title-error"
                className="mt-2 text-sm leading-5 text-red-700"
              >
                {titleError}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {pending ? "Creando..." : "Crear tarea"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <PedidoProgressBar {...progress} />
      </div>

      {tasks.length > 0 ? (
        <ul className="mt-5 space-y-4">
          {tasks.map((task) => (
            <PedidoTaskItem key={task.id} pedidoId={pedidoId} task={task} />
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-md border border-dashed border-zinc-300 px-4 py-3 text-sm leading-6 text-zinc-600">
          Este pedido todavía no tiene tareas registradas.
        </p>
      ) : null}
    </section>
  );
}
