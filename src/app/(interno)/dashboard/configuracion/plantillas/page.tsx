import { redirect } from "next/navigation";

import { TaskTemplateCreateDialogButton } from "@/components/configuracion/TaskTemplateCreateDialogButton";
import { InternalTaskTemplatesList } from "@/components/configuracion/InternalTaskTemplatesList";
import {
  ListingPageHeader,
  ListingToolbar,
} from "@/components/listing";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
import { listTaskTemplates } from "@/lib/task-templates";
import { getSingleSearchParam } from "@/lib/utils";

type DashboardConfiguracionPlantillasPageProps = {
  searchParams: Promise<{
    q?: string | string[] | undefined;
  }>;
};

export default async function DashboardConfiguracionPlantillasPage({
  searchParams,
}: DashboardConfiguracionPlantillasPageProps) {
  const params = await searchParams;
  const q = getSingleSearchParam(params.q);
  const result = await listTaskTemplates({ q });

  if (!result.ok && result.reason === "unauthorized") {
    redirect("/login");
  }

  if (!result.ok && result.reason === "forbidden") {
    redirect("/sin-permisos");
  }

  const searchValue = q?.trim() ?? "";

  return (
    <div className="space-y-8">
      <ListingPageHeader
        title="Plantillas"
        description="Gestiona plantillas de tareas de producción."
        action={<TaskTemplateCreateDialogButton />}
        toolbar={
          <ListingToolbar
            searchLabel="Buscar plantillas"
            searchPlaceholder="Nombre o descripción"
            initialQuery={searchValue}
          />
        }
      />

      {!result.ok ? (
        <ReadErrorAlert
          variant="danger"
          title="No se pudieron cargar las plantillas"
          retryable={result.reason === "error"}
        >
          <p>{result.message}</p>
        </ReadErrorAlert>
      ) : (
        <InternalTaskTemplatesList
          templates={result.templates}
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
