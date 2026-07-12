import {
  ClickableTableRow,
  ListingCardLink,
} from "@/components/listing";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
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

function formatDate(value: string | null): string {
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

function getContactPreview(solicitud: InternalSolicitud): string {
  return solicitud.client_email
    ? `${solicitud.client_phone} · ${solicitud.client_email}`
    : solicitud.client_phone;
}

export function InternalSolicitudesList({
  solicitudes,
  emptyMessage = "Cuando entren solicitudes públicas, aparecerán aquí para revisión.",
  hasActiveFilters = false,
}: InternalSolicitudesListProps) {
  if (solicitudes.length === 0) {
    return (
      <EmptyState
        variant={hasActiveFilters ? "search" : "default"}
        title={
          hasActiveFilters
            ? "No encontramos solicitudes con estos filtros."
            : "No hay solicitudes registradas todavía."
        }
        description={emptyMessage}
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 xl:hidden" aria-label="Solicitudes">
        {solicitudes.map((solicitud) => (
          <ListingCardLink
            href={`/dashboard/solicitudes/${solicitud.id}`}
            key={solicitud.id}
            aria-label={`Abrir solicitud de ${solicitud.client_name}`}
            className="space-y-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="line-clamp-2 text-base font-semibold text-text-primary">
                  {solicitud.client_name}
                </h2>
                <p className="mt-1 truncate text-sm text-text-secondary">
                  {getContactPreview(solicitud)}
                </p>
              </div>
              <StatusBadge status={solicitud.status} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-text-primary">
                {getSolicitudServiceTypeLabel(solicitud.service_type)}
              </span>
              <WorkflowTypeBadge workflowType={solicitud.workflow_type} />
            </div>

            <p className="text-sm text-text-secondary">
              Recibida: {formatDate(solicitud.created_at)}
            </p>
          </ListingCardLink>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) xl:block">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-border text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[32%]" />
              <col className="w-[20%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
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
                  Recibida
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {solicitudes.map((solicitud) => (
                <ClickableTableRow
                  key={solicitud.id}
                  href={`/dashboard/solicitudes/${solicitud.id}`}
                  label={`Abrir solicitud de ${solicitud.client_name}`}
                  className="align-top"
                >
                  <td className="px-4 py-4 font-semibold text-text-primary">
                    <div className="truncate">{solicitud.client_name}</div>
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    <div className="truncate">{solicitud.client_phone}</div>
                    {solicitud.client_email ? (
                      <div className="mt-1 truncate text-xs text-text-muted">
                        {solicitud.client_email}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 text-text-secondary">
                    <div className="truncate font-medium text-text-primary">
                      {getSolicitudServiceTypeLabel(solicitud.service_type)}
                    </div>
                    <div className="mt-2">
                      <WorkflowTypeBadge
                        workflowType={solicitud.workflow_type}
                      />
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    <StatusBadge status={solicitud.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                    {formatDate(solicitud.created_at)}
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
