import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  getSolicitudServiceTypeLabel,
  type InternalSolicitud,
} from "@/lib/solicitudes";

type InternalSolicitudesListProps = {
  solicitudes: InternalSolicitud[];
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

export function InternalSolicitudesList({
  solicitudes,
  emptyMessage = "Cuando entren solicitudes públicas, aparecerán aquí ordenadas por fecha de creación.",
  hasActiveFilters = false,
}: InternalSolicitudesListProps) {
  if (solicitudes.length === 0) {
    return (
      <EmptyState
        variant={hasActiveFilters ? "search" : "default"}
        title={
          hasActiveFilters
            ? "Sin resultados para estos filtros"
            : "No hay solicitudes para mostrar"
        }
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="grid gap-4 lg:hidden" aria-label="Solicitudes">
        {solicitudes.map((solicitud) => (
          <Card
            as="article"
            key={solicitud.id}
            padding="sm"
            className="shadow-(--shadow-soft)"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold text-text-muted">
                  {formatShortReference(solicitud.id)}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-text-primary">
                  {solicitud.client_name}
                </h2>
              </div>
              <StatusBadge status={solicitud.status} />
            </div>

            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Servicio
                </dt>
                <dd className="mt-1 text-text-primary">
                  {getSolicitudServiceTypeLabel(solicitud.service_type)}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Creación
                  </dt>
                  <dd className="mt-1 text-text-primary">
                    {formatDate(solicitud.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Deseada
                  </dt>
                  <dd className="mt-1 text-text-primary">
                    {formatDate(solicitud.desired_date)}
                  </dd>
                </div>
              </div>
            </dl>

            <div className="mt-4 border-t border-border pt-4">
              <Link
                href={`/dashboard/solicitudes/${solicitud.id}`}
                className={`${actionLinkClasses} w-full`}
              >
                Ver solicitud
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) lg:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Ref.
                </th>
                <th scope="col" className="px-4 py-3">
                  Cliente
                </th>
                <th scope="col" className="px-4 py-3">
                  Contacto
                </th>
                <th scope="col" className="px-4 py-3">
                  Servicio
                </th>
                <th scope="col" className="px-4 py-3">
                  Estado
                </th>
                <th scope="col" className="px-4 py-3">
                  Creación
                </th>
                <th scope="col" className="px-4 py-3">
                  Deseada
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {solicitudes.map((solicitud) => (
                <tr
                  key={solicitud.id}
                  className="align-top transition-colors duration-200 hover:bg-brand-primary-soft/50"
                >
                  <td className="whitespace-nowrap px-4 py-4 font-mono text-xs font-semibold text-text-secondary">
                    {formatShortReference(solicitud.id)}
                  </td>
                  <td className="px-4 py-4 font-semibold text-text-primary">
                    {solicitud.client_name}
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    <div>{solicitud.client_phone}</div>
                    {solicitud.client_email ? (
                      <div className="mt-1 text-xs text-text-muted">
                        {solicitud.client_email}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    {getSolicitudServiceTypeLabel(solicitud.service_type)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <StatusBadge status={solicitud.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(solicitud.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(solicitud.desired_date)}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <Link
                      href={`/dashboard/solicitudes/${solicitud.id}`}
                      className={actionLinkClasses}
                    >
                      Ver solicitud
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
