"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Check,
  Gauge,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import type {
  DeletePedidoTaskActionState,
  PedidoDetailAction,
  TogglePedidoTaskCompletionActionState,
  UpdatePedidoTaskProgressActionState,
  UpdatePedidoTaskTitleActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import { Button, InlineDeleteConfirmation } from "@/components/ui";
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
  onDeleteIntent: () => void;
  onDeleteSuccess: (message: string) => void;
  successNavigationHref: string;
};

type PedidoTaskItemMode =
  | "idle"
  | "edit-title"
  | "edit-progress"
  | "confirm-delete";

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

function InlineTaskActionMessage({
  state,
}: {
  state: TogglePedidoTaskCompletionActionState;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <p
      className={
        state.ok
          ? "wrap-break-word text-xs font-semibold leading-5 text-success"
          : "wrap-break-word text-xs font-semibold leading-5 text-danger"
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

function iconButtonClassName(tone: "default" | "danger" = "default") {
  return [
    "h-10 w-10 shrink-0 px-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    tone === "danger"
      ? "focus-visible:ring-danger"
      : "focus-visible:ring-brand-primary",
  ].join(" ");
}

function SpinnerIcon() {
  return (
    <LoaderCircle
      className="size-4 animate-spin motion-reduce:animate-none"
      aria-hidden="true"
    />
  );
}

function getTaskSecondaryText({
  completedQuantity,
  isCompleted,
  isQuantified,
  targetQuantity,
}: {
  completedQuantity: number;
  isCompleted: boolean;
  isQuantified: boolean;
  targetQuantity: number;
}) {
  const status = isCompleted ? "Completada" : "Pendiente";

  if (!isQuantified) {
    return status;
  }

  return `${completedQuantity} de ${targetQuantity} · ${status}`;
}

function PedidoTaskTitleInlineForm({
  action,
  onCancel,
  onSaved,
  successNavigationHref,
  task,
}: {
  action: PedidoDetailAction<UpdatePedidoTaskTitleActionState>;
  onCancel: () => void;
  onSaved: () => void;
  successNavigationHref: string;
  task: PedidoTask;
}) {
  const [title, setTitle] = useState(task.title);
  async function submitTitleAction(
    previousState: UpdatePedidoTaskTitleActionState,
    formData: FormData,
  ) {
    const nextState = await action(previousState, formData);

    if (!nextState.ok && nextState.values?.title !== undefined) {
      setTitle(nextState.values.title);
    }

    return nextState;
  }

  const [state, formAction, pending] = useActionState(
    submitTitleAction,
    titleInitialState,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const titleError = state.fieldErrors?.title;
  const generalError = !state.ok ? state.message : "";
  const errorMessage = titleError ?? generalError;
  const errorId = `task-title-${task.id}-error`;
  const hintId = `task-title-${task.id}-hint`;
  const describedBy = [hintId, errorMessage ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
      window.location.assign(successNavigationHref);
    }
  }, [onSaved, state.ok, successNavigationHref]);

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || pending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="min-w-0"
      onKeyDown={handleKeyDown}
    >
      <TaskHiddenFields taskId={task.id} />
      <div className="min-w-0 sm:flex sm:items-start sm:gap-2">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`task-title-${task.id}`}>
            Editar tarea {task.title}
          </label>
          <input
            ref={inputRef}
            id={`task-title-${task.id}`}
            name="title"
            type="text"
            required
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={pending}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={describedBy}
            className="min-h-10 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm text-text-primary transition-colors placeholder:text-text-muted focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"
          />
          <p
            id={hintId}
            className="mt-2 wrap-break-word text-xs leading-5 text-text-secondary"
          >
            Los números del título definen la cantidad de la tarea y pueden
            reiniciar su progreso.
          </p>
          {errorMessage ? (
            <p
              id={errorId}
              className="mt-2 wrap-break-word text-xs font-semibold leading-5 text-danger"
              role="alert"
              aria-live="polite"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="mt-2 flex shrink-0 items-center gap-1 sm:mt-0">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={pending}
            className={iconButtonClassName()}
            aria-label={
              pending
                ? `Guardando tarea ${task.title}...`
                : `Guardar tarea ${task.title}`
            }
            title={
              pending
                ? `Guardando tarea ${task.title}...`
                : `Guardar tarea ${task.title}`
            }
          >
            {pending ? (
              <SpinnerIcon />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            className={iconButtonClassName()}
            aria-label={`Cancelar edición de tarea ${task.title}`}
            title={`Cancelar edición de tarea ${task.title}`}
            onClick={onCancel}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </form>
  );
}

function PedidoTaskProgressInlineForm({
  action,
  completedQuantity,
  onCancel,
  onSaved,
  successNavigationHref,
  targetQuantity,
  task,
}: {
  action: PedidoDetailAction<UpdatePedidoTaskProgressActionState>;
  completedQuantity: number;
  onCancel: () => void;
  onSaved: () => void;
  successNavigationHref: string;
  targetQuantity: number;
  task: PedidoTask;
}) {
  const [progress, setProgress] = useState(String(completedQuantity));
  async function submitProgressAction(
    previousState: UpdatePedidoTaskProgressActionState,
    formData: FormData,
  ) {
    const nextState = await action(previousState, formData);

    if (!nextState.ok && nextState.values?.completedQuantity !== undefined) {
      setProgress(nextState.values.completedQuantity);
    }

    return nextState;
  }

  const [state, formAction, pending] = useActionState(
    submitProgressAction,
    progressInitialState,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);
  const progressError = state.fieldErrors?.completed_quantity;
  const generalError = !state.ok ? state.message : "";
  const errorMessage = progressError ?? generalError;
  const errorId = `task-progress-${task.id}-error`;

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (state.ok) {
      onSaved();
      // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
      window.location.assign(successNavigationHref);
    }
  }, [onSaved, state.ok, successNavigationHref]);

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Escape" || pending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onCancel();
  }

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="mt-2 min-w-0"
      onKeyDown={handleKeyDown}
    >
      <TaskHiddenFields taskId={task.id} />
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 sm:flex sm:items-center sm:gap-2">
          <label className="sr-only" htmlFor={`task-progress-${task.id}`}>
            Actualizar progreso de tarea {task.title}
          </label>
          <input
            ref={inputRef}
            id={`task-progress-${task.id}`}
            name="completed_quantity"
            type="number"
            min={0}
            max={targetQuantity}
            step={1}
            value={progress}
            onChange={(event) => setProgress(event.target.value)}
            disabled={pending}
            aria-invalid={Boolean(errorMessage)}
            aria-describedby={errorMessage ? errorId : undefined}
            className="min-h-10 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm text-text-primary transition-colors focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted sm:w-28"
          />
          <span className="mt-1 block text-sm leading-6 text-text-secondary sm:mt-0 sm:shrink-0">
            de {targetQuantity}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={pending}
            className={iconButtonClassName()}
            aria-label={
              pending
                ? `Guardando progreso de tarea ${task.title}...`
                : `Guardar progreso de tarea ${task.title}`
            }
            title={
              pending
                ? `Guardando progreso de tarea ${task.title}...`
                : `Guardar progreso de tarea ${task.title}`
            }
          >
            {pending ? (
              <SpinnerIcon />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            className={iconButtonClassName()}
            aria-label={`Cancelar progreso de tarea ${task.title}`}
            title={`Cancelar progreso de tarea ${task.title}`}
            onClick={onCancel}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <p
          id={errorId}
          className="mt-2 wrap-break-word text-xs font-semibold leading-5 text-danger"
          role="alert"
          aria-live="polite"
        >
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}

export function PedidoTaskItem({
  task,
  canManage,
  actions,
  onDeleteIntent,
  onDeleteSuccess,
  successNavigationHref,
}: PedidoTaskItemProps) {
  const [mode, setMode] = useState<PedidoTaskItemMode>("idle");
  const [completionState, completionAction, completionPending] = useActionState(
    task.is_completed ? actions.reopen : actions.complete,
    completionInitialState,
  );
  const isQuantified = task.task_type === "cuantificada";
  const targetQuantity = task.target_quantity ?? 0;
  const completedQuantity = task.completed_quantity ?? 0;
  const editTriggerId = `task-edit-${task.id}`;
  const progressTriggerId = `task-progress-trigger-${task.id}`;
  const deleteTriggerId = `task-delete-${task.id}`;
  const effectiveMode = canManage ? mode : "idle";
  const secondaryText = getTaskSecondaryText({
    completedQuantity,
    isCompleted: task.is_completed,
    isQuantified,
    targetQuantity,
  });

  useEffect(() => {
    if (completionState.ok) {
      // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
      window.location.assign(successNavigationHref);
    }
  }, [completionState.ok, successNavigationHref]);

  function focusTrigger(triggerId: string) {
    window.requestAnimationFrame(() => {
      const trigger = document.getElementById(triggerId);

      if (trigger instanceof HTMLButtonElement) {
        trigger.focus({ preventScroll: true });
      }
    });
  }

  function closeTitleEditor() {
    setMode("idle");
    focusTrigger(editTriggerId);
  }

  function closeProgressEditor() {
    setMode("idle");
    focusTrigger(progressTriggerId);
  }

  function openDeleteConfirmation() {
    onDeleteIntent();
    setMode("confirm-delete");
  }

  function cancelDeleteConfirmation() {
    setMode("idle");
    focusTrigger(deleteTriggerId);
  }

  return (
    <li className="min-w-0 px-4 py-3">
      {canManage && effectiveMode === "confirm-delete" ? (
        <InlineDeleteConfirmation
          action={actions.delete}
          initialState={deleteInitialState}
          title="¿Eliminar esta tarea?"
          description={
            <p>
              Se eliminará “{task.title}” de este pedido. Esta acción no se
              puede deshacer.
            </p>
          }
          confirmLabel="Eliminar tarea"
          pendingLabel="Eliminando tarea..."
          className="border-0 bg-transparent p-0"
          onCancel={cancelDeleteConfirmation}
          onSuccess={(message) => {
            onDeleteSuccess(message);
            // TD-NEXT-001: fallback temporal para navegación same-route en self-hosted.
            window.location.assign(successNavigationHref);
          }}
        >
          <TaskHiddenFields taskId={task.id} />
        </InlineDeleteConfirmation>
      ) : (
        <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            {effectiveMode === "edit-title" ? (
              <PedidoTaskTitleInlineForm
                action={actions.updateTitle}
                task={task}
                onCancel={closeTitleEditor}
                onSaved={closeTitleEditor}
                successNavigationHref={successNavigationHref}
              />
            ) : (
              <p
                className={[
                  "wrap-break-word text-sm font-semibold leading-6 text-text-primary",
                  task.is_completed ? "text-text-secondary" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {task.title}
              </p>
            )}

            {effectiveMode === "edit-progress" ? (
              <PedidoTaskProgressInlineForm
                action={actions.updateProgress}
                completedQuantity={completedQuantity}
                targetQuantity={targetQuantity}
                task={task}
                onCancel={closeProgressEditor}
                onSaved={closeProgressEditor}
                successNavigationHref={successNavigationHref}
              />
            ) : (
              <p className="mt-1 wrap-break-word text-xs leading-5 text-text-secondary">
                {secondaryText}
              </p>
            )}

            {canManage && effectiveMode === "idle" ? (
              <div className="mt-2">
                <InlineTaskActionMessage state={completionState} />
              </div>
            ) : null}
          </div>

          {canManage && effectiveMode === "idle" ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1 md:justify-end">
              {isQuantified && !task.is_completed ? (
                <Button
                  id={progressTriggerId}
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={completionPending}
                  className={iconButtonClassName()}
                  aria-label={`Actualizar progreso de tarea ${task.title}`}
                  title={`Actualizar progreso de tarea ${task.title}`}
                  onClick={() => setMode("edit-progress")}
                >
                  <Gauge className="size-4" aria-hidden="true" />
                </Button>
              ) : null}

              {!isQuantified || task.is_completed ? (
                <form action={completionAction} aria-busy={completionPending}>
                  <TaskHiddenFields taskId={task.id} />
                  <Button
                    type="submit"
                    disabled={completionPending}
                    variant={task.is_completed ? "secondary" : "primary"}
                    size="sm"
                    className={iconButtonClassName()}
                    aria-label={
                      completionPending
                        ? task.is_completed
                          ? `Reabriendo tarea ${task.title}...`
                          : `Completando tarea ${task.title}...`
                        : task.is_completed
                          ? `Reabrir tarea ${task.title}`
                          : `Marcar como completada tarea ${task.title}`
                    }
                    title={
                      completionPending
                        ? task.is_completed
                          ? `Reabriendo tarea ${task.title}...`
                          : `Completando tarea ${task.title}...`
                        : task.is_completed
                          ? `Reabrir tarea ${task.title}`
                          : `Marcar como completada tarea ${task.title}`
                    }
                  >
                    {completionPending ? (
                      <SpinnerIcon />
                    ) : task.is_completed ? (
                      <RotateCcw className="size-4" aria-hidden="true" />
                    ) : (
                      <Check className="size-4" aria-hidden="true" />
                    )}
                  </Button>
                </form>
              ) : null}

              <Button
                id={editTriggerId}
                type="button"
                variant="secondary"
                size="sm"
                disabled={completionPending}
                className={iconButtonClassName()}
                aria-label={`Editar tarea ${task.title}`}
                title={`Editar tarea ${task.title}`}
                onClick={() => setMode("edit-title")}
              >
                <Pencil className="size-4" aria-hidden="true" />
              </Button>

              <Button
                id={deleteTriggerId}
                type="button"
                variant="danger"
                size="sm"
                disabled={completionPending}
                className={iconButtonClassName("danger")}
                aria-label={`Eliminar tarea ${task.title}`}
                title={`Eliminar tarea ${task.title}`}
                onClick={openDeleteConfirmation}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </li>
  );
}
