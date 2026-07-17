"use client";

import { useActionState, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import type {
  DeleteTaskTemplateTaskActionState,
  MoveTaskTemplateTaskActionState,
  TaskTemplateDetailAction,
  UpdateTaskTemplateTaskActionState,
} from "@/app/(interno)/dashboard/configuracion/plantillas/[templateId]/actions";
import { Button, EmptyState } from "@/components/ui";
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

const updateInitialState: UpdateTaskTemplateTaskActionState = {
  ok: false,
  message: "",
};

function TaskHiddenFields({ taskId }: { taskId: string }) {
  return <input type="hidden" name="task_id" value={taskId} />;
}

function InlineActionError({
  message,
}: {
  message: string | undefined;
}) {
  if (!message) {
    return null;
  }

  return (
    <p
      className="mt-2 max-w-full break-words text-xs font-semibold text-danger"
      aria-live="polite"
    >
      {message}
    </p>
  );
}

function iconButtonClassName(tone: "default" | "danger" = "default") {
  return [
    "h-10 w-10 px-0",
    tone === "danger" ? "text-white" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
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
  const isUp = direction === "up";
  const label = `${isUp ? "Subir" : "Bajar"} tarea ${task.title}`;
  const Icon = isUp ? ArrowUp : ArrowDown;

  return (
    <form action={formAction} aria-busy={pending} className="min-w-0">
      <TaskHiddenFields taskId={task.id} />
      <input type="hidden" name="direction" value={direction} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={disabled || pending}
        className={iconButtonClassName()}
        aria-label={label}
        title={label}
      >
        <Icon className="size-4" aria-hidden="true" />
      </Button>
      {!state.ok ? <InlineActionError message={state.message} /> : null}
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
  const label = `Eliminar tarea ${task.title}`;

  return (
    <form action={formAction} aria-busy={pending} className="min-w-0">
      <TaskHiddenFields taskId={task.id} />
      <Button
        type="submit"
        variant="danger"
        size="sm"
        disabled={pending}
        className={iconButtonClassName("danger")}
        aria-label={label}
        title={label}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
      {!state.ok ? <InlineActionError message={state.message} /> : null}
    </form>
  );
}

function UpdateTaskTemplateTaskInlineForm({
  task,
  action,
  onCancel,
  onSaved,
}: {
  task: TaskTemplateTask;
  action: TaskTemplateDetailAction<UpdateTaskTemplateTaskActionState>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    updateInitialState,
  );
  const [title, setTitle] = useState(task.title);
  const titleError = state.fieldErrors?.title;

  useEffect(() => {
    if (state.ok) {
      onSaved();
    }
  }, [onSaved, state.ok]);

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="min-w-0 md:flex md:items-center md:gap-2"
    >
      <TaskHiddenFields taskId={task.id} />
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor={`task-title-${task.id}`}>
          Editar tarea {task.title}
        </label>
        <input
          id={`task-title-${task.id}`}
          name="title"
          type="text"
          required
          maxLength={160}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={pending}
          aria-invalid={titleError ? true : undefined}
          className="min-h-10 w-full rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm text-text-primary transition-colors focus:border-brand-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <InlineActionError
          message={titleError ?? (!state.ok ? state.message : undefined)}
        />
      </div>

      <div className="mt-2 flex shrink-0 items-center gap-1 md:mt-0">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending}
          className={iconButtonClassName()}
          aria-label={`Guardar tarea ${task.title}`}
          title={`Guardar tarea ${task.title}`}
        >
          <Check className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          className={iconButtonClassName()}
          aria-label="Cancelar edición"
          title="Cancelar edición"
          onClick={onCancel}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

function TaskTemplateTaskRow({
  task,
  index,
  isFirst,
  isLast,
  actions,
}: {
  task: TaskTemplateTask;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  actions: TaskTemplateTaskItemActions;
}) {
  const [isEditing, setIsEditing] = useState(false);

  return (
    <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
      <span className="row-span-2 mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-control) bg-brand-primary-soft text-sm font-semibold text-brand-primary md:row-span-1 md:mt-0">
        {index + 1}
      </span>

      {isEditing ? (
        <div className="col-start-2 min-w-0 md:col-span-2 md:col-start-auto">
          <UpdateTaskTemplateTaskInlineForm
            task={task}
            action={actions.update}
            onCancel={() => setIsEditing(false)}
            onSaved={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <>
          <div className="min-w-0 py-1.5 md:py-0">
            <p className="break-words text-sm font-semibold leading-6 text-text-primary md:truncate">
              {task.title}
            </p>
          </div>

          <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-1 md:col-start-auto md:flex-nowrap md:justify-end">
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
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={iconButtonClassName()}
              aria-label={`Editar tarea ${task.title}`}
              title={`Editar tarea ${task.title}`}
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
            <DeleteTaskTemplateTaskForm
              task={task}
              action={actions.delete}
            />
          </div>
        </>
      )}
    </li>
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
    <ol
      className="divide-y divide-border overflow-hidden rounded-(--radius-card) border border-border bg-surface"
      aria-label="Tareas de la plantilla"
    >
      {tasks.map((task, index) => (
        <TaskTemplateTaskRow
          key={task.id}
          task={task}
          index={index}
          isFirst={index === 0}
          isLast={index === tasks.length - 1}
          actions={actions}
        />
      ))}
    </ol>
  );
}
