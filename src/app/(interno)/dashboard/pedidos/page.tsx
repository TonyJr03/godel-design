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
import { listOperationalServiceTypes } from "@/lib/service-types";
import { getSingleSearchParam } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/workflow-types";

type DashboardPedidosPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    status?: string | string[] | undefined;
    workflow_type?: string | string[] | undefined;
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
  workflowType,
  paymentStatus,
  page,
}: {
  q: string | null;
  status: string | undefined;
  workflowType: string | undefined;
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

  if (workflowType) {
    params.set("workflow_type", workflowType);
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
  const workflowType = getSingleSearchParam(params.workflow_type);
  const paymentStatus = getSingleSearchParam(params.payment_status);
  const page = getSingleSearchParam(params.page);
  const result = await listInternalPedidos({
    q,
    status,
    workflowType,
    paymentStatus,
    page,
  });
  const serviceTypesResult = await listOperationalServiceTypes();

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
      workflowType,
      paymentStatus,
      page: result.pagination.page,
    });
    const requestedPage = normalizePageParam(page);
    const currentPageIsCanonical =
      result.pagination.page > 1 && page === String(result.pagination.page);

    if (!currentPageIsCanonical || requestedPage !== result.pagination.page) {
      redirect(canonicalHref);
    }
  }

  const profile = await getCurrentProfile();
  const canCreatePedido =
    profile !== null && hasPermission(profile.role, "pedidos.manage");
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
                serviceTypesResult.ok
                  ? serviceTypesResult.serviceTypes
                  : []
              }
              serviceTypesLoadError={
                serviceTypesResult.ok
                  ? undefined
                  : serviceTypesResult.message
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
              {
                name: "workflow_type",
                label: "Tipo",
                value: result.workflowType ?? "",
                options: [
                  { value: "", label: "Todos los tipos" },
                  {
                    value: WORKFLOW_TYPES.ENCARGO,
                    label: `${WORKFLOW_TYPE_LABELS.encargo}s`,
                  },
                  {
                    value: WORKFLOW_TYPES.IMPRESION,
                    label: "Impresiones",
                  },
                ],
              },
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

      {result.ok && result.ignoredInvalidWorkflowType ? (
        <Alert variant="warning">
          El filtro de tipo no es válido y fue ignorado.
        </Alert>
      ) : null}

      {result.ok && result.ignoredInvalidPaymentStatus ? (
        <Alert variant="warning">
          El filtro de pago no es válido y fue ignorado.
        </Alert>
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
                result.workflowType ||
                result.paymentStatus,
            )}
            emptyMessage={
              searchValue ||
                result.status ||
                result.workflowType ||
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
                workflow_type: workflowType,
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
