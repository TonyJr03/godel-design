import Image from "next/image";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";

export default function EstadoLoading() {
  return (
    <div className="min-h-screen bg-brand-primary-soft">
      <PublicHeader currentPage="estado" />
      <main
        aria-busy="true"
        className="flex min-h-[52vh] items-center justify-center px-4 py-10 sm:px-6"
      >
        <section
          aria-labelledby="estado-loading-title"
          className="w-full max-w-sm rounded-(--radius-card) border border-brand-primary/12 bg-surface px-6 py-8 text-center shadow-(--shadow-soft)"
        >
          <div
            role="status"
            aria-live="polite"
            className="flex flex-col items-center"
          >
            <div className="relative flex h-16 w-16 items-center justify-center">
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2 border-brand-accent/20 border-t-brand-accent motion-safe:animate-spin"
              />
              <Image
                src="/brand/godel-diseno-mark.png"
                alt=""
                width={34}
                height={34}
                aria-hidden="true"
                className="h-8 w-8 object-contain"
                loading="eager"
              />
            </div>
            <h1
              id="estado-loading-title"
              className="mt-4 text-base font-semibold text-text-primary"
            >
              Preparando consulta...
            </h1>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Verificando el código público de forma segura.
            </p>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
