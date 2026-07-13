import Link from "next/link";

import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import type {
  DashboardPedidoWorkItem,
  GetDashboardWorkItemsResult,
} from "@/lib/dashboard";

type DashboardReadyOrdersPanelProps = {
  result: GetDashboardWorkItemsResult;
};

function getWorkflowCardClasses(
  workflowType: DashboardPedidoWorkItem["workflowType"],
) {
  return workflowType === "impresion"
    ? "border-l-brand-accent"
    : "border-l-info";
}

function formatDate(value: string | null): string {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function getPedidoSubtitle(pedido: DashboardPedidoWorkItem): string {
  if (pedido.clienteNombre && pedido.descriptionSnippet) {
    return `${pedido.clienteNombre} · ${pedido.descriptionSnippet}`;
  }

  return (
    pedido.clienteNombre ??
    pedido.descriptionSnippet ??
    "Sin cliente asociado"
  );
}

function DashboardReadyOrderProgress({
  pedido,
}: {
  pedido: DashboardPedidoWorkItem;
}) {
  if (!pedido.progress.hasTasks) {
    return null;
  }

  const progressPercentage = Math.max(
    0,
    Math.min(100, pedido.progress.progressPercentage),
  );

  return (
    <div className="mt-3 flex min-w-0 items-center gap-3">
      <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand-primary"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-medium text-text-secondary">
        {`${pedido.progress.progressPercentage}% · ${pedido.progress.completedTasks}/${pedido.progress.totalTasks}`}
      </span>
    </div>
  );
}

function DashboardReadyOrderCard({
  pedido,
}: {
  pedido: DashboardPedidoWorkItem;
}) {
  return (
    <Link
      href={pedido.href}
      aria-label={`Abrir pedido ${pedido.numeroPedido}`}
      className={[
        "group block min-w-0 rounded-(--radius-card) border border-l-4 border-border bg-surface p-4 shadow-(--shadow-soft) transition-[background-color,box-shadow] duration-200 hover:bg-brand-primary-soft hover:shadow-(--shadow-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        getWorkflowCardClasses(pedido.workflowType),
      ].join(" ")}
    >
      <article className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-primary">
              {pedido.numeroPedido}
            </p>
            <h3 className="mt-1 line-clamp-2 text-base font-semibold text-text-primary transition-colors duration-200 group-hover:text-brand-primary">
              {pedido.title}
            </h3>
          </div>
          <span className="shrink-0 text-xs font-semibold text-text-primary">
            Entrega: {formatDate(pedido.fechaEntregaEstimada)}
          </span>
        </div>

        <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-secondary">
          {getPedidoSubtitle(pedido)}
        </p>

        <DashboardReadyOrderProgress pedido={pedido} />
      </article>
    </Link>
  );
}

export function DashboardReadyOrdersPanel({
  result,
}: DashboardReadyOrdersPanelProps) {
  if (!result.ok) {
    return (
      <Alert
        variant="warning"
        title="No se pudieron cargar los pedidos listos"
      >
        <p>
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </Alert>
    );
  }

  const group = result.workItems.pedidoBoard.listosEntrega;

  if (group.items.length === 0) {
    return (
      <EmptyState
        title="Sin pedidos listos"
        description="No hay pedidos listos para entrega en este momento."
        variant="search"
        className="p-4 shadow-none"
      />
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="grid min-w-0 gap-3">
        {group.items.map((pedido) => (
          <DashboardReadyOrderCard key={pedido.id} pedido={pedido} />
        ))}
      </div>

      {group.moreCount > 0 ? (
        <Link
          href={group.moreHref}
          className="inline-flex min-h-10 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          +{group.moreCount.toLocaleString("es")} pedidos más
        </Link>
      ) : null}
    </div>
  );
}
