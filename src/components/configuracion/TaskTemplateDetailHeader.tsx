import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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

export function TaskTemplateDetailHeader({
  template,
}: TaskTemplateDetailHeaderProps) {
  return (
    <article className="space-y-6">
      <header className="min-w-0">
        <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <BackToPlantillasLink presentation="text" />

            <p className="mt-2 text-sm font-semibold text-brand-primary">
              Configuración / Plantillas de tareas
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-text-primary">
                {template.name}
              </h1>
              <StatusBadge
                status={template.is_active ? "activo" : "inactivo"}
                label={template.is_active ? "Activa" : "Inactiva"}
              />
            </div>
            <p className="mt-3 max-w-3xl text-base leading-7 text-text-secondary">
              {template.description?.trim() ||
                "Sin descripción interna definida."}
            </p>
          </div>

          <div className="hidden shrink-0 xl:block">
            <BackToPlantillasLink presentation="button" />
          </div>
        </div>
      </header>
    </article>
  );
}
