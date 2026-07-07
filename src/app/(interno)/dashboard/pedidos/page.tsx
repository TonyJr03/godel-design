import Link from "next/link";

import { ListFiltersBar } from "@/components/common/ListFiltersBar";
import { InternalPedidosList } from "@/components/pedidos/InternalPedidosList";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  INTERNAL_PEDIDO_ESTADOS,
  INTERNAL_PEDIDO_PAYMENT_STATUSES,
  PEDIDO_PAYMENT_STATUS_LABELS,
  PEDIDO_STATUS_LABELS,
  listInternalPedidos,
} from "@/lib/pedidos";
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
  }>;
};

export default async function DashboardPedidosPage({
  searchParams,
}: DashboardPedidosPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const status = getSingleSearchParam(params.status);
  const workflowType = getSingleSearchParam(params.workflow_type);
  const paymentStatus = getSingleSearchParam(params.payment_status);
  const result = await listInternalPedidos({
    q,
    status,
    workflowType,
    paymentStatus,
  });
  const searchValue = result.q ?? "";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Pedidos"
          description="Listado interno de pedidos oficiales para seguimiento operativo."
        />
        <Link
          href="/dashboard/pedidos/nuevo"
          className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover"
        >
          Nuevo pedido
        </Link>
      </div>

      <ListFiltersBar
        searchLabel="Buscar pedidos"
        searchPlaceholder="Número, cliente, solicitud o trabajo"
        initialQuery={searchValue}
        filters={[
          {
            name: "status",
            label: "Estado",
            value: result.status ?? "",
            options: [
              { value: "", label: "Todos los estados" },
              ...INTERNAL_PEDIDO_ESTADOS.map((estadoOption) => ({
                value: estadoOption,
                label: PEDIDO_STATUS_LABELS[estadoOption],
              })),
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
        <Alert variant="danger">{result.message}</Alert>
      ) : (
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
              ? "No se encontraron pedidos con los filtros aplicados."
              : undefined
          }
        />
      )}
    </div>
  );
}
