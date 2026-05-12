import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardSolicitudesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Solicitudes"
        description="Listado futuro de solicitudes recibidas por el formulario publico."
      />
      <PlaceholderCard
        title="Listado de solicitudes futuro"
        description="Esta vista no consulta datos todavia. Solo define la ruta inicial del modulo."
      />
    </div>
  );
}
