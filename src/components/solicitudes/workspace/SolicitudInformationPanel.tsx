import Link from "next/link";

import { CopyableCode } from "@/components/common/CopyableCode";
import { InternalServiceDisplay } from "@/components/service-types/InternalServiceDisplay";
import { MetadataGrid, MetadataItem, StatusBadge } from "@/components/ui";
import { InformationPanelSection } from "@/components/workspace/InformationPanelSection";
import type { InternalCliente } from "@/lib/clientes";
import {
  getSolicitudServiceTypeLabel,
  type InternalSolicitudDetail,
} from "@/lib/solicitudes";
import { formatAppDateTime } from "@/lib/utils";
import { WORKFLOW_TYPE_LABELS } from "@/lib/workflow-types";

type SolicitudInformationPanelProps = {
  solicitud: InternalSolicitudDetail;
  clienteAsociado?: Pick<InternalCliente, "id" | "name"> | null;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const metadataLinkClassName =
  "font-semibold text-brand-primary underline-offset-4 transition-colors hover:text-brand-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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

export function SolicitudInformationPanel({
  solicitud,
  clienteAsociado,
}: SolicitudInformationPanelProps) {
  return (
    <div className="grid gap-5">
      <InformationPanelSection title="Trabajo solicitado">
        <MetadataGrid className="sm:grid-cols-1">
          <MetadataItem
            label="Servicio"
            value={
              <InternalServiceDisplay
                service={solicitud.service}
                fallback={getSolicitudServiceTypeLabel(
                  solicitud.service_type,
                )}
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
      </InformationPanelSection>

      <InformationPanelSection title="Contacto recibido">
        <MetadataGrid className="sm:grid-cols-1">
          <MetadataItem label="Nombre" value={solicitud.client_name} />
          <MetadataItem label="Teléfono" value={solicitud.client_phone} />
          <MetadataItem
            label="Correo electrónico"
            value={solicitud.client_email ?? "No definido"}
          />
        </MetadataGrid>
      </InformationPanelSection>

      <InformationPanelSection title="Relaciones">
        <MetadataGrid className="sm:grid-cols-1">
          <MetadataItem
            label="Cliente interno"
            value={
              clienteAsociado ? (
                <Link
                  href={`/dashboard/clientes/${clienteAsociado.id}`}
                  className={metadataLinkClassName}
                >
                  {clienteAsociado.name}
                </Link>
              ) : (
                "Sin cliente interno asociado."
              )
            }
          />
          {solicitud.converted_order_id ? (
            <MetadataItem
              label="Pedido generado"
              value={
                <Link
                  href={`/dashboard/pedidos/${solicitud.converted_order_id}`}
                  className={metadataLinkClassName}
                >
                  Ver pedido generado
                </Link>
              }
            />
          ) : null}
        </MetadataGrid>
      </InformationPanelSection>

      <InformationPanelSection title="Registro">
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
      </InformationPanelSection>
    </div>
  );
}
