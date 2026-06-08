import Link from "next/link";

import type {
  DashboardRecentActivityItem,
  GetDashboardRecentActivityResult,
} from "@/lib/dashboard";
import { formatAppDateTime } from "@/lib/utils";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";

import { DashboardSection } from "./DashboardSection";

type DashboardRecentActivityProps = {
  result: GetDashboardRecentActivityResult;
};

const SOURCE_LABELS: Record<DashboardRecentActivityItem["source"], string> = {
  pedido: "Pedido",
  solicitud: "Solicitud",
};

const sourceClasses: Record<DashboardRecentActivityItem["source"], string> = {
  pedido: "border-brand-primary/30 bg-brand-primary-soft text-brand-primary",
  solicitud: "border-brand-accent/30 bg-brand-accent-soft text-brand-accent",
};

function getLinkLabel(source: DashboardRecentActivityItem["source"]): string {
  return source === "pedido" ? "Ver pedido" : "Ver solicitud";
}

export function DashboardRecentActivity({
  result,
}: DashboardRecentActivityProps) {
  if (!result.ok) {
    return (
      <Alert variant="warning" title="No se pudo cargar la actividad reciente">
        <p>
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </Alert>
    );
  }

  return (
    <DashboardSection
      title="Actividad reciente"
      description="Últimos movimientos relevantes registrados en solicitudes y pedidos."
    >
      {result.activity.items.length === 0 ? (
        <EmptyState
          title="Sin actividad reciente"
          description="Todavía no hay movimientos recientes para mostrar."
        />
      ) : (
        <div className="overflow-hidden rounded-(--radius-card) border border-border bg-surface shadow-(--shadow-soft)">
          {result.activity.items.map((item, index) => (
            <article
              key={item.id}
              className={[
                "relative grid gap-3 border-l-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-5",
                item.source === "pedido"
                  ? "border-l-brand-primary"
                  : "border-l-brand-accent",
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
                className="inline-flex min-h-10 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-3 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft"
              >
                {getLinkLabel(item.source)}
              </Link>
            </article>
          ))}
        </div>
      )}
    </DashboardSection>
  );
}
