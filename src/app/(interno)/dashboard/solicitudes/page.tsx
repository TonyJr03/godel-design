import { redirect } from "next/navigation";

import {
  ListingPageHeader,
  ListingPagination,
  ListingToolbar,
} from "@/components/listing";
import { InternalSolicitudesList } from "@/components/solicitudes/InternalSolicitudesList";
import { Alert } from "@/components/ui/Alert";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
import { normalizePageParam } from "@/lib/pagination";
import {
  INTERNAL_SOLICITUD_ESTADOS,
  SOLICITUD_STATUS_LABELS,
  listInternalSolicitudes,
} from "@/lib/solicitudes";
import {
  getInternalServiceOptionLabel,
  listInternalServiceTypeOptions,
} from "@/lib/service-types";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardSolicitudesPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    status?: string | string[] | undefined;
    service_id?: string | string[] | undefined;
    page?: string | string[] | undefined;
  }>;
};

const SOLICITUDES_PATHNAME = "/dashboard/solicitudes";

function buildSolicitudesCanonicalHref({
  q,
  status,
  serviceId,
  page,
}: {
  q: string | null;
  status: string | undefined;
  serviceId: string | undefined;
  page: number;
}): string {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (status) {
    params.set("status", status);
  }

  if (serviceId) {
    params.set("service_id", serviceId);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString
    ? `${SOLICITUDES_PATHNAME}?${queryString}`
    : SOLICITUDES_PATHNAME;
}

export default async function DashboardSolicitudesPage({
  searchParams,
}: DashboardSolicitudesPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const status = getSingleSearchParam(params.status);
  const serviceId = getSingleSearchParam(params.service_id);
  const page = getSingleSearchParam(params.page);
  const result = await listInternalSolicitudes({
    q,
    status,
    serviceId,
    page,
  });

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  const searchValue = result.q ?? "";

  if (result.ok && page !== undefined) {
    const canonicalHref = buildSolicitudesCanonicalHref({
      q: result.q,
      status,
      serviceId: result.serviceId ?? undefined,
      page: result.pagination.page,
    });
    const requestedPage = normalizePageParam(page);
    const currentPageIsCanonical =
      result.pagination.page > 1 && page === String(result.pagination.page);

    if (
      !currentPageIsCanonical ||
      requestedPage !== result.pagination.page
    ) {
      redirect(canonicalHref);
    }
  }

  const serviceTypesResult = await listInternalServiceTypeOptions();

  return (
    <div className="space-y-8">
      <ListingPageHeader
        title="Solicitudes"
        description="Listado interno de solicitudes recibidas por el formulario público."
        toolbar={
          <ListingToolbar
            searchLabel="Buscar solicitudes"
            searchPlaceholder="Buscar solicitud"
            initialQuery={searchValue}
            filters={[
              {
                name: "status",
                label: "Estado",
                value: result.status ?? "",
                options: [
                  { value: "", label: "Todos los estados" },
                  ...INTERNAL_SOLICITUD_ESTADOS.map((estadoOption) => ({
                    value: estadoOption,
                    label: SOLICITUD_STATUS_LABELS[estadoOption],
                  })),
                ],
              },
              ...(serviceTypesResult.ok
                ? [
                    {
                      name: "service_id",
                      label: "Servicio",
                      value: result.serviceId ?? "",
                      options: [
                        { value: "", label: "Todos los servicios" },
                        ...serviceTypesResult.serviceTypes.map((service) => ({
                          value: service.id,
                          label: getInternalServiceOptionLabel(service),
                        })),
                      ],
                    },
                  ]
                : []),
            ]}
          />
        }
      />

      {result.ok && result.ignoredInvalidEstado ? (
        <Alert variant="warning">
          El filtro de estado no es válido y fue ignorado.
        </Alert>
      ) : null}

      {result.ok && result.ignoredInvalidServiceId ? (
        <Alert variant="warning">
          El filtro de servicio no es válido y fue ignorado.
        </Alert>
      ) : null}

      {result.ok && !serviceTypesResult.ok ? (
        <ReadErrorAlert
          variant="warning"
          title="No se pudieron cargar los servicios del filtro"
          retryable={serviceTypesResult.reason === "error"}
        >
          <p>
            El listado sigue disponible. El filtro Servicio se omitió
            temporalmente.
          </p>
        </ReadErrorAlert>
      ) : null}

      {!result.ok ? (
        <ReadErrorAlert
          variant="danger"
          title="No se pudieron cargar las solicitudes"
          retryable={result.reason === "error"}
        >
          <p>{result.message}</p>
        </ReadErrorAlert>
      ) : (
        <>
          <InternalSolicitudesList
            solicitudes={result.solicitudes}
            hasActiveFilters={Boolean(
              searchValue || result.status || result.serviceId,
            )}
            emptyMessage={
              searchValue || result.status || result.serviceId
                ? "Prueba limpiar los filtros o cambiar la búsqueda."
                : undefined
            }
          />

          {result.solicitudes.length > 0 ? (
            <ListingPagination
              pagination={result.pagination}
              pathname={SOLICITUDES_PATHNAME}
              query={{
                q: result.q,
                status,
                service_id: result.serviceId,
              }}
              itemLabel="solicitudes"
              ariaLabel="Paginación de solicitudes"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
