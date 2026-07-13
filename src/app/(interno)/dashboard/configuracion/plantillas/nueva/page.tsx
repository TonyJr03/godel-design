import Link from "next/link";

import { TaskTemplateForm } from "@/components/configuracion/TaskTemplateForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NuevaPlantillaPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Nueva plantilla"
        description="Crea una plantilla de tareas de producción."
      />

      <div className="space-y-6">
        <Link
          href="/dashboard/configuracion/plantillas"
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
        >
          Volver a plantillas
        </Link>

        <TaskTemplateForm mode="create" layout="section" />
      </div>
    </div>
  );
}
