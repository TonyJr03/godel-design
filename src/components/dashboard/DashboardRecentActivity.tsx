import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { ReadErrorAlert } from "@/components/ui/ReadErrorAlert";
import type {
  DashboardRecentActivityItem,
  GetDashboardRecentActivityResult,
} from "@/lib/dashboard";
import { formatAppDateTime } from "@/lib/utils";

import { DashboardSection } from "./DashboardSection";

type DashboardRecentActivityProps = {
  result: GetDashboardRecentActivityResult;
};

const SOURCE_LABELS: Record<DashboardRecentActivityItem["source"], string> = {
  pedido: "Pedido",
  solicitud: "Solicitud",
};

const sourceClasses: Record<DashboardRecentActivityItem["source"], string> = {
  pedido: "border-border bg-surface-muted text-text-primary",
  solicitud: "border-border bg-surface-muted text-text-primary",
};

function getWorkflowBorderClass(
  workflowType: DashboardRecentActivityItem["workflowType"],
) {
  return workflowType === "impresion"
    ? "border-l-brand-accent"
    : "border-l-info";
}

function getLinkLabel(source: DashboardRecentActivityItem["source"]): string {
  return source === "pedido" ? "Ver pedido" : "Ver solicitud";
}

export function DashboardRecentActivity({
  result,
}: DashboardRecentActivityProps) {
  if (!result.ok) {
    return (
      <ReadErrorAlert
        variant="warning"
        title="No se pudo cargar la actividad reciente"
        retryable={result.reason === "error"}
      >
        <p>{result.message}</p>
      </ReadErrorAlert>
    );
  }

  const isWorkerActivity = result.activity.kind === "worker";

  return (
    <DashboardSection
      title="Actividad reciente"
      description={
        isWorkerActivity
          ? "Últimos movimientos relevantes registrados en tus pedidos asignados."
          : "Últimos movimientos relevantes registrados en solicitudes y pedidos."
      }
    >
      {result.activity.items.length === 0 ? (
        <EmptyState
          title="Sin actividad reciente"
          description={
            isWorkerActivity
              ? "Sin actividad reciente en tus pedidos asignados."
              : "Todavía no hay movimientos recientes para mostrar."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft)">
          {result.activity.items.map((item, index) => (
            <article
              key={item.id}
              className={[
                "relative grid gap-3 border-l-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-5",
                getWorkflowBorderClass(item.workflowType),
                index > 0 ? "border-t border-t-border" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={[
                      "rounded-(--radius-control) border px-2.5 py-1 text-xs font-semibold",
                      sourceClasses[item.source],
                    ].join(" ")}
                  >
                    {SOURCE_LABELS[item.source]}
                  </span>
                  <time
                    dateTime={item.createdAt}
                    className="text-xs font-medium text-text-muted"
                  >
                    {formatAppDateTime(item.createdAt)}
                  </time>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-text-primary">
                  {item.title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-text-secondary">
                  {item.description}
                </p>
              </div>
              <Link
                href={item.href}
                aria-label={`${getLinkLabel(item.source)}: ${item.title}`}
                title={getLinkLabel(item.source)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center justify-self-start rounded-(--radius-control) border border-border-strong bg-surface text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:justify-self-end"
              >
                <ExternalLink
                  aria-hidden="true"
                  className="h-4 w-4"
                  strokeWidth={1.75}
                />
              </Link>
            </article>
          ))}
        </div>
      )}
    </DashboardSection>
  );
}
