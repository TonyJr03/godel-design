import { Card, MetadataGrid, MetadataItem } from "@/components/ui";
import type { PublicTrackingStatusResult } from "@/lib/public-tracking";
import { formatAppDateTime } from "@/lib/utils";

type PublicTrackingResultCardProps = {
  trackingStatus: PublicTrackingStatusResult;
};

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDateOnly(value: string | null, fallback = "No definida") {
  if (!value) {
    return fallback;
  }

  return DATE_ONLY_FORMATTER.format(new Date(`${value}T00:00:00.000Z`));
}

function clampProgress(value: number) {
  return Math.min(100, Math.max(0, value));
}

function PublicProgress({
  progress,
}: {
  progress: PublicTrackingStatusResult["progress"];
}) {
  if (!progress) {
    return null;
  }

  if (typeof progress.percentage === "number") {
    const progressValue = clampProgress(progress.percentage);

    return (
      <section className="rounded-(--radius-card) border border-brand-primary/12 bg-brand-primary-soft p-4 sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
              Avance público
            </p>
            <h3 className="mt-1 text-sm font-semibold text-text-primary">
              {progress.label}
            </h3>
          </div>
          <p className="text-2xl font-semibold tracking-tight text-brand-primary">
            {progressValue}%
          </p>
        </div>
        <div
          className="mt-4 h-3 overflow-hidden rounded-full bg-surface"
          role="progressbar"
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressValue}
        >
          <div
            className="h-full rounded-full bg-brand-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-(--radius-card) border border-info/30 bg-info-soft px-4 py-3 text-sm leading-6 text-text-primary">
      <p className="font-semibold text-info">Avance público</p>
      <p className="mt-1">{progress.label}</p>
    </section>
  );
}

export function PublicTrackingResultCard({
  trackingStatus,
}: PublicTrackingResultCardProps) {
  const isPedido = trackingStatus.kind === "pedido";

  return (
    <Card
      as="article"
      variant="raised"
      padding="lg"
      className="overflow-hidden border-brand-primary/12 bg-surface"
    >
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
                Resultado encontrado
              </p>
              <span className="inline-flex min-h-8 w-fit items-center rounded-(--radius-control) border border-brand-primary/20 bg-brand-primary-soft px-3 text-xs font-semibold text-brand-primary">
                {isPedido ? "Pedido" : "Solicitud"}
              </span>
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">
              {trackingStatus.statusLabel}
            </h2>
          </div>
          <div className="w-full rounded-(--radius-control) border border-brand-primary/15 bg-brand-primary-soft px-4 py-3 sm:w-auto sm:min-w-56">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary">
              Código de seguimiento
            </p>
            <p className="mt-1 wrap-break-word font-mono text-lg font-semibold text-brand-primary">
              {trackingStatus.publicReference}
            </p>
          </div>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-text-secondary">
          {trackingStatus.statusDescription}
        </p>
      </header>

      <MetadataGrid className="mt-6 rounded-(--radius-card) border border-border bg-surface-raised p-4 sm:p-5">
        <MetadataItem label="Tipo" value={isPedido ? "Pedido" : "Solicitud"} />
        <MetadataItem label="Flujo" value={trackingStatus.workflowLabel} />
        <MetadataItem
          label={isPedido ? "Fecha de creación" : "Fecha de recepción"}
          value={formatAppDateTime(trackingStatus.createdAt, "No definida")}
        />
        {isPedido ? (
          <>
            {trackingStatus.estimatedDeliveryDate ? (
              <MetadataItem
                label="Fecha estimada de entrega"
                value={formatDateOnly(trackingStatus.estimatedDeliveryDate)}
              />
            ) : null}
            {trackingStatus.actualDeliveryDate ? (
              <MetadataItem
                label="Fecha real de entrega"
                value={formatDateOnly(trackingStatus.actualDeliveryDate)}
              />
            ) : null}
          </>
        ) : trackingStatus.desiredDate ? (
          <MetadataItem
            label="Fecha deseada"
            value={formatDateOnly(trackingStatus.desiredDate)}
          />
        ) : null}
      </MetadataGrid>

      <div className="mt-6">
        <PublicProgress progress={trackingStatus.progress} />
      </div>
    </Card>
  );
}
