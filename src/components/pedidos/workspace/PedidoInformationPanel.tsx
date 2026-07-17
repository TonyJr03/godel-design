import Link from "next/link";
import type { ReactNode } from "react";

import { MetadataGrid, MetadataItem, StatusBadge } from "@/components/ui";
import type { InternalPedidoDetail } from "@/lib/pedidos";
import {
  SOLICITUD_STATUS_LABELS,
  getSolicitudServiceTypeLabel,
} from "@/lib/solicitudes";
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

function formatShortReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

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
      <PanelSection title="Cliente">
        {pedido.clientes ? (
          <MetadataGrid className="sm:grid-cols-1">
            <MetadataItem
              label="Nombre"
              value={
                <Link
                  href={`/dashboard/clientes/${pedido.clientes.id}`}
                  className="inline-flex min-h-11 items-center font-semibold text-brand-primary underline-offset-4 hover:underline"
                >
                  {pedido.clientes.name}
                </Link>
              }
            />
            <MetadataItem label="Teléfono" value={pedido.clientes.phone} />
            <MetadataItem
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

      <PanelSection title="Solicitud de origen">
        {pedido.solicitudes ? (
          <MetadataGrid className="sm:grid-cols-1">
            <MetadataItem
              label="Servicio"
              value={
                <Link
                  href={`/dashboard/solicitudes/${pedido.solicitudes.id}`}
                  className="inline-flex min-h-11 items-center font-semibold text-brand-primary underline-offset-4 hover:underline"
                >
                  {getSolicitudServiceTypeLabel(
                    pedido.solicitudes.service_type,
                  )}
                </Link>
              }
            />
            <MetadataItem
              label="Tipo de solicitud"
              value={WORKFLOW_TYPE_LABELS[pedido.solicitudes.workflow_type]}
            />
            <MetadataItem
              label="Cliente capturado"
              value={pedido.solicitudes.client_name}
            />
            <MetadataItem
              label="Estado"
              value={
                <StatusBadge
                  status={pedido.solicitudes.status}
                  label={SOLICITUD_STATUS_LABELS[pedido.solicitudes.status]}
                />
              }
            />
            <MetadataItem
              label="Fecha deseada"
              value={formatDate(pedido.solicitudes.desired_date)}
            />
            <MetadataItem
              label="Descripción original"
              value={
                <span className="whitespace-pre-line">
                  {pedido.solicitudes.description}
                </span>
              }
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

      <PanelSection title="Información técnica">
        <MetadataGrid className="sm:grid-cols-1">
          <MetadataItem
            label="Referencia interna"
            value={formatShortReference(pedido.id)}
          />
          <MetadataItem
            label="Creación"
            value={formatAppDateTime(pedido.created_at, "No definida")}
          />
          <MetadataItem
            label="Entrega real"
            value={formatDate(pedido.actual_delivery_date)}
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
            value={
              <span className="break-all font-mono text-xs text-text-secondary">
                {pedido.id}
              </span>
            }
          />
        </MetadataGrid>
      </PanelSection>
    </div>
  );
}
