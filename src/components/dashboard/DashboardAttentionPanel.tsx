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
      <section
        aria-labelledby="dashboard-attention-title"
        className="rounded-(--radius-card) border border-success/30 bg-success-soft p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-success">
          Operación al día
        </p>
        <h2
          id="dashboard-attention-title"
          className="mt-2 text-xl font-semibold text-text-primary"
        >
          No hay incidencias prioritarias
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Los indicadores actuales no muestran atrasos, entregas próximas ni
          trabajo pendiente de organizar.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="dashboard-attention-title"
      className="rounded-(--radius-card) border border-brand-accent/30 bg-brand-accent-soft p-5 shadow-(--shadow-soft) sm:p-6"
    >
      <div className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-accent">
          Atención operativa
        </p>
        <h2
          id="dashboard-attention-title"
          className="mt-2 text-xl font-semibold text-text-primary"
        >
          Revisa estos puntos primero
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          Indicadores con trabajo pendiente según el estado actual de la
          operación.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {items.map((item) => (
          <article
            key={item.label}
            className={[
              "rounded-(--radius-control) border bg-surface/80 p-4",
              toneClasses[item.tone],
            ].join(" ")}
          >
            <p className="text-sm font-semibold text-text-primary">
              {item.label}
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {item.value.toLocaleString("es")}
            </p>
            <p className="mt-2 text-xs leading-5 text-text-secondary">
              {item.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
