import { ListFiltersBar } from "@/components/common/ListFiltersBar";
import { InternalSolicitudesList } from "@/components/solicitudes/InternalSolicitudesList";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  INTERNAL_SOLICITUD_ESTADOS,
  SOLICITUD_STATUS_LABELS,
  listInternalSolicitudes,
} from "@/lib/solicitudes";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardSolicitudesPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    status?: string | string[] | undefined;
  }>;
};

export default async function DashboardSolicitudesPage({
  searchParams,
}: DashboardSolicitudesPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const status = getSingleSearchParam(params.status);
  const result = await listInternalSolicitudes({ q, status });
  const searchValue = result.q ?? "";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Solicitudes"
        description="Listado interno de solicitudes recibidas por el formulario público."
      />

      <ListFiltersBar
        searchLabel="Buscar solicitudes"
        searchPlaceholder="Referencia, cliente, servicio o descripción"
        initialQuery={searchValue}
        filters={[
          {
            name: "status",
            label: "Estado",
            value: result.status ?? "",
            options: [
              { value: "", label: "Todos los estados" },
              ...INTERNAL_SOLICITUD_ESTADOS.map((estadoOption) => ({
                value: estadoOption,
                label: SOLICITUD_STATUS_LABELS[estadoOption],
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
        <InternalSolicitudesList
          solicitudes={result.solicitudes}
          emptyMessage={
            searchValue || result.status
              ? "No se encontraron solicitudes con los filtros aplicados."
              : undefined
          }
        />
      )}
    </div>
  );
}
