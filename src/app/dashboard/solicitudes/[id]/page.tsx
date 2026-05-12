import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardSolicitudDetallePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Detalle de solicitud"
        description="Vista futura para revisar una solicitud especifica."
      />
      <PlaceholderCard
        title="Detalle pendiente"
        description="La ruta dinamica queda preparada sin leer datos ni parametros por ahora."
      />
    </div>
  );
}
