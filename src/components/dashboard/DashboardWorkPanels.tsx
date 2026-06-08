import Link from "next/link";

import type {
  DashboardPedidoWorkItem,
  DashboardPendingSolicitudItem,
  GetDashboardWorkItemsResult,
} from "@/lib/dashboard";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";

import { DashboardSection } from "./DashboardSection";

type DashboardWorkPanelsProps = {
  result: GetDashboardWorkItemsResult;
};

type AttentionTone = "info" | "warning" | "danger" | "success";

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getSolicitudReference(id: string): string {
  return `Solicitud ${id.slice(0, 8)}`;
}

function getPedidoAttention(
  item: DashboardPedidoWorkItem,
): { label: string; tone: AttentionTone } | null {
  if (item.attention.isPendingReview) {
    return { label: "Pendiente de revisión", tone: "warning" };
  }

  if (item.attention.isOverdue) {
    return { label: "Entrega atrasada", tone: "danger" };
  }

  if (item.attention.isDueSoon) {
    return { label: "Entrega próxima", tone: "warning" };
  }

  if (item.attention.isReviewWithoutTasks) {
    return { label: "Sin tareas", tone: "warning" };
  }

  if (item.attention.isProductionWithPendingTasks) {
    return { label: "Tareas pendientes", tone: "info" };
  }

  if (item.attention.isReadyForDelivery) {
    return { label: "Listo para entrega", tone: "success" };
  }

  return null;
}

function getPedidoProgressLabel(item: DashboardPedidoWorkItem): string {
  if (!item.progress.hasTasks) {
    return "Sin tareas registradas";
  }

  if (item.progress.isComplete) {
    return `${item.progress.completedTasks} de ${item.progress.totalTasks} tareas completadas`;
  }

  return `${item.progress.progressPercentage}% completado · ${item.progress.pendingTasks} pendientes`;
}

const attentionClasses: Record<AttentionTone, string> = {
  info: "border-info/30 bg-info-soft text-info",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  success: "border-success/30 bg-success-soft text-success",
};

const actionLinkClasses =
  "inline-flex min-h-10 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft";

function SolicitudesList({
  solicitudes,
}: {
  solicitudes: DashboardPendingSolicitudItem[];
}) {
  if (solicitudes.length === 0) {
    return (
      <EmptyState
        title="Solicitudes al día"
        description="No hay solicitudes pendientes por revisar."
      />
    );
  }

  return (
    <div className="grid gap-3">
      {solicitudes.map((solicitud) => (
        <Card
          as="article"
          key={solicitud.id}
          padding="sm"
          className="shadow-(--shadow-soft)"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                {getSolicitudReference(solicitud.id)}
              </p>
              <p className="mt-1 text-base font-semibold text-text-primary">
                {solicitud.clienteNombre}
              </p>
            </div>
            <StatusBadge status={solicitud.status} />
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Servicio
              </dt>
              <dd className="mt-1 text-text-primary">
                {solicitud.tipoServicio}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Fecha deseada
              </dt>
              <dd className="mt-1 text-text-primary">
                {formatDate(solicitud.fechaDeseada)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Contacto
              </dt>
              <dd className="mt-1 text-text-primary">
                {solicitud.clienteTelefono}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                Recibida
              </dt>
              <dd className="mt-1 text-text-primary">
                {formatDate(solicitud.createdAt)}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex justify-end border-t border-border pt-4">
            <Link href={solicitud.href} className={actionLinkClasses}>
              Ver solicitud
            </Link>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PedidosList({
  pedidos,
  emptyMessage,
}: {
  pedidos: DashboardPedidoWorkItem[];
  emptyMessage: string;
}) {
  if (pedidos.length === 0) {
    return (
      <EmptyState
        title="Sin pedidos pendientes"
        description={emptyMessage}
      />
    );
  }

  return (
    <div className="grid gap-3">
      {pedidos.map((pedido) => {
        const attention = getPedidoAttention(pedido);

        return (
          <Card
            as="article"
            key={pedido.id}
            padding="sm"
            className="shadow-(--shadow-soft)"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-primary">
                  {pedido.numeroPedido}
                </p>
                <h3 className="mt-1 text-base font-semibold text-text-primary">
                  {pedido.title}
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {pedido.clienteNombre ?? "Sin cliente asociado"}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusBadge status={pedido.status} />
                <PriorityBadge priority={pedido.priority} />
              </div>
            </div>

            {attention ? (
              <p
                className={[
                  "mt-4 inline-flex rounded-(--radius-control) border px-2.5 py-1 text-xs font-semibold",
                  attentionClasses[attention.tone],
                ].join(" ")}
              >
                {attention.label}
              </p>
            ) : null}

            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Progreso
                </dt>
                <dd className="mt-1 text-text-primary">
                  {getPedidoProgressLabel(pedido)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Entrega estimada
                </dt>
                <dd className="mt-1 text-text-primary">
                  {formatDate(pedido.fechaEntregaEstimada)}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex justify-end border-t border-border pt-4">
              <Link href={pedido.href} className={actionLinkClasses}>
                Ver pedido
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function DashboardWorkPanels({ result }: DashboardWorkPanelsProps) {
  if (!result.ok) {
    return (
      <Alert
        variant="warning"
        title="No se pudieron cargar los paneles operativos"
      >
        <p>
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </Alert>
    );
  }

  if (result.workItems.kind === "worker") {
    return (
      <DashboardSection
        title="Trabajo que requiere seguimiento"
        description="Pedidos asignados ordenados según la atención operativa que necesitan."
      >
        <PedidosList
          pedidos={result.workItems.pedidosAsignados}
          emptyMessage="No tienes pedidos asignados que requieran atención."
        />
      </DashboardSection>
    );
  }

  return (
    <section aria-labelledby="dashboard-work-title">
      <div className="max-w-3xl">
        <h2
          id="dashboard-work-title"
          className="text-xl font-semibold tracking-tight text-text-primary"
        >
          Trabajo pendiente
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Accesos directos a las solicitudes y pedidos que necesitan una
          decisión o seguimiento.
        </p>
      </div>

      <div className="mt-4 grid gap-8 xl:grid-cols-2">
        <DashboardSection
          title="Solicitudes pendientes"
          description="Solicitudes nuevas, en revisión, contactadas o aprobadas sin convertir."
        >
          <SolicitudesList
            solicitudes={result.workItems.solicitudesPendientes}
          />
        </DashboardSection>
        <DashboardSection
          title="Pedidos que requieren atención"
          description="Pedidos priorizados por revisión, fechas, tareas y estado de entrega."
        >
          <PedidosList
            pedidos={result.workItems.pedidosAtencion}
            emptyMessage="No hay pedidos que requieran atención inmediata."
          />
        </DashboardSection>
      </div>
    </section>
  );
}
