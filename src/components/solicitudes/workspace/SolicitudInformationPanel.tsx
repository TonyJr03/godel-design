import Link from "next/link";
import type { ReactNode } from "react";

import { CopyableCode } from "@/components/common/CopyableCode";
import { MetadataGrid, MetadataItem, StatusBadge } from "@/components/ui";
import type { InternalSolicitudDetail } from "@/lib/solicitudes";
import { getSolicitudServiceTypeLabel } from "@/lib/solicitudes";
import { formatAppDateTime } from "@/lib/utils";
import { WORKFLOW_TYPE_LABELS } from "@/lib/workflow-types";

type SolicitudInformationPanelProps = {
  solicitud: InternalSolicitudDetail;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  return value ? DATE_FORMATTER.format(new Date(value)) : "No definida";
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <div className="mt-3 rounded-(--radius-control) border border-border bg-surface-muted p-3">
        {children}
      </div>
    </section>
  );
}

export function SolicitudInformationPanel({
  solicitud,
}: SolicitudInformationPanelProps) {
  return (
    <div className="grid gap-4">
      <PanelSection title="Solicitud">
        <MetadataGrid className="sm:grid-cols-1">
          <MetadataItem
            label="Referencia pública"
            value={
              <CopyableCode
                code={solicitud.public_reference}
                presentation="inline"
              />
            }
          />
          <MetadataItem
            label="Tipo de solicitud"
            value={WORKFLOW_TYPE_LABELS[solicitud.workflow_type]}
          />
          <MetadataItem
            label="Tipo de servicio"
            value={getSolicitudServiceTypeLabel(solicitud.service_type)}
          />
          <MetadataItem
            label="Estado"
            value={<StatusBadge status={solicitud.status} />}
          />
          <MetadataItem
            label="Fecha de recepción"
            value={formatDate(solicitud.created_at)}
          />
          <MetadataItem
            label="Fecha deseada"
            value={formatDate(solicitud.desired_date)}
          />
          <MetadataItem
            label="Última actualización"
            value={formatAppDateTime(solicitud.updated_at, "No definida")}
          />
        </MetadataGrid>
      </PanelSection>

      {solicitud.converted_order_id ? (
        <PanelSection title="Pedido convertido">
          <Link
            href={`/dashboard/pedidos/${solicitud.converted_order_id}`}
            className="inline-flex min-h-11 items-center font-semibold text-brand-primary underline-offset-4 hover:underline"
          >
            Ver pedido generado
          </Link>
        </PanelSection>
      ) : null}

      <PanelSection title="Metadata técnica">
        <MetadataGrid className="sm:grid-cols-1">
          <MetadataItem
            label="Identificador interno"
            value={
              <span className="break-all font-mono text-xs text-text-secondary">
                {solicitud.id}
              </span>
            }
          />
        </MetadataGrid>
      </PanelSection>
    </div>
  );
}
