import { redirect } from "next/navigation";

import { BackToConfigurationLink } from "@/components/configuracion/BackToConfigurationLink";
import { ExpiredUploadsCleanupAction } from "@/components/configuracion/ExpiredUploadsCleanupAction";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions/permissions";

import { runExpiredUploadsCleanupAction } from "./actions";

export default async function DashboardConfiguracionMantenimientoPage() {
  const profile = await getCurrentProfile();

  if (!profile) {
    redirect("/login");
  }

  if (
    profile.must_change_password
    || !hasPermission(profile.role, "configuracion.manage")
  ) {
    redirect("/sin-permisos");
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <BackToConfigurationLink presentation="text" />
        <PageHeader
          title="Mantenimiento"
          description="Ejecuta tareas administrativas de mantenimiento del sistema."
        />
      </div>

      <section className="max-w-3xl rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
        <div className="space-y-3">
          <h2 className="text-xl font-semibold text-text-primary">
            Limpieza de cargas expiradas
          </h2>
          <p className="text-sm leading-6 text-text-secondary sm:text-base">
            Revisa reservas de archivos vencidas y elimina archivos temporales
            que nunca llegaron a convertirse en archivos operativos.
          </p>
          <Alert variant="info">
            No elimina archivos ya confirmados en solicitudes o pedidos.
          </Alert>
        </div>

        <div className="mt-6">
          <ExpiredUploadsCleanupAction
            cleanupAction={runExpiredUploadsCleanupAction}
          />
        </div>
      </section>
    </div>
  );
}
