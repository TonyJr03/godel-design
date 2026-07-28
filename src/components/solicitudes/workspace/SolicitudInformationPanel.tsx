import type { ReactNode } from "react";

import { CopyableCode } from "@/components/common/CopyableCode";
import { InternalServiceDisplay } from "@/components/service-types/InternalServiceDisplay";
import { MetadataGrid, MetadataItem, StatusBadge } from "@/components/ui";
import type { InternalSolicitudDetail } from "@/lib/solicitudes";
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

function InternalId({ id }: { id: string }) {
  return (
    <span className="break-all font-mono text-xs text-text-secondary">
      {id}
    </span>
  );
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>

      <div className="mt-4 rounded-(--radius-control) border border-border bg-surface-muted p-4">
        {children}
      </div>
    </section>
  );
}

export function SolicitudInformationPanel({
  solicitud,
}: SolicitudInformationPanelProps) {
  return (
    <div className="grid gap-5">
      <PanelSection title="Trabajo solicitado">
        <MetadataGrid>
          <MetadataItem
            label="Servicio"
            value={
              <InternalServiceDisplay
                service={solicitud.service}
                showWorkflow={false}
              />
            }
          />
          <MetadataItem
            label="Tipo de trabajo"
            value={WORKFLOW_TYPE_LABELS[solicitud.workflow_type]}
          />
          <MetadataItem
            label="Estado"
            value={<StatusBadge status={solicitud.status} />}
          />
          <MetadataItem
            label="Fecha deseada"
            value={formatDate(solicitud.desired_date)}
          />
        </MetadataGrid>
      </PanelSection>

      <PanelSection title="Registro">
        <MetadataGrid>
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
            label="Fecha de recepción"
            value={formatDate(solicitud.created_at)}
          />
          <MetadataItem
            label="Última actualización"
            value={formatAppDateTime(solicitud.updated_at, "No definida")}
          />
          <MetadataItem
            label="Identificador interno"
            value={<InternalId id={solicitud.id} />}
          />
        </MetadataGrid>
      </PanelSection>
    </div>
  );
}
