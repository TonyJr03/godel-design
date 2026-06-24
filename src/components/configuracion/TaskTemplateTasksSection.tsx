import type {
  CreateTaskTemplateTaskActionState,
  TaskTemplateDetailAction,
} from "@/app/dashboard/configuracion/plantillas/[templateId]/actions";
import { TaskTemplateTaskForm } from "@/components/configuracion/TaskTemplateTaskForm";
import {
  TaskTemplateTasksList,
  type TaskTemplateTaskItemActions,
} from "@/components/configuracion/TaskTemplateTasksList";
import { Alert, Card } from "@/components/ui";
import type { TaskTemplateTask } from "@/lib/task-templates";

type TaskTemplateTasksSectionProps = {
  createTaskAction: TaskTemplateDetailAction<CreateTaskTemplateTaskActionState>;
  taskActions: TaskTemplateTaskItemActions;
  tasks: TaskTemplateTask[];
  loadError?: string;
};

export function TaskTemplateTasksSection({
  createTaskAction,
  taskActions,
  tasks,
  loadError,
}: TaskTemplateTasksSectionProps) {
  return (
    <section className="space-y-6" aria-labelledby="template-tasks-title">
      <Card as="section" padding="lg" className="shadow-(--shadow-soft)">
        <div className="max-w-3xl">
          <h2
            id="template-tasks-title"
            className="text-xl font-semibold text-text-primary"
          >
            Tareas de la plantilla
          </h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Estas tareas se usarán como base cuando apliques la plantilla a un
            pedido de tipo Encargo. Editarlas aquí no modifica pedidos
            existentes.
          </p>
        </div>

        <div className="mt-6">
          <TaskTemplateTaskForm mode="create" action={createTaskAction} />
        </div>
      </Card>

      {loadError ? <Alert variant="danger">{loadError}</Alert> : null}

      {!loadError ? (
        <TaskTemplateTasksList tasks={tasks} actions={taskActions} />
      ) : null}
    </section>
  );
}
