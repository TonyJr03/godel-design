import { ListFiltersBar } from "@/components/common/ListFiltersBar";
import { InternalSolicitudesList } from "@/components/solicitudes/InternalSolicitudesList";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  INTERNAL_SOLICITUD_ESTADOS,
  SOLICITUD_STATUS_LABELS,
  listInternalSolicitudes,
} from "@/lib/solicitudes";
import { getSingleSearchParam } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/workflow-types";

type DashboardSolicitudesPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    status?: string | string[] | undefined;
    workflow_type?: string | string[] | undefined;
  }>;
};

export default async function DashboardSolicitudesPage({
  searchParams,
}: DashboardSolicitudesPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const status = getSingleSearchParam(params.status);
  const workflowType = getSingleSearchParam(params.workflow_type);
  const result = await listInternalSolicitudes({
    q,
    status,
    workflowType,
  });
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
        ]}
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

      {!result.ok ? (
        <Alert variant="danger">{result.message}</Alert>
      ) : (
        <InternalSolicitudesList
          solicitudes={result.solicitudes}
          hasActiveFilters={Boolean(
            searchValue || result.status || result.workflowType,
          )}
          emptyMessage={
            searchValue || result.status || result.workflowType
              ? "No se encontraron solicitudes con los filtros aplicados."
              : undefined
          }
        />
      )}
    </div>
  );
}
