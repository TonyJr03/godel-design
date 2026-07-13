import Link from "next/link";

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
import { DashboardRecentActivity } from "./DashboardRecentActivity";

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

  return workItemsResult.workItems.solicitudesPendientes.length;
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

function SolicitudesPendientesPanel({
  workItemsResult,
}: {
  workItemsResult: GetDashboardWorkItemsResult;
}) {
  const count = getSolicitudesPendientesCount(workItemsResult) ?? 0;

  return (
    <div className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3">
      <p className="text-sm font-semibold text-text-primary">
        {count.toLocaleString("es")} solicitudes requieren atención.
      </p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        El listado detallado se mantiene en el contenido principal hasta que el
        panel final se implemente en la siguiente subtarea.
      </p>
    </div>
  );
}

function PedidosListosPanel({
  workItemsResult,
}: {
  workItemsResult: GetDashboardWorkItemsResult;
}) {
  const readyGroup = workItemsResult.ok
    ? workItemsResult.workItems.pedidoBoard.listosEntrega
    : null;
  const totalCount = readyGroup?.totalCount ?? 0;
  const moreHref =
    readyGroup?.moreHref ?? "/dashboard/pedidos?status=listo_entrega";

  return (
    <div className="rounded-(--radius-control) border border-border bg-surface-muted px-4 py-3">
      <p className="text-sm font-semibold text-text-primary">
        {totalCount.toLocaleString("es")} pedidos listos para entrega.
      </p>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        Las cards compactas se incorporarán en el tablero final. Por ahora, el
        acceso filtrado permite revisar estos pedidos en el listado existente.
      </p>
      <Link
        href={moreHref}
        className="mt-4 inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-brand-primary transition-colors duration-200 hover:border-brand-primary hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Ver pedidos listos
      </Link>
    </div>
  );
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
      description: "Señales prioritarias para revisar primero.",
      content: <DashboardAttentionPanel result={summaryResult} />,
    },
    ...(workerDashboard
      ? {}
      : {
          pendingRequests: {
            id: "pendingRequests",
            title: "Solicitudes pendientes",
            description: "Solicitudes que todavía requieren gestión.",
            content: (
              <SolicitudesPendientesPanel workItemsResult={workItemsResult} />
            ),
          },
        }),
    readyOrders: {
      id: "readyOrders",
      title: "Pedidos listos para entrega",
      description: workerDashboard
        ? "Pedidos asignados en estado listo para entrega."
        : "Pedidos terminados pendientes de entrega.",
      content: <PedidosListosPanel workItemsResult={workItemsResult} />,
    },
    history: {
      id: "history",
      title: "Historial",
      description: "Actividad reciente de pedidos y solicitudes.",
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
      icon: "estado",
      statusLabel: "Prioridades",
      tone: "warning",
    },
    ...(workerDashboard
      ? []
      : [
          {
            id: "pendingRequests",
            label: "Solicitudes",
            icon: "cliente",
            badge: getSolicitudesPendientesCount(workItemsResult),
            statusLabel: "Pendientes",
            tone: "warning",
          } satisfies WorkspaceAction,
        ]),
    {
      id: "readyOrders",
      label: "Entregas",
      icon: "tareas",
      badge: getPedidosListosCount(workItemsResult),
      statusLabel: "Listos",
      tone: "success",
    },
    {
      id: "history",
      label: "Historial",
      icon: "historial",
      badge: getActivityCount(activityResult),
      statusLabel: "Actividad",
    },
    {
      id: "summary",
      label: "Resumen",
      icon: "informacion",
      statusLabel: "Métricas",
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
          ? "Resumen de los pedidos en los que estás asignado."
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
