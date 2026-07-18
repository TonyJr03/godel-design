import Link from "next/link";

import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";
import { PublicTrackingResultCard } from "@/components/tracking/PublicTrackingResultCard";
import { PublicTrackingSearchForm } from "@/components/tracking/PublicTrackingSearchForm";
import { Alert, Card } from "@/components/ui";
import { getPublicTrackingStatus } from "@/lib/public-tracking";

export const dynamic = "force-dynamic";

type EstadoPageProps = {
  searchParams: Promise<{
    ref?: string | string[];
  }>;
};

function getSingleSearchParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

const visibleInfoItems = [
  "Estado público de la solicitud o pedido.",
  "Fechas de recepción, entrega estimada o entrega real.",
  "Progreso agregado cuando el pedido lo permite.",
] as const;

const privacyInfoItems = [
  "La consulta usa solo el código público de seguimiento.",
  "Los datos personales y detalles privados no se muestran en esta página.",
  "Si falta contexto, el equipo lo revisa directamente contigo.",
] as const;

export default async function EstadoPage({ searchParams }: EstadoPageProps) {
  const params = await searchParams;
  const hasReferenceQuery = Object.prototype.hasOwnProperty.call(params, "ref");
  const submittedReference = getSingleSearchParam(params.ref);
  const trackingResult = hasReferenceQuery
    ? await getPublicTrackingStatus(submittedReference)
    : null;
  const hasError = trackingResult?.ok === false;
  const trackingPanel = !trackingResult ? (
    <section
      aria-live="polite"
      className="overflow-hidden rounded-(--radius-card) border border-brand-primary/12 bg-surface p-6 shadow-(--shadow-soft) sm:p-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-primary-soft text-lg font-semibold text-brand-primary"
        >
          GD
        </div>
        <div>
          <h2 className="text-xl font-semibold text-text-primary">
            El resultado aparecerá aquí
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Introduce un código válido con formato GD-XXXX-XXXX para consultar
            la etapa actual. Si acabas de enviar una solicitud, usa el código
            que recibiste al finalizar.
          </p>
        </div>
      </div>
    </section>
  ) : trackingResult.ok ? (
    <PublicTrackingResultCard trackingStatus={trackingResult.trackingStatus} />
  ) : (
    <Alert
      variant={trackingResult.reason === "error" ? "warning" : "danger"}
      title={
        trackingResult.reason === "not_found"
          ? "Código no encontrado"
          : trackingResult.reason === "invalid_reference"
            ? "Código inválido"
            : "Consulta no disponible"
      }
      aria-live="polite"
    >
      <p className="leading-6">{trackingResult.message}</p>
    </Alert>
  );

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
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent-soft">
                Consulta pública
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
                Consulta el estado de tu solicitud o pedido
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/82 sm:text-lg">
                Usa el código de seguimiento que recibiste para ver la etapa
                actual sin compartir datos de contacto ni información privada.
              </p>
            </header>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto grid w-full max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="min-w-0 space-y-6">
              <Card
                as="section"
                variant="raised"
                padding="lg"
                className="border-brand-primary/12 bg-surface"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                  Búsqueda segura
                </p>
                <h2 className="mt-2 text-xl font-semibold text-text-primary">
                  Código de seguimiento
                </h2>
                <p className="mt-2 text-sm leading-6 text-text-secondary">
                  Introduce el código que recibiste al enviar tu solicitud o al
                  crear tu pedido.
                </p>
                <div className="mt-6">
                  <PublicTrackingSearchForm
                    defaultReference={submittedReference}
                    hasError={hasError}
                  />
                </div>
              </Card>

              {trackingPanel}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-24">
              <Card
                as="section"
                variant="default"
                padding="md"
                className="border-brand-primary/12 bg-surface shadow-(--shadow-soft)"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                  Información visible
                </p>
                <h2 className="mt-2 text-lg font-semibold text-text-primary">
                  Qué muestra esta consulta
                </h2>
                <ul className="mt-4 space-y-2 text-sm leading-6 text-text-secondary">
                  {visibleInfoItems.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-accent"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card
                as="section"
                variant="default"
                padding="md"
                className="border-brand-primary/12 bg-surface shadow-(--shadow-soft)"
              >
                <h2 className="text-base font-semibold text-text-primary">
                  Tus datos siguen protegidos
                </h2>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
                  {privacyInfoItems.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <div className="flex flex-col gap-3">
                <Link
                  href="/solicitud"
                  className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) bg-brand-primary px-5 text-base font-semibold text-white shadow-(--shadow-soft) transition-colors duration-200 hover:bg-brand-primary-hover"
                >
                  Enviar una solicitud
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-5 text-base font-semibold text-text-primary transition-colors duration-200 hover:bg-surface-muted"
                >
                  Volver al inicio
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
