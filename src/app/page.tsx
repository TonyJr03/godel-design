import Link from "next/link";

import { PublicHeader } from "@/components/layout/PublicHeader";

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader currentPage="home" />
      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:py-24">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent">
              Impresión, diseño y personalización
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              Tu idea empieza con una solicitud clara
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-text-secondary">
              Cuéntanos qué necesitas producir o personalizar. El equipo de
              Godel Diseño revisará los detalles contigo antes de confirmar el
              precio, la fecha y el inicio del trabajo.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/solicitud"
                className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) bg-brand-primary px-6 text-base font-semibold text-white transition-colors hover:bg-brand-primary-hover"
              >
                Enviar solicitud
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-6 text-base font-semibold text-text-primary transition-colors hover:bg-surface-muted"
              >
                Acceso interno
              </Link>
            </div>
            <p className="mt-4 text-sm leading-6 text-text-secondary">
              Enviar una solicitud no es una compra ni confirma un pedido.
            </p>
          </div>

          <div className="relative">
            <div
              className="absolute -left-3 top-8 h-24 w-1 rounded-full bg-brand-accent sm:-left-4"
              aria-hidden="true"
            />
            <section className="rounded-(--radius-card) border border-border bg-surface p-6 shadow-(--shadow-soft) sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                Un proceso acompañado
              </p>
              <h2 className="mt-2 text-xl font-semibold text-text-primary">
                De la idea a la producción
              </h2>
              <ol className="mt-6 space-y-5">
                {[
                  [
                    "Comparte el trabajo",
                    "Describe medidas, cantidades, colores y referencias.",
                  ],
                  [
                    "Revisamos contigo",
                    "Aclaramos detalles y confirmamos lo necesario.",
                  ],
                  [
                    "Acordamos el pedido",
                    "Definimos precio, fecha y próximos pasos antes de producir.",
                  ],
                ].map(([title, description], index) => (
                  <li key={title} className="flex gap-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-sm font-semibold text-brand-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-text-primary">{title}</p>
                      <p className="mt-1 text-sm leading-6 text-text-secondary">
                        {description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </section>

        <section className="border-y border-border bg-surface-raised">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6 sm:py-12">
            {[
              [
                "Información útil",
                "El formulario te guía para compartir los datos que ayudan a entender el trabajo.",
              ],
              [
                "Revisión humana",
                "El equipo revisa cada solicitud y contacta contigo antes de confirmar.",
              ],
              [
                "Archivos protegidos",
                "Las referencias adjuntas se usan únicamente para evaluar tu solicitud.",
              ],
            ].map(([title, description]) => (
              <article key={title} className="border-l-2 border-brand-accent pl-4">
                <h2 className="font-semibold text-text-primary">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="flex flex-col gap-6 rounded-(--radius-card) border border-brand-primary/20 bg-brand-primary-soft p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                ¿Tienes un trabajo en mente?
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                Envía la información disponible. Podrás aclarar cualquier
                detalle cuando el equipo se ponga en contacto contigo.
              </p>
            </div>
            <Link
              href="/solicitud"
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-(--radius-control) bg-brand-primary px-6 text-base font-semibold text-white transition-colors hover:bg-brand-primary-hover"
            >
              Enviar solicitud
            </Link>
          </div>
        </section>

        <footer className="border-t border-border bg-surface-raised">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>Godel Diseño · Producción personalizada</p>
            <p>Solicitudes revisadas por el equipo antes de confirmar.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
