import { MetadataGrid, MetadataItem } from "@/components/ui";
import type { InternalSolicitudDetail } from "@/lib/solicitudes";

type SolicitudContactPreviewProps = {
  solicitud: InternalSolicitudDetail;
};

export function SolicitudContactPreview({
  solicitud,
}: SolicitudContactPreviewProps) {
  return (
    <section
      aria-labelledby="solicitud-contact-preview-title"
      className="flex min-h-0 flex-col rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6 xl:h-full xl:overflow-hidden"
    >
      <h2
        id="solicitud-contact-preview-title"
        className="shrink-0 text-lg font-semibold text-text-primary"
      >
        Contacto recibido
      </h2>

      <div className="mt-5 min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain">
        <MetadataGrid>
          <MetadataItem label="Nombre" value={solicitud.client_name} />
          <MetadataItem label="Teléfono" value={solicitud.client_phone} />
          <MetadataItem
            className="min-w-0 sm:col-span-2"
            label="Correo electrónico"
            value={solicitud.client_email ?? "No informado"}
          />
        </MetadataGrid>
      </div>
    </section>
  );
}
