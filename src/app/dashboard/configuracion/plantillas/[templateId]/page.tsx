import { notFound } from "next/navigation";

import {
  createTaskTemplateTaskAction,
  deleteTaskTemplateTaskAction,
  moveTaskTemplateTaskAction,
  updateTaskTemplateTaskAction,
} from "@/app/dashboard/configuracion/plantillas/[templateId]/actions";
import { TaskTemplateDetailHeader } from "@/components/configuracion/TaskTemplateDetailHeader";
import { TaskTemplateTasksSection } from "@/components/configuracion/TaskTemplateTasksSection";
import { Alert } from "@/components/ui";
import {
  getTaskTemplateById,
  listTaskTemplateTasks,
} from "@/lib/task-templates";

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
      <TaskTemplateTasksSection
        createTaskAction={createTaskAction}
        taskActions={taskActions}
        tasks={tasksResult.ok ? tasksResult.tasks : []}
        loadError={tasksResult.ok ? undefined : tasksResult.message}
      />
    </div>
  );
}
