import { TaskTemplatesSection } from "@/components/configuracion/TaskTemplatesSection";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { listTaskTemplates } from "@/lib/task-templates";

export default async function DashboardConfiguracionPlantillasPage() {
  const result = await listTaskTemplates();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Plantillas"
        description="Plantillas de tareas de producción."
      />

      {!result.ok ? (
        <Alert variant="danger">{result.message}</Alert>
      ) : (
        <TaskTemplatesSection templates={result.templates} />
      )}
    </div>
  );
}
