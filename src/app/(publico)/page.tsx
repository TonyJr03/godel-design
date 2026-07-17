import Link from "next/link";

import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicTrackingSearchForm } from "@/components/tracking/PublicTrackingSearchForm";

const processSteps = [
  [
    "Envías tu solicitud",
    "Comparte el trabajo, cantidades, medidas y referencias disponibles.",
  ],
  [
    "Revisamos los detalles",
    "El equipo valida el alcance y prepara las preguntas necesarias.",
  ],
  [
    "Confirmamos contigo",
    "Acordamos precio, fecha y próximos pasos antes de producir.",
  ],
] as const;

const trustItems = [
  [
    "Solicitud guiada",
    "El formulario reúne la información básica para entender el trabajo.",
  ],
  [
    "Revisión humana",
    "Cada solicitud pasa por el equipo antes de convertirse en trabajo confirmado.",
  ],
  [
    "Archivos protegidos",
    "Las referencias adjuntas se usan solo para revisar tu solicitud.",
  ],
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader currentPage="home" />
      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent">
              Impresión, diseño y personalización
            </p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              Cuéntanos qué necesitas preparar
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-text-secondary">
              En Godel Diseño recibimos solicitudes para trabajos de impresión,
              diseño y personalización. Revisamos la información contigo antes
              de confirmar alcance, precio y fecha.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/solicitud"
                className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) bg-brand-primary px-6 text-base font-semibold text-white transition-colors hover:bg-brand-primary-hover"
              >
                Enviar solicitud
              </Link>
              <Link
                href="/estado"
                className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-6 text-base font-semibold text-text-primary transition-colors hover:bg-surface-muted"
              >
                Consultar estado
              </Link>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-text-secondary">
              Enviar una solicitud no confirma todavía un pedido ni inicia la
              producción.
            </p>
          </div>

          <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
              Cómo funciona
            </p>
            <h2 className="mt-2 text-xl font-semibold text-text-primary">
              De la idea al trabajo confirmado
            </h2>
            <ol className="mt-6 space-y-4">
              {processSteps.map(([title, description], index) => (
                <li key={title} className="flex gap-3">
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
        </section>

        <section className="border-y border-border bg-surface-raised">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                Seguimiento
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
                Consulta el estado de tu solicitud o trabajo
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                Usa el código de seguimiento que recibiste para consultar una
                actualización pública y segura.
              </p>
            </div>
            <div className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
              <PublicTrackingSearchForm
                layout="inline"
                helperText="Formato esperado: GD-XXXX-XXXX."
              />
              <Link
                href="/estado"
                className="mt-4 inline-flex min-h-10 items-center rounded-(--radius-control) text-sm font-semibold text-brand-primary underline-offset-4 transition-colors hover:text-brand-primary-hover hover:underline"
              >
                Ir a la página de consulta
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="grid gap-4 sm:grid-cols-3">
            {trustItems.map(([title, description]) => (
              <article
                key={title}
                className="rounded-(--radius-card) border border-border bg-surface p-5"
              >
                <h2 className="text-base font-semibold text-text-primary">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16">
          <div className="flex flex-col gap-5 rounded-(--radius-card) border border-brand-primary/20 bg-brand-primary-soft p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="text-xl font-semibold text-text-primary">
                ¿Tienes la información básica?
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                Envíala aunque falten detalles. El equipo los revisará contigo
                antes de continuar.
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
            <p>Solicitudes revisadas antes de confirmar el trabajo.</p>
          </div>
        </footer>
      </main>
    </div>
  );
}
