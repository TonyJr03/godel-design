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
import { listOperationalServiceTypes } from "@/lib/service-types";
import {
  EMPTY_PEDIDO_TASKS_PROGRESS,
  canManagePedidoTasksInStatus,
  getInternalPedidoById,
  isPedidoClosedStatus,
  isPedidoInitialStatus,
  listPedidoComments,
  listPedidoHistory,
  listPedidoTasks,
} from "@/lib/pedidos";
import { listPedidoFiles } from "@/lib/storage";
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
  finalizePedidoFileAction,
  reservePedidoFilesAction,
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
  const tasksResult = await listPedidoTasks(result.pedido.id);
  const filesResult = await listPedidoFiles(result.pedido.id);
  const commentsResult = await listPedidoComments(result.pedido.id);
  const historyResult = await listPedidoHistory(result.pedido.id);
  const shouldEnableTaskTemplateAction =
    result.pedido.workflow_type === WORKFLOW_TYPES.ENCARGO &&
    canManagePedidoTasksInStatus(result.pedido.status);
  const tasksLoadRetryable = !tasksResult.ok && tasksResult.reason === "error";
  const filesLoadRetryable = !filesResult.ok && filesResult.reason === "error";
  const commentsLoadRetryable =
    !commentsResult.ok && commentsResult.reason === "error";
  const historyLoadRetryable =
    !historyResult.ok && historyResult.reason === "error";
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
  const editServiceTypesResult = canEditPedido
    ? await listOperationalServiceTypes()
    : null;
  const reserveFilesAction = reservePedidoFilesAction.bind(null, pedidoId);
  const finalizeFileAction = finalizePedidoFileAction.bind(null, pedidoId);

  return (
    <>
      {shouldStartReviewOnOpen ? (
        <AutoReviewOnOpen
          action={startReviewOnOpenAction}
          successNavigationHref={`/dashboard/pedidos/${pedidoId}`}
        />
      ) : null}
      <InternalPedidoDetail
        pedido={result.pedido}
        updatePedidoDataAction={editPedidoAction}
        editServiceTypes={
          editServiceTypesResult?.ok
            ? editServiceTypesResult.serviceTypes
            : []
        }
        editServiceTypesLoadError={
          editServiceTypesResult && !editServiceTypesResult.ok
            ? editServiceTypesResult.message
            : undefined
        }
        updateStatusAction={updateStatusAction}
        statusSuccessNavigationHref={`/dashboard/pedidos/${pedidoId}`}
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
        personnelPanelContent={
          canManagePedidos && assignWorkerAction && removeWorkerAction ? (
            <PedidoWorkerAssignmentForm
              pedidoId={pedidoId}
              successNavigationHref={`/dashboard/pedidos/${pedidoId}`}
              presentation="panel"
              assignWorkerAction={assignWorkerAction}
              removeWorkerAction={removeWorkerAction}
              asignaciones={result.pedido.pedido_trabajadores}
              canManage
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
            successNavigationHref={`/dashboard/pedidos/${pedidoId}`}
          />
        }
        tasksPanelContent={
          result.pedido.workflow_type === WORKFLOW_TYPES.ENCARGO ? (
            <PedidoTasksSection
              pedidoId={pedidoId}
              presentation="panel"
              applyTaskTemplateAction={
                shouldEnableTaskTemplateAction ? applyTemplateAction : undefined
              }
              createTaskAction={createTaskAction}
              taskActions={taskActions}
              pedidoStatus={result.pedido.status}
              tasks={tasksResult.ok ? tasksResult.tasks : []}
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
            successNavigationHref={`/dashboard/pedidos/${pedidoId}`}
          />
        }
        fileUploadPanelContent={
          <PedidoFileUploadForm
            presentation="panel"
            reserveFilesAction={reserveFilesAction}
            finalizeFileAction={finalizeFileAction}
            pedidoStatus={result.pedido.status}
            canUpload={profile !== null}
            successNavigationHref={`/dashboard/pedidos/${pedidoId}`}
          />
        }
      />
    </>
  );
}
