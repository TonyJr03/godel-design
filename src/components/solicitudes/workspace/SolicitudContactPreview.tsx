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
      className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6"
    >
      <h2
        id="solicitud-contact-preview-title"
        className="text-lg font-semibold text-text-primary"
      >
        Contacto recibido
      </h2>

      <MetadataGrid className="mt-5 sm:grid-cols-1">
        <MetadataItem label="Nombre" value={solicitud.client_name} />
        <MetadataItem label="Teléfono" value={solicitud.client_phone} />
        <MetadataItem
          label="Correo electrónico"
          value={solicitud.client_email ?? "No informado"}
        />
      </MetadataGrid>
    </section>
  );
}
