import Link from "next/link";
import type {
  DashboardRecentActivityItem,
  GetDashboardRecentActivityResult,
} from "@/lib/dashboard";

type DashboardRecentActivityProps = {
  result: GetDashboardRecentActivityResult;
};

const SOURCE_LABELS: Record<DashboardRecentActivityItem["source"], string> = {
  pedido: "Pedido",
  solicitud: "Solicitud",
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatDateTime(value: string): string {
  return DATE_TIME_FORMATTER.format(new Date(value));
}

function getLinkLabel(source: DashboardRecentActivityItem["source"]): string {
  return source === "pedido" ? "Ver pedido" : "Ver solicitud";
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-5 text-sm text-zinc-600">
      No hay actividad reciente para mostrar.
    </div>
  );
}

export function DashboardRecentActivity({
  result,
}: DashboardRecentActivityProps) {
  if (!result.ok) {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
        <h2 className="font-semibold">
          No se pudo cargar la actividad reciente.
        </h2>
        <p className="mt-2 leading-6">
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-zinc-950">
          Actividad reciente
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Últimos movimientos relevantes del sistema.
        </p>
      </div>

      {result.activity.items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
          {result.activity.items.map((item) => (
            <article key={item.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
                      {SOURCE_LABELS[item.source]}
                    </span>
                    <time
                      dateTime={item.createdAt}
                      className="text-xs text-zinc-500"
                    >
                      {formatDateTime(item.createdAt)}
                    </time>
                  </div>
                  <h3 className="mt-3 truncate text-sm font-semibold text-zinc-950">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">
                    {item.description}
                  </p>
                </div>
                <Link
                  href={item.href}
                  className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
                >
                  {getLinkLabel(item.source)}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
