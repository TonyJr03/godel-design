import {
  TaskTemplateTasksList,
  type TaskTemplateTaskItemActions,
} from "@/components/configuracion/TaskTemplateTasksList";
import { DetailPanel, ReadErrorAlert } from "@/components/ui";
import type { TaskTemplateTask } from "@/lib/task-templates";

type TaskTemplateTasksSectionProps = {
  taskActions: TaskTemplateTaskItemActions;
  tasks: TaskTemplateTask[];
  loadError?: string;
  loadErrorRetryable?: boolean;
};

export function TaskTemplateTasksSection({
  taskActions,
  tasks,
  loadError,
  loadErrorRetryable = false,
}: TaskTemplateTasksSectionProps) {
  return (
    <DetailPanel
      title="Tareas de la plantilla"
      description="Define el flujo base que se aplicará a pedidos compatibles. Los cambios no modifican pedidos existentes."
    >
      {loadError ? (
        <ReadErrorAlert
          variant="warning"
          title="No se pudieron cargar las tareas de la plantilla"
          retryable={loadErrorRetryable}
        >
          <p>{loadError}</p>
        </ReadErrorAlert>
      ) : null}

      {!loadError ? (
        <TaskTemplateTasksList tasks={tasks} actions={taskActions} />
      ) : null}
    </DetailPanel>
  );
}
