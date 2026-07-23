import { redirect } from "next/navigation";

import { ClienteCreateDialogButton } from "@/components/clientes/ClienteCreateDialogButton";
import { InternalClientesList } from "@/components/clientes/InternalClientesList";
import {
  ListingPageHeader,
  ListingPagination,
  ListingToolbar,
} from "@/components/listing";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
import { listInternalClientes } from "@/lib/clientes";
import { normalizePageParam } from "@/lib/pagination";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardClientesPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    page?: string | string[] | undefined;
  }>;
};

const CLIENTES_PATHNAME = "/dashboard/clientes";

function buildClientesCanonicalHref(q: string | null, page: number): string {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString ? `${CLIENTES_PATHNAME}?${queryString}` : CLIENTES_PATHNAME;
}

export default async function DashboardClientesPage({
  searchParams,
}: DashboardClientesPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const page = getSingleSearchParam(params.page);
  const result = await listInternalClientes({ q, page });

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  const searchValue = result.q ?? "";

  if (result.ok && page !== undefined) {
    const canonicalHref = buildClientesCanonicalHref(
      result.q,
      result.pagination.page,
    );
    const requestedPage = normalizePageParam(page);
    const currentPageIsCanonical =
      result.pagination.page > 1 && page === String(result.pagination.page);

    if (!currentPageIsCanonical || requestedPage !== result.pagination.page) {
      redirect(canonicalHref);
    }
  }

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
        <>
          <InternalClientesList
            clientes={result.clientes}
            hasActiveFilters={Boolean(searchValue)}
            emptyMessage={
              searchValue ? "Prueba cambiar el término de búsqueda." : undefined
            }
          />

          {result.clientes.length > 0 ? (
            <ListingPagination
              pagination={result.pagination}
              pathname={CLIENTES_PATHNAME}
              query={{ q: result.q }}
              itemLabel="clientes"
              ariaLabel="Paginación de clientes"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
