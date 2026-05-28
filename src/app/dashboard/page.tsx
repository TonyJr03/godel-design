import { DashboardOverview } from "@/components/dashboard/DashboardOverview";
import { PageHeader } from "@/components/ui/PageHeader";
import { getDashboardSummary } from "@/lib/dashboard";

export default async function DashboardPage() {
  const result = await getDashboardSummary();
  const isWorkerDashboard = result.ok && result.summary.kind === "worker";

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
      <DashboardOverview result={result} />
    </div>
  );
}
