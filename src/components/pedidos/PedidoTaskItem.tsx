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
          ? "rounded-(--radius-control) border border-success/30 bg-success-soft px-3 py-2 text-sm leading-5 text-success"
          : "rounded-(--radius-control) border border-danger/30 bg-danger-soft px-3 py-2 text-sm leading-5 text-danger"
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
    <li className="rounded-(--radius-control) border border-border bg-surface-muted p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                task.is_completed
                  ? "inline-flex rounded-(--radius-control) border border-success/30 bg-success-soft px-2 py-1 text-xs font-semibold text-success"
                  : "inline-flex rounded-(--radius-control) border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-secondary"
              }
            >
              {task.is_completed ? "Completada" : "Pendiente"}
            </span>
            <span className="inline-flex rounded-(--radius-control) border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-secondary">
              {isQuantified ? "Cuantificada" : "Simple"}
            </span>
          </div>
          <p className="mt-3 text-base font-semibold leading-6 text-text-primary">
            {task.title}
          </p>
          {isQuantified ? (
            <p className="mt-1 text-sm text-text-secondary">
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
                  className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-medium text-text-primary transition-colors hover:bg-brand-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
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
                className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-danger/30 bg-surface px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50"
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
          className="mt-4 border-t border-border pt-4"
        >
          <TaskHiddenFields taskId={task.id} />
          <ActionMessage state={progressState} />
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="max-w-40">
              <label
                htmlFor={`task-progress-${task.id}`}
                className="text-sm font-medium text-text-primary"
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
                className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
              />
              {progressError ? (
                <p
                  id={`task-progress-${task.id}-error`}
                  className="mt-2 text-sm leading-5 text-danger"
                >
                  {progressError}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={progressPending}
              className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
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
          className="mt-4 border-t border-border pt-4"
        >
          <TaskHiddenFields taskId={task.id} />
          <ActionMessage state={titleState} />
          <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="flex-1">
              <label
                htmlFor={`task-title-${task.id}`}
                className="text-sm font-medium text-text-primary"
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
                className="mt-2 min-h-11 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 py-2 text-sm text-text-primary shadow-(--shadow-soft) placeholder:text-text-muted disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
              />
              {titleError ? (
                <p
                  id={`task-title-${task.id}-error`}
                  className="mt-2 text-sm leading-5 text-danger"
                >
                  {titleError}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={titlePending}
              className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
