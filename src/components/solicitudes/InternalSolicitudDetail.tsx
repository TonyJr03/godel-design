import Link from "next/link";
import type { ReactNode } from "react";
import type { InternalSolicitudDetail as InternalSolicitudDetailData } from "@/lib/solicitudes";
import {
  SOLICITUD_STATUS_LABELS,
  getSolicitudServiceTypeLabel,
} from "@/lib/solicitudes";
import { SolicitudStatusForm } from "./SolicitudStatusForm";

type InternalSolicitudDetailProps = {
  solicitud: InternalSolicitudDetailData;
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
  if (!value) {
    return "No definida";
  }

  return DATE_FORMATTER.format(new Date(value));
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 text-sm text-zinc-900">{value}</dd>
    </div>
  );
}

export function InternalSolicitudDetail({
  solicitud,
  clienteSection,
  conversionSection,
  filesSection,
  commentsSection,
  historySection,
}: InternalSolicitudDetailProps) {
  const serviceTypeLabel = getSolicitudServiceTypeLabel(solicitud.service_type);

  return (
    <article className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-sm font-semibold text-teal-700">
            {formatShortReference(solicitud.id)}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
            Solicitud de {solicitud.client_name}
          </h1>
          <p className="mt-3 text-base leading-7 text-zinc-600">
            {serviceTypeLabel}
          </p>
        </div>
        <Link
          href="/dashboard/solicitudes"
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-800 transition hover:border-zinc-400"
        >
          Volver al listado
        </Link>
      </div>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex rounded-md bg-teal-50 px-2.5 py-1.5 text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-700/15">
            {SOLICITUD_STATUS_LABELS[solicitud.status]}
          </span>
          <span className="text-xs text-zinc-500">
            ID completo: <span className="font-mono">{solicitud.id}</span>
          </span>
        </div>

        <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Cliente" value={solicitud.client_name} />
          <DetailItem label="Teléfono" value={solicitud.client_phone} />
          <DetailItem
            label="Correo electrónico"
            value={solicitud.client_email ?? "No informado"}
          />
          <DetailItem label="Tipo de servicio" value={serviceTypeLabel} />
          <DetailItem
            label="Fecha deseada"
            value={formatDate(solicitud.desired_date)}
          />
          <DetailItem
            label="Fecha de creación"
            value={formatDate(solicitud.created_at)}
          />
          <DetailItem
            label="Última actualización"
            value={formatDate(solicitud.updated_at)}
          />
        </dl>
      </section>

      {clienteSection}

      {conversionSection}

      {filesSection}

      {commentsSection}

      {historySection}

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">
          Gestión interna
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Actualiza el estado operativo de la solicitud.
        </p>
        <div className="mt-5">
          <SolicitudStatusForm
            solicitudId={solicitud.id}
            currentStatus={solicitud.status}
          />
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-950">Descripción</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
          {solicitud.description}
        </p>
      </section>

      {solicitud.notes ? (
        <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-950">
            Observaciones
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
            {solicitud.notes}
          </p>
        </section>
      ) : null}
    </article>
  );
}
