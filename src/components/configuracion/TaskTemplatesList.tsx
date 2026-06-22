"use client";

import { useActionState } from "react";

import {
  toggleTaskTemplateActiveAction,
  type TaskTemplateActionState,
} from "@/app/dashboard/configuracion/actions";
import { TaskTemplateForm } from "@/components/configuracion/TaskTemplateForm";
import { Alert, Button, Card, EmptyState, StatusBadge } from "@/components/ui";
import type { TaskTemplateListItem } from "@/lib/task-templates";

type TaskTemplatesListProps = {
  templates: TaskTemplateListItem[];
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const initialToggleState: TaskTemplateActionState = {
  ok: false,
  message: "",
};

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value));
}

function formatTasksCount(count: number): string {
  return count === 1 ? "1 tarea" : `${count} tareas`;
}

function ToggleTaskTemplateActiveForm({
  template,
}: {
  template: TaskTemplateListItem;
}) {
  const [state, formAction, pending] = useActionState(
    toggleTaskTemplateActiveAction,
    initialToggleState,
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
        size="sm"
        disabled={pending}
        className="w-full sm:w-auto"
      >
        {pending
          ? "Actualizando..."
          : template.is_active
            ? "Desactivar"
            : "Activar"}
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

export function TaskTemplatesList({ templates }: TaskTemplatesListProps) {
  if (templates.length === 0) {
    return (
      <EmptyState
        title="No hay plantillas de tareas"
        description="Cuando crees una plantilla, aparecerá aquí para administrarla desde Configuración."
      />
    );
  }

  return (
    <div className="grid gap-4" aria-label="Plantillas de tareas">
      {templates.map((template) => (
        <Card
          as="article"
          key={template.id}
          padding="md"
          className="shadow-(--shadow-soft)"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-semibold text-text-primary">
                  {template.name}
                </h3>
                <StatusBadge
                  status={template.is_active ? "activo" : "inactivo"}
                  label={template.is_active ? "Activa" : "Inactiva"}
                />
              </div>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
                {template.description?.trim() ||
                  "Sin descripción interna definida."}
              </p>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Tareas
                  </dt>
                  <dd className="mt-1 text-text-primary">
                    {formatTasksCount(template.tasksCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Creación
                  </dt>
                  <dd className="mt-1 text-text-primary">
                    {formatDate(template.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Actualización
                  </dt>
                  <dd className="mt-1 text-text-primary">
                    {formatDate(template.updated_at)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="w-full shrink-0 lg:w-44">
              <ToggleTaskTemplateActiveForm template={template} />
            </div>
          </div>

          <details className="mt-5 border-t border-border pt-5">
            <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft">
              Editar
            </summary>
            <div className="mt-5 max-w-3xl">
              <TaskTemplateForm
                mode="edit"
                layout="inline"
                template={template}
              />
            </div>
          </details>
        </Card>
      ))}
    </div>
  );
}
