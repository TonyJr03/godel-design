import { notFound, redirect } from "next/navigation";
import { PedidoCommentComposer } from "@/components/pedidos/PedidoCommentComposer";
import { InternalPedidoDetail } from "@/components/pedidos/InternalPedidoDetail";
import { PedidoPaymentSection } from "@/components/pedidos/PedidoPaymentSection";
import { PedidoTasksSection } from "@/components/pedidos/PedidoTasksSection";
import { PedidoWorkerAssignmentForm } from "@/components/pedidos/PedidoWorkerAssignmentForm";
import { PedidoFileUploadForm } from "@/components/storage/PedidoFileUploadForm";
import { Alert, PageHeader } from "@/components/ui";
import { AutoReviewOnOpen } from "@/components/workspace";
import { getCurrentProfile } from "@/lib/auth/current-user";
import {
  hasPermission,
  isAdmin,
  isSupervisor,
} from "@/lib/permissions/permissions";
import {
  EMPTY_PEDIDO_TASKS_PROGRESS,
  canManagePedidoTasksInStatus,
  getInternalPedidoById,
  isPedidoClosedStatus,
  isPedidoInitialStatus,
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
  updatePedidoDataAction,
  updatePedidoPaymentAction,
  updatePedidoStatusAction,
  updatePedidoTaskProgressAction,
  updatePedidoTaskTitleAction,
  uploadPedidoFileAction,
} from "./actions";
import { startPedidoReviewOnOpenAction } from "./actions/status-actions";

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
    if (result.reason === "unauthorized") {
      redirect("/login");
    }

    if (result.reason === "forbidden") {
      redirect("/sin-permisos");
    }

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
  const canEditPedido =
    canManagePedidos && !isPedidoClosedStatus(result.pedido.status);
  const canManagePayments =
    profile !== null && (isAdmin(profile.role) || isSupervisor(profile.role));
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
  const workersLoadRetryable =
    workersResult !== null && !workersResult.ok && workersResult.reason === "error";
  const tasksLoadRetryable = !tasksResult.ok && tasksResult.reason === "error";
  const filesLoadRetryable = !filesResult.ok && filesResult.reason === "error";
  const commentsLoadRetryable =
    !commentsResult.ok && commentsResult.reason === "error";
  const historyLoadRetryable =
    !historyResult.ok && historyResult.reason === "error";
  const taskTemplatesLoadRetryable =
    taskTemplatesResult !== null &&
    !taskTemplatesResult.ok &&
    taskTemplatesResult.reason === "error";
  const pedidoId = result.pedido.id;
  const assignWorkerAction = canManagePedidos
    ? assignPedidoWorkerAction.bind(null, pedidoId)
    : undefined;
  const removeWorkerAction = canManagePedidos
    ? removePedidoWorkerAction.bind(null, pedidoId)
    : undefined;
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
  const shouldStartReviewOnOpen = isPedidoInitialStatus(result.pedido.status);
  const startReviewOnOpenAction = startPedidoReviewOnOpenAction.bind(
    null,
    pedidoId,
  );
  const updatePaymentAction = canManagePayments
    ? updatePedidoPaymentAction.bind(null, pedidoId)
    : undefined;
  const editPedidoAction = canEditPedido
    ? updatePedidoDataAction.bind(null, pedidoId)
    : undefined;
  const uploadFileAction = uploadPedidoFileAction.bind(null, pedidoId);

  return (
    <>
      {shouldStartReviewOnOpen ? (
        <AutoReviewOnOpen action={startReviewOnOpenAction} />
      ) : null}
      <InternalPedidoDetail
        pedido={result.pedido}
        updatePedidoDataAction={editPedidoAction}
        updateStatusAction={updateStatusAction}
        taskProgress={tasksResult.ok ? tasksResult.progress : undefined}
        tasksLoadError={
          tasksResult.ok
            ? undefined
            : "No se pudieron cargar las tareas del pedido."
        }
        tasksLoadRetryable={tasksLoadRetryable}
        tasks={tasksResult.ok ? tasksResult.tasks : []}
        history={historyResult.ok ? historyResult.history : []}
        historyLoadError={historyResult.ok ? undefined : historyResult.message}
        historyLoadRetryable={historyLoadRetryable}
        files={filesResult.ok ? filesResult.files : []}
        filesLoadError={
          filesResult.ok
            ? undefined
            : "No se pudieron cargar los archivos del pedido."
        }
        filesLoadRetryable={filesLoadRetryable}
        comments={commentsResult.ok ? commentsResult.comments : []}
        commentsLoadError={commentsResult.ok ? undefined : commentsResult.message}
        commentsLoadRetryable={commentsLoadRetryable}
        personnelLoadError={
          workersResult && !workersResult.ok ? workersResult.message : undefined
        }
        taskTemplatesLoadError={
          taskTemplatesResult && !taskTemplatesResult.ok
            ? taskTemplatesResult.message
            : undefined
        }
        personnelPanelContent={
          canManagePedidos && assignWorkerAction && removeWorkerAction ? (
            <PedidoWorkerAssignmentForm
              presentation="panel"
              assignWorkerAction={assignWorkerAction}
              removeWorkerAction={removeWorkerAction}
              asignaciones={result.pedido.pedido_trabajadores}
              canManage
              trabajadores={workersResult?.ok ? workersResult.workers : []}
              loadAssignableError={
                workersResult && !workersResult.ok
                  ? workersResult.message
                  : undefined
              }
              loadAssignableErrorRetryable={workersLoadRetryable}
            />
          ) : (
            <PedidoWorkerAssignmentForm
              presentation="panel"
              asignaciones={result.pedido.pedido_trabajadores}
              canManage={false}
            />
          )
        }
        paymentPanelContent={
          <PedidoPaymentSection
            presentation="panel"
            payment={result.pedido.payment}
            canManage={canManagePayments}
            updatePaymentAction={updatePaymentAction}
          />
        }
        tasksPanelContent={
          result.pedido.workflow_type === WORKFLOW_TYPES.ENCARGO ? (
            <PedidoTasksSection
              presentation="panel"
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
              taskTemplatesLoadRetryable={taskTemplatesLoadRetryable}
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
              loadErrorRetryable={tasksLoadRetryable}
            />
          ) : undefined
        }
        commentComposerPanelContent={
          <PedidoCommentComposer
            presentation="panel"
            createCommentAction={createCommentAction}
          />
        }
        fileUploadPanelContent={
          <PedidoFileUploadForm
            presentation="panel"
            uploadFileAction={uploadFileAction}
            pedidoStatus={result.pedido.status}
            canUpload={profile !== null}
          />
        }
      />
    </>
  );
}
