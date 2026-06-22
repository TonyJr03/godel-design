"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import type {
  CreateTaskTemplateTaskActionState,
  TaskTemplateDetailAction,
  UpdateTaskTemplateTaskActionState,
} from "@/app/dashboard/configuracion/plantillas/[templateId]/actions";
import { Alert, Button, FormActions, FormField, Input } from "@/components/ui";
import type {
  TaskTemplateTask,
  TaskTemplateTaskField,
} from "@/lib/task-templates";

type TaskTemplateTaskFormProps =
  | {
      mode: "create";
      action: TaskTemplateDetailAction<CreateTaskTemplateTaskActionState>;
      task?: never;
    }
  | {
      mode: "edit";
      action: TaskTemplateDetailAction<UpdateTaskTemplateTaskActionState>;
      task: TaskTemplateTask;
    };

const createInitialState: CreateTaskTemplateTaskActionState = {
  ok: false,
  message: "",
  values: {
    title: "",
  },
};

const updateInitialState: UpdateTaskTemplateTaskActionState = {
  ok: false,
  message: "",
};

function getFieldError(
  state: CreateTaskTemplateTaskActionState | UpdateTaskTemplateTaskActionState,
  field: TaskTemplateTaskField,
) {
  return state.fieldErrors?.[field];
}

export function TaskTemplateTaskForm({
  mode,
  action,
  task,
}: TaskTemplateTaskFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldId = useId();
  const isCreate = mode === "create";
  const [state, formAction, pending] = useActionState(
    action,
    isCreate ? createInitialState : updateInitialState,
  );
  const titleError = getFieldError(state, "title");

  useEffect(() => {
    if (isCreate && state.ok) {
      formRef.current?.reset();
    }
  }, [isCreate, state.ok]);

  return (
    <form ref={formRef} action={formAction} aria-busy={pending}>
      {task ? <input type="hidden" name="task_id" value={task.id} /> : null}

      <div className="space-y-4">
        {state.message ? (
          <Alert variant={state.ok ? "success" : "danger"} aria-live="polite">
            {state.message}
          </Alert>
        ) : null}

        <FormField
          id={`${fieldId}-title`}
          label={isCreate ? "Nueva tarea" : "Editar tarea"}
          required
          error={titleError}
          help={
            isCreate
              ? "Ejemplos: Revisar diseño enviado por el cliente, Imprimir 100 páginas."
              : undefined
          }
        >
          {({ describedBy, invalid }) => (
            <Input
              id={`${fieldId}-title`}
              name="title"
              type="text"
              required
              maxLength={160}
              defaultValue={
                state.values?.title ?? (task ? task.title : "")
              }
              placeholder="Ej. Imprimir 100 páginas"
              invalid={invalid}
              disabled={pending}
              aria-describedby={describedBy}
            />
          )}
        </FormField>

        <FormActions
          note={
            isCreate
              ? "Si el texto contiene una cantidad entera positiva, la tarea será cuantificada."
              : undefined
          }
        >
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending
              ? isCreate
                ? "Agregando..."
                : "Guardando..."
              : isCreate
                ? "Agregar tarea"
                : "Guardar tarea"}
          </Button>
        </FormActions>
      </div>
    </form>
  );
}
