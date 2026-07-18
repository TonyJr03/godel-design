import Link from "next/link";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";

const secondaryLinkClasses =
  "inline-flex min-h-12 items-center justify-center rounded-(--radius-control) border border-white/24 bg-white/10 px-5 text-center text-base font-semibold text-white transition-colors duration-200 hover:bg-white/18 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary motion-reduce:transition-none";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-brand-primary-soft">
      <PublicHeader />
      <main>
        <section className="relative isolate overflow-hidden bg-brand-primary text-white">
          <div
            aria-hidden="true"
            className="absolute -right-24 top-12 -z-10 h-28 w-80 skew-x-[-18deg] bg-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute -left-28 bottom-10 -z-10 hidden h-24 w-72 skew-x-[-16deg] bg-brand-accent/85 sm:block"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-12 lg:min-h-[calc(100vh-73px-140px)] lg:grid-cols-[minmax(0,1fr)_390px] lg:py-12">
            <header className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent-soft">
                Página no encontrada
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                No encontramos esta página
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">
                Es posible que la dirección haya cambiado, esté incompleta o ya
                no exista. Puedes volver a una zona pública segura para
                continuar.
              </p>
              <div className="mt-6 max-w-2xl rounded-(--radius-card) border border-white/18 bg-white/10 px-4 py-3 text-sm leading-6 text-white shadow-(--shadow-soft) sm:px-5">
                Si llegaste desde un enlace guardado, abre de nuevo la sección
                desde la navegación pública.
              </div>
            </header>

            <aside className="rounded-(--radius-card) border border-white/18 bg-white/10 p-5 shadow-(--shadow-soft) sm:p-6 lg:justify-self-end">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between lg:flex-col lg:items-start">
                <div>
                  <p className="text-6xl font-semibold tracking-tight sm:text-7xl">
                    404
                  </p>
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.16em] text-white/78">
                    Sin resultado
                  </p>
                </div>
                <p className="max-w-sm text-sm leading-6 text-white/82">
                  Elige una acción pública para continuar sin salir del sitio.
                </p>
              </div>

              <div className="mt-6 grid gap-3">
                <Link
                  href="/"
                  className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) bg-white px-5 text-center text-base font-semibold text-brand-primary shadow-(--shadow-soft) transition-colors duration-200 hover:bg-brand-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-primary motion-reduce:transition-none"
                >
                  Volver al inicio
                </Link>
                <Link href="/solicitud" className={secondaryLinkClasses}>
                  Enviar solicitud
                </Link>
                <Link href="/estado" className={secondaryLinkClasses}>
                  Consultar estado
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
