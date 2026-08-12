import { ConfigurationHub } from "@/components/configuracion/ConfigurationHub";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/permissions";

export default async function DashboardConfiguracionPage() {
  const profile = await getCurrentProfile();
  const canManageConfiguration = Boolean(
    profile && hasPermission(profile.role, "configuracion.manage"),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Configuración"
        description="Entrada a las secciones internas de configuración del sistema."
      />

      <ConfigurationHub canManageConfiguration={canManageConfiguration} />
    </div>
  );
}
