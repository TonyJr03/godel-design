import type { ReactNode } from "react";
import Link from "next/link";

import { InternalServiceDisplay } from "@/components/service-types/InternalServiceDisplay";
import {
  MetadataGrid,
  MetadataItem,
  PriorityBadge,
  StatusBadge,
} from "@/components/ui";
import {
  PEDIDO_PRIORITY_LABELS,
  type InternalPedidoDetail,
} from "@/lib/pedidos";
import { formatAppDateTime } from "@/lib/utils";
import { WORKFLOW_TYPE_LABELS } from "@/lib/workflow-types";

type PedidoInformationPanelProps = {
  pedido: InternalPedidoDetail;
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

export function PedidoInformationPanel({ pedido }: PedidoInformationPanelProps) {
  return (
    <div className="grid gap-5">
      <PanelSection title="Trabajo">
        <MetadataGrid>
          <MetadataItem
            label="Servicio"
            value={
              <InternalServiceDisplay
                service={pedido.service}
                showWorkflow={false}
              />
            }
          />
          <MetadataItem
            label="Tipo de trabajo"
            value={WORKFLOW_TYPE_LABELS[pedido.workflow_type]}
          />
          <MetadataItem
            label="Estado"
            value={<StatusBadge status={pedido.status} />}
          />
          <MetadataItem
            label="Prioridad"
            value={
              <PriorityBadge
                priority={pedido.priority}
                label={PEDIDO_PRIORITY_LABELS[pedido.priority]}
              />
            }
          />
          <MetadataItem
            label="Entrega estimada"
            value={formatDate(pedido.estimated_delivery_date)}
          />
          <MetadataItem
            label="Entrega real"
            value={formatDate(pedido.actual_delivery_date)}
          />
        </MetadataGrid>
      </PanelSection>

      <PanelSection title="Cliente">
        {pedido.clientes ? (
          <MetadataGrid>
            <MetadataItem
              label="Nombre"
              value={
                <Link
                  href={`/dashboard/clientes/${pedido.clientes.id}`}
                  className={metadataLinkClassName}
                >
                  {pedido.clientes.name}
                </Link>
              }
            />
            <MetadataItem label="Teléfono" value={pedido.clientes.phone} />
            <MetadataItem
              className="sm:col-span-2"
              label="Correo electrónico"
              value={pedido.clientes.email ?? "No definido"}
            />
          </MetadataGrid>
        ) : (
          <p className="text-sm leading-6 text-text-secondary">
            {pedido.cliente_id
              ? "El pedido tiene un cliente asociado, pero sus datos no están disponibles."
              : "Este pedido no tiene cliente asociado."}
          </p>
        )}
      </PanelSection>

      <PanelSection title="Origen">
        {pedido.solicitudes ? (
          <MetadataGrid>
            <MetadataItem
              label="Solicitud de origen"
              value={
                <Link
                  href={`/dashboard/solicitudes/${pedido.solicitudes.id}`}
                  className={metadataLinkClassName}
                >
                  Ver solicitud
                </Link>
              }
            />
            <MetadataItem
              label="Servicio solicitado"
              value={
                <InternalServiceDisplay
                  service={pedido.solicitudes.service}
                  showWorkflow={false}
                />
              }
            />
            <MetadataItem
              label="Tipo de solicitud"
              value={WORKFLOW_TYPE_LABELS[pedido.solicitudes.workflow_type]}
            />
            <MetadataItem
              label="Fecha deseada"
              value={formatDate(pedido.solicitudes.desired_date)}
            />
          </MetadataGrid>
        ) : (
          <p className="text-sm leading-6 text-text-secondary">
            {pedido.solicitud_id
              ? "La solicitud asociada no está disponible para mostrar."
              : "Pedido creado manualmente, sin solicitud de origen."}
          </p>
        )}
      </PanelSection>

      <PanelSection title="Registro">
        <MetadataGrid>
          <MetadataItem
            label="Creación"
            value={formatAppDateTime(pedido.created_at, "No definida")}
          />
          <MetadataItem
            label="Creado por"
            value={pedido.creador?.full_name ?? "No definido"}
          />
          <MetadataItem
            label="Última actualización"
            value={formatAppDateTime(pedido.updated_at, "No definida")}
          />
          <MetadataItem
            label="Identificador interno"
            value={<InternalId id={pedido.id} />}
          />
        </MetadataGrid>
      </PanelSection>
    </div>
  );
}
