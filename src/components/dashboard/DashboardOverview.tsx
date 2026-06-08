import type { GetDashboardSummaryResult } from "@/lib/dashboard";
import { Alert } from "@/components/ui/Alert";
import {
  DashboardSummaryCards,
  type DashboardSummaryCard,
} from "./DashboardSummaryCards";
import { DashboardSection } from "./DashboardSection";

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
      tone: "info",
    },
    {
      title: "Solicitudes pendientes",
      value: metrics.solicitudesPendientes,
      description: "Solicitudes nuevas, en revisión o contactadas.",
      tone: "warning",
    },
    {
      title: "Aprobadas sin convertir",
      value: metrics.solicitudesAprobadasPendientesConvertir,
      description: "Solicitudes aprobadas que aún no tienen pedido.",
      tone: "warning",
    },
    {
      title: "Pedidos activos",
      value: metrics.pedidosActivos,
      description: "Pedidos abiertos, sin contar entregados ni cancelados.",
      tone: "info",
    },
    {
      title: "En producción",
      value: metrics.pedidosEnProduccion,
      description: "Pedidos actualmente en fase de producción.",
      tone: "info",
    },
    {
      title: "Listos para entrega",
      value: metrics.pedidosListosEntrega,
      description: "Pedidos terminados y pendientes de entrega.",
      tone: "success",
    },
    {
      title: "Sin tareas",
      value: metrics.pedidosSinTareas,
      description:
        "Pedidos pendientes de revisión o en revisión que aún no tienen tareas.",
      tone: "warning",
    },
    {
      title: "Pedidos atrasados",
      value: metrics.pedidosAtrasados,
      description: "Pedidos activos con fecha estimada vencida.",
      tone: "danger",
    },
    {
      title: "Próximos a entrega",
      value: metrics.pedidosProximosEntrega,
      description: "Pedidos activos con entrega en los próximos 7 días.",
      tone: "warning",
    },
    {
      title: "Clientes registrados",
      value: metrics.clientesRegistrados,
      description: "Clientes disponibles para operación interna.",
      tone: "neutral",
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
      tone: "neutral",
    },
    {
      title: "Asignados activos",
      value: metrics.pedidosAsignadosActivos,
      description: "Tus pedidos abiertos, sin entregados ni cancelados.",
      tone: "info",
    },
    {
      title: "En producción",
      value: metrics.pedidosAsignadosEnProduccion,
      description: "Tus pedidos asignados que están en producción.",
      tone: "info",
    },
    {
      title: "Listos para entrega",
      value: metrics.pedidosAsignadosListosEntrega,
      description: "Tus pedidos terminados y pendientes de entrega.",
      tone: "success",
    },
    {
      title: "Asignados sin tareas",
      value: metrics.pedidosAsignadosSinTareas,
      description:
        "Tus pedidos pendientes de revisión o en revisión que aún no tienen tareas.",
      tone: "warning",
    },
    {
      title: "Atrasados",
      value: metrics.pedidosAsignadosAtrasados,
      description: "Tus pedidos activos con fecha estimada vencida.",
      tone: "danger",
    },
    {
      title: "Próximos a entrega",
      value: metrics.pedidosAsignadosProximosEntrega,
      description: "Tus pedidos con entrega en los próximos 7 días.",
      tone: "warning",
    },
  ];
}

export function DashboardOverview({ result }: DashboardOverviewProps) {
  if (!result.ok) {
    return (
      <Alert variant="danger" title="No se pudo cargar el resumen del dashboard">
        <p>
          Intenta recargar la página o contacta al administrador si el problema
          continúa.
        </p>
      </Alert>
    );
  }

  const cards =
    result.summary.kind === "management"
      ? getManagementCards(result.summary.metrics)
      : getWorkerCards(result.summary.metrics);

  return (
    <DashboardSection
      title="Resumen operativo"
      description="Métricas de contexto para entender el volumen y estado general del trabajo."
    >
      <DashboardSummaryCards cards={cards} />
    </DashboardSection>
  );
}
