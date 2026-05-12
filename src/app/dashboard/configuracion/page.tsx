import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardConfiguracionPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Configuracion"
        description="Ajustes futuros del sistema operativo."
      />
      <PlaceholderCard
        title="Ajustes pendientes"
        description="Esta seccion queda reservada para configuraciones de una fase posterior."
      />
    </div>
  );
}
