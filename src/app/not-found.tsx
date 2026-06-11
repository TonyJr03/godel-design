import Link from "next/link";

import { PublicHeader } from "@/components/layout/PublicHeader";
import { Card } from "@/components/ui";

const secondaryLinkClasses =
  "inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-center text-sm font-semibold text-text-primary transition-colors duration-200 hover:bg-surface-muted";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="flex min-h-[calc(100vh-73px)] items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
        <Card
          as="section"
          variant="raised"
          padding="lg"
          className="relative w-full max-w-2xl overflow-hidden"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-brand-accent"
          />

          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent">
            Página no encontrada · 404
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            No encontramos esta página
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-text-secondary">
            Es posible que la dirección haya cambiado, esté incompleta o ya no
            exista. Puedes regresar a un punto seguro para continuar.
          </p>

          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) bg-brand-primary px-4 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-brand-primary-hover sm:col-span-2"
            >
              Volver al inicio
            </Link>
            <Link href="/solicitud" className={secondaryLinkClasses}>
              Enviar una solicitud
            </Link>
            <Link href="/login" className={secondaryLinkClasses}>
              Acceso interno
            </Link>
          </div>

          <p className="mt-7 border-t border-border pt-5 text-sm leading-6 text-text-muted">
            Si llegaste desde un enlace guardado, vuelve a abrir la sección
            desde la navegación principal.
          </p>
        </Card>
      </main>
    </div>
  );
}
