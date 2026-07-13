import Link from "next/link";

import { Alert } from "@/components/ui/Alert";
import type {
  DashboardPedidoBoard as DashboardPedidoBoardData,
  DashboardPedidoBoardGroup,
  DashboardPedidoWorkItem,
  GetDashboardWorkItemsResult,
} from "@/lib/dashboard";

type DashboardPedidoBoardProps = {
  result: GetDashboardWorkItemsResult;
};

type DashboardPedidoBoardSectionVariant = "compact" | "wide";

type DashboardPedidoBoardSectionProps = {
  group: DashboardPedidoBoardGroup;
  variant: DashboardPedidoBoardSectionVariant;
  showProgress?: boolean;
};

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

function getPaymentLabel(pedido: DashboardPedidoWorkItem): string {
  if (!pedido.payment.isAvailable) {
    return "Sin pago";
  }

  if (pedido.payment.paymentStatus === "pagado") {
    return "Pagado";
  }

  if (pedido.payment.paymentStatus === "parcial") {
    return "Parcial";
  }

  return "Pendiente";
}

function getPaymentClasses(pedido: DashboardPedidoWorkItem): string {
  if (!pedido.payment.isAvailable) {
    return "border-warning/30 bg-warning-soft text-text-primary";
  }

  if (pedido.payment.paymentStatus === "pagado") {
    return "border-success/30 bg-success-soft text-success";
  }

  if (pedido.payment.paymentStatus === "parcial") {
    return "border-warning/30 bg-warning-soft text-text-primary";
  }

  return "border-danger/30 bg-danger-soft text-danger";
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

function getEmptyMessage(group: DashboardPedidoBoardGroup): string {
  if (group.key === "nuevos") {
    return "Sin pedidos nuevos.";
  }

  if (group.key === "enRevision") {
    return "Sin pedidos en revisión.";
  }

  return "Sin pedidos en producción.";
}

function hasActivePedidos(board: DashboardPedidoBoardData): boolean {
  return (
    board.nuevos.totalCount > 0 ||
    board.enRevision.totalCount > 0 ||
    board.enProduccion.totalCount > 0
  );
}

function DashboardPedidoProgress({
  pedido,
}: {
  pedido: DashboardPedidoWorkItem;
}) {
  if (!pedido.progress.hasTasks) {
    return (
      <p className="text-xs font-medium text-text-secondary">
        Sin tareas registradas
      </p>
    );
  }

  const progressPercentage = Math.max(
    0,
    Math.min(100, pedido.progress.progressPercentage),
  );

  return (
    <div className="space-y-2">
      <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-brand-primary"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      <p className="text-xs font-medium text-text-secondary">
        {pedido.progress.progressPercentage}% ·{" "}
        {pedido.progress.completedTasks}/{pedido.progress.totalTasks} tareas
      </p>
    </div>
  );
}

function DashboardPedidoCard({
  pedido,
  variant,
  showProgress = false,
}: {
  pedido: DashboardPedidoWorkItem;
  variant: DashboardPedidoBoardSectionVariant;
  showProgress?: boolean;
}) {
  return (
    <Link
      href={pedido.href}
      aria-label={`Abrir pedido ${pedido.numeroPedido}`}
      className="group block min-w-0 rounded-(--radius-card) border border-border bg-surface p-4 shadow-(--shadow-soft) transition-[background-color,border-color,box-shadow] duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-primary">
              {pedido.numeroPedido}
            </p>
            <h3
              className={[
                "mt-1 font-semibold text-text-primary transition-colors duration-200 group-hover:text-brand-primary",
                variant === "wide"
                  ? "line-clamp-2 text-base"
                  : "line-clamp-1 text-sm",
              ].join(" ")}
            >
              {pedido.title}
            </h3>
          </div>
          <span
            className={[
              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
              getPaymentClasses(pedido),
            ].join(" ")}
          >
            {getPaymentLabel(pedido)}
          </span>
        </div>

        <p
          className={[
            "mt-3 text-sm leading-6 text-text-secondary",
            variant === "wide" ? "line-clamp-2" : "line-clamp-1",
          ].join(" ")}
        >
          {getPedidoSubtitle(pedido)}
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
          <span className="font-medium text-text-primary">
            Entrega: {formatDate(pedido.fechaEntregaEstimada)}
          </span>
        </div>

        {showProgress ? (
          <div className="mt-4">
            <DashboardPedidoProgress pedido={pedido} />
          </div>
        ) : null}
      </article>
    </Link>
  );
}

function DashboardPedidoBoardSection({
  group,
  variant,
  showProgress = false,
}: DashboardPedidoBoardSectionProps) {
  return (
    <section
      aria-labelledby={`dashboard-pedido-board-${group.key}-title`}
      className="min-w-0 rounded-(--radius-card) border border-border bg-surface-muted p-4"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            id={`dashboard-pedido-board-${group.key}-title`}
            className="text-base font-semibold text-text-primary"
          >
            {group.title}
          </h3>
          <p className="mt-1 text-xs font-medium text-text-secondary">
            {group.totalCount.toLocaleString("es")} en seguimiento
          </p>
        </div>
        <span className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface px-2 text-xs font-bold text-text-primary">
          {group.totalCount.toLocaleString("es")}
        </span>
      </div>

      {group.items.length > 0 ? (
        <div className="mt-4 grid min-w-0 gap-3">
          {group.items.map((pedido) => (
            <DashboardPedidoCard
              key={pedido.id}
              pedido={pedido}
              variant={variant}
              showProgress={showProgress}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-(--radius-control) border border-border bg-surface px-4 py-3">
          <p className="text-sm text-text-secondary">
            {getEmptyMessage(group)}
          </p>
        </div>
      )}

      {group.moreCount > 0 ? (
        <Link
          href={group.moreHref}
          className="mt-4 inline-flex min-h-10 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          +{group.moreCount.toLocaleString("es")} pedidos más
        </Link>
      ) : null}
    </section>
  );
}

export function DashboardPedidoBoard({ result }: DashboardPedidoBoardProps) {
  if (!result.ok) {
    return (
      <Alert
        variant="warning"
        title="No se pudo cargar el tablero de pedidos"
      >
        <p>
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </Alert>
    );
  }

  const board = result.workItems.pedidoBoard;
  const hasPedidos = hasActivePedidos(board);

  return (
    <section aria-labelledby="dashboard-pedido-board-title" className="min-w-0">
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary">
          Atención principal
        </p>
        <h2
          id="dashboard-pedido-board-title"
          className="mt-2 text-xl font-semibold tracking-tight text-text-primary"
        >
          Pedidos activos
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Prioriza pedidos nuevos, en revisión y en producción sin abrir
          métricas secundarias.
        </p>
      </div>

      {!hasPedidos ? (
        <div className="mt-5 rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3">
          <p className="text-sm text-text-secondary">
            No hay pedidos activos en seguimiento.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">
        <DashboardPedidoBoardSection
          group={board.nuevos}
          variant="compact"
        />
        <DashboardPedidoBoardSection
          group={board.enRevision}
          variant="compact"
        />
      </div>

      <div className="mt-4">
        <DashboardPedidoBoardSection
          group={board.enProduccion}
          variant="wide"
          showProgress
        />
      </div>
    </section>
  );
}
