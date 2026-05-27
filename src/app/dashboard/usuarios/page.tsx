import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardUsuariosPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Usuarios"
        description="Gestión futura de usuarios internos."
      />
      <PlaceholderCard
        title="Usuarios internos pendientes"
        description="La gestión funcional se implementará en subfases posteriores."
      />
    </div>
  );
}
