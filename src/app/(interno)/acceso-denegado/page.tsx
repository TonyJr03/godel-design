import Link from "next/link";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { Alert, Card } from "@/components/ui";

export default function AccesoDenegadoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 sm:px-6 sm:py-14">
      <Card
        as="section"
        variant="raised"
        padding="lg"
        className="relative w-full max-w-xl overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-brand-accent"
        />

        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent">
          Acceso interno
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          No pudimos abrir el espacio de trabajo
        </h1>
        <p className="mt-4 text-base leading-7 text-text-secondary">
          La sesión actual no tiene acceso habilitado al sistema interno de
          Godel Diseño.
        </p>

        <Alert
          variant="warning"
          title="Qué puedes hacer"
          className="mt-6 leading-6"
        >
          Contacta a la administración si crees que tu cuenta debería estar
          activa. Para entrar con otra cuenta, cierra esta sesión y vuelve al
          acceso interno.
        </Alert>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover"
          >
            Volver al inicio
          </Link>
          <LogoutButton />
        </div>

        <p className="mt-6 border-t border-border pt-5 text-sm leading-6 text-text-muted">
          No necesitas compartir contraseñas ni información técnica para
          solicitar ayuda.
        </p>
      </Card>
    </main>
  );
}
