import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { DashboardRecentActivity } from "@/components/dashboard/DashboardRecentActivity";
import { DashboardWorkPanels } from "@/components/dashboard/DashboardWorkPanels";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDashboard } from "@/lib/dashboard";

export default async function DashboardPage() {
  const { summaryResult, workItemsResult, activityResult } =
    await getDashboard();
  const isWorkerDashboard =
    (summaryResult.ok && summaryResult.summary.kind === "worker") ||
    (workItemsResult.ok && workItemsResult.workItems.kind === "worker") ||
    (activityResult.ok && activityResult.activity.kind === "worker");

  return (
    <div className="space-y-8">
      <PageHeader
        title={isWorkerDashboard ? "Mi trabajo asignado" : "Dashboard operativo"}
        description={
          isWorkerDashboard
            ? "Resumen de los pedidos en los que estás asignado."
            : "Resumen general de solicitudes, pedidos y clientes."
        }
      />
      <DashboardOverview result={summaryResult} />
      <DashboardWorkPanels result={workItemsResult} />
      <DashboardRecentActivity result={activityResult} />
    </div>
  );
}
