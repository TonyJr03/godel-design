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
      <section className="rounded-(--radius-control) border border-border bg-surface-raised p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {progress.label}
          </h3>
          <p className="text-sm font-semibold text-brand-primary">
            {progressValue}%
          </p>
        </div>
        <div
          className="mt-3 h-3 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressValue}
        >
          <div
            className="h-full rounded-full bg-brand-primary transition-[width] duration-300"
            style={{ width: `${progressValue}%` }}
          />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-(--radius-control) border border-info/30 bg-info-soft px-4 py-3 text-sm leading-6 text-text-primary">
      {progress.label}
    </section>
  );
}

export function PublicTrackingResultCard({
  trackingStatus,
}: PublicTrackingResultCardProps) {
  const isPedido = trackingStatus.kind === "pedido";

  return (
    <Card as="article" variant="raised" padding="lg" className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-accent">
              Resultado encontrado
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
              {trackingStatus.statusLabel}
            </h2>
          </div>
          <span className="inline-flex min-h-9 w-fit items-center rounded-(--radius-control) border border-brand-primary/20 bg-brand-primary-soft px-3 text-sm font-semibold text-brand-primary">
            {isPedido ? "Pedido" : "Solicitud"}
          </span>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-text-secondary">
          {trackingStatus.statusDescription}
        </p>
      </header>

      <MetadataGrid>
        <MetadataItem
          label="Código de seguimiento"
          value={
            <span className="font-mono font-semibold">
              {trackingStatus.publicReference}
            </span>
          }
        />
        {isPedido && trackingStatus.orderNumber ? (
          <MetadataItem
            label="Número de pedido"
            value={trackingStatus.orderNumber}
          />
        ) : null}
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

      <PublicProgress progress={trackingStatus.progress} />
    </Card>
  );
}
