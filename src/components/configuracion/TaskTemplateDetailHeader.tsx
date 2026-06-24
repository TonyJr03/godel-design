import Link from "next/link";

import { Card, StatusBadge } from "@/components/ui";
import type { TaskTemplateDetail } from "@/lib/task-templates";

type TaskTemplateDetailHeaderProps = {
  template: TaskTemplateDetail;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  return DATE_FORMATTER.format(new Date(value));
}

export function TaskTemplateDetailHeader({
  template,
}: TaskTemplateDetailHeaderProps) {
  return (
    <Card as="section" padding="lg" className="shadow-(--shadow-soft)">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-primary">
            Configuración / Plantillas de tareas
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-text-primary">
              {template.name}
            </h1>
            <StatusBadge
              status={template.is_active ? "activo" : "inactivo"}
              label={template.is_active ? "Activa" : "Inactiva"}
            />
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
            {template.description?.trim() ||
              "Sin descripción interna definida."}
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
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

        <Link
          href="/dashboard/configuracion"
          className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft"
        >
          Volver a configuración
        </Link>
      </div>
    </Card>
  );
}
