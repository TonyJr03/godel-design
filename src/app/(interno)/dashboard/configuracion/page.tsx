import { TaskTemplatesSection } from "@/components/configuracion/TaskTemplatesSection";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { listTaskTemplates } from "@/lib/task-templates";

export default async function DashboardConfiguracionPage() {
  const result = await listTaskTemplates();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Configuración"
        description="Ajustes operativos del sistema interno."
      />

      {!result.ok ? (
        <Alert variant="danger">{result.message}</Alert>
      ) : (
        <TaskTemplatesSection templates={result.templates} />
      )}
    </div>
  );
}
