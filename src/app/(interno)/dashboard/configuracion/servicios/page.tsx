import { redirect } from "next/navigation";

import { BackToConfigurationLink } from "@/components/configuracion/BackToConfigurationLink";
import { InternalServiceTypesList } from "@/components/configuracion/InternalServiceTypesList";
import { ServiceTypeCreateDialogButton } from "@/components/configuracion/ServiceTypeCreateDialogButton";
import {
  ListingPageHeader,
  ListingPagination,
  ListingToolbar,
} from "@/components/listing";
import { Alert, ReadErrorAlert } from "@/components/ui";
import { normalizePageParam } from "@/lib/pagination";
import { listInternalServiceTypes } from "@/lib/service-types";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardConfiguracionServiciosPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    availability?: string | string[] | undefined;
    page?: string | string[] | undefined;
  }>;
};

const SERVICES_PATHNAME = "/dashboard/configuracion/servicios";

const availabilityFilterOptions = [
  { value: "", label: "Todos los servicios" },
  { value: "public", label: "Disponibles públicamente" },
  { value: "hidden", label: "Ocultos del formulario público" },
] as const;

function buildServicesCanonicalHref({
  q,
  availability,
  page,
}: {
  q: string | null;
  availability: string | null | undefined;
  page: number;
}): string {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (availability) {
    params.set("availability", availability);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString
    ? `${SERVICES_PATHNAME}?${queryString}`
    : SERVICES_PATHNAME;
}

export default async function DashboardConfiguracionServiciosPage({
  searchParams,
}: DashboardConfiguracionServiciosPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const availability = getSingleSearchParam(params.availability);
  const page = getSingleSearchParam(params.page);
  const result = await listInternalServiceTypes({ q, availability, page });

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  const searchValue = result.q ?? "";
  const availabilityValue = result.availability ?? "";

  if (result.ok && page !== undefined) {
    const canonicalHref = buildServicesCanonicalHref({
      q: result.q,
      availability,
      page: result.pagination.page,
    });
    const requestedPage = normalizePageParam(page);
    const currentPageIsCanonical =
      result.pagination.page > 1 && page === String(result.pagination.page);

    if (!currentPageIsCanonical || requestedPage !== result.pagination.page) {
      redirect(canonicalHref);
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <BackToConfigurationLink presentation="text" />
        <ListingPageHeader
          title="Servicios"
          description="Gestiona el catálogo de servicios y su disponibilidad pública."
          action={
            <div className="flex items-center gap-2">
              <ServiceTypeCreateDialogButton />
              <BackToConfigurationLink presentation="button" />
            </div>
          }
          toolbar={
            <ListingToolbar
              searchLabel="Buscar servicios"
              searchPlaceholder="Nombre o descripción"
              initialQuery={searchValue}
              filters={[
                {
                  name: "availability",
                  label: "Disponibilidad pública",
                  value: availabilityValue,
                  options: availabilityFilterOptions,
                },
              ]}
            />
          }
        />
      </div>

      {result.ignoredInvalidAvailability ? (
        <Alert variant="warning" title="Filtro ignorado">
          <p>
            La disponibilidad indicada no es válida. Se muestran todos los
            servicios que coinciden con la búsqueda.
          </p>
        </Alert>
      ) : null}

      {!result.ok ? (
        <ReadErrorAlert
          variant="danger"
          title="No se pudieron cargar los servicios"
          retryable={result.reason === "error"}
        >
          <p>{result.message}</p>
        </ReadErrorAlert>
      ) : (
        <>
          <InternalServiceTypesList
            serviceTypes={result.serviceTypes}
            publicEncargoCount={result.publicEncargoCount}
            hasActiveFilters={Boolean(
              searchValue ||
                result.availability ||
                result.ignoredInvalidAvailability,
            )}
            emptyMessage={
              searchValue || result.availability
                ? "Prueba cambiar la búsqueda o limpiar los filtros."
                : undefined
            }
          />

          {result.serviceTypes.length > 0 ? (
            <ListingPagination
              pagination={result.pagination}
              pathname={SERVICES_PATHNAME}
              query={{ q: result.q, availability }}
              itemLabel="servicios"
              ariaLabel="Paginación de servicios"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
