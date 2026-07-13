import type {
  CreateTaskTemplateTaskActionState,
  TaskTemplateDetailAction,
} from "@/app/(interno)/dashboard/configuracion/plantillas/[templateId]/actions";
import { TaskTemplateTaskForm } from "@/components/configuracion/TaskTemplateTaskForm";
import {
  TaskTemplateTasksList,
  type TaskTemplateTaskItemActions,
} from "@/components/configuracion/TaskTemplateTasksList";
import { Alert, DetailPanel } from "@/components/ui";
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
    <DetailPanel
      title="Tareas de la plantilla"
      description="Define el flujo base que se aplicará a pedidos compatibles. Los cambios no modifican pedidos existentes."
    >
      <div className="space-y-6">
        <div>
          <TaskTemplateTaskForm mode="create" action={createTaskAction} />
        </div>

        <div className="border-t border-border pt-6">
          {loadError ? <Alert variant="danger">{loadError}</Alert> : null}

          {!loadError ? (
            <TaskTemplateTasksList tasks={tasks} actions={taskActions} />
          ) : null}
        </div>
      </div>
    </DetailPanel>
  );
}
