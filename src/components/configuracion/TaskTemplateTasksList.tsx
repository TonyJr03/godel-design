"use client";

import { useActionState } from "react";

import type {
  DeleteTaskTemplateTaskActionState,
  MoveTaskTemplateTaskActionState,
  TaskTemplateDetailAction,
  UpdateTaskTemplateTaskActionState,
} from "@/app/dashboard/configuracion/plantillas/[templateId]/actions";
import { TaskTemplateTaskForm } from "@/components/configuracion/TaskTemplateTaskForm";
import { Alert, Button, EmptyState, StatusBadge } from "@/components/ui";
import type { TaskTemplateTask } from "@/lib/task-templates";

export type TaskTemplateTaskItemActions = {
  delete: TaskTemplateDetailAction<DeleteTaskTemplateTaskActionState>;
  move: TaskTemplateDetailAction<MoveTaskTemplateTaskActionState>;
  update: TaskTemplateDetailAction<UpdateTaskTemplateTaskActionState>;
};

type TaskTemplateTasksListProps = {
  tasks: TaskTemplateTask[];
  actions: TaskTemplateTaskItemActions;
};

const deleteInitialState: DeleteTaskTemplateTaskActionState = {
  ok: false,
  message: "",
};

const moveInitialState: MoveTaskTemplateTaskActionState = {
  ok: false,
  message: "",
};

function formatTargetQuantity(task: TaskTemplateTask): string {
  if (task.task_type !== "cuantificada") {
    return "Sin cantidad";
  }

  return `${task.target_quantity ?? 0}`;
}

function TaskHiddenFields({ taskId }: { taskId: string }) {
  return <input type="hidden" name="task_id" value={taskId} />;
}

function ActionMessage({
  state,
}: {
  state: DeleteTaskTemplateTaskActionState | MoveTaskTemplateTaskActionState;
}) {
  if (!state.message) {
    return null;
  }

  return (
    <Alert
      variant={state.ok ? "success" : "danger"}
      aria-live="polite"
      className="py-2"
    >
      {state.message}
    </Alert>
  );
}

function MoveTaskTemplateTaskForm({
  task,
  direction,
  action,
  disabled,
}: {
  task: TaskTemplateTask;
  direction: "up" | "down";
  action: TaskTemplateDetailAction<MoveTaskTemplateTaskActionState>;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    moveInitialState,
  );

  return (
    <form action={formAction} aria-busy={pending} className="space-y-2">
      <TaskHiddenFields taskId={task.id} />
      <input type="hidden" name="direction" value={direction} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
        className="w-full sm:w-auto"
      >
        {pending
          ? "Moviendo..."
          : direction === "up"
            ? "Subir"
            : "Bajar"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

function DeleteTaskTemplateTaskForm({
  task,
  action,
}: {
  task: TaskTemplateTask;
  action: TaskTemplateDetailAction<DeleteTaskTemplateTaskActionState>;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    deleteInitialState,
  );

  return (
    <form action={formAction} aria-busy={pending} className="space-y-2">
      <TaskHiddenFields taskId={task.id} />
      <Button
        type="submit"
        variant="danger"
        size="sm"
        disabled={pending}
        className="w-full sm:w-auto"
      >
        {pending ? "Eliminando..." : "Eliminar"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}

export function TaskTemplateTasksList({
  tasks,
  actions,
}: TaskTemplateTasksListProps) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Esta plantilla todavía no tiene tareas"
        description="Agrega la primera tarea para definir el flujo predeterminado."
      />
    );
  }

  return (
    <ol className="space-y-4" aria-label="Tareas de la plantilla">
      {tasks.map((task, index) => {
        const isFirst = index === 0;
        const isLast = index === tasks.length - 1;
        const isQuantified = task.task_type === "cuantificada";

        return (
          <li
            key={task.id}
            className="rounded-(--radius-card) border border-border bg-surface p-4 shadow-(--shadow-soft)"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex size-8 items-center justify-center rounded-(--radius-control) bg-brand-primary-soft text-sm font-semibold text-brand-primary">
                    {index + 1}
                  </span>
                  <StatusBadge
                    status={isQuantified ? "en_progreso" : "pendiente"}
                    label={isQuantified ? "Cuantificada" : "Simple"}
                  />
                  <span className="rounded-(--radius-control) border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-text-secondary">
                    {formatTargetQuantity(task)}
                  </span>
                </div>

                <p className="mt-3 text-base font-semibold leading-6 text-text-primary">
                  {task.title}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:w-auto">
                <MoveTaskTemplateTaskForm
                  task={task}
                  direction="up"
                  action={actions.move}
                  disabled={isFirst}
                />
                <MoveTaskTemplateTaskForm
                  task={task}
                  direction="down"
                  action={actions.move}
                  disabled={isLast}
                />
                <DeleteTaskTemplateTaskForm
                  task={task}
                  action={actions.delete}
                />
              </div>
            </div>

            <details className="mt-4 border-t border-border pt-4">
              <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft">
                Editar
              </summary>
              <div className="mt-4 max-w-3xl">
                <TaskTemplateTaskForm
                  mode="edit"
                  action={actions.update}
                  task={task}
                />
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
