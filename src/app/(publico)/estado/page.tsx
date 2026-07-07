import Link from "next/link";

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

export default async function EstadoPage({ searchParams }: EstadoPageProps) {
  const params = await searchParams;
  const hasReferenceQuery = Object.prototype.hasOwnProperty.call(params, "ref");
  const submittedReference = getSingleSearchParam(params.ref);
  const trackingResult = hasReferenceQuery
    ? await getPublicTrackingStatus(submittedReference)
    : null;
  const hasError = trackingResult?.ok === false;
  const trackingPanel = !trackingResult ? (
    <Alert variant="info" title="Consulta el estado de tu solicitud o pedido.">
      <p className="leading-6">
        El resultado se mostrará aquí después de introducir un código válido con
        formato GD-XXXX-XXXX.
      </p>
    </Alert>
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
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-brand-accent">
            Consulta pública
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Consulta el estado de tu solicitud o pedido
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
            Usa el código de seguimiento que recibiste para ver la etapa actual
            sin compartir datos de contacto ni archivos.
          </p>
        </header>

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Card as="section" variant="raised" padding="lg">
              <h2 className="text-xl font-semibold text-text-primary">
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

          <aside className="space-y-4 lg:sticky lg:top-6">
            <Card as="section" variant="default" padding="md">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                Información visible
              </p>
              <h2 className="mt-2 text-lg font-semibold text-text-primary">
                Qué muestra esta consulta
              </h2>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-text-secondary">
                <li>Estado público de la solicitud o pedido.</li>
                <li>Fechas de recepción, entrega estimada o entrega real.</li>
                <li>Progreso agregado cuando el pedido lo permite.</li>
              </ul>
            </Card>

            <Card as="section" variant="muted" padding="md">
              <h2 className="text-base font-semibold text-text-primary">
                Tus datos siguen protegidos
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Esta página no muestra nombre, teléfono, correo, archivos,
                comentarios, historial interno ni identificadores técnicos.
              </p>
            </Card>

            <div className="flex flex-col gap-3">
              <Link
                href="/solicitud"
                className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) bg-brand-primary px-5 text-base font-semibold text-white transition-colors hover:bg-brand-primary-hover"
              >
                Enviar una solicitud
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-5 text-base font-semibold text-text-primary transition-colors hover:bg-surface-muted"
              >
                Volver al inicio
              </Link>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
