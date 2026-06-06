"use client";

import { useActionState } from "react";
import type {
  DeletePedidoTaskActionState,
  PedidoDetailAction,
  TogglePedidoTaskCompletionActionState,
  UpdatePedidoTaskProgressActionState,
  UpdatePedidoTaskTitleActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import type { PedidoTask } from "@/lib/pedidos/list-pedido-tasks";

export type PedidoTaskItemActions = {
  complete: PedidoDetailAction<TogglePedidoTaskCompletionActionState>;
  delete: PedidoDetailAction<DeletePedidoTaskActionState>;
  reopen: PedidoDetailAction<TogglePedidoTaskCompletionActionState>;
  updateProgress: PedidoDetailAction<UpdatePedidoTaskProgressActionState>;
  updateTitle: PedidoDetailAction<UpdatePedidoTaskTitleActionState>;
};

type PedidoTaskItemProps = {
  task: PedidoTask;
  canManage: boolean;
  actions: PedidoTaskItemActions;
};

const titleInitialState: UpdatePedidoTaskTitleActionState = {
  ok: false,
  message: "",
};

const progressInitialState: UpdatePedidoTaskProgressActionState = {
  ok: false,
  message: "",
};

const completionInitialState: TogglePedidoTaskCompletionActionState = {
  ok: false,
  message: "",
};

const deleteInitialState: DeletePedidoTaskActionState = {
  ok: false,
  message: "",
};

function ActionMessage({
  state,
}: {
  state:
    | UpdatePedidoTaskTitleActionState
    | UpdatePedidoTaskProgressActionState
    | TogglePedidoTaskCompletionActionState
    | DeletePedidoTaskActionState;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={
        state.ok
          ? "rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm leading-5 text-teal-900"
          : "rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-5 text-red-900"
      }
      role={state.ok ? "status" : "alert"}
      aria-live="polite"
    >
      {state.message}
    </p>
  );
}

function TaskHiddenFields({ taskId }: { taskId: string }) {
  return <input type="hidden" name="task_id" value={taskId} />;
}

export function PedidoTaskItem({
  task,
  canManage,
  actions,
}: PedidoTaskItemProps) {
  const [titleState, titleAction, titlePending] = useActionState(
    actions.updateTitle,
    titleInitialState,
  );
  const [progressState, progressAction, progressPending] = useActionState(
    actions.updateProgress,
    progressInitialState,
  );
  const [completionState, completionAction, completionPending] = useActionState(
    task.is_completed ? actions.reopen : actions.complete,
    completionInitialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    actions.delete,
    deleteInitialState,
  );
  const isQuantified = task.task_type === "cuantificada";
  const targetQuantity = task.target_quantity ?? 0;
  const completedQuantity = task.completed_quantity ?? 0;
  const titleError = titleState.fieldErrors?.title;
  const progressError = progressState.fieldErrors?.completed_quantity;

  return (
    <li className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                task.is_completed
                  ? "inline-flex rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15"
                  : "inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-200"
              }
            >
              {task.is_completed ? "Completada" : "Pendiente"}
            </span>
            <span className="inline-flex rounded-md bg-white px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200">
              {isQuantified ? "Cuantificada" : "Simple"}
            </span>
          </div>
          <p className="mt-3 text-base font-semibold leading-6 text-zinc-950">
            {task.title}
          </p>
          {isQuantified ? (
            <p className="mt-1 text-sm text-zinc-600">
              {completedQuantity} / {targetQuantity}
            </p>
          ) : null}
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {!isQuantified || task.is_completed ? (
              <form action={completionAction} aria-busy={completionPending}>
                <TaskHiddenFields taskId={task.id} />
                <button
                  type="submit"
                  disabled={completionPending}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
                >
                  {task.is_completed ? "Reabrir" : "Marcar como completada"}
                </button>
              </form>
            ) : null}

            <form action={deleteAction} aria-busy={deletePending}>
              <TaskHiddenFields taskId={task.id} />
              <button
                type="submit"
                disabled={deletePending}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-medium text-red-700 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
              >
                Eliminar
              </button>
            </form>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="mt-4 grid gap-3">
          <ActionMessage state={completionState} />
          <ActionMessage state={deleteState} />
        </div>
      ) : null}

      {canManage && isQuantified ? (
        <form
          action={progressAction}
          aria-busy={progressPending}
          className="mt-4 border-t border-zinc-200 pt-4"
        >
          <TaskHiddenFields taskId={task.id} />
          <ActionMessage state={progressState} />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="max-w-40">
              <label
                htmlFor={`task-progress-${task.id}`}
                className="text-sm font-medium text-zinc-900"
              >
                Actualizar progreso
              </label>
              <input
                key={`${task.id}-${completedQuantity}`}
                id={`task-progress-${task.id}`}
                name="completed_quantity"
                type="number"
                min={0}
                max={targetQuantity}
                step={1}
                defaultValue={
                  progressState.values?.completedQuantity ??
                  String(completedQuantity)
                }
                disabled={progressPending}
                aria-invalid={Boolean(progressError)}
                aria-describedby={
                  progressError ? `task-progress-${task.id}-error` : undefined
                }
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
              />
              {progressError ? (
                <p
                  id={`task-progress-${task.id}-error`}
                  className="mt-2 text-sm leading-5 text-red-700"
                >
                  {progressError}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={progressPending}
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              Guardar
            </button>
          </div>
        </form>
      ) : null}

      {canManage ? (
        <form
          action={titleAction}
          aria-busy={titlePending}
          className="mt-4 border-t border-zinc-200 pt-4"
        >
          <TaskHiddenFields taskId={task.id} />
          <ActionMessage state={titleState} />
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label
                htmlFor={`task-title-${task.id}`}
                className="text-sm font-medium text-zinc-900"
              >
                Editar
              </label>
              <input
                key={`${task.id}-${task.title}`}
                id={`task-title-${task.id}`}
                name="title"
                type="text"
                maxLength={160}
                required
                defaultValue={titleState.values?.title ?? task.title}
                disabled={titlePending}
                aria-invalid={Boolean(titleError)}
                aria-describedby={
                  titleError ? `task-title-${task.id}-error` : undefined
                }
                className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
              />
              {titleError ? (
                <p
                  id={`task-title-${task.id}-error`}
                  className="mt-2 text-sm leading-5 text-red-700"
                >
                  {titleError}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={titlePending}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            >
              Guardar
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
