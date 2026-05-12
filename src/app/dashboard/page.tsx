import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Resumen operativo futuro para solicitudes, pedidos y actividad interna."
      />
      <PlaceholderCard
        title="Resumen operativo futuro"
        description="Aqui se mostraran indicadores y alertas cuando existan datos reales."
      />
    </div>
  );
}
