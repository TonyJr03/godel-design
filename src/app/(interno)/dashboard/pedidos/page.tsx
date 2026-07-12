import Link from "next/link";
import { Plus } from "lucide-react";

import {
  ListingPageHeader,
  ListingToolbar,
} from "@/components/listing";
import { InternalPedidosList } from "@/components/pedidos/InternalPedidosList";
import { Alert } from "@/components/ui/Alert";
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
      <ListingPageHeader
        title="Pedidos"
        description="Listado interno de pedidos oficiales para seguimiento operativo."
        action={
          <Link
            href="/dashboard/pedidos/nuevo"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Nuevo pedido"
            title="Nuevo pedido"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
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
              ? "Prueba limpiar los filtros o cambiar la búsqueda."
              : undefined
          }
        />
      )}
    </div>
  );
}
