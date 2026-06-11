import Link from "next/link";

import { LoginForm } from "@/components/auth/LoginForm";
import { PublicHeader } from "@/components/layout/PublicHeader";

const accessNotes = [
  [
    "Trabajo organizado",
    "Consulta solicitudes, coordina pedidos y da seguimiento al trabajo desde un único espacio.",
  ],
  [
    "Solo personal autorizado",
    "Usa las credenciales internas asignadas por la administración del sistema.",
  ],
] as const;

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader currentPage="login" />
      <main className="mx-auto grid min-h-[calc(100vh-73px)] w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent">
            Workspace de producción
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Acceso interno
          </h1>
          <p className="mt-4 text-lg leading-8 text-text-secondary">
            Gestión operativa de solicitudes, pedidos y producción para el
            equipo autorizado de Godel Diseño.
          </p>

          <div className="mt-8 hidden gap-4 lg:grid lg:grid-cols-1 xl:grid-cols-2">
            {accessNotes.map(([title, description]) => (
              <section
                key={title}
                className="rounded-(--radius-card) border border-border bg-surface-raised p-5"
              >
                <h2 className="font-semibold text-text-primary">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {description}
                </p>
              </section>
            ))}
          </div>

          <Link
            href="/"
            className="mt-8 hidden min-h-11 items-center rounded-(--radius-control) text-sm font-semibold text-brand-primary underline-offset-4 hover:underline lg:inline-flex"
          >
            Volver al inicio
          </Link>
        </section>

        <div>
          <LoginForm />
          <p className="mt-4 text-center text-xs leading-5 text-text-muted">
            Si no tienes acceso o tu cuenta está inactiva, contacta al
            administrador.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:hidden">
            {accessNotes.map(([title, description]) => (
              <section
                key={title}
                className="rounded-(--radius-card) border border-border bg-surface-raised p-5"
              >
                <h2 className="font-semibold text-text-primary">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {description}
                </p>
              </section>
            ))}
          </div>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-11 items-center rounded-(--radius-control) text-sm font-semibold text-brand-primary underline-offset-4 hover:underline lg:hidden"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}
