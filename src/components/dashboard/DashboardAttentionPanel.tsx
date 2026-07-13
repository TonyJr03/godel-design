import type { GetDashboardSummaryResult } from "@/lib/dashboard";

type DashboardAttentionPanelProps = {
  result: GetDashboardSummaryResult;
};

type AttentionTone = "info" | "warning" | "danger";

type AttentionItem = {
  label: string;
  value: number;
  detail: string;
  tone: AttentionTone;
};

const toneClasses: Record<AttentionTone, string> = {
  info: "border-info/30 bg-info-soft text-info",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
};

function getAttentionItems(
  result: Extract<GetDashboardSummaryResult, { ok: true }>,
): AttentionItem[] {
  if (result.summary.kind === "worker") {
    const metrics = result.summary.metrics;

    return [
      {
        label: "Pedidos atrasados",
        value: metrics.pedidosAsignadosAtrasados,
        detail: "Asignados con fecha estimada vencida.",
        tone: "danger",
      },
      {
        label: "Próximos a entrega",
        value: metrics.pedidosAsignadosProximosEntrega,
        detail: "Asignados con entrega en los próximos 7 días.",
        tone: "warning",
      },
      {
        label: "Sin tareas",
        value: metrics.pedidosAsignadosSinTareas,
        detail: "Asignados pendientes de organización de tareas.",
        tone: "warning",
      },
    ].filter((item) => item.value > 0) as AttentionItem[];
  }

  const metrics = result.summary.metrics;

  return [
    {
      label: "Pedidos atrasados",
      value: metrics.pedidosAtrasados,
      detail: "Pedidos activos con fecha estimada vencida.",
      tone: "danger",
    },
    {
      label: "Próximos a entrega",
      value: metrics.pedidosProximosEntrega,
      detail: "Pedidos con entrega prevista en los próximos 7 días.",
      tone: "warning",
    },
    {
      label: "Pedidos sin tareas",
      value: metrics.pedidosSinTareas,
      detail: "Pedidos pendientes de organizar antes de producción.",
      tone: "warning",
    },
    {
      label: "Solicitudes pendientes",
      value: metrics.solicitudesPendientes,
      detail: "Solicitudes que todavía requieren gestión.",
      tone: "info",
    },
    {
      label: "Aprobadas sin convertir",
      value: metrics.solicitudesAprobadasPendientesConvertir,
      detail: "Solicitudes aprobadas que aún no tienen pedido.",
      tone: "warning",
    },
  ].filter((item) => item.value > 0) as AttentionItem[];
}

export function DashboardAttentionPanel({
  result,
}: DashboardAttentionPanelProps) {
  if (!result.ok) {
    return null;
  }

  const items = getAttentionItems(result);

  if (items.length === 0) {
    return (
      <div className="rounded-(--radius-control) border border-success/30 bg-success-soft px-4 py-3">
        <p className="text-sm font-semibold text-text-primary">
          No hay incidencias prioritarias
        </p>
        <p className="mt-1 text-sm leading-6 text-text-secondary">
          Los indicadores actuales no muestran atrasos, entregas próximas ni
          trabajo pendiente de organizar.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <article
          key={item.label}
          className={[
            "rounded-(--radius-control) border bg-surface px-4 py-3",
            toneClasses[item.tone],
          ].join(" ")}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">
                {item.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                {item.detail}
              </p>
            </div>
            <span className="shrink-0 text-2xl font-semibold tracking-tight text-text-primary">
              {item.value.toLocaleString("es")}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}
