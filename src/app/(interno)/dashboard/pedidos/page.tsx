import { redirect } from "next/navigation";

import {
  ListingPageHeader,
  ListingPagination,
  ListingToolbar,
} from "@/components/listing";
import { InternalPedidosList } from "@/components/pedidos/InternalPedidosList";
import { PedidoCreateDialogButton } from "@/components/pedidos/PedidoCreateDialogButton";
import { Alert } from "@/components/ui/Alert";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
import { getCurrentProfile } from "@/lib/auth/current-user";
import { normalizePageParam } from "@/lib/pagination";
import { hasPermission } from "@/lib/permissions";
import {
  INTERNAL_PEDIDO_ESTADOS,
  INTERNAL_PEDIDO_NEW_STATUS_FILTER,
  INTERNAL_PEDIDO_PAYMENT_STATUSES,
  PEDIDO_PRIORIDADES,
  PEDIDO_PAYMENT_STATUS_LABELS,
  PEDIDO_STATUS_LABELS,
  listInternalPedidos,
} from "@/lib/pedidos";
import {
  getInternalServiceOptionLabel,
  listInternalServiceTypeOptions,
  listOperationalServiceTypes,
} from "@/lib/service-types";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardPedidosPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    status?: string | string[] | undefined;
    service_id?: string | string[] | undefined;
    payment_status?: string | string[] | undefined;
    page?: string | string[] | undefined;
  }>;
};

const PEDIDOS_PATHNAME = "/dashboard/pedidos";

const PEDIDO_STATUS_FILTER_OPTIONS = [
  { value: INTERNAL_PEDIDO_NEW_STATUS_FILTER, label: "Nuevo" },
  ...INTERNAL_PEDIDO_ESTADOS.filter(
    (status) =>
      status !== "creado" && status !== "solicitud_recibida",
  ).map((status) => ({
    value: status,
    label: PEDIDO_STATUS_LABELS[status],
  })),
];

function buildPedidosCanonicalHref({
  q,
  status,
  serviceId,
  paymentStatus,
  page,
}: {
  q: string | null;
  status: string | undefined;
  serviceId: string | undefined;
  paymentStatus: string | undefined;
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

  if (paymentStatus) {
    params.set("payment_status", paymentStatus);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `${PEDIDOS_PATHNAME}?${queryString}` : PEDIDOS_PATHNAME;
}

export default async function DashboardPedidosPage({
  searchParams,
}: DashboardPedidosPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const status = getSingleSearchParam(params.status);
  const serviceId = getSingleSearchParam(params.service_id);
  const paymentStatus = getSingleSearchParam(params.payment_status);
  const page = getSingleSearchParam(params.page);
  const [result, profile] = await Promise.all([
    listInternalPedidos({
      q,
      status,
      serviceId,
      paymentStatus,
      page,
    }),
    getCurrentProfile(),
  ]);

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  if (result.ok && page !== undefined) {
    const canonicalHref = buildPedidosCanonicalHref({
      q: result.q,
      status,
      serviceId: result.serviceId ?? undefined,
      paymentStatus,
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

  const canCreatePedido =
    profile !== null && hasPermission(profile.role, "pedidos.manage");
  const [filterServiceTypesResult, operationalServiceTypesResult] =
    await Promise.all([
      listInternalServiceTypeOptions(),
      canCreatePedido ? listOperationalServiceTypes() : Promise.resolve(null),
    ]);
  const searchValue = result.q ?? "";

  return (
    <div className="space-y-8">
      <ListingPageHeader
        title="Pedidos"
        description="Listado interno de pedidos oficiales para seguimiento operativo."
        action={
          canCreatePedido ? (
            <PedidoCreateDialogButton
              prioridades={PEDIDO_PRIORIDADES}
              serviceTypes={
                operationalServiceTypesResult?.ok
                  ? operationalServiceTypesResult.serviceTypes
                  : []
              }
              serviceTypesLoadError={
                operationalServiceTypesResult?.ok
                  ? undefined
                  : operationalServiceTypesResult?.message
              }
            />
          ) : undefined
        }
        toolbar={
          <ListingToolbar
            searchLabel="Buscar pedidos"
            searchPlaceholder="Buscar pedido"
            initialQuery={searchValue}
            filters={[
              {
                name: "status",
                label: "Estado",
                value: result.status ?? "",
                options: [
                  { value: "", label: "Todos los estados" },
                  ...PEDIDO_STATUS_FILTER_OPTIONS,
                ],
              },
              ...(filterServiceTypesResult.ok
                ? [
                    {
                      name: "service_id",
                      label: "Servicio",
                      value: result.serviceId ?? "",
                      options: [
                        { value: "", label: "Todos los servicios" },
                        ...filterServiceTypesResult.serviceTypes.map(
                          (service) => ({
                            value: service.id,
                            label: getInternalServiceOptionLabel(service),
                          }),
                        ),
                      ],
                    },
                  ]
                : []),
              {
                name: "payment_status",
                label: "Pago",
                value: result.paymentStatus ?? "",
                options: [
                  { value: "", label: "Todos los pagos" },
                  ...INTERNAL_PEDIDO_PAYMENT_STATUSES.map((paymentOption) => ({
                    value: paymentOption,
                    label: PEDIDO_PAYMENT_STATUS_LABELS[paymentOption],
                  })),
                ],
              },
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

      {result.ok && result.ignoredInvalidPaymentStatus ? (
        <Alert variant="warning">
          El filtro de pago no es válido y fue ignorado.
        </Alert>
      ) : null}

      {result.ok && !filterServiceTypesResult.ok ? (
        <ReadErrorAlert
          variant="warning"
          title="No se pudieron cargar los servicios del filtro"
          retryable={filterServiceTypesResult.reason === "error"}
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
          title="No se pudieron cargar los pedidos"
          retryable={result.reason === "error"}
        >
          <p>{result.message}</p>
        </ReadErrorAlert>
      ) : (
        <>
          <InternalPedidosList
            pedidos={result.pedidos}
            hasActiveFilters={Boolean(
                searchValue ||
                result.status ||
                result.serviceId ||
                result.paymentStatus,
            )}
            emptyMessage={
              searchValue ||
                result.status ||
                result.serviceId ||
                result.paymentStatus
                ? "Prueba limpiar los filtros o cambiar la búsqueda."
                : undefined
            }
          />

          {result.pedidos.length > 0 ? (
            <ListingPagination
              pagination={result.pagination}
              pathname={PEDIDOS_PATHNAME}
              query={{
                q: result.q,
                status,
                service_id: result.serviceId,
                payment_status: paymentStatus,
              }}
              itemLabel="pedidos"
              ariaLabel="Paginación de pedidos"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
