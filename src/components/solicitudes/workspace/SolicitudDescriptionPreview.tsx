import type { InternalSolicitudDetail } from "@/lib/solicitudes";
import { WORKFLOW_TYPES } from "@/lib/workflow-types";

type SolicitudDescriptionPreviewProps = {
  solicitud: InternalSolicitudDetail;
  className?: string;
};

export function SolicitudDescriptionPreview({
  solicitud,
  className,
}: SolicitudDescriptionPreviewProps) {
  const title =
    solicitud.workflow_type === WORKFLOW_TYPES.IMPRESION
      ? "Datos de impresión solicitada"
      : "Trabajo solicitado";
  const description = solicitud.description.trim()
    ? solicitud.description
    : "Sin descripción registrada.";

  return (
    <section
      aria-labelledby="solicitud-description-preview-title"
      className={[
        "flex min-h-0 flex-col rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6 xl:h-full xl:overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <h2
        id="solicitud-description-preview-title"
        className="shrink-0 text-lg font-semibold text-text-primary"
      >
        {title}
      </h2>

      <div className="mt-4 min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
        <p className="whitespace-pre-wrap wrap-break-word text-sm leading-7 text-text-secondary">
          {description}
        </p>

        {solicitud.notes?.trim() ? (
          <div className="mt-5 border-t border-border pt-5">
            <h3 className="text-sm font-semibold text-text-primary">
              Observaciones
            </h3>
            <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-7 text-text-secondary">
              {solicitud.notes}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
