import Link from "next/link";

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
    status?: string | string[] | undefined;
  }>;
};

export default async function DashboardPedidosPage({
  searchParams,
}: DashboardPedidosPageProps) {
  const params = await searchParams;
  const status = getSingleSearchParam(params.status);
  const result = await listInternalPedidos({ status });

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

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-950">
          Filtrar por estado
        </h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/pedidos"
            className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition ${
              result.ok && !result.status
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
            }`}
          >
            Todos
          </Link>
          {INTERNAL_PEDIDO_ESTADOS.map((estadoOption) => (
            <Link
              key={estadoOption}
              href={`/dashboard/pedidos?status=${estadoOption}`}
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition ${
                result.ok && result.status === estadoOption
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400"
              }`}
            >
              {PEDIDO_STATUS_LABELS[estadoOption]}
            </Link>
          ))}
        </div>
      </section>

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
        <InternalPedidosList pedidos={result.pedidos} />
      )}
    </div>
  );
}
