import Link from "next/link";

import { EmptyState } from "@/components/ui/EmptyState";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
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
  isWorkerBoard: boolean;
  showProgress?: boolean;
};

const DASHBOARD_PEDIDO_SECTION_DISPLAY_LIMIT = 3;

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

function getEmptyMessage(
  group: DashboardPedidoBoardGroup,
  isWorkerBoard: boolean,
): string {
  if (group.key === "nuevos") {
    return isWorkerBoard
      ? "Sin pedidos nuevos asignados."
      : "Sin pedidos nuevos.";
  }

  if (group.key === "enRevision") {
    return isWorkerBoard
      ? "Sin pedidos asignados en revisión."
      : "Sin pedidos en revisión.";
  }

  return isWorkerBoard
    ? "Sin pedidos asignados en producción."
    : "Sin pedidos en producción.";
}

function hasActivePedidos(board: DashboardPedidoBoardData): boolean {
  return (
    board.nuevos.totalCount > 0 ||
    board.enRevision.totalCount > 0 ||
    board.enProduccion.totalCount > 0
  );
}

function getWorkflowCardClasses(pedido: DashboardPedidoWorkItem): string {
  if (pedido.workflowType === "impresion") {
    return "border-l-brand-accent";
  }

  return "border-l-info";
}

function getGroupMoreHref(group: DashboardPedidoBoardGroup): string {
  return group.key === "nuevos"
    ? "/dashboard/pedidos?status=nuevo"
    : group.moreHref;
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
    <div className="flex min-w-0 items-center gap-3">
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
      className={[
        "group block min-w-0 rounded-(--radius-card) border border-l-4 border-border bg-surface p-3 shadow-(--shadow-soft) transition-[background-color,box-shadow] duration-200 hover:bg-brand-primary-soft hover:shadow-(--shadow-soft) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        getWorkflowCardClasses(pedido),
      ].join(" ")}
    >
      <article className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
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
          <span className="shrink-0 text-xs font-semibold text-text-primary">
            Entrega: {formatDate(pedido.fechaEntregaEstimada)}
          </span>
        </div>

        <p
          className={[
            "mt-1 text-xs leading-5 text-text-secondary",
            variant === "wide" ? "line-clamp-2" : "line-clamp-1",
          ].join(" ")}
        >
          {getPedidoSubtitle(pedido)}
        </p>

        {showProgress ? (
          <div className="mt-2">
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
  isWorkerBoard,
  showProgress = false,
}: DashboardPedidoBoardSectionProps) {
  const visibleItems = group.items.slice(
    0,
    DASHBOARD_PEDIDO_SECTION_DISPLAY_LIMIT,
  );
  const visualMoreCount = Math.max(0, group.totalCount - visibleItems.length);

  return (
    <section
      aria-labelledby={`dashboard-pedido-board-${group.key}-title`}
      className="min-w-0 rounded-(--radius-card) border border-border bg-surface-muted p-3"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h3
          id={`dashboard-pedido-board-${group.key}-title`}
          className="min-w-0 text-base font-semibold text-text-primary"
        >
          {group.title}
        </h3>
        <span className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface px-2 text-xs font-bold text-text-primary">
          {group.totalCount.toLocaleString("es")}
        </span>
      </div>

      {visibleItems.length > 0 ? (
        <div className="mt-3 grid min-w-0 gap-2">
          {visibleItems.map((pedido) => (
            <DashboardPedidoCard
              key={pedido.id}
              pedido={pedido}
              variant={variant}
              showProgress={showProgress}
            />
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-(--radius-control) border border-border bg-surface px-3 py-2">
          <p className="text-sm text-text-secondary">
            {getEmptyMessage(group, isWorkerBoard)}
          </p>
        </div>
      )}

      {visualMoreCount > 0 ? (
        <Link
          href={getGroupMoreHref(group)}
          className="mt-3 inline-flex min-h-10 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          +{visualMoreCount.toLocaleString("es")} pedidos más
        </Link>
      ) : null}
    </section>
  );
}

export function DashboardPedidoBoard({ result }: DashboardPedidoBoardProps) {
  if (!result.ok) {
    return (
      <ReadErrorAlert
        variant="warning"
        title="No se pudo cargar el tablero de pedidos"
        retryable={result.reason === "error"}
      >
        <p>{result.message}</p>
      </ReadErrorAlert>
    );
  }

  const board = result.workItems.pedidoBoard;
  const isWorkerBoard = result.workItems.kind === "worker";
  const hasPedidos = hasActivePedidos(board);

  return (
    <section aria-labelledby="dashboard-pedido-board-title" className="min-w-0">
      <h2 id="dashboard-pedido-board-title" className="sr-only">
        {isWorkerBoard ? "Mis pedidos asignados" : "Pedidos activos"}
      </h2>

      {!hasPedidos ? (
        <EmptyState
          title={
            isWorkerBoard
              ? "No tienes pedidos activos asignados"
              : "No hay pedidos activos"
          }
          description={
            isWorkerBoard
              ? "No hay pedidos asignados que requieran seguimiento en este momento."
              : "No hay pedidos nuevos, en revisión ni en producción en este momento."
          }
          className="p-4 shadow-none"
        />
      ) : (
        <>
          <div className="grid min-w-0 gap-3 xl:grid-cols-2">
            <DashboardPedidoBoardSection
              group={board.nuevos}
              variant="compact"
              isWorkerBoard={isWorkerBoard}
            />
            <DashboardPedidoBoardSection
              group={board.enRevision}
              variant="compact"
              isWorkerBoard={isWorkerBoard}
            />
          </div>

          <div className="mt-3">
            <DashboardPedidoBoardSection
              group={board.enProduccion}
              variant="wide"
              isWorkerBoard={isWorkerBoard}
              showProgress
            />
          </div>
        </>
      )}
    </section>
  );
}
