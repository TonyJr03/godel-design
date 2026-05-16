import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardNuevoPedidoPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Nuevo pedido"
        description="Creación manual futura de pedidos internos."
      />
      <PlaceholderCard
        title="Creación manual pendiente"
        description="El formulario y las reglas de negocio se agregarán en una fase posterior."
      />
    </div>
  );
}
