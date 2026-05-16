import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardClientesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Clientes"
        description="Gestión básica futura de clientes."
      />
      <PlaceholderCard
        title="Gestión de clientes pendiente"
        description="Aquí se preparará el listado y mantenimiento básico de clientes."
      />
    </div>
  );
}
