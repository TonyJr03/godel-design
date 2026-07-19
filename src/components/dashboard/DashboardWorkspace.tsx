import {
  WorkspaceController,
  WorkspaceShell,
  type WorkspaceAction,
  type WorkspacePanel,
} from "@/components/workspace";
import type {
  GetDashboardRecentActivityResult,
  GetDashboardSummaryResult,
  GetDashboardWorkItemsResult,
} from "@/lib/dashboard";

import { DashboardAttentionPanel } from "./DashboardAttentionPanel";
import { DashboardOverview } from "./DashboardOverview";
import { DashboardPedidoBoard } from "./DashboardPedidoBoard";
import { DashboardPendingRequestsPanel } from "./DashboardPendingRequestsPanel";
import { DashboardRecentActivity } from "./DashboardRecentActivity";
import { DashboardReadyOrdersPanel } from "./DashboardReadyOrdersPanel";

type DashboardWorkspaceProps = {
  summaryResult: GetDashboardSummaryResult;
  workItemsResult: GetDashboardWorkItemsResult;
  activityResult: GetDashboardRecentActivityResult;
};

function isWorkerDashboard({
  summaryResult,
  workItemsResult,
  activityResult,
}: DashboardWorkspaceProps): boolean {
  return (
    (summaryResult.ok && summaryResult.summary.kind === "worker") ||
    (workItemsResult.ok && workItemsResult.workItems.kind === "worker") ||
    (activityResult.ok && activityResult.activity.kind === "worker")
  );
}

function getSolicitudesPendientesCount(
  workItemsResult: GetDashboardWorkItemsResult,
): number | undefined {
  if (!workItemsResult.ok || workItemsResult.workItems.kind !== "management") {
    return undefined;
  }

  return workItemsResult.workItems.solicitudesPendientesGroup.totalCount;
}

function getPedidosListosCount(
  workItemsResult: GetDashboardWorkItemsResult,
): number | undefined {
  if (!workItemsResult.ok) {
    return undefined;
  }

  return workItemsResult.workItems.pedidoBoard.listosEntrega.totalCount;
}

function getActivityCount(
  activityResult: GetDashboardRecentActivityResult,
): number | undefined {
  return activityResult.ok ? activityResult.activity.items.length : undefined;
}

export function DashboardWorkspace({
  summaryResult,
  workItemsResult,
  activityResult,
}: DashboardWorkspaceProps) {
  const workerDashboard = isWorkerDashboard({
    summaryResult,
    workItemsResult,
    activityResult,
  });
  const panels: Readonly<Record<string, WorkspacePanel>> = {
    attention: {
      id: "attention",
      title: "Atención operativa",
      description: workerDashboard
        ? "Señales prioritarias de tus pedidos asignados."
        : "Señales prioritarias para revisar primero.",
      content: <DashboardAttentionPanel result={summaryResult} />,
    },
    ...(workerDashboard
      ? {}
      : {
          pendingRequests: {
            id: "pendingRequests",
            title: "Solicitudes pendientes",
            description: "Solicitudes que todavía requieren gestión.",
            content: <DashboardPendingRequestsPanel result={workItemsResult} />,
          },
        }),
    readyOrders: {
      id: "readyOrders",
      title: "Pedidos listos para entrega",
      description: workerDashboard
        ? "Pedidos asignados en estado listo para entrega."
        : "Pedidos terminados pendientes de entrega.",
      content: <DashboardReadyOrdersPanel result={workItemsResult} />,
    },
    history: {
      id: "history",
      title: "Historial",
      description: workerDashboard
        ? "Actividad reciente de tus pedidos asignados."
        : "Actividad reciente de pedidos y solicitudes.",
      content: <DashboardRecentActivity result={activityResult} />,
    },
    summary: {
      id: "summary",
      title: "Resumen operativo",
      description: "Métricas de contexto del trabajo actual.",
      content: <DashboardOverview result={summaryResult} />,
    },
  };
  const actions: WorkspaceAction[] = [
    {
      id: "attention",
      label: "Atención",
      icon: "alerta",
      statusLabel: !summaryResult.ok
        ? "Atención no disponible"
        : workerDashboard
          ? "Mis prioridades"
          : "Prioridades",
      tone: !summaryResult.ok ? "danger" : "warning",
    },
    ...(workerDashboard
      ? []
      : [
          {
            id: "pendingRequests",
            label: "Solicitudes",
            icon: "solicitudes",
            badge: workItemsResult.ok
              ? getSolicitudesPendientesCount(workItemsResult)
              : undefined,
            statusLabel: workItemsResult.ok
              ? "Pendientes"
              : "Solicitudes no disponibles",
            tone: workItemsResult.ok ? "warning" : "danger",
          } satisfies WorkspaceAction,
        ]),
    {
      id: "readyOrders",
      label: "Entregas",
      icon: "entrega",
      badge: workItemsResult.ok
        ? getPedidosListosCount(workItemsResult)
        : undefined,
      statusLabel: !workItemsResult.ok
        ? "Entregas no disponibles"
        : workerDashboard
          ? "Mis listos"
          : "Listos",
      tone: workItemsResult.ok ? "success" : "danger",
    },
    {
      id: "history",
      label: "Historial",
      icon: "historial",
      badge: activityResult.ok ? getActivityCount(activityResult) : undefined,
      statusLabel: activityResult.ok
        ? workerDashboard
          ? "Mi actividad"
          : "Actividad"
        : "Actividad no disponible",
      tone: activityResult.ok ? undefined : "danger",
    },
    {
      id: "summary",
      label: "Resumen",
      icon: "dashboard",
      statusLabel: summaryResult.ok
        ? workerDashboard
          ? "Mis métricas"
          : "Métricas"
        : "Resumen no disponible",
      tone: summaryResult.ok ? undefined : "danger",
    },
  ];
  const compactActionIds = workerDashboard
    ? ["attention", "readyOrders", "history"]
    : ["attention", "pendingRequests", "readyOrders"];
  const header = (
    <header className="min-w-0 border-b border-border pb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-primary">
        Workspace operativo
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
        {workerDashboard ? "Mi trabajo asignado" : "Dashboard operativo"}
      </h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-text-secondary">
        {workerDashboard
          ? "Pedidos donde participas, entregas próximas y señales que requieren tu atención."
          : "Vista diaria de pedidos activos, solicitudes pendientes y señales operativas."}
      </p>
    </header>
  );

  return (
    <WorkspaceController
      actions={actions}
      panels={panels}
      primaryActionId="attention"
      tabletActionIds={compactActionIds}
      mobileActionIds={compactActionIds}
    >
      <WorkspaceShell
        header={header}
        main={<DashboardPedidoBoard result={workItemsResult} />}
        hasActions
        railPresentation="icons"
        desktopMode="flow"
      />
    </WorkspaceController>
  );
}
