import Link from "next/link";
import type { ReactNode } from "react";

import type {
  SolicitudDetailAction,
  UpdateSolicitudStatusActionState,
} from "@/app/dashboard/solicitudes/[id]/actions";
import { CopyableCode } from "@/components/common/CopyableCode";
import {
  DetailPanel,
  MetadataGrid,
  MetadataItem,
  StatusBadge,
} from "@/components/ui";
import type { InternalSolicitudDetail as InternalSolicitudDetailData } from "@/lib/solicitudes";
import { getSolicitudServiceTypeLabel } from "@/lib/solicitudes";
import { SolicitudStatusForm } from "./SolicitudStatusForm";
import { WorkflowTypeBadge } from "./WorkflowTypeBadge";
import {
  WORKFLOW_TYPES,
  WORKFLOW_TYPE_LABELS,
} from "@/lib/workflow-types";

type InternalSolicitudDetailProps = {
  solicitud: InternalSolicitudDetailData;
  updateStatusAction: SolicitudDetailAction<UpdateSolicitudStatusActionState>;
  clienteSection?: ReactNode;
  conversionSection?: ReactNode;
  filesSection?: ReactNode;
  commentsSection?: ReactNode;
  historySection?: ReactNode;
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

export function InternalSolicitudDetail({
  solicitud,
  updateStatusAction,
  clienteSection,
  conversionSection,
  filesSection,
  commentsSection,
  historySection,
}: InternalSolicitudDetailProps) {
  const serviceTypeLabel = getSolicitudServiceTypeLabel(solicitud.service_type);
  const isPrintWorkflow =
    solicitud.workflow_type === WORKFLOW_TYPES.IMPRESION;
  const workflowTypeLabel = WORKFLOW_TYPE_LABELS[solicitud.workflow_type];

  return (
    <article className="space-y-6">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-sm font-semibold text-brand-primary">
              Referencia interna {formatShortReference(solicitud.id)}
            </p>
            <WorkflowTypeBadge workflowType={solicitud.workflow_type} />
            <StatusBadge status={solicitud.status} />
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text-primary">
            Solicitud de {solicitud.client_name}
          </h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-text-secondary">
            {serviceTypeLabel}
          </p>
        </div>
        <Link
          href="/dashboard/solicitudes"
          className="inline-flex min-h-11 items-center justify-center rounded-(--radius-control) border border-border-strong bg-surface px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-muted"
        >
          Volver a solicitudes
        </Link>
      </header>

      <CopyableCode
        code={solicitud.public_reference}
        helperText="Comparte este código con el cliente para consultar el estado público. Si la solicitud ya fue convertida, el mismo código mostrará el pedido asociado."
        className="border-brand-primary/20 bg-brand-primary-soft"
      />

      <section className="rounded-(--radius-card) border border-border bg-surface p-5 shadow-(--shadow-soft) sm:p-6">
        <MetadataGrid className="lg:grid-cols-5">
          <MetadataItem label="Cliente" value={solicitud.client_name} />
          <MetadataItem
            label="Tipo de solicitud"
            value={workflowTypeLabel}
          />
          <MetadataItem label="Servicio" value={serviceTypeLabel} />
          <MetadataItem
            label="Fecha deseada"
            value={formatDate(solicitud.desired_date)}
          />
          <MetadataItem
            label="Recepción"
            value={formatDate(solicitud.created_at)}
          />
        </MetadataGrid>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="order-2 min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
          <DetailPanel
            title={
              isPrintWorkflow
                ? "Datos de impresión solicitada"
                : "Trabajo solicitado"
            }
            description={
              isPrintWorkflow
                ? "Opciones recibidas para preparar la impresión."
                : "Descripción recibida para valorar y preparar el encargo."
            }
          >
            <p className="whitespace-pre-wrap text-sm leading-7 text-text-primary">
              {solicitud.description}
            </p>
            {solicitud.notes ? (
              <div className="mt-5 border-t border-border pt-5">
                <h3 className="text-sm font-semibold text-text-primary">
                  Observaciones
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-secondary">
                  {solicitud.notes}
                </p>
              </div>
            ) : null}
          </DetailPanel>

          {filesSection}
          {commentsSection}
          {historySection}
        </div>

        <aside className="contents min-w-0 xl:col-start-2 xl:row-start-1 xl:block xl:space-y-6">
          <div className="order-1 space-y-6 xl:block">
            <DetailPanel
              title="Gestión interna"
              description="Actualiza el estado siguiendo las transiciones permitidas."
            >
              <SolicitudStatusForm
                updateStatusAction={updateStatusAction}
                currentStatus={solicitud.status}
              />
            </DetailPanel>

            {clienteSection}
            {conversionSection}
          </div>

          <div className="order-3 space-y-6 xl:block">
            <DetailPanel
              title="Contacto recibido"
              description="Datos capturados en la solicitud pública."
            >
              <MetadataGrid className="sm:grid-cols-1">
                <MetadataItem label="Teléfono" value={solicitud.client_phone} />
                <MetadataItem
                  label="Correo electrónico"
                  value={solicitud.client_email ?? "No informado"}
                />
              </MetadataGrid>
            </DetailPanel>

            <DetailPanel
              title="Metadata"
              description="Información técnica secundaria."
            >
              <MetadataGrid className="sm:grid-cols-1">
                <MetadataItem
                  label="Última actualización"
                  value={formatDate(solicitud.updated_at)}
                />
                <MetadataItem
                  label="Identificador interno"
                  value={
                    <span className="break-all font-mono text-xs text-text-secondary">
                      {solicitud.id}
                    </span>
                  }
                />
              </MetadataGrid>
            </DetailPanel>
          </div>
        </aside>
      </div>
    </article>
  );
}
