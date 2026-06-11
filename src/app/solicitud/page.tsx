import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicSolicitudForm } from "@/components/solicitudes/PublicSolicitudForm";

export default function SolicitudPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader currentPage="solicitud" />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent">
            Solicitud de trabajo
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Cuéntanos qué necesitas crear
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
            Envía los detalles de tu idea y el equipo de Godel Diseño la
            revisará contigo para confirmar alcance, precio y fecha.
          </p>
          <div className="mt-6 rounded-(--radius-card) border border-brand-primary/20 bg-brand-primary-soft px-4 py-3 text-sm leading-6 text-text-primary sm:px-5">
            <strong>Enviar esta solicitud no confirma un pedido.</strong>{" "}
            Primero revisaremos la información y nos pondremos en contacto
            contigo.
          </div>
        </header>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <PublicSolicitudForm />

          <aside className="space-y-4 lg:sticky lg:top-6">
            <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft)">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                Paso a paso
              </p>
              <h2 className="mt-2 text-lg font-semibold text-text-primary">
                Cómo funciona
              </h2>
              <ol className="mt-5 space-y-5">
                {[
                  [
                    "Envías tu solicitud",
                    "Cuéntanos el trabajo y adjunta referencias si las tienes.",
                  ],
                  [
                    "Revisamos los detalles",
                    "El equipo comprueba la información y prepara las preguntas necesarias.",
                  ],
                  [
                    "Te contactamos",
                    "Confirmamos contigo alcance, precio y fecha antes de continuar.",
                  ],
                  [
                    "Preparamos el trabajo",
                    "Solo después de la confirmación se organiza la producción.",
                  ],
                ].map(([title, description], index) => (
                  <li key={title} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-text-primary">
                        {title}
                      </p>
                      <p className="mt-1 text-sm leading-5 text-text-secondary">
                        {description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="rounded-(--radius-card) border border-border bg-surface-raised p-5">
              <h2 className="text-base font-semibold text-text-primary">
                Antes de empezar
              </h2>
              <ul className="mt-3 space-y-2 text-sm leading-5 text-text-secondary">
                <li>Ten a mano medidas, cantidades y colores importantes.</li>
                <li>Los archivos de referencia son opcionales.</li>
                <li>Podrás aclarar cualquier detalle cuando te contactemos.</li>
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
