import {
  ClickableTableRow,
  ListingCardLink,
} from "@/components/listing";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { TaskTemplateListItem } from "@/lib/task-templates";

type InternalTaskTemplatesListProps = {
  templates: TaskTemplateListItem[];
  hasActiveFilters?: boolean;
  emptyMessage?: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

function formatDescription(value: string | null): string {
  return value?.trim() || "Sin descripción interna definida.";
}

function getTemplateHref(template: TaskTemplateListItem): string {
  return `/dashboard/configuracion/plantillas/${template.id}`;
}

function getTemplateLabel(template: TaskTemplateListItem): string {
  return `Abrir plantilla ${template.name}`;
}

function formatTasksCount(count: number): string {
  return count === 1 ? "1 tarea" : `${count} tareas`;
}

export function InternalTaskTemplatesList({
  templates,
  hasActiveFilters = false,
  emptyMessage = "Cuando existan plantillas de tareas, aparecerán aquí para consulta interna.",
}: InternalTaskTemplatesListProps) {
  if (templates.length === 0) {
    return (
      <EmptyState
        variant={hasActiveFilters ? "search" : "default"}
        title={
          hasActiveFilters
            ? "No encontramos plantillas con esta búsqueda."
            : "No hay plantillas de tareas todavía."
        }
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 xl:hidden" aria-label="Plantillas">
        {templates.map((template) => (
          <ListingCardLink
            href={getTemplateHref(template)}
            key={template.id}
            aria-label={getTemplateLabel(template)}
            className="space-y-4 overflow-hidden"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-text-primary">
                  {template.name}
                </h2>
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
                  {formatDescription(template.description)}
                </p>
              </div>
              <StatusBadge
                status={template.is_active ? "activo" : "inactivo"}
                label={template.is_active ? "Activa" : "Inactiva"}
                className="shrink-0"
              />
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
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
              <div className="col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Actualización
                </dt>
                <dd className="mt-1 text-text-primary">
                  {formatDate(template.updated_at)}
                </dd>
              </div>
            </dl>
          </ListingCardLink>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) xl:block">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-border text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[34%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Plantilla
                </th>
                <th scope="col" className="px-4 py-3">
                  Descripción
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Tareas
                </th>
                <th scope="col" className="px-4 py-3">
                  Creación
                </th>
                <th scope="col" className="px-4 py-3">
                  Actualización
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {templates.map((template) => (
                <ClickableTableRow
                  key={template.id}
                  href={getTemplateHref(template)}
                  label={getTemplateLabel(template)}
                  className="align-top"
                >
                  <td className="px-4 py-4 font-semibold text-text-primary">
                    <div className="truncate">{template.name}</div>
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    <div className="line-clamp-2 leading-6">
                      {formatDescription(template.description)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <StatusBadge
                      status={template.is_active ? "activo" : "inactivo"}
                      label={template.is_active ? "Activa" : "Inactiva"}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatTasksCount(template.tasksCount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(template.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(template.updated_at)}
                  </td>
                </ClickableTableRow>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
