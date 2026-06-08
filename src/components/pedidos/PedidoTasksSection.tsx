"use client";

import { useActionState, useEffect, useRef } from "react";
import type {
  CreatePedidoTaskActionState,
  PedidoDetailAction,
} from "@/app/dashboard/pedidos/[id]/actions";
import {
  canManagePedidoTasksInStatus,
  getPedidoTaskManagementBlockedReason,
  type PedidoStatus,
} from "@/lib/pedidos/status";
import type { PedidoTask } from "@/lib/pedidos/list-pedido-tasks";
import type { PedidoTasksProgress } from "@/lib/pedidos/task-progress";
import { PedidoProgressBar } from "./PedidoProgressBar";
import {
  PedidoTaskItem,
  type PedidoTaskItemActions,
} from "./PedidoTaskItem";

type PedidoTasksSectionProps = {
  createTaskAction: PedidoDetailAction<CreatePedidoTaskActionState>;
  taskActions: PedidoTaskItemActions;
  pedidoStatus: PedidoStatus;
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
  createTaskAction,
  taskActions,
  pedidoStatus,
  tasks,
  progress,
  loadError,
}: PedidoTasksSectionProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    createTaskAction,
    createInitialState,
  );
  const titleError = state.fieldErrors?.title;
  const canManageTasks = canManagePedidoTasksInStatus(pedidoStatus);
  const blockedReason = getPedidoTaskManagementBlockedReason(pedidoStatus);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
    }
  }, [state.ok]);

  return (
    <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">
          Tareas del pedido
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Escribe cada paso del trabajo como una tarea. Si incluyes una
          cantidad, el sistema la detectará automáticamente.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-text-secondary">
          <span className="rounded-(--radius-control) bg-surface-muted px-2 py-1">
            Diseñar el logo
          </span>
          <span className="rounded-(--radius-control) bg-surface-muted px-2 py-1">
            Imprimir 40 páginas
          </span>
          <span className="rounded-(--radius-control) bg-surface-muted px-2 py-1">
            Encuadernar 2 libretas
          </span>
        </div>
      </div>

      {loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
          {loadError}
        </p>
      ) : null}

      {canManageTasks ? (
        <form
          ref={formRef}
          action={formAction}
          aria-busy={pending}
          className="mt-6 border-t border-border pt-5"
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

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label
                htmlFor="pedido-task-title"
                className="text-sm font-medium text-text-primary"
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
                className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
              />
              {titleError ? (
                <p
                  id="pedido-task-title-error"
                  className="mt-2 text-sm leading-5 text-danger"
                >
                  {titleError}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
            >
              {pending ? "Creando..." : "Crear tarea"}
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-6 rounded-(--radius-control) border border-warning/30 bg-warning-soft px-4 py-3 text-sm leading-6 text-text-primary">
          {blockedReason}
        </p>
      )}

      <div className="mt-6">
        <PedidoProgressBar {...progress} />
      </div>

      {tasks.length > 0 ? (
        <ul className="mt-5 space-y-4">
          {tasks.map((task) => (
            <PedidoTaskItem
              key={task.id}
              task={task}
              canManage={canManageTasks}
              actions={taskActions}
            />
          ))}
        </ul>
      ) : !loadError ? (
        <p className="mt-5 rounded-(--radius-control) border border-dashed border-border-strong bg-surface-raised px-4 py-3 text-sm leading-6 text-text-secondary">
          Este pedido todavía no tiene tareas registradas.
        </p>
      ) : null}
    </section>
  );
}
