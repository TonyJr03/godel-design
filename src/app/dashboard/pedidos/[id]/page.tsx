import { notFound } from "next/navigation";
import { InternalPedidoDetail } from "@/components/pedidos/InternalPedidoDetail";
import { PedidoCommentsSection } from "@/components/pedidos/PedidoCommentsSection";
import { PedidoHistorySection } from "@/components/pedidos/PedidoHistorySection";
import { PedidoTasksSection } from "@/components/pedidos/PedidoTasksSection";
import { PedidoWorkerAssignmentForm } from "@/components/pedidos/PedidoWorkerAssignmentForm";
import { PedidoFilesSection } from "@/components/storage/PedidoFilesSection";
import { Alert, PageHeader } from "@/components/ui";
import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  hasPermission,
} from "@/lib/permissions/permissions";
import {
  EMPTY_PEDIDO_TASKS_PROGRESS,
  canManagePedidoTasksInStatus,
  getInternalPedidoById,
  listAssignableWorkers,
  listPedidoComments,
  listPedidoHistory,
  listPedidoTasks,
} from "@/lib/pedidos";
import { listPedidoFiles } from "@/lib/storage";
import { listActiveTaskTemplatesForOrder } from "@/lib/task-templates";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";
import {
  applyTaskTemplateAction,
  assignPedidoWorkerAction,
  completePedidoTaskAction,
  createPedidoCommentAction,
  createPedidoTaskAction,
  deletePedidoTaskAction,
  removePedidoWorkerAction,
  reopenPedidoTaskAction,
  updatePedidoStatusAction,
  updatePedidoTaskProgressAction,
  updatePedidoTaskTitleAction,
  uploadPedidoFileAction,
} from "./actions";

type DashboardPedidoDetallePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function DashboardPedidoDetallePage({
  params,
}: DashboardPedidoDetallePageProps) {
  const { id } = await params;
  const result = await getInternalPedidoById(id);

  if (!result.ok) {
    if (result.reason === "invalid_id" || result.reason === "not_found") {
      notFound();
    }

    return (
      <div className="space-y-8">
        <PageHeader
          title="Detalle de pedido"
          description="Consulta interna de la información registrada del pedido."
        />
        <Alert variant="danger">{result.message}</Alert>
      </div>
    );
  }

  const profile = await getCurrentProfile();
  const canManagePedidos =
    profile !== null && hasPermission(profile.role, "pedidos.manage");
  const workersResult = canManagePedidos ? await listAssignableWorkers() : null;
  const tasksResult = await listPedidoTasks(result.pedido.id);
  const filesResult = await listPedidoFiles(result.pedido.id);
  const commentsResult = await listPedidoComments(result.pedido.id);
  const historyResult = await listPedidoHistory(result.pedido.id);
  const shouldLoadTaskTemplates =
    result.pedido.workflow_type === WORKFLOW_TYPES.ENCARGO &&
    canManagePedidoTasksInStatus(result.pedido.status);
  const taskTemplatesResult = shouldLoadTaskTemplates
    ? await listActiveTaskTemplatesForOrder()
    : null;
  const pedidoId = result.pedido.id;
  const assignWorkerAction = assignPedidoWorkerAction.bind(null, pedidoId);
  const removeWorkerAction = removePedidoWorkerAction.bind(null, pedidoId);
  const createTaskAction = createPedidoTaskAction.bind(null, pedidoId);
  const applyTemplateAction = applyTaskTemplateAction.bind(null, pedidoId);
  const taskActions = {
    complete: completePedidoTaskAction.bind(null, pedidoId),
    delete: deletePedidoTaskAction.bind(null, pedidoId),
    reopen: reopenPedidoTaskAction.bind(null, pedidoId),
    updateProgress: updatePedidoTaskProgressAction.bind(null, pedidoId),
    updateTitle: updatePedidoTaskTitleAction.bind(null, pedidoId),
  };
  const createCommentAction = createPedidoCommentAction.bind(null, pedidoId);
  const updateStatusAction = updatePedidoStatusAction.bind(null, pedidoId);
  const uploadFileAction = uploadPedidoFileAction.bind(null, pedidoId);

  return (
    <InternalPedidoDetail
        pedido={result.pedido}
        updateStatusAction={updateStatusAction}
        taskProgress={tasksResult.ok ? tasksResult.progress : undefined}
        tasksLoadError={
          tasksResult.ok
            ? undefined
            : "No se pudieron cargar las tareas del pedido."
        }
        workerAssignmentSection={
          <PedidoWorkerAssignmentForm
            assignWorkerAction={assignWorkerAction}
            removeWorkerAction={removeWorkerAction}
            asignaciones={result.pedido.pedido_trabajadores}
            canManage={canManagePedidos}
            trabajadores={workersResult?.ok ? workersResult.workers : []}
            loadAssignableError={
              canManagePedidos && workersResult && !workersResult.ok
                ? workersResult.message
                : undefined
            }
          />
        }
        tasksSection={
          <PedidoTasksSection
            applyTaskTemplateAction={
              shouldLoadTaskTemplates ? applyTemplateAction : undefined
            }
            createTaskAction={createTaskAction}
            taskActions={taskActions}
            pedidoStatus={result.pedido.status}
            tasks={tasksResult.ok ? tasksResult.tasks : []}
            taskTemplates={
              taskTemplatesResult?.ok ? taskTemplatesResult.templates : []
            }
            taskTemplatesLoadError={
              taskTemplatesResult && !taskTemplatesResult.ok
                ? taskTemplatesResult.message
                : undefined
            }
            progress={
              tasksResult.ok
                ? tasksResult.progress
                : EMPTY_PEDIDO_TASKS_PROGRESS
            }
            loadError={
              tasksResult.ok
                ? undefined
                : "No se pudieron cargar las tareas del pedido."
            }
          />
        }
        commentsSection={
          <PedidoCommentsSection
            createCommentAction={createCommentAction}
            comments={commentsResult.ok ? commentsResult.comments : []}
            loadError={
              commentsResult.ok ? undefined : commentsResult.message
            }
          />
        }
        historySection={
          <PedidoHistorySection
            history={historyResult.ok ? historyResult.history : []}
            loadError={historyResult.ok ? undefined : historyResult.message}
          />
        }
        filesSection={
          <PedidoFilesSection
            pedidoId={result.pedido.id}
            uploadFileAction={uploadFileAction}
            pedidoStatus={result.pedido.status}
            files={filesResult.ok ? filesResult.files : []}
            canUpload={profile !== null}
            loadError={
              filesResult.ok
                ? undefined
                : "No se pudieron cargar los archivos del pedido."
            }
          />
        }
    />
  );
}
