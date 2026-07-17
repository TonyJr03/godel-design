import type { ReactNode } from "react";

import type {
  PedidoDetailAction,
  UpdatePedidoStatusActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import {
  WorkspaceController,
  WorkspaceShell,
  type WorkspaceAction,
  type WorkspacePanel,
} from "@/components/workspace";
import type {
  InternalPedidoDetail as InternalPedidoDetailData,
  InternalPedidoPayment,
  PedidoComment,
  PedidoHistoryItem,
  PedidoTask,
  PedidoTasksProgress,
} from "@/lib/pedidos";
import {
  EMPTY_PEDIDO_TASKS_PROGRESS,
  isPedidoActiveStatus,
  type PedidoStatus,
} from "@/lib/pedidos";
import type { PedidoFileListItem } from "@/lib/storage";
import { getTodayDateInputValue } from "@/lib/utils";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

import { PedidoStatusForm } from "./PedidoStatusForm";
import {
  PedidoCommentsPanel,
  PedidoFilesPanel,
  PedidoHistoryTimeline,
  PedidoInformationPanel,
  PedidoWorkspaceHeader,
  PedidoWorkspaceMain,
} from "./workspace";

type InternalPedidoDetailProps = {
  pedido: InternalPedidoDetailData;
  updateStatusAction: PedidoDetailAction<UpdatePedidoStatusActionState>;
  taskProgress?: PedidoTasksProgress | null;
  tasksLoadError?: string;
  tasks: readonly PedidoTask[];
  history: readonly PedidoHistoryItem[];
  historyLoadError?: string;
  files: readonly PedidoFileListItem[];
  filesLoadError?: string;
  comments: readonly PedidoComment[];
  commentsLoadError?: string;
  personnelPanelContent: ReactNode;
  paymentPanelContent: ReactNode;
  tasksPanelContent?: ReactNode;
  fileUploadPanelContent: ReactNode;
  commentComposerPanelContent: ReactNode;
};

type WorkspaceActionState = Pick<WorkspaceAction, "tone" | "statusLabel">;

function getTaskActionState({
  isPrintWorkflow,
  isActivePedido,
  status,
  progress,
  loadError,
}: {
  isPrintWorkflow: boolean;
  isActivePedido: boolean;
  status: PedidoStatus;
  progress: PedidoTasksProgress;
  loadError?: string;
}): WorkspaceActionState {
  if (isPrintWorkflow) {
    return {};
  }

  if (loadError) {
    return {
      tone: "danger",
      statusLabel: "No se pudieron cargar las tareas",
    };
  }

  if (isActivePedido && !progress.hasTasks) {
    return {
      tone: "warning",
      statusLabel: "Sin tareas registradas",
    };
  }

  if (status === "en_produccion" && progress.hasTasks && !progress.isComplete) {
    return {
      tone: "warning",
      statusLabel: "Tareas pendientes",
    };
  }

  if (progress.hasTasks && progress.isComplete) {
    return {
      tone: "success",
      statusLabel: "Tareas completadas",
    };
  }

  return {};
}

function getPaymentActionState(
  payment: InternalPedidoPayment,
): WorkspaceActionState {
  if (!payment.isAvailable) {
    return {
      tone: "danger",
      statusLabel: "Resumen financiero no disponible",
    };
  }

  if (payment.paymentStatus === "pagado") {
    return {
      tone: "success",
      statusLabel: "Pago completado",
    };
  }

  return {
    tone: "warning",
    statusLabel: "Pago pendiente",
  };
}

export function InternalPedidoDetail({
  pedido,
  updateStatusAction,
  taskProgress,
  tasksLoadError,
  tasks,
  history,
  historyLoadError,
  files,
  filesLoadError,
  comments,
  commentsLoadError,
  personnelPanelContent,
  paymentPanelContent,
  tasksPanelContent,
  fileUploadPanelContent,
  commentComposerPanelContent,
}: InternalPedidoDetailProps) {
  const isPrintWorkflow = pedido.workflow_type === WORKFLOW_TYPES.IMPRESION;
  const safeTaskProgress = taskProgress ?? EMPTY_PEDIDO_TASKS_PROGRESS;
  const isActivePedido = isPedidoActiveStatus(pedido.status);
  const today = getTodayDateInputValue();
  const estimatedDeliveryDate =
    pedido.estimated_delivery_date?.slice(0, 10) ?? null;
  const isEstimatedDeliveryOverdue =
    isActivePedido &&
    estimatedDeliveryDate !== null &&
    estimatedDeliveryDate < today;
  const taskActionState = getTaskActionState({
    isPrintWorkflow,
    isActivePedido,
    status: pedido.status,
    progress: safeTaskProgress,
    loadError: tasksLoadError,
  });
  const filesActionState: WorkspaceActionState = filesLoadError
    ? {
        tone: "danger",
        statusLabel: "No se pudieron cargar los archivos",
      }
    : {};
  const commentsActionState: WorkspaceActionState = commentsLoadError
    ? {
        tone: "danger",
        statusLabel: "No se pudieron cargar los comentarios",
      }
    : {};
  const personalActionState: WorkspaceActionState =
    isActivePedido && pedido.pedido_trabajadores.length === 0
      ? {
          tone: "warning",
          statusLabel: "Sin personal asignado",
        }
      : {};
  const paymentActionState = getPaymentActionState(pedido.payment);
  const historyActionState: WorkspaceActionState = historyLoadError
    ? {
        tone: "danger",
        statusLabel: "No se pudo cargar el historial",
      }
    : {};
  const compactActionIds = isPrintWorkflow
    ? ["estado", "archivos", "pagos"]
    : ["estado", "tareas", "archivos"];
  const workspaceActions: readonly WorkspaceAction[] = [
    {
      id: "estado",
      label: "Estado",
      icon: "estado",
      tone: isEstimatedDeliveryOverdue ? "warning" : undefined,
      statusLabel: isEstimatedDeliveryOverdue
        ? "Fecha estimada vencida"
        : undefined,
    },
    ...(!isPrintWorkflow && tasksPanelContent
      ? [
          {
            id: "tareas",
            label: "Tareas",
            icon: "tareas",
            ...taskActionState,
            badge:
              !tasksLoadError && safeTaskProgress.pendingTasks
                ? safeTaskProgress.pendingTasks
                : undefined,
          } satisfies WorkspaceAction,
        ]
      : []),
    {
      id: "archivos",
      label: "Archivos",
      icon: "archivos",
      ...filesActionState,
      badge: files.length > 0 ? files.length : undefined,
    },
    {
      id: "comentarios",
      label: "Comentarios",
      icon: "comentarios",
      ...commentsActionState,
      badge: comments.length > 0 ? comments.length : undefined,
    },
    {
      id: "personal",
      label: "Personal",
      icon: "personal",
      ...personalActionState,
      badge:
        pedido.pedido_trabajadores.length > 0
          ? pedido.pedido_trabajadores.length
          : undefined,
    },
    {
      id: "pagos",
      label: "Pagos",
      icon: "pagos",
      ...paymentActionState,
    },
    {
      id: "historial",
      label: "Historial",
      icon: "historial",
      ...historyActionState,
      badge: history.length > 0 ? history.length : undefined,
    },
    {
      id: "informacion",
      label: "Información",
      icon: "informacion",
    },
  ];
  const workspacePanels: Readonly<Record<string, WorkspacePanel>> = {
    estado: {
      id: "estado",
      title: "Estado",
      description:
        "Consulta el estado actual y aplica una transición permitida.",
      content: (
        <PedidoStatusForm
          presentation="panel"
          updateStatusAction={updateStatusAction}
          estadoActual={pedido.status}
          workflowType={pedido.workflow_type}
          paymentStatus={pedido.payment.paymentStatus}
          taskProgress={taskProgress}
          tasksLoadError={tasksLoadError}
        />
      ),
    },
    ...(tasksPanelContent
      ? {
          tareas: {
            id: "tareas",
            title: "Tareas",
            description:
              "Organiza el trabajo, actualiza cantidades y controla el avance.",
            content: tasksPanelContent,
          },
        }
      : {}),
    archivos: {
      id: "archivos",
      title: "Archivos",
      description:
        "Consulta los archivos asociados y agrega nuevos recursos al pedido.",
      contentMode: "fill",
      content: (
        <div className="flex h-full min-h-0 flex-col">
          <section
            aria-labelledby="pedido-files-list-title"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          >
            <h3
              id="pedido-files-list-title"
              className="text-base font-semibold text-text-primary"
            >
              Archivos asociados
            </h3>

            <div className="mt-4">
              <PedidoFilesPanel
                pedidoId={pedido.id}
                files={files}
                loadError={filesLoadError}
              />
            </div>
          </section>

          <div className="mt-4 shrink-0 border-t border-border pt-4">
            {fileUploadPanelContent}
          </div>
        </div>
      ),
    },
    comentarios: {
      id: "comentarios",
      title: "Comentarios",
      description:
        "Consulta la conversación interna y registra nuevas notas para el equipo.",
      contentMode: "fill",
      content: (
        <div className="flex h-full min-h-0 flex-col">
          <section
            aria-labelledby="pedido-comments-list-title"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          >
            <h3
              id="pedido-comments-list-title"
              className="text-base font-semibold text-text-primary"
            >
              Conversación interna
            </h3>

            <div className="mt-4">
              <PedidoCommentsPanel
                comments={comments}
                loadError={commentsLoadError}
              />
            </div>
          </section>

          <div className="mt-4 shrink-0 border-t border-border pt-4">
            {commentComposerPanelContent}
          </div>
        </div>
      ),
    },
    personal: {
      id: "personal",
      title: "Personal",
      description:
        "Consulta y administra las personas asignadas al pedido.",
      contentMode: "fill",
      content: personnelPanelContent,
    },
    pagos: {
      id: "pagos",
      title: "Pagos",
      description:
        "Consulta el resumen financiero y registra los importes recibidos.",
      content: paymentPanelContent,
    },
    historial: {
      id: "historial",
      title: "Historial",
      description: "Eventos operativos registrados para este pedido.",
      content: (
        <PedidoHistoryTimeline
          history={history}
          loadError={historyLoadError}
        />
      ),
    },
    informacion: {
      id: "informacion",
      title: "Información",
      description:
        "Datos completos del cliente, el origen y el registro del pedido.",
      content: <PedidoInformationPanel pedido={pedido} />,
    },
  };

  return (
    <WorkspaceController
      actions={workspaceActions}
      panels={workspacePanels}
      tabletActionIds={compactActionIds}
      mobileActionIds={compactActionIds}
    >
      <article>
        <WorkspaceShell
          hasActions
          desktopMode="contained"
          railPresentation="icons"
          header={<PedidoWorkspaceHeader pedido={pedido} />}
          main={
            <PedidoWorkspaceMain
              pedido={pedido}
              tasks={tasks}
              taskProgress={safeTaskProgress}
              tasksLoadError={tasksLoadError}
              files={files}
              filesLoadError={filesLoadError}
            />
          }
        />
      </article>
    </WorkspaceController>
  );
}
