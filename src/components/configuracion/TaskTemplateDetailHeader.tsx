import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";

import { StatusBadge } from "@/components/ui";
import type { TaskTemplateDetail } from "@/lib/task-templates";

type TaskTemplateDetailHeaderProps = {
  template: TaskTemplateDetail;
};

function BackToPlantillasLink({
  presentation,
}: {
  presentation: "text" | "button";
}) {
  const className =
    presentation === "text"
      ? "inline-flex min-h-11 w-fit items-center gap-2 font-mono text-base font-semibold text-brand-primary transition-colors hover:text-brand-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background xl:hidden"
      : "hidden min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted xl:inline-flex xl:w-auto";

  return (
    <Link href="/dashboard/configuracion/plantillas" className={className}>
      <ArrowLeft
        aria-hidden="true"
        className="h-4 w-4"
        strokeWidth={1.75}
      />
      Volver a plantillas
    </Link>
  );
}

function EditPlantillaLink({ templateId }: { templateId: string }) {
  return (
    <Link
      href={`/dashboard/configuracion/plantillas/${templateId}/editar`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-(--radius-control) bg-brand-primary text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      aria-label="Editar plantilla"
      title="Editar plantilla"
    >
      <Pencil className="size-5" aria-hidden="true" />
    </Link>
  );
}

export function TaskTemplateDetailHeader({
  template,
}: TaskTemplateDetailHeaderProps) {
  return (
    <article className="space-y-6">
      <header className="min-w-0">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <BackToPlantillasLink presentation="text" />

            <div className="mt-2 flex min-w-0 items-start gap-3 xl:block">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm font-semibold text-brand-primary">
                    Configuración / Plantillas de tareas
                  </p>
                  <StatusBadge
                    status={template.is_active ? "activo" : "inactivo"}
                    label={template.is_active ? "Activa" : "Inactiva"}
                  />
                </div>

                <h1 className="mt-2 break-words text-3xl font-semibold tracking-tight text-text-primary">
                  {template.name}
                </h1>
                <p className="mt-3 max-w-3xl break-words text-base leading-7 text-text-secondary">
                  {template.description?.trim() ||
                    "Sin descripción interna definida."}
                </p>
              </div>

              <div className="shrink-0 xl:hidden">
                <EditPlantillaLink templateId={template.id} />
              </div>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-2 xl:flex">
            <BackToPlantillasLink presentation="button" />
            <EditPlantillaLink templateId={template.id} />
          </div>
        </div>
      </header>
    </article>
  );
}
