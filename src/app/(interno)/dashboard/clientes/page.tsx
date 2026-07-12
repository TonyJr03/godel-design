import Link from "next/link";
import { Plus } from "lucide-react";

import { InternalClientesList } from "@/components/clientes/InternalClientesList";
import {
  ListingPageHeader,
  ListingToolbar,
} from "@/components/listing";
import { Alert } from "@/components/ui/Alert";
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
      <ListingPageHeader
        title="Clientes"
        description="Listado interno de clientes registrados para consulta operativa."
        action={
          <Link
            href="/dashboard/clientes/nuevo"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Nuevo cliente"
            title="Nuevo cliente"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
        }
        toolbar={
          <ListingToolbar
            searchLabel="Buscar clientes"
            searchPlaceholder="Nombre, teléfono o correo"
            initialQuery={searchValue}
          />
        }
      />

      {!result.ok ? (
        <Alert variant="danger">{result.message}</Alert>
      ) : (
        <InternalClientesList
          clientes={result.clientes}
          hasActiveFilters={Boolean(searchValue)}
          emptyMessage={
            searchValue
              ? "Prueba cambiar el término de búsqueda."
              : undefined
          }
        />
      )}
    </div>
  );
}
