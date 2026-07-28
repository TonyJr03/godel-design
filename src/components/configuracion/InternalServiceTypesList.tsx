import { WorkflowTypeBadge } from "@/components/ui/WorkflowTypeBadge";
import { EmptyState, StatusBadge } from "@/components/ui";
import type { InternalServiceType } from "@/lib/service-types";

import { ServiceTypeEditDialogButton } from "./ServiceTypeEditDialogButton";

type InternalServiceTypesListProps = {
  serviceTypes: InternalServiceType[];
  publicEncargoCount: number;
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
  return value?.trim() || "Sin descripción definida.";
}

function getAvailabilityStatus(serviceType: InternalServiceType) {
  return serviceType.isPubliclyAvailable
    ? { status: "completado", label: "Disponible" }
    : { status: "oculto", label: "Oculto" };
}

export function InternalServiceTypesList({
  serviceTypes,
  publicEncargoCount,
  hasActiveFilters = false,
  emptyMessage,
}: InternalServiceTypesListProps) {
  if (serviceTypes.length === 0) {
    return (
      <EmptyState
        variant={hasActiveFilters ? "search" : "default"}
        title={
          hasActiveFilters
            ? "No encontramos servicios con estos filtros."
            : "No hay servicios configurados."
        }
        description={
          emptyMessage ??
          (hasActiveFilters
            ? "Prueba cambiar la búsqueda o limpiar los filtros."
            : "Los servicios del catálogo aparecerán aquí.")
        }
      />
    );
  }

  return (
    <>
      <div className="grid gap-3 xl:hidden" aria-label="Servicios">
        {serviceTypes.map((serviceType) => {
          const availability = getAvailabilityStatus(serviceType);

          return (
            <article
              key={serviceType.id}
              className="rounded-(--radius-card) border border-border bg-surface p-4 shadow-(--shadow-soft)"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-text-primary">
                    {serviceType.name}
                  </h2>
                  {serviceType.workflowType === "impresion" ? (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      Servicio del sistema
                    </p>
                  ) : null}
                </div>
                <ServiceTypeEditDialogButton
                  serviceType={serviceType}
                  isLastPublicEncargo={
                    serviceType.workflowType === "encargo" &&
                    serviceType.isPubliclyAvailable &&
                    publicEncargoCount === 1
                  }
                />
              </div>

              <p className="mt-3 line-clamp-3 text-sm leading-6 text-text-secondary">
                {formatDescription(serviceType.description)}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Flujo
                  </dt>
                  <dd className="mt-1">
                    <WorkflowTypeBadge workflowType={serviceType.workflowType} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Disponibilidad
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge
                      status={availability.status}
                      label={availability.label}
                    />
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                    Actualización
                  </dt>
                  <dd className="mt-1 text-text-primary">
                    {formatDate(serviceType.updatedAt)}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft) xl:block">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed divide-y divide-border text-sm">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[34%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[12%]" />
              <col className="w-[5%]" />
            </colgroup>
            <thead className="bg-surface-muted text-left text-xs font-semibold uppercase tracking-wide text-text-secondary">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Servicio
                </th>
                <th scope="col" className="px-4 py-3">
                  Descripción
                </th>
                <th scope="col" className="px-4 py-3">
                  Flujo
                </th>
                <th scope="col" className="px-4 py-3">
                  Disponibilidad pública
                </th>
                <th scope="col" className="px-4 py-3">
                  Actualización
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Acción
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {serviceTypes.map((serviceType) => {
                const availability = getAvailabilityStatus(serviceType);

                return (
                  <tr key={serviceType.id} className="align-top">
                    <td className="px-4 py-4">
                      <div className="truncate font-semibold text-text-primary">
                        {serviceType.name}
                      </div>
                      {serviceType.workflowType === "impresion" ? (
                        <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                          Servicio del sistema
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-text-secondary">
                      <div className="line-clamp-2 leading-6">
                        {formatDescription(serviceType.description)}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <WorkflowTypeBadge workflowType={serviceType.workflowType} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <StatusBadge
                        status={availability.status}
                        label={availability.label}
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-text-secondary">
                      {formatDate(serviceType.updatedAt)}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <ServiceTypeEditDialogButton
                        serviceType={serviceType}
                        isLastPublicEncargo={
                          serviceType.workflowType === "encargo" &&
                          serviceType.isPubliclyAvailable &&
                          publicEncargoCount === 1
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
