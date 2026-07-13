import Link from "next/link";

import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  DashboardPendingSolicitudItem,
  GetDashboardWorkItemsResult,
} from "@/lib/dashboard";

type DashboardPendingRequestsPanelProps = {
  result: GetDashboardWorkItemsResult;
};

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function DashboardPendingRequestCard({
  solicitud,
}: {
  solicitud: DashboardPendingSolicitudItem;
}) {
  return (
    <Link
      href={solicitud.href}
      aria-label={`Abrir solicitud de ${solicitud.clienteNombre}`}
      className="group block min-w-0 rounded-(--radius-card) border border-border bg-surface p-4 shadow-(--shadow-soft) transition-[background-color,border-color,box-shadow] duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-base font-semibold text-text-primary transition-colors duration-200 group-hover:text-brand-primary">
              {solicitud.clienteNombre}
            </h3>
            <p className="mt-1 line-clamp-1 text-sm text-text-secondary">
              {solicitud.tipoServicio}
            </p>
          </div>
          <StatusBadge status={solicitud.status} className="shrink-0" />
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Teléfono
            </dt>
            <dd className="mt-1 truncate text-text-primary">
              {solicitud.clienteTelefono}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Recibida
            </dt>
            <dd className="mt-1 text-text-primary">
              {formatDate(solicitud.createdAt)}
            </dd>
          </div>
        </dl>
      </article>
    </Link>
  );
}

export function DashboardPendingRequestsPanel({
  result,
}: DashboardPendingRequestsPanelProps) {
  if (!result.ok) {
    return (
      <Alert variant="warning" title="No se pudieron cargar las solicitudes">
        <p>
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </Alert>
    );
  }

  if (result.workItems.kind === "worker") {
    return (
      <p className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3 text-sm text-text-secondary">
        Este panel no aplica para el rol trabajador.
      </p>
    );
  }

  const solicitudes = result.workItems.solicitudesPendientes;

  if (solicitudes.length === 0) {
    return (
      <EmptyState
        title="Sin solicitudes pendientes"
        description="No hay solicitudes abiertas que requieran gestión inmediata."
        variant="search"
        className="p-4 shadow-none"
      />
    );
  }

  return (
    <div className="grid min-w-0 gap-3">
      {solicitudes.map((solicitud) => (
        <DashboardPendingRequestCard
          key={solicitud.id}
          solicitud={solicitud}
        />
      ))}
    </div>
  );
}
