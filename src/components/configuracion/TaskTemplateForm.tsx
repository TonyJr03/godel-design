"use client";

import { useActionState, useEffect, useId, useRef } from "react";

import {
  createTaskTemplateAction,
  updateTaskTemplateAction,
  type TaskTemplateActionState,
} from "@/app/(interno)/dashboard/configuracion/actions";
import {
  Alert,
  Button,
  FormActions,
  FormField,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import type {
  TaskTemplateField,
  TaskTemplateDetail,
  TaskTemplateListItem,
} from "@/lib/task-templates";

type EditableTaskTemplate = Pick<
  TaskTemplateListItem | TaskTemplateDetail,
  "id" | "name" | "description" | "is_active"
>;

type TaskTemplateFormCommonProps = {
  onSuccess?: (state: TaskTemplateActionState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

type TaskTemplateFormProps = TaskTemplateFormCommonProps &
  (
    | {
      mode: "create";
      template?: never;
      includeStatus?: never;
    }
    | {
      mode: "edit";
      template: EditableTaskTemplate;
      includeStatus?: boolean;
    }
  );

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
  includeStatus = false,
}: {
  state: TaskTemplateActionState;
  template?: EditableTaskTemplate;
  fieldPrefix: string;
  includeStatus?: boolean;
}) {
  const nameError = getFieldError(state, "name");
  const descriptionError = getFieldError(state, "description");
  const nameId = `${fieldPrefix}-name`;
  const descriptionId = `${fieldPrefix}-description`;
  const statusId = `${fieldPrefix}-status`;

  return (
    <div className="grid gap-4">
      <FormField
        id={nameId}
        label="Nombre"
        required
        error={nameError}
        compact
      >
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
        compact
      >
        {({ describedBy, invalid }) => (
          <Textarea
            id={descriptionId}
            name="description"
            maxLength={2000}
            defaultValue={template?.description ?? ""}
            invalid={invalid}
            aria-describedby={describedBy}
            className="min-h-20"
          />
        )}
      </FormField>

      {includeStatus && template ? (
        <FormField id={statusId} label="Estado" required compact>
          {({ describedBy, invalid }) => (
            <Select
              id={statusId}
              name="is_active"
              required
              defaultValue={template.is_active ? "true" : "false"}
              invalid={invalid}
              aria-describedby={describedBy}
            >
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </Select>
          )}
        </FormField>
      ) : null}
    </div>
  );
}

export function TaskTemplateForm({
  mode,
  template,
  includeStatus = false,
  onSuccess,
  onDirtyChange,
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

    if (state.ok) {
      onDirtyChange?.(false);
      onSuccess?.(state);
    }
  }, [isCreate, onDirtyChange, onSuccess, state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      aria-busy={pending}
      onChange={() => onDirtyChange?.(true)}
    >
      <div className="space-y-4">
        {state.message ? (
          <Alert
            variant={state.ok ? "success" : "danger"}
            title={
              state.ok
                ? isCreate
                  ? "Plantilla creada"
                  : "Cambios guardados"
                : isCreate
                  ? "No se pudo crear la plantilla"
                  : "No se pudieron guardar los cambios"
            }
            aria-live="polite"
          >
            <p>{state.message}</p>
          </Alert>
        ) : null}

        {template ? (
          <input type="hidden" name="template_id" value={template.id} />
        ) : null}

        <TaskTemplateFields
          state={state}
          template={template}
          fieldPrefix={fieldPrefix}
          includeStatus={!isCreate && includeStatus}
        />

        <FormActions compact note={undefined}>
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending
              ? isCreate
                ? "Creando plantilla..."
                : "Guardando cambios..."
              : isCreate
                ? "Crear plantilla"
                : "Guardar cambios"}
          </Button>
        </FormActions>
      </div>
    </form>
  );
}
