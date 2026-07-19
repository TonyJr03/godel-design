import { redirect } from "next/navigation";

import {
  ListingPageHeader,
  ListingToolbar,
} from "@/components/listing";
import { InternalPedidosList } from "@/components/pedidos/InternalPedidosList";
import { PedidoCreateDialogButton } from "@/components/pedidos/PedidoCreateDialogButton";
import type { PedidoFormCliente } from "@/components/pedidos/PedidoForm";
import { Alert } from "@/components/ui/Alert";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  listInternalClientes,
  type ListInternalClientesResult,
} from "@/lib/clientes";
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

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  const profile = await getCurrentProfile();
  const canCreatePedido =
    profile !== null && hasPermission(profile.role, "pedidos.manage");
  const clientesResult: ListInternalClientesResult | null = canCreatePedido
    ? await listInternalClientes({ limit: 100 })
    : null;

  if (clientesResult && !clientesResult.ok) {
    if (clientesResult.reason === "unauthorized") {
      redirect("/login");
    }
  }

  const canShowCreatePedidoAction =
    canCreatePedido &&
    (clientesResult === null ||
      clientesResult.ok ||
      clientesResult.reason === "error");
  const clientes: PedidoFormCliente[] = clientesResult?.ok
    ? clientesResult.clientes.map((cliente) => ({
        id: cliente.id,
        name: cliente.name,
      }))
    : [];
  const clientesLoadRetryable =
    clientesResult !== null &&
    !clientesResult.ok &&
    clientesResult.reason === "error";
  const searchValue = result.q ?? "";

  return (
    <div className="space-y-8">
      <ListingPageHeader
        title="Pedidos"
        description="Listado interno de pedidos oficiales para seguimiento operativo."
        action={
          canShowCreatePedidoAction ? (
            <PedidoCreateDialogButton
              clientes={clientes}
              prioridades={PEDIDO_PRIORIDADES}
              clientesLoadError={
                clientesResult && !clientesResult.ok
                  ? clientesResult.message
                  : undefined
              }
              clientesLoadRetryable={clientesLoadRetryable}
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
