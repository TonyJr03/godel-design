import { notFound } from "next/navigation";

import {
  createTaskTemplateTaskAction,
  deleteTaskTemplateTaskAction,
  moveTaskTemplateTaskAction,
  updateTaskTemplateTaskAction,
} from "@/app/(interno)/dashboard/configuracion/plantillas/[templateId]/actions";
import { TaskTemplateDetailHeader } from "@/components/configuracion/TaskTemplateDetailHeader";
import { TaskTemplateForm } from "@/components/configuracion/TaskTemplateForm";
import { TaskTemplateStatusToggleForm } from "@/components/configuracion/TaskTemplateStatusToggleForm";
import { TaskTemplateTasksSection } from "@/components/configuracion/TaskTemplateTasksSection";
import {
  Alert,
  DetailPanel,
  MetadataGrid,
  MetadataItem,
  StatusBadge,
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

  const createTaskAction = createTaskTemplateTaskAction.bind(null, templateId);
  const taskActions = {
    delete: deleteTaskTemplateTaskAction.bind(null, templateId),
    move: moveTaskTemplateTaskAction.bind(null, templateId),
    update: updateTaskTemplateTaskAction.bind(null, templateId),
  };

  return (
    <div className="space-y-8">
      <TaskTemplateDetailHeader template={templateResult.template} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <DetailPanel title="Datos de la plantilla">
            <TaskTemplateForm
              mode="edit"
              layout="inline"
              template={templateResult.template}
            />
          </DetailPanel>

          <TaskTemplateTasksSection
            createTaskAction={createTaskAction}
            taskActions={taskActions}
            tasks={tasksResult.ok ? tasksResult.tasks : []}
            loadError={tasksResult.ok ? undefined : tasksResult.message}
          />
        </div>

        <aside className="space-y-6">
          <DetailPanel title="Estado">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge
                  status={
                    templateResult.template.is_active ? "activo" : "inactivo"
                  }
                  label={
                    templateResult.template.is_active ? "Activa" : "Inactiva"
                  }
                />
                <p className="text-sm leading-6 text-text-secondary">
                  {templateResult.template.is_active
                    ? "Disponible para aplicarse en pedidos compatibles."
                    : "No estará disponible para nuevas aplicaciones."}
                </p>
              </div>

              <TaskTemplateStatusToggleForm
                template={templateResult.template}
              />
            </div>
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
