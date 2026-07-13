import Link from "next/link";
import { notFound } from "next/navigation";

import { TaskTemplateForm } from "@/components/configuracion/TaskTemplateForm";
import { Alert, PageHeader } from "@/components/ui";
import { getTaskTemplateById } from "@/lib/task-templates";

type PageProps = {
  params: Promise<{
    templateId: string;
  }>;
};

export default async function EditarPlantillaPage({ params }: PageProps) {
  const { templateId } = await params;
  const result = await getTaskTemplateById(templateId);

  if (!result.ok) {
    if (result.reason === "invalid_id" || result.reason === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <PageHeader
          title="Editar plantilla"
          description="Actualiza los datos y el estado de la plantilla."
        />
        <Alert variant="danger">{result.message}</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Editar plantilla"
        description="Actualiza los datos y el estado de la plantilla."
      />

      <div className="space-y-6">
        <Link
          href={`/dashboard/configuracion/plantillas/${result.template.id}`}
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
        >
          Volver a la plantilla
        </Link>

        <TaskTemplateForm
          mode="edit"
          layout="section"
          template={result.template}
          includeStatus
        />
      </div>
    </div>
  );
}
