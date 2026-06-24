import Link from "next/link";
import type { ReactNode } from "react";

import type {
  PedidoDetailAction,
  UpdatePedidoStatusActionState,
} from "@/app/dashboard/pedidos/[id]/actions";
import { CopyableCode } from "@/components/common/CopyableCode";
import {
  DetailPanel,
  MetadataGrid,
  MetadataItem,
  PriorityBadge,
  StatusBadge,
} from "@/components/ui";
import type {
  InternalPedidoDetail as InternalPedidoDetailData,
  PedidoStatusTransitionContext,
} from "@/lib/pedidos";
import {
  SOLICITUD_STATUS_LABELS,
  getSolicitudServiceTypeLabel,
} from "@/lib/solicitudes";
import { formatAppDateTime } from "@/lib/utils";
import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/workflow-types";
import { PedidoWorkflowTypeBadge } from "./PedidoWorkflowTypeBadge";
import { PedidoStatusForm } from "./PedidoStatusForm";

type InternalPedidoDetailProps = {
  pedido: InternalPedidoDetailData;
  updateStatusAction: PedidoDetailAction<UpdatePedidoStatusActionState>;
  taskProgress?: PedidoStatusTransitionContext | null;
  tasksLoadError?: string;
  workerAssignmentSection?: ReactNode;
  paymentSection?: ReactNode;
  tasksSection?: ReactNode;
  filesSection?: ReactNode;
  commentsSection?: ReactNode;
  historySection?: ReactNode;
};

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

function getProgressLabel(
  progress: PedidoStatusTransitionContext | null | undefined,
) {
  if (!progress?.hasTasks) {
    return "Sin tareas";
  }

  return progress.isComplete
    ? "Tareas completadas"
    : `${Math.round(progress.progressPercentage)}% completado`;
}

export function InternalPedidoDetail({
  pedido,
  updateStatusAction,
  taskProgress,
  tasksLoadError,
  workerAssignmentSection,
  paymentSection,
  tasksSection,
  filesSection,
  commentsSection,
  historySection,
}: InternalPedidoDetailProps) {
  const isPrintWorkflow =
    pedido.workflow_type === WORKFLOW_TYPES.IMPRESION;

  return (
    <article className="space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-sm font-semibold text-brand-primary">
              {pedido.order_number}
            </p>
            <PedidoWorkflowTypeBadge workflowType={pedido.workflow_type} />
            <StatusBadge status={pedido.status} />
            <PriorityBadge priority={pedido.priority} />
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">
            Detalle del pedido
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-text-secondary">
            Consulta la información del trabajo y su seguimiento operativo.
          </p>
        </div>
        <Link
          href="/dashboard/pedidos"
          className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
        >
          Volver a pedidos
        </Link>
      </header>

      <CopyableCode
        code={pedido.public_reference}
        helperText="Comparte este código con el cliente para consultar el estado público. El número de pedido se mantiene como referencia operativa interna."
        className="border-brand-primary/20 bg-brand-primary-soft"
      />

      <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
        <MetadataGrid className="lg:grid-cols-5">
          <MetadataItem
            label="Cliente"
            value={pedido.clientes?.name ?? "Sin cliente asociado"}
          />
          <MetadataItem
            label="Tipo de pedido"
            value={WORKFLOW_TYPE_LABELS[pedido.workflow_type]}
          />
          <MetadataItem
            label={isPrintWorkflow ? "Operación" : "Progreso"}
            value={
              isPrintWorkflow
                ? "Flujo directo de impresión"
                : getProgressLabel(taskProgress)
            }
          />
          <MetadataItem
            label="Entrega estimada"
            value={formatDate(pedido.estimated_delivery_date)}
          />
          <MetadataItem
            label="Personal asignado"
            value={
              pedido.pedido_trabajadores.length > 0
                ? pedido.pedido_trabajadores
                    .map(
                      (assignment) =>
                        assignment.perfiles?.full_name ?? "Perfil no disponible",
                    )
                    .join(", ")
                : "Sin personal asignado"
            }
          />
        </MetadataGrid>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
          <DetailPanel
            title={
              isPrintWorkflow
                ? "Datos del pedido de impresión"
                : "Datos del encargo"
            }
            description={
              isPrintWorkflow
                ? "Especificaciones registradas para preparar este pedido de impresión."
                : "Título y descripción operativa del trabajo solicitado."
            }
          >
            <h3 className="text-xl font-semibold text-text-primary">
              {pedido.title}
            </h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
              {pedido.description}
            </p>
          </DetailPanel>

          {isPrintWorkflow ? (
            <section className="rounded-(--radius-card) border border-brand-accent/30 bg-brand-accent-soft p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-text-primary">
                Flujo directo de impresión
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Las tareas detalladas no se muestran como bloque principal para
                este tipo de pedido en esta etapa.
              </p>
            </section>
          ) : (
            tasksSection
          )}
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
              taskProgress={taskProgress}
              tasksLoadError={tasksLoadError}
            />

            {paymentSection}

            {workerAssignmentSection}
          </div>

          <div className="order-3 space-y-6 xl:block">
            <DetailPanel title="Cliente" description="Contacto asociado al pedido.">
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
                <MetadataItem label="Teléfono" value={pedido.clientes.phone} />
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
                        SOLICITUD_STATUS_LABELS[pedido.solicitudes.status]
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

            <DetailPanel title="Metadata" description="Información técnica secundaria.">
            <MetadataGrid className="sm:grid-cols-1">
              <MetadataItem
                label="Referencia interna"
                value={formatShortReference(pedido.id)}
              />
              <MetadataItem
                label="Creación"
                value={formatAppDateTime(pedido.created_at, "No definida")}
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
                value={formatAppDateTime(pedido.updated_at, "No definida")}
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
    </article>
  );
}
