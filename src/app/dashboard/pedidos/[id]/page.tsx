import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardPedidoDetallePage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Detalle de pedido"
        description="Vista futura para consultar y actualizar un pedido específico."
      />
      <PlaceholderCard
        title="Detalle pendiente"
        description="La ruta dinámica queda preparada sin cargar datos reales."
      />
    </div>
  );
}
