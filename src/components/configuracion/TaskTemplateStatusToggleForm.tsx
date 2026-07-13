"use client";

import { useActionState } from "react";

import {
  toggleTaskTemplateActiveAction,
  type TaskTemplateActionState,
} from "@/app/(interno)/dashboard/configuracion/actions";
import { Alert, Button } from "@/components/ui";
import type { TaskTemplateDetail } from "@/lib/task-templates";

type TaskTemplateStatusToggleFormProps = {
  template: TaskTemplateDetail;
};

const initialState: TaskTemplateActionState = {
  ok: false,
  message: "",
};

export function TaskTemplateStatusToggleForm({
  template,
}: TaskTemplateStatusToggleFormProps) {
  const [state, formAction, pending] = useActionState(
    toggleTaskTemplateActiveAction,
    initialState,
  );
  const nextActiveState = !template.is_active;

  return (
    <form action={formAction} aria-busy={pending} className="space-y-3">
      <input type="hidden" name="template_id" value={template.id} />
      <input
        type="hidden"
        name="is_active"
        value={nextActiveState ? "true" : "false"}
      />

      <Button
        type="submit"
        variant={template.is_active ? "secondary" : "primary"}
        disabled={pending}
        className="w-full"
      >
        {pending
          ? "Actualizando..."
          : template.is_active
            ? "Desactivar plantilla"
            : "Activar plantilla"}
      </Button>

      {state.message ? (
        <Alert
          variant={state.ok ? "success" : "danger"}
          aria-live="polite"
          className="py-2"
        >
          {state.message}
        </Alert>
      ) : null}
    </form>
  );
}
