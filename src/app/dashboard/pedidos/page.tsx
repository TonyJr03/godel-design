import Link from "next/link";

import { ListFiltersBar } from "@/components/common/ListFiltersBar";
import { InternalPedidosList } from "@/components/pedidos/InternalPedidosList";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  INTERNAL_PEDIDO_ESTADOS,
  PEDIDO_STATUS_LABELS,
  listInternalPedidos,
} from "@/lib/pedidos";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardPedidosPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    status?: string | string[] | undefined;
  }>;
};

export default async function DashboardPedidosPage({
  searchParams,
}: DashboardPedidosPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const status = getSingleSearchParam(params.status);
  const result = await listInternalPedidos({ q, status });
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
        ]}
      />

      {result.ok && result.ignoredInvalidEstado ? (
        <Alert variant="warning">
          El filtro de estado no es válido y fue ignorado.
        </Alert>
      ) : null}

      {!result.ok ? (
        <Alert variant="danger">{result.message}</Alert>
      ) : (
        <InternalPedidosList
          pedidos={result.pedidos}
          hasActiveFilters={Boolean(searchValue || result.status)}
          emptyMessage={
            searchValue || result.status
              ? "No se encontraron pedidos con los filtros aplicados."
              : undefined
          }
        />
      )}
    </div>
  );
}
