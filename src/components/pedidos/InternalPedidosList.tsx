import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { InternalPedido } from "@/lib/pedidos";
import { getSolicitudServiceTypeLabel } from "@/lib/solicitudes";

type InternalPedidosListProps = {
  pedidos: InternalPedido[];
  emptyMessage?: string;
  hasActiveFilters?: boolean;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const actionLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft";

function formatShortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

function getTrabajadoresLabel(pedido: InternalPedido): string {
  if (pedido.pedido_trabajadores.length === 0) {
    return "Sin asignar";
  }

  return pedido.pedido_trabajadores
    .map((asignacion) =>
      asignacion.perfiles?.full_name?.trim()
        ? asignacion.perfiles.full_name
        : "Usuario asignado",
    )
    .join(", ");
}

function getClienteLabel(pedido: InternalPedido): string {
  if (pedido.clientes?.name) {
    return pedido.clientes.name;
  }

  return pedido.cliente_id ? "Cliente asociado" : "Sin cliente asociado";
}

function getProgressLabel(pedido: InternalPedido): string {
  if (!pedido.taskProgress.hasTasks) {
    return "Sin tareas";
  }

  if (pedido.taskProgress.isComplete) {
    return `${pedido.taskProgress.completedTasks} de ${pedido.taskProgress.totalTasks} tareas completadas`;
  }

  return `${pedido.taskProgress.progressPercentage}% completado · ${pedido.taskProgress.pendingTasks} pendientes`;
}

function ProgressBadge({ pedido }: { pedido: InternalPedido }) {
  return (
    <span
      className={[
        "inline-flex rounded-(--radius-control) border px-2.5 py-1 text-xs font-semibold",
        pedido.taskProgress.isComplete
          ? "border-success/30 bg-success-soft text-success"
          : "border-border-strong bg-surface-muted text-text-secondary",
      ].join(" ")}
    >
      {getProgressLabel(pedido)}
    </span>
  );
}

export function InternalPedidosList({
  pedidos,
  emptyMessage = "Cuando existan pedidos internos, aparecerán aquí ordenados por fecha de creación.",
  hasActiveFilters = false,
}: InternalPedidosListProps) {
  if (pedidos.length === 0) {
    return (
      <EmptyState
        variant={hasActiveFilters ? "search" : "default"}
        title={
          hasActiveFilters
            ? "Sin resultados para estos filtros"
            : "No hay pedidos para mostrar"
        }
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 xl:hidden" aria-label="Pedidos">
        {pedidos.map((pedido) => (
          <Card
            as="article"
            key={pedido.id}
            padding="sm"
            className="shadow-(--shadow-soft)"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-primary">
                  {pedido.order_number}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">
                  {pedido.title}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {getClienteLabel(pedido)}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusBadge status={pedido.status} />
                <PriorityBadge priority={pedido.priority} />
              </div>
            </div>

            <div className="mt-4">
              <ProgressBadge pedido={pedido} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Entrega estimada
                </dt>
                <dd className="mt-1 text-text-primary">
                  {formatDate(pedido.estimated_delivery_date)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Personal
                </dt>
                <dd className="mt-1 text-text-primary">
                  {getTrabajadoresLabel(pedido)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-border pt-4">
              <Link
                href={`/dashboard/pedidos/${pedido.id}`}
                className={`${actionLinkClasses} w-full`}
              >
                Ver pedido
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) xl:block">
        <div className="overflow-x-auto">
          <table className="min-w-275 divide-y divide-border text-sm">
            <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Pedido
                </th>
                <th scope="col" className="px-4 py-3">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3">
                  Solicitud
                </th>
                <th scope="col" className="px-4 py-3">
                  Trabajo
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Prioridad
                </th>
                <th scope="col" className="px-4 py-3">
                  Progreso
                </th>
                <th scope="col" className="px-4 py-3">
                  Personal
                </th>
                <th scope="col" className="px-4 py-3">
                  Creación
                </th>
                <th scope="col" className="px-4 py-3">
                  Entrega estimada
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {pedidos.map((pedido) => (
                <tr
                  key={pedido.id}
                  className="align-top transition-colors duration-200 hover:bg-brand-primary-soft/50"
                >
                  <td className="whitespace-nowrap px-4 py-4">
                    <div className="font-semibold text-text-primary">
                      {pedido.order_number}
                    </div>
                    <div className="mt-1 font-mono text-xs text-text-muted">
                      {formatShortReference(pedido.id)}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    {getClienteLabel(pedido)}
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    {pedido.solicitudes ? (
                      <div>
                        <div>
                          {getSolicitudServiceTypeLabel(
                            pedido.solicitudes.service_type,
                          )}
                        </div>
                        <div className="mt-1 font-mono text-xs text-text-muted">
                          {formatShortReference(pedido.solicitudes.id)}
                        </div>
                      </div>
                    ) : pedido.solicitud_id ? (
                      <div>
                        <div>Solicitud asociada</div>
                        <div className="mt-1 font-mono text-xs text-text-muted">
                          {formatShortReference(pedido.solicitud_id)}
                        </div>
                      </div>
                    ) : (
                      "Manual"
                    )}
                  </td>
                  <td className="min-w-64 px-4 py-4 text-text-secondary">
                    <div className="font-semibold text-text-primary">
                      {pedido.title}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                      {pedido.description}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <StatusBadge status={pedido.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <PriorityBadge priority={pedido.priority} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <ProgressBadge pedido={pedido} />
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    {getTrabajadoresLabel(pedido)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(pedido.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(pedido.estimated_delivery_date)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/dashboard/pedidos/${pedido.id}`}
                      className={actionLinkClasses}
                    >
                      Ver pedido
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
