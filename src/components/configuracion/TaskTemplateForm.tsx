"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import {
  createTaskTemplateAction,
  updateTaskTemplateAction,
  type TaskTemplateActionState,
} from "@/app/dashboard/configuracion/actions";
import {
  Alert,
  Button,
  FormActions,
  FormField,
  FormSection,
  Input,
  Textarea,
} from "@/components/ui";
import type {
  TaskTemplateField,
  TaskTemplateListItem,
} from "@/lib/task-templates";

type TaskTemplateFormProps =
  | {
      mode: "create";
      layout?: "section";
      template?: never;
    }
  | {
      mode: "edit";
      layout?: "inline";
      template: TaskTemplateListItem;
    };

const initialState: TaskTemplateActionState = {
  ok: false,
  message: "",
};

function getFieldError(
  state: TaskTemplateActionState,
  field: TaskTemplateField,
) {
  return state.fieldErrors?.[field];
}

function TaskTemplateFields({
  state,
  template,
  fieldPrefix,
}: {
  state: TaskTemplateActionState;
  template?: TaskTemplateListItem;
  fieldPrefix: string;
}) {
  const nameError = getFieldError(state, "name");
  const descriptionError = getFieldError(state, "description");
  const nameId = `${fieldPrefix}-name`;
  const descriptionId = `${fieldPrefix}-description`;

  return (
    <div className="grid gap-5">
      <FormField id={nameId} label="Nombre" required error={nameError}>
        {({ describedBy, invalid }) => (
          <Input
            id={nameId}
            name="name"
            type="text"
            required
            minLength={2}
            maxLength={120}
            defaultValue={template?.name ?? ""}
            invalid={invalid}
            aria-describedby={describedBy}
          />
        )}
      </FormField>

      <FormField
        id={descriptionId}
        label="Descripción"
        error={descriptionError}
      >
        {({ describedBy, invalid }) => (
          <Textarea
            id={descriptionId}
            name="description"
            maxLength={2000}
            defaultValue={template?.description ?? ""}
            invalid={invalid}
            aria-describedby={describedBy}
            className="min-h-24"
          />
        )}
      </FormField>
    </div>
  );
}

export function TaskTemplateForm({
  mode,
  layout = mode === "create" ? "section" : "inline",
  template,
}: TaskTemplateFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fieldPrefix = useId();
  const action =
    mode === "create" ? createTaskTemplateAction : updateTaskTemplateAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const isCreate = mode === "create";

  useEffect(() => {
    if (isCreate && state.ok) {
      formRef.current?.reset();
    }
  }, [isCreate, state.ok]);

  const content = (
    <div className="space-y-5">
      {state.message ? (
        <Alert variant={state.ok ? "success" : "danger"} aria-live="polite">
          {state.message}
        </Alert>
      ) : null}

      {template ? (
        <input type="hidden" name="template_id" value={template.id} />
      ) : null}

      <TaskTemplateFields
        state={state}
        template={template}
        fieldPrefix={fieldPrefix}
      />

      <FormActions
        note={
          isCreate
            ? "Las tareas internas se configurarán en la siguiente etapa."
            : undefined
        }
      >
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending
            ? isCreate
              ? "Creando..."
              : "Guardando..."
            : isCreate
              ? "Crear plantilla"
              : "Guardar cambios"}
        </Button>
      </FormActions>
    </div>
  );

  return (
    <form ref={formRef} action={formAction} aria-busy={pending}>
      {layout === "section" ? (
        <FormSection
          title="Nueva plantilla"
          description="Crea una cabecera reutilizable. Las tareas se agregarán en Alfa 3.3."
        >
          {content}
        </FormSection>
      ) : (
        content
      )}
    </form>
  );
}
