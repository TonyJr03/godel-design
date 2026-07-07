import Link from "next/link";
import { ListFiltersBar } from "@/components/common/ListFiltersBar";
import { InternalClientesList } from "@/components/clientes/InternalClientesList";
import { Alert } from "@/components/ui/Alert";
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
          className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover"
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
        <Alert variant="danger">{result.message}</Alert>
      ) : (
        <InternalClientesList
          clientes={result.clientes}
          hasActiveFilters={Boolean(searchValue)}
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
