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
  PedidoComment,
  PedidoHistoryItem,
  PedidoTask,
  PedidoTasksProgress,
} from "@/lib/pedidos";
import { EMPTY_PEDIDO_TASKS_PROGRESS } from "@/lib/pedidos";
import type { PedidoFileListItem } from "@/lib/storage";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

import { PedidoStatusForm } from "./PedidoStatusForm";
import {
  getPedidoPrimaryWorkspaceAction,
  PedidoCommentsPanel,
  PedidoFilesPanel,
  PedidoHistoryTimeline,
  PedidoInformationPanel,
  PedidoWorkspaceHeader,
  PedidoWorkspaceMain,
  PedidoWorkspaceSummary,
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
  personnelPanelContent?: ReactNode;
  paymentPanelContent?: ReactNode;
  tasksPanelContent?: ReactNode;
  fileUploadSection?: ReactNode;
  commentComposerSection?: ReactNode;
};

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
  fileUploadSection,
  commentComposerSection,
}: InternalPedidoDetailProps) {
  const isPrintWorkflow = pedido.workflow_type === WORKFLOW_TYPES.IMPRESION;
  const safeTaskProgress = taskProgress ?? EMPTY_PEDIDO_TASKS_PROGRESS;
  const primaryAction = getPedidoPrimaryWorkspaceAction({
    pedido,
    taskProgress,
    tasksLoadError,
  });
  const compactActionIds = isPrintWorkflow
    ? ["estado", "archivos", "pagos"]
    : ["estado", "tareas", "archivos"];
  const workspaceActions: readonly WorkspaceAction[] = [
    {
      id: "estado",
      label: "Estado",
      icon: "estado",
    },
    ...(!isPrintWorkflow && tasksPanelContent
      ? [
          {
            id: "tareas",
            label: "Tareas",
            icon: "tareas",
            badge:
              !tasksLoadError && taskProgress?.pendingTasks
                ? taskProgress.pendingTasks
                : undefined,
          } satisfies WorkspaceAction,
        ]
      : []),
    {
      id: "archivos",
      label: "Archivos",
      icon: "archivos",
      badge: files.length > 0 ? files.length : undefined,
    },
    {
      id: "comentarios",
      label: "Comentarios",
      icon: "comentarios",
      badge: comments.length > 0 ? comments.length : undefined,
    },
    {
      id: "personal",
      label: "Personal",
      icon: "personal",
      badge:
        pedido.pedido_trabajadores.length > 0
          ? pedido.pedido_trabajadores.length
          : undefined,
    },
    {
      id: "pagos",
      label: "Pagos",
      icon: "pagos",
      tone:
        pedido.payment.isAvailable &&
        pedido.payment.paymentStatus === "pagado"
          ? "success"
          : "warning",
    },
    {
      id: "historial",
      label: "Historial",
      icon: "historial",
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
      description: "Archivos privados y entregables asociados al pedido.",
      content: (
        <PedidoFilesPanel
          pedidoId={pedido.id}
          files={files}
          loadError={filesLoadError}
        />
      ),
    },
    comentarios: {
      id: "comentarios",
      title: "Comentarios",
      description: "Notas internas compartidas por el equipo.",
      content: (
        <PedidoCommentsPanel
          comments={comments}
          loadError={commentsLoadError}
        />
      ),
    },
    personal: {
      id: "personal",
      title: "Personal",
      description:
        "Consulta y administra las personas asignadas al pedido.",
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
      primaryActionId={primaryAction?.id}
      tabletActionIds={compactActionIds}
      mobileActionIds={compactActionIds}
    >
      <article>
        <WorkspaceShell
          hasActions
          header={
            <PedidoWorkspaceHeader
              pedido={pedido}
              primaryActionLabel={primaryAction?.label}
            />
          }
          summary={
            <PedidoWorkspaceSummary
              pedido={pedido}
              taskProgress={taskProgress}
              tasksLoadError={tasksLoadError}
              filesLoadError={filesLoadError}
            />
          }
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
        >
          <section
            aria-labelledby="pedido-contributions-title"
            className="min-w-0 space-y-6 pt-3"
          >
            <div className="min-w-0">
              <h2
                id="pedido-contributions-title"
                className="text-2xl font-semibold tracking-tight text-text-primary"
              >
                Aportes al pedido
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
                Sube nuevos archivos y registra comentarios internos para el
                equipo.
              </p>
            </div>

            <div className="grid items-start gap-6 xl:grid-cols-2">
              {fileUploadSection}
              {commentComposerSection}
            </div>
          </section>
        </WorkspaceShell>
      </article>
    </WorkspaceController>
  );
}
