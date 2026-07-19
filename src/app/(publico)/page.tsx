import Image from "next/image";
import Link from "next/link";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicTrackingSearchForm } from "@/components/tracking/PublicTrackingSearchForm";

const processSteps = [
  [
    "Envías tu solicitud",
    "Comparte el tipo de trabajo, cantidades, medidas y referencias disponibles.",
  ],
  [
    "Revisamos contigo",
    "El equipo valida detalles, archivos y condiciones antes de avanzar.",
  ],
  [
    "Confirmamos el trabajo",
    "Acordamos alcance, fecha y próximos pasos antes de producir.",
  ],
] as const;

const capabilities = [
  "Impresiones",
  "Diseños personalizados",
  "Personalización de productos",
  "Referencias y archivos",
] as const;

const trustItems = [
  [
    "Revisión humana",
    "Cada solicitud se revisa antes de convertirse en trabajo confirmado.",
  ],
  [
    "Archivos protegidos",
    "Las referencias adjuntas se usan solo para evaluar tu solicitud.",
  ],
  [
    "Comunicación previa",
    "Confirmamos los detalles contigo antes de iniciar la producción.",
  ],
] as const;

export default function Home() {
  return (
    <div className="min-h-screen bg-brand-primary-soft">
      <PublicHeader currentPage="home" />
      <main className="overflow-hidden">
        <section className="relative isolate bg-brand-primary text-white">
          <div
            className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.16),rgba(255,255,255,0)_34%),linear-gradient(135deg,#145d99_0%,#104e82_58%,#0b3a65_100%)]"
            aria-hidden="true"
          />
          <div
            className="absolute -right-32 top-0 -z-10 h-full w-1/2 skew-x-[-15deg] bg-white/10"
            aria-hidden="true"
          />
          <div
            className="absolute -left-28 bottom-12 -z-10 h-28 w-72 skew-x-[-16deg] bg-brand-accent/80"
            aria-hidden="true"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:py-24 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-16">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/75">
                Impresión, diseño y personalización
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                Da forma a tu idea con una solicitud clara
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-white/82">
                Cuéntanos qué necesitas preparar. Revisamos tu solicitud,
                aclaramos los detalles contigo y confirmamos el trabajo antes de
                producir.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/solicitud"
                  className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) bg-white px-6 text-base font-semibold text-brand-primary shadow-(--shadow-soft) transition-colors duration-200 hover:bg-brand-primary-soft"
                >
                  Enviar solicitud
                </Link>
                <Link
                  href="/estado"
                  className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) border border-white/35 bg-white/10 px-6 text-base font-semibold text-white transition-colors duration-200 hover:bg-white/18"
                >
                  Consultar estado
                </Link>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/76">
                Enviar una solicitud no confirma todavía un pedido ni inicia la
                producción.
              </p>
            </div>

            <div className="relative mx-auto hidden w-full max-w-sm flex-col items-center justify-center py-4 text-center sm:py-6 xl:flex xl:max-w-none">
              <Image
                src="/brand/godel-diseno-horizontal-on-dark.png"
                alt="Godel Diseño"
                width={420}
                height={124}
                className="mx-auto h-auto w-full max-w-80 sm:max-w-96"
                loading="eager"
              />
              <p className="mt-7 text-sm font-semibold uppercase tracking-[0.14em] text-white">
                Producción personalizada
              </p>
              <p className="mt-3 max-w-80 text-sm leading-6 text-white/76">
                Diseño, impresión y personalización preparados con revisión
                humana.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-surface">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">
                Proceso acompañado
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
                Un proceso claro para preparar tu trabajo
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                Cada solicitud ordena la conversación inicial antes de convertir
                una idea en trabajo confirmado.
              </p>
            </div>
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {processSteps.map(([title, description], index) => (
                <article
                  key={title}
                  className="relative overflow-hidden rounded-(--radius-card) border border-brand-primary/12 bg-surface p-5 shadow-(--shadow-soft)"
                >
                  <div
                    className="absolute -right-10 top-0 h-24 w-20 skew-x-[-18deg] bg-brand-primary-soft"
                    aria-hidden="true"
                  />
                  <span
                    className={[
                      "relative flex h-10 w-10 items-center justify-center rounded-(--radius-control) text-sm font-semibold text-white",
                      index === 1 ? "bg-brand-accent" : "bg-brand-primary",
                    ].join(" ")}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <h3 className="relative mt-4 text-base font-semibold text-text-primary">
                    {title}
                  </h3>
                  <p className="relative mt-2 text-sm leading-6 text-text-secondary">
                    {description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-brand-primary-soft">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">
                Qué puedes solicitar
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
                Capacidades generales para preparar tu trabajo
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                Cuéntanos lo que tienes en mente. La solicitud sirve para
                entender el alcance y ordenar la conversación inicial.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {capabilities.map((capability, index) => (
                <article
                  key={capability}
                  className="relative overflow-hidden rounded-(--radius-card) border border-brand-primary/12 bg-surface p-5 shadow-(--shadow-soft)"
                >
                  <div
                    className={[
                      "absolute inset-y-0 right-0 w-14 skew-x-[-16deg]",
                      index % 2 === 0
                        ? "bg-brand-primary-soft"
                        : "bg-brand-accent-soft",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <span
                    className={[
                      "relative block h-1.5 w-10 rounded-full",
                      index % 2 === 0 ? "bg-brand-primary" : "bg-brand-accent",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <h3 className="relative mt-4 text-lg font-semibold text-text-primary">
                    {capability}
                  </h3>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative bg-surface">
          <div
            className="absolute inset-y-0 right-0 w-1/3 skew-x-[-16deg] bg-brand-primary-soft"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid w-full max-w-6xl gap-7 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-primary">
                Seguimiento
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">
                Consulta el estado con tu código
              </h2>
              <p className="mt-3 text-sm leading-6 text-text-secondary">
                Usa el código que recibiste para consultar una actualización
                pública y segura.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-(--radius-card) border border-brand-primary/20 bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
              <div
                className="absolute inset-y-0 left-0 w-1.5 bg-brand-primary"
                aria-hidden="true"
              />
              <div
                className="absolute -right-12 -top-10 h-24 w-28 skew-x-[-18deg] bg-brand-accent-soft"
                aria-hidden="true"
              />
              <div className="relative">
                <PublicTrackingSearchForm
                  layout="inline"
                  helperText="Formato esperado: GD-XXXX-XXXX."
                />
                <Link
                  href="/estado"
                  className="mt-4 inline-flex min-h-10 items-center rounded-(--radius-control) text-sm font-semibold text-brand-primary underline-offset-4 transition-colors duration-200 hover:text-brand-primary-hover hover:underline"
                >
                  Ir a la página de consulta
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-brand-primary-soft">
          <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-12 sm:grid-cols-3 sm:px-6 sm:py-16">
            {trustItems.map(([title, description], index) => (
              <article
                key={title}
                className="rounded-(--radius-card) border border-brand-primary/12 bg-surface p-5 shadow-(--shadow-soft)"
              >
                <span
                  className={[
                    "flex h-10 w-10 items-center justify-center rounded-(--radius-control) text-sm font-semibold text-white",
                    index === 1 ? "bg-brand-accent" : "bg-brand-primary",
                  ].join(" ")}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <h2 className="mt-4 text-base font-semibold text-text-primary">
                  {title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  {description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-brand-primary-soft px-4 pb-12 sm:px-6 sm:pb-16">
          <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-(--radius-card) bg-brand-primary p-6 text-white shadow-(--shadow-soft) sm:p-8">
            <div
              className="absolute -right-12 inset-y-0 w-36 skew-x-[-18deg] bg-brand-accent"
              aria-hidden="true"
            />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  Listo para compartir tu idea
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/78">
                  Envía la información disponible. El equipo revisará los
                  detalles contigo antes de continuar.
                </p>
              </div>
              <Link
                href="/solicitud"
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-(--radius-control) bg-white px-6 text-base font-semibold text-brand-primary shadow-(--shadow-soft) transition-colors duration-200 hover:bg-brand-primary-soft"
              >
                Enviar solicitud
              </Link>
            </div>
          </div>
        </section>

        <PublicFooter />
      </main>
    </div>
  );
}
