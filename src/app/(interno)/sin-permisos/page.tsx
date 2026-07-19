import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentUser, getCurrentUserWithProfile } from "@/lib/auth";

const primaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 motion-reduce:transition-none";

export default async function SinPermisosPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const userWithProfile = await getCurrentUserWithProfile();

  if (!userWithProfile) {
    redirect("/acceso-denegado");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6 sm:py-14">
      <div className="w-full max-w-2xl">
        <EmptyState
          variant="permission"
          titleAs="h1"
          eyebrow="Permiso requerido"
          title="Esta sección no está disponible para tu usuario"
          description={
            <div className="space-y-3">
              <p>
                Tu sesión sigue activa y puedes continuar en las áreas
                habilitadas para tu usuario.
              </p>
              <p>
                Si crees que se trata de un error, contacta a la administración
                para revisar el acceso.
              </p>
            </div>
          }
          action={
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/dashboard" className={primaryLinkClasses}>
                Volver al dashboard
              </Link>
              <div className="sm:min-w-44">
                <LogoutButton />
              </div>
            </div>
          }
        />
      </div>
    </main>
  );
}
