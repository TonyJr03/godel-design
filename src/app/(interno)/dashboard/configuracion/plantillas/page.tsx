import Link from "next/link";
import { Plus } from "lucide-react";

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
        action={
          <Link
            href="/dashboard/configuracion/plantillas/nueva"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Nueva plantilla"
            title="Nueva plantilla"
          >
            <Plus className="size-5" aria-hidden="true" />
          </Link>
        }
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
