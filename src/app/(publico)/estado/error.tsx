"use client";

import Link from "next/link";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { Alert, Button, Card } from "@/components/ui";

type EstadoErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const secondaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

const ghostLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) px-4 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

export default function EstadoError({ reset }: EstadoErrorProps) {
  return (
    <div className="min-h-screen bg-brand-primary-soft">
      <PublicHeader currentPage="estado" />
      <main>
        <section className="relative isolate overflow-hidden bg-brand-primary text-white">
          <div
            aria-hidden="true"
            className="absolute -right-24 top-12 -z-10 h-28 w-80 skew-x-[-18deg] bg-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute -left-28 bottom-10 -z-10 h-24 w-72 skew-x-[-16deg] bg-brand-accent/85"
          />
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
            <header className="max-w-3xl">
              <p className="text-sm font-semibold uppercase text-brand-accent-soft">
                Consulta pública
              </p>
              <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">
                No pudimos completar la consulta
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">
                La vista de seguimiento no está disponible en este momento.
              </p>
            </header>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto w-full max-w-6xl">
            <Card
              as="section"
              variant="raised"
              padding="lg"
              className="max-w-3xl border-brand-primary/12 bg-surface"
            >
              <Alert variant="danger" title="Consulta no disponible">
                <p className="leading-6">
                  Intenta consultar nuevamente. También puedes volver al inicio
                  y regresar a esta sección más tarde.
                </p>
              </Alert>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => reset()}
                  className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
                >
                  Reintentar
                </Button>
                <Link href="/estado" className={secondaryLinkClasses}>
                  Volver a consulta
                </Link>
                <Link href="/" className={ghostLinkClasses}>
                  Ir al inicio
                </Link>
              </div>
            </Card>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
