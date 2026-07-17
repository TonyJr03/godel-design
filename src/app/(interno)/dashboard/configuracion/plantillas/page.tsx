import { TaskTemplateCreateDialogButton } from "@/components/configuracion/TaskTemplateCreateDialogButton";
import { InternalTaskTemplatesList } from "@/components/configuracion/InternalTaskTemplatesList";
import {
  ListingPageHeader,
  ListingToolbar,
} from "@/components/listing";
import { Alert } from "@/components/ui/Alert";
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
        <Alert variant="danger">{result.message}</Alert>
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
