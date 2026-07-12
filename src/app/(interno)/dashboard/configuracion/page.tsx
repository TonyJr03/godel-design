import { ConfigurationHub } from "@/components/configuracion/ConfigurationHub";
import { PageHeader } from "@/components/ui/PageHeader";

export default function DashboardConfiguracionPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Configuración"
        description="Entrada a las secciones internas de configuración del sistema."
      />

      <ConfigurationHub />
    </div>
  );
}
