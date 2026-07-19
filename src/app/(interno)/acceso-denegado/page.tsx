import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCurrentUser, getCurrentUserWithProfile } from "@/lib/auth";

const primaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 motion-reduce:transition-none";

const actionsWrapperClasses = "flex flex-col gap-3 sm:flex-row";

export default async function AccesoDenegadoPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const userWithProfile = await getCurrentUserWithProfile();

  if (userWithProfile) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6 sm:py-14">
      <div className="w-full max-w-2xl">
        <EmptyState
          variant="permission"
          titleAs="h1"
          eyebrow="Acceso interno no habilitado"
          title="No pudimos abrir el espacio de trabajo"
          description={
            <div className="space-y-3">
              <p>
                La cuenta autenticada no tiene acceso interno activo para abrir
                el espacio de trabajo de Godel Diseño.
              </p>
              <p>
                Contacta a la administración si crees que debería estar
                habilitada. También puedes cerrar sesión para entrar con otra
                cuenta.
              </p>
            </div>
          }
          action={
            <div className={actionsWrapperClasses}>
              <Link href="/" className={primaryLinkClasses}>
                Volver al inicio
              </Link>
              <LogoutButton />
            </div>
          }
        />
      </div>
    </main>
  );
}
