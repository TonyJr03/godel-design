import { PageHeader } from "@/components/ui/PageHeader";
import { PlaceholderCard } from "@/components/ui/PlaceholderCard";

export default function DashboardUsuariosPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Usuarios"
        description="Gestion futura de usuarios internos."
      />
      <PlaceholderCard
        title="Usuarios internos pendientes"
        description="Los roles y permisos se conectaran cuando exista autenticacion real."
      />
    </div>
  );
}
