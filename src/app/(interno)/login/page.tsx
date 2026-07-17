import { LoginForm } from "@/components/auth/LoginForm";

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
      <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="max-w-2xl">
          <div className="inline-flex min-h-11 items-center gap-3 rounded-(--radius-control)">
            <span
              className="h-8 w-1 rounded-full bg-brand-accent"
              aria-hidden="true"
            />
            <div>
              <p className="text-base font-semibold text-text-primary">
                Godel Diseño
              </p>
              <p className="text-xs text-text-secondary">Área privada</p>
            </div>
          </div>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent">
            Workspace de producción
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Acceso interno
          </h1>
          <p className="mt-4 text-lg leading-8 text-text-secondary">
            Gestión operativa de solicitudes, pedidos y producción para el
            equipo autorizado de Godel Diseño.
          </p>

          <div className="mt-7 hidden gap-3 lg:grid lg:grid-cols-1 xl:grid-cols-2">
            {accessNotes.map(([title, description]) => (
              <section
                key={title}
                className="rounded-(--radius-card) border border-border bg-surface-raised/70 p-4"
              >
                <h2 className="text-sm font-semibold text-text-primary">
                  {title}
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-text-secondary">
                  {description}
                </p>
              </section>
            ))}
          </div>
        </section>

        <div>
          <LoginForm />
          <p className="mt-4 text-center text-xs leading-5 text-text-muted">
            Si no tienes acceso o tu cuenta está inactiva, contacta al
            administrador.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:hidden">
            {accessNotes.map(([title, description]) => (
              <section
                key={title}
                className="rounded-(--radius-card) border border-border bg-surface-raised/70 p-4"
              >
                <h2 className="text-sm font-semibold text-text-primary">
                  {title}
                </h2>
                <p className="mt-1.5 text-sm leading-6 text-text-secondary">
                  {description}
                </p>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
