import type { GetDashboardSummaryResult } from "@/lib/dashboard";
import {
  DashboardSummaryCards,
  type DashboardSummaryCard,
} from "./DashboardSummaryCards";

type DashboardOverviewProps = {
  result: GetDashboardSummaryResult;
};

type ManagementDashboardSuccess = Extract<
  GetDashboardSummaryResult,
  { ok: true; summary: { kind: "management" } }
>;

type WorkerDashboardSuccess = Extract<
  GetDashboardSummaryResult,
  { ok: true; summary: { kind: "worker" } }
>;

function getManagementCards(
  metrics: ManagementDashboardSuccess["summary"]["metrics"],
): DashboardSummaryCard[] {
  return [
    {
      title: "Solicitudes nuevas",
      value: metrics.solicitudesNuevas,
      description: "Solicitudes recibidas pendientes de primera revisión.",
    },
    {
      title: "Solicitudes pendientes",
      value: metrics.solicitudesPendientes,
      description: "Solicitudes nuevas, en revisión o contactadas.",
    },
    {
      title: "Aprobadas sin convertir",
      value: metrics.solicitudesAprobadasPendientesConvertir,
      description: "Solicitudes aprobadas que aún no tienen pedido.",
    },
    {
      title: "Pedidos activos",
      value: metrics.pedidosActivos,
      description: "Pedidos abiertos, sin contar entregados ni cancelados.",
    },
    {
      title: "En producción",
      value: metrics.pedidosEnProduccion,
      description: "Pedidos actualmente en fase de producción.",
    },
    {
      title: "Listos para entrega",
      value: metrics.pedidosListosEntrega,
      description: "Pedidos terminados y pendientes de entrega.",
    },
    {
      title: "Pedidos atrasados",
      value: metrics.pedidosAtrasados,
      description: "Pedidos activos con fecha estimada vencida.",
    },
    {
      title: "Próximos a entrega",
      value: metrics.pedidosProximosEntrega,
      description: "Pedidos activos con entrega en los próximos 7 días.",
    },
    {
      title: "Clientes registrados",
      value: metrics.clientesRegistrados,
      description: "Clientes disponibles para operación interna.",
    },
  ];
}

function getWorkerCards(
  metrics: WorkerDashboardSuccess["summary"]["metrics"],
): DashboardSummaryCard[] {
  return [
    {
      title: "Pedidos asignados",
      value: metrics.totalPedidosAsignados,
      description: "Total de pedidos en los que estás asignado.",
    },
    {
      title: "Asignados activos",
      value: metrics.pedidosAsignadosActivos,
      description: "Tus pedidos abiertos, sin entregados ni cancelados.",
    },
    {
      title: "En producción",
      value: metrics.pedidosAsignadosEnProduccion,
      description: "Tus pedidos asignados que están en producción.",
    },
    {
      title: "Listos para entrega",
      value: metrics.pedidosAsignadosListosEntrega,
      description: "Tus pedidos terminados y pendientes de entrega.",
    },
    {
      title: "Atrasados",
      value: metrics.pedidosAsignadosAtrasados,
      description: "Tus pedidos activos con fecha estimada vencida.",
    },
    {
      title: "Próximos a entrega",
      value: metrics.pedidosAsignadosProximosEntrega,
      description: "Tus pedidos con entrega en los próximos 7 días.",
    },
  ];
}

export function DashboardOverview({ result }: DashboardOverviewProps) {
  if (!result.ok) {
    return (
      <section className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-950">
        <h2 className="font-semibold">
          No se pudo cargar el resumen del dashboard.
        </h2>
        <p className="mt-2 leading-6">
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </section>
    );
  }

  const cards =
    result.summary.kind === "management"
      ? getManagementCards(result.summary.metrics)
      : getWorkerCards(result.summary.metrics);

  return <DashboardSummaryCards cards={cards} />;
}
