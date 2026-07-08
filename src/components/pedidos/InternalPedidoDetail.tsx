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
  PedidoHistoryItem,
  PedidoTask,
  PedidoTasksProgress,
} from "@/lib/pedidos";
import { EMPTY_PEDIDO_TASKS_PROGRESS } from "@/lib/pedidos";
import type { PedidoFileListItem } from "@/lib/storage";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

import { PedidoStatusForm } from "./PedidoStatusForm";
import {
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
  workerAssignmentSection?: ReactNode;
  paymentSection?: ReactNode;
  tasksSection?: ReactNode;
  filesSection?: ReactNode;
  commentsSection?: ReactNode;
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
  workerAssignmentSection,
  paymentSection,
  tasksSection,
  filesSection,
  commentsSection,
}: InternalPedidoDetailProps) {
  const isPrintWorkflow = pedido.workflow_type === WORKFLOW_TYPES.IMPRESION;
  const safeTaskProgress = taskProgress ?? EMPTY_PEDIDO_TASKS_PROGRESS;
  const workspaceActions: readonly WorkspaceAction[] = [
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
      tabletActionIds={["historial", "informacion"]}
      mobileActionIds={["historial", "informacion"]}
    >
      <article>
        <WorkspaceShell
          hasActions
          header={<PedidoWorkspaceHeader pedido={pedido} />}
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
            aria-labelledby="pedido-management-title"
            className="min-w-0 space-y-6 pt-3"
          >
            <div className="min-w-0">
              <h2
                id="pedido-management-title"
                className="text-2xl font-semibold tracking-tight text-text-primary"
              >
                Gestión del pedido
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
                Administra el estado, las tareas, los archivos y el seguimiento
                interno.
              </p>
            </div>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="order-2 min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
                {!isPrintWorkflow ? tasksSection : null}
                {filesSection}
                {commentsSection}
              </div>

              <aside className="contents min-w-0 xl:col-start-2 xl:row-start-1 xl:block xl:space-y-6">
                <div className="order-1 space-y-6 xl:block">
                  <PedidoStatusForm
                    updateStatusAction={updateStatusAction}
                    estadoActual={pedido.status}
                    workflowType={pedido.workflow_type}
                    paymentStatus={pedido.payment.paymentStatus}
                    taskProgress={taskProgress}
                    tasksLoadError={tasksLoadError}
                  />

                  {paymentSection}

                  {workerAssignmentSection}
                </div>
              </aside>
            </div>
          </section>
        </WorkspaceShell>
      </article>
    </WorkspaceController>
  );
}
