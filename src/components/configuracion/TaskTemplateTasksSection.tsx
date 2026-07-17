import {
  TaskTemplateTasksList,
  type TaskTemplateTaskItemActions,
} from "@/components/configuracion/TaskTemplateTasksList";
import { Alert, DetailPanel } from "@/components/ui";
import type { TaskTemplateTask } from "@/lib/task-templates";

type TaskTemplateTasksSectionProps = {
  taskActions: TaskTemplateTaskItemActions;
  tasks: TaskTemplateTask[];
  loadError?: string;
};

export function TaskTemplateTasksSection({
  taskActions,
  tasks,
  loadError,
}: TaskTemplateTasksSectionProps) {
  return (
    <DetailPanel
      title="Tareas de la plantilla"
      description="Define el flujo base que se aplicará a pedidos compatibles. Los cambios no modifican pedidos existentes."
    >
      {loadError ? <Alert variant="danger">{loadError}</Alert> : null}

      {!loadError ? (
        <TaskTemplateTasksList tasks={tasks} actions={taskActions} />
      ) : null}
    </DetailPanel>
  );
}
