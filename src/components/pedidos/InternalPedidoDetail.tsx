import Link from "next/link";
import type { ReactNode } from "react";

import type {
  PedidoDetailAction,
  UpdatePedidoStatusActionState,
} from "@/app/(interno)/dashboard/pedidos/[id]/actions";
import {
  DetailPanel,
  MetadataGrid,
  MetadataItem,
  StatusBadge,
} from "@/components/ui";
import {
  WorkspaceController,
  WorkspaceShell,
  type WorkspaceAction,
  type WorkspacePanel,
} from "@/components/workspace";
import type {
  InternalPedidoDetail as InternalPedidoDetailData,
  PedidoTask,
  PedidoTasksProgress,
} from "@/lib/pedidos";
import { EMPTY_PEDIDO_TASKS_PROGRESS } from "@/lib/pedidos";
import {
  SOLICITUD_STATUS_LABELS,
  getSolicitudServiceTypeLabel,
} from "@/lib/solicitudes";
import type { PedidoFileListItem } from "@/lib/storage";
import { formatAppDateTime } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/workflow-types";

import { PedidoStatusForm } from "./PedidoStatusForm";
import {
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
  files: readonly PedidoFileListItem[];
  filesLoadError?: string;
  workerAssignmentSection?: ReactNode;
  paymentSection?: ReactNode;
  tasksSection?: ReactNode;
  filesSection?: ReactNode;
  commentsSection?: ReactNode;
  historySection?: ReactNode;
};

const EMPTY_WORKSPACE_ACTIONS: readonly WorkspaceAction[] = [];
const EMPTY_WORKSPACE_PANELS: Readonly<Record<string, WorkspacePanel>> = {};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatShortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

function formatDate(value: string | null): string {
  return value ? DATE_FORMATTER.format(new Date(value)) : "No definida";
}

export function InternalPedidoDetail({
  pedido,
  updateStatusAction,
  taskProgress,
  tasksLoadError,
  tasks,
  files,
  filesLoadError,
  workerAssignmentSection,
  paymentSection,
  tasksSection,
  filesSection,
  commentsSection,
  historySection,
}: InternalPedidoDetailProps) {
  const isPrintWorkflow =
    pedido.workflow_type === WORKFLOW_TYPES.IMPRESION;
  const safeTaskProgress = taskProgress ?? EMPTY_PEDIDO_TASKS_PROGRESS;

  return (
    <WorkspaceController
      actions={EMPTY_WORKSPACE_ACTIONS}
      panels={EMPTY_WORKSPACE_PANELS}
    >
      <article className="space-y-8">
        <WorkspaceShell
          hasActions={false}
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
        />

        <section
          aria-labelledby="pedido-management-title"
          className="min-w-0 space-y-6"
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
              {historySection}
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

              <div className="order-3 space-y-6 xl:block">
                <DetailPanel
                  title="Cliente"
                  description="Contacto asociado al pedido."
                >
                  {pedido.clientes ? (
                    <MetadataGrid className="sm:grid-cols-1">
                      <MetadataItem
                        label="Nombre"
                        value={
                          <Link
                            href={`/dashboard/clientes/${pedido.clientes.id}`}
                            className="inline-flex min-h-11 items-center font-semibold text-brand-primary underline-offset-4 hover:underline"
                          >
                            {pedido.clientes.name}
                          </Link>
                        }
                      />
                      <MetadataItem
                        label="Teléfono"
                        value={pedido.clientes.phone}
                      />
                      <MetadataItem
                        label="Correo electrónico"
                        value={pedido.clientes.email ?? "No definido"}
                      />
                    </MetadataGrid>
                  ) : (
                    <p className="text-sm leading-6 text-text-secondary">
                      {pedido.cliente_id
                        ? "El pedido tiene un cliente asociado, pero sus datos no están disponibles."
                        : "Este pedido no tiene cliente asociado."}
                    </p>
                  )}
                </DetailPanel>

                <DetailPanel
                  title="Solicitud de origen"
                  description="Referencia de entrada del trabajo."
                >
                  {pedido.solicitudes ? (
                    <MetadataGrid className="sm:grid-cols-1">
                      <MetadataItem
                        label="Servicio"
                        value={
                          <Link
                            href={`/dashboard/solicitudes/${pedido.solicitudes.id}`}
                            className="inline-flex min-h-11 items-center font-semibold text-brand-primary underline-offset-4 hover:underline"
                          >
                            {getSolicitudServiceTypeLabel(
                              pedido.solicitudes.service_type,
                            )}
                          </Link>
                        }
                      />
                      <MetadataItem
                        label="Tipo de solicitud"
                        value={
                          WORKFLOW_TYPE_LABELS[
                            pedido.solicitudes.workflow_type
                          ]
                        }
                      />
                      <MetadataItem
                        label="Cliente capturado"
                        value={pedido.solicitudes.client_name}
                      />
                      <MetadataItem
                        label="Estado"
                        value={
                          <StatusBadge
                            status={pedido.solicitudes.status}
                            label={
                              SOLICITUD_STATUS_LABELS[
                                pedido.solicitudes.status
                              ]
                            }
                          />
                        }
                      />
                      <MetadataItem
                        label="Fecha deseada"
                        value={formatDate(pedido.solicitudes.desired_date)}
                      />
                      <MetadataItem
                        label="Descripción original"
                        value={
                          <span className="whitespace-pre-line">
                            {pedido.solicitudes.description}
                          </span>
                        }
                      />
                    </MetadataGrid>
                  ) : (
                    <p className="text-sm leading-6 text-text-secondary">
                      {pedido.solicitud_id
                        ? "La solicitud asociada no está disponible para mostrar."
                        : "Pedido creado manualmente, sin solicitud de origen."}
                    </p>
                  )}
                </DetailPanel>

                <DetailPanel
                  title="Metadata"
                  description="Información técnica secundaria."
                >
                  <MetadataGrid className="sm:grid-cols-1">
                    <MetadataItem
                      label="Referencia interna"
                      value={formatShortReference(pedido.id)}
                    />
                    <MetadataItem
                      label="Creación"
                      value={formatAppDateTime(
                        pedido.created_at,
                        "No definida",
                      )}
                    />
                    <MetadataItem
                      label="Entrega real"
                      value={formatDate(pedido.actual_delivery_date)}
                    />
                    <MetadataItem
                      label="Creado por"
                      value={pedido.creador?.full_name ?? "No definido"}
                    />
                    <MetadataItem
                      label="Última actualización"
                      value={formatAppDateTime(
                        pedido.updated_at,
                        "No definida",
                      )}
                    />
                    <MetadataItem
                      label="Identificador interno"
                      value={
                        <span className="break-all font-mono text-xs text-text-secondary">
                          {pedido.id}
                        </span>
                      }
                    />
                  </MetadataGrid>
                </DetailPanel>
              </div>
            </aside>
          </div>
        </section>
      </article>
    </WorkspaceController>
  );
}
