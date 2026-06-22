import { TaskTemplateForm } from "@/components/configuracion/TaskTemplateForm";
import { TaskTemplatesList } from "@/components/configuracion/TaskTemplatesList";
import { Alert } from "@/components/ui";
import type { TaskTemplateListItem } from "@/lib/task-templates";

type TaskTemplatesSectionProps = {
  templates: TaskTemplateListItem[];
};

export function TaskTemplatesSection({ templates }: TaskTemplatesSectionProps) {
  return (
    <section className="space-y-6" aria-labelledby="task-templates-title">
      <div className="max-w-3xl">
        <h2
          id="task-templates-title"
          className="text-xl font-semibold text-text-primary"
        >
          Plantillas de tareas
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Define plantillas reutilizables para cargar tareas predeterminadas en
          pedidos de tipo Encargo.
        </p>
      </div>

      <Alert variant="info">
        Usa Gestionar tareas para definir, ordenar y mantener las tareas
        internas de cada plantilla.
      </Alert>

      <TaskTemplateForm mode="create" layout="section" />

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            Plantillas existentes
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Las plantillas inactivas permanecen visibles para administración,
            pero no se usarán en la selección futura de pedidos.
          </p>
        </div>

        <TaskTemplatesList templates={templates} />
      </div>
    </section>
  );
}
