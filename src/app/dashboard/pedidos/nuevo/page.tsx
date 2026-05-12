import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardNuevoPedidoPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Nuevo pedido"
        description="Creacion manual futura de pedidos internos."
      />
      <PlaceholderCard
        title="Creacion manual pendiente"
        description="El formulario y las reglas de negocio se agregaran en una fase posterior."
      />
    </div>
  );
}
