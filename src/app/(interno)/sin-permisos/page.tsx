import Link from "next/link";

import { LogoutButton } from "@/components/auth/LogoutButton";
import { Alert, Card } from "@/components/ui";

export default function SinPermisosPage() {
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
          Permisos internos
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          Esta sección no está disponible para tu usuario
        </h1>
        <p className="mt-4 text-base leading-7 text-text-secondary">
          Tu sesión sigue activa y puedes continuar trabajando en las áreas
          habilitadas para tu perfil.
        </p>

        <Alert
          variant="warning"
          title="Acceso limitado"
          className="mt-6 leading-6"
        >
          Vuelve al dashboard para continuar. Si necesitas acceder a esta
          sección y crees que se trata de un error, contacta a la administración.
        </Alert>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover"
          >
            Volver al dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors duration-200 hover:bg-surface-muted"
          >
            Volver al inicio
          </Link>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <p className="mb-3 text-sm leading-6 text-text-muted">
            También puedes cerrar la sesión para acceder con otra cuenta.
          </p>
          <div className="sm:max-w-48">
            <LogoutButton />
          </div>
        </div>
      </Card>
    </main>
  );
}
