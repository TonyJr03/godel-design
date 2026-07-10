"use client";

import { useActionState } from "react";

import type {
  ApplyTaskTemplateActionState,
  PedidoDetailAction,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import { Alert, Button, Select } from "@/components/ui";
import type { ActiveTaskTemplateForOrder } from "@/lib/task-templates";

type ApplyTaskTemplateFormProps = {
  action: PedidoDetailAction<ApplyTaskTemplateActionState>;
  templates: ActiveTaskTemplateForOrder[];
  loadError?: string;
  presentation?: "card" | "panel";
};

const initialState: ApplyTaskTemplateActionState = {
  ok: false,
  message: "",
};

function formatTasksCount(count: number): string {
  return count === 1 ? "1 tarea" : `${count} tareas`;
}

export function ApplyTaskTemplateForm({
  action,
  templates,
  loadError,
  presentation = "card",
}: ApplyTaskTemplateFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const templateError = state.fieldErrors?.template_id;
  const hasTemplates = templates.length > 0;
  const isPanelPresentation = presentation === "panel";

  return (
    <div
      className={
        isPanelPresentation
          ? "min-w-0"
          : "rounded-(--radius-card) border border-border bg-surface-raised p-4"
      }
    >
      <div>
        <h3 className="text-base font-semibold text-text-primary">
          Cargar tareas predeterminadas
        </h3>
        {!isPanelPresentation ? (
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Las tareas de la plantilla se agregarán al final de las tareas
            actuales. Luego podrás editarlas, completarlas o eliminarlas
            normalmente.
          </p>
        ) : null}
      </div>

      {loadError ? (
        <Alert variant="danger" className="mt-4">
          {loadError}
        </Alert>
      ) : null}

      {!loadError && !hasTemplates ? (
        <Alert variant="info" className="mt-4">
          No hay plantillas activas con tareas configuradas. Configura
          plantillas de tareas desde Configuración para usarlas aquí.
        </Alert>
      ) : null}

      {hasTemplates ? (
        <form action={formAction} aria-busy={pending} className="mt-4">
          {state.message ? (
            <Alert
              variant={state.ok ? "success" : "danger"}
              aria-live="polite"
            >
              {state.message}
            </Alert>
          ) : null}

          <div
            className={[
              state.message ? "mt-4" : "",
              "grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div>
              <label
                htmlFor="task-template-id"
                className={
                  isPanelPresentation
                    ? "sr-only"
                    : "text-sm font-medium text-text-primary"
                }
              >
                Seleccionar plantilla
              </label>
              <Select
                id="task-template-id"
                name="template_id"
                required
                disabled={pending}
                defaultValue=""
                invalid={Boolean(templateError)}
                aria-describedby={
                  templateError ? "task-template-id-error" : undefined
                }
                className={isPanelPresentation ? "" : "mt-2"}
              >
                <option value="" disabled>
                  Selecciona una plantilla
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {formatTasksCount(template.tasksCount)}
                  </option>
                ))}
              </Select>
              {templateError ? (
                <p
                  id="task-template-id-error"
                  className="mt-2 text-sm leading-5 text-danger"
                >
                  {templateError}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              disabled={pending}
              className="w-full lg:w-auto"
            >
              {pending ? "Aplicando..." : "Aplicar plantilla"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
