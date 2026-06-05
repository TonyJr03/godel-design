import Link from "next/link";
import { ListFiltersBar } from "@/components/common/ListFiltersBar";
import { InternalClientesList } from "@/components/clientes/InternalClientesList";
import { PageHeader } from "@/components/ui/PageHeader";
import { listInternalClientes } from "@/lib/clientes";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardClientesPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
  }>;
};

export default async function DashboardClientesPage({
  searchParams,
}: DashboardClientesPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const result = await listInternalClientes({ q });
  const searchValue = result.q ?? "";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Clientes"
          description="Listado interno de clientes registrados para consulta operativa."
        />
        <Link
          href="/dashboard/clientes/nuevo"
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Nuevo cliente
        </Link>
      </div>

      <ListFiltersBar
        searchLabel="Buscar clientes"
        searchPlaceholder="Nombre, teléfono o correo"
        initialQuery={searchValue}
      />

      {!result.ok ? (
        <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
          {result.message}
        </section>
      ) : (
        <InternalClientesList
          clientes={result.clientes}
          emptyMessage={
            searchValue
              ? "No se encontraron clientes con los filtros aplicados."
              : undefined
          }
        />
      )}
    </div>
  );
}
