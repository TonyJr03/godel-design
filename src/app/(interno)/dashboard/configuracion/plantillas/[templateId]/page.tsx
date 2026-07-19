import { notFound } from "next/navigation";

import {
  createTaskTemplateTaskAction,
  deleteTaskTemplateTaskAction,
  moveTaskTemplateTaskAction,
  updateTaskTemplateTaskAction,
} from "@/app/(interno)/dashboard/configuracion/plantillas/[templateId]/actions";
import { TaskTemplateDetailHeader } from "@/components/configuracion/TaskTemplateDetailHeader";
import { TaskTemplateTaskForm } from "@/components/configuracion/TaskTemplateTaskForm";
import { TaskTemplateTasksSection } from "@/components/configuracion/TaskTemplateTasksSection";
import {
  Alert,
  DetailPanel,
  MetadataGrid,
  MetadataItem,
} from "@/components/ui";
import {
  getTaskTemplateById,
  listTaskTemplateTasks,
} from "@/lib/task-templates";
import { formatAppDateTime } from "@/lib/utils";

type TaskTemplateDetailPageProps = {
  params: Promise<{
    templateId: string;
  }>;
};

export default async function TaskTemplateDetailPage({
  params,
}: TaskTemplateDetailPageProps) {
  const { templateId } = await params;
  const [templateResult, tasksResult] = await Promise.all([
    getTaskTemplateById(templateId),
    listTaskTemplateTasks(templateId),
  ]);

  if (
    !templateResult.ok &&
    (templateResult.reason === "invalid_id" ||
      templateResult.reason === "not_found")
  ) {
    notFound();
  }

  if (!templateResult.ok) {
    return <Alert variant="danger">{templateResult.message}</Alert>;
  }

  const tasksLoadRetryable =
    !tasksResult.ok && tasksResult.reason === "error";
  const createTaskAction = createTaskTemplateTaskAction.bind(null, templateId);
  const taskActions = {
    delete: deleteTaskTemplateTaskAction.bind(null, templateId),
    move: moveTaskTemplateTaskAction.bind(null, templateId),
    update: updateTaskTemplateTaskAction.bind(null, templateId),
  };

  return (
    <div className="space-y-8">
      <TaskTemplateDetailHeader template={templateResult.template} />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0">
          <TaskTemplateTasksSection
            taskActions={taskActions}
            tasks={tasksResult.ok ? tasksResult.tasks : []}
            loadError={tasksResult.ok ? undefined : tasksResult.message}
            loadErrorRetryable={tasksLoadRetryable}
          />
        </div>

        <aside className="min-w-0 space-y-6 xl:sticky xl:top-24 xl:self-start">
          <DetailPanel title="Nueva tarea">
            {tasksResult.ok ? (
              <TaskTemplateTaskForm
                mode="create"
                action={createTaskAction}
                variant="compact"
              />
            ) : (
              <Alert
                variant="warning"
                title="Creación temporalmente no disponible"
              >
                Carga las tareas actuales antes de agregar una nueva.
              </Alert>
            )}
          </DetailPanel>

          <DetailPanel title="Registro">
            <MetadataGrid>
              <MetadataItem
                label="Creación"
                value={formatAppDateTime(
                  templateResult.template.created_at,
                  "No definida",
                )}
              />
              <MetadataItem
                label="Actualización"
                value={formatAppDateTime(
                  templateResult.template.updated_at,
                  "No definida",
                )}
              />
              <MetadataItem
                label="Identificador interno"
                className="min-w-0 sm:col-span-2"
                value={
                  <span className="block w-full max-w-full break-all font-mono text-xs leading-6 text-text-secondary">
                    {templateResult.template.id}
                  </span>
                }
              />
            </MetadataGrid>
          </DetailPanel>
        </aside>
      </div>
    </div>
  );
}
