import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardClientesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Clientes"
        description="Gestion basica futura de clientes."
      />
      <PlaceholderCard
        title="Gestion de clientes pendiente"
        description="Aqui se preparara el listado y mantenimiento basico de clientes."
      />
    </div>
  );
}
