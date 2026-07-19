import { redirect } from "next/navigation";

import { ClienteCreateDialogButton } from "@/components/clientes/ClienteCreateDialogButton";
import { InternalClientesList } from "@/components/clientes/InternalClientesList";
import {
  ListingPageHeader,
  ListingToolbar,
} from "@/components/listing";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
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

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  const searchValue = result.q ?? "";

  return (
    <div className="space-y-8">
      <ListingPageHeader
        title="Clientes"
        description="Listado interno de clientes registrados para consulta operativa."
        action={<ClienteCreateDialogButton />}
        toolbar={
          <ListingToolbar
            searchLabel="Buscar clientes"
            searchPlaceholder="Nombre, teléfono o correo"
            initialQuery={searchValue}
          />
        }
      />

      {!result.ok ? (
        <ReadErrorAlert
          variant="danger"
          title="No se pudieron cargar los clientes"
          retryable={result.reason === "error"}
        >
          <p>{result.message}</p>
        </ReadErrorAlert>
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
