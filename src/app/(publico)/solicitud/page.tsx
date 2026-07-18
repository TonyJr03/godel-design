import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicSolicitudForm } from "@/components/solicitudes/PublicSolicitudForm";

const requestSteps = [
  [
    "Envías tu solicitud",
    "Elige Encargo o Impresión y completa los datos necesarios.",
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
] as const;

const preparationItems = [
  "Ten a mano medidas, cantidades y colores importantes.",
  "Para una impresión debes adjuntar el documento que prepararemos.",
  "En los encargos, los archivos de referencia son opcionales.",
  "Podrás aclarar cualquier detalle cuando te contactemos.",
] as const;

export default function SolicitudPage() {
  return (
    <div className="min-h-screen bg-brand-primary-soft">
      <PublicHeader currentPage="solicitud" />
      <main>
        <section className="relative isolate overflow-hidden bg-brand-primary text-white">
          <div
            aria-hidden="true"
            className="absolute -right-20 top-10 -z-10 h-28 w-72 skew-x-[-18deg] bg-white/10"
          />
          <div
            aria-hidden="true"
            className="absolute -left-28 bottom-10 -z-10 h-24 w-72 skew-x-[-16deg] bg-brand-accent/85"
          />
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:py-16">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent-soft">
                Solicitud de trabajo
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                Cuéntanos qué necesitas preparar
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">
                Elige entre un encargo personalizado o una impresión directa.
                Revisaremos la información contigo para confirmar alcance,
                precio y fecha antes de iniciar el trabajo.
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto grid w-full max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0">
              <PublicSolicitudForm />
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24">
              <section className="overflow-hidden rounded-(--radius-card) border border-brand-primary/12 bg-surface p-5 shadow-(--shadow-soft)">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                  Paso a paso
                </p>
                <h2 className="mt-2 text-lg font-semibold text-text-primary">
                  Cómo funciona
                </h2>
                <ol className="mt-5 space-y-5">
                  {requestSteps.map(([title, description], index) => (
                    <li key={title} className="flex gap-3">
                      <span
                        className={[
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                          index === 1 ? "bg-brand-accent" : "bg-brand-primary",
                        ].join(" ")}
                      >
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

              <section className="rounded-(--radius-card) border border-brand-primary/12 bg-surface p-5 shadow-(--shadow-soft)">
                <h2 className="text-base font-semibold text-text-primary">
                  Antes de empezar
                </h2>
                <ul className="mt-3 space-y-2 text-sm leading-5 text-text-secondary">
                  {preparationItems.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
