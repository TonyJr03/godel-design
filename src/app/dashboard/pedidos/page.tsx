import Link from "next/link";

import { ListFiltersBar } from "@/components/common/ListFiltersBar";
import { InternalPedidosList } from "@/components/pedidos/InternalPedidosList";
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
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
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
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          El filtro de estado no es válido y fue ignorado.
        </section>
      ) : null}

      {!result.ok ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      ) : (
        <InternalPedidosList
          pedidos={result.pedidos}
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
