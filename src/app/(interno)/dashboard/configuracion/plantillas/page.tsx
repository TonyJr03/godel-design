import { redirect } from "next/navigation";

import { BackToConfigurationLink } from "@/components/configuracion/BackToConfigurationLink";
import { TaskTemplateCreateDialogButton } from "@/components/configuracion/TaskTemplateCreateDialogButton";
import { InternalTaskTemplatesList } from "@/components/configuracion/InternalTaskTemplatesList";
import {
  ListingPageHeader,
  ListingPagination,
  ListingToolbar,
} from "@/components/listing";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
import { normalizePageParam } from "@/lib/pagination";
import { listTaskTemplates } from "@/lib/task-templates";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardConfiguracionPlantillasPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
    page?: string | string[] | undefined;
  }>;
};

const TEMPLATES_PATHNAME = "/dashboard/configuracion/plantillas";

function buildTemplatesCanonicalHref(q: string | null, page: number): string {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }

  if (page > 1) {
    params.set("page", String(page));
  }

  const queryString = params.toString();

  return queryString
    ? `${TEMPLATES_PATHNAME}?${queryString}`
    : TEMPLATES_PATHNAME;
}

export default async function DashboardConfiguracionPlantillasPage({
  searchParams,
}: DashboardConfiguracionPlantillasPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const page = getSingleSearchParam(params.page);
  const result = await listTaskTemplates({ q, page });

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  const searchValue = result.ok ? result.q ?? "" : q?.trim() ?? "";

  if (result.ok && page !== undefined) {
    const canonicalHref = buildTemplatesCanonicalHref(
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
      <div className="space-y-4">
        <BackToConfigurationLink presentation="text" />
        <ListingPageHeader
          title="Plantillas"
          description="Gestiona plantillas de tareas de producción."
          action={
            <div className="flex items-center gap-2">
              <TaskTemplateCreateDialogButton />
              <BackToConfigurationLink presentation="button" />
            </div>
          }
          toolbar={
            <ListingToolbar
              searchLabel="Buscar plantillas"
              searchPlaceholder="Nombre o descripción"
              initialQuery={searchValue}
            />
          }
        />
      </div>

      {!result.ok ? (
        <ReadErrorAlert
          variant="danger"
          title="No se pudieron cargar las plantillas"
          retryable={result.reason === "error"}
        >
          <p>{result.message}</p>
        </ReadErrorAlert>
      ) : (
        <>
          <InternalTaskTemplatesList
            templates={result.templates}
            hasActiveFilters={Boolean(searchValue)}
            emptyMessage={
              searchValue
                ? "Prueba cambiar el término de búsqueda."
                : undefined
            }
          />

          {result.templates.length > 0 ? (
            <ListingPagination
              pagination={result.pagination}
              pathname={TEMPLATES_PATHNAME}
              query={{ q: result.q }}
              itemLabel="plantillas"
              ariaLabel="Paginación de plantillas"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
